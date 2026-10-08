import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CRELINK_LIMITS, RESERVED_SLUGS, SessionUser, UserRole } from '@crelink/shared';
import type { PoolClient } from 'pg';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config.service';
import { Database, isUniqueViolation } from '../database';
import { apiError, insertWithRandomId } from '../common/http';
import { GoogleClientConfig, GoogleOAuth, googleVerifyFailureReason, GoogleProfile } from './google-oauth';

/** 세션 쿠키 원문 토큰을 DB에 저장할 값(SHA-256 hex)으로 바꿉니다. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
    private readonly google: GoogleOAuth,
  ) {}

  private googleConfig(): GoogleClientConfig {
    const google = this.config.google;
    if (!google) {
      throw apiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'auth_not_configured',
        '로그인 설정이 아직 준비되지 않았습니다. 운영자에게 문의해 주세요.',
      );
    }
    return google;
  }

  /** 구글 인증 주소와 CSRF 방지용 state. state는 `cl_oauth_state` 쿠키로도 내려 보냅니다. */
  start(): { authorizationUrl: string; state: string } {
    const google = this.googleConfig();
    const state = randomBytes(32).toString('base64url');
    return { authorizationUrl: this.google.authorizationUrl(google, state), state };
  }

  /** state 확인 → code 교환·ID 토큰 검증 → 사용자 찾기 또는 가입 → 세션 발급. */
  async completeLogin(
    code: unknown,
    state: unknown,
    cookieState: string | null,
  ): Promise<{ user: SessionUser; token: string }> {
    const google = this.googleConfig();
    if (
      typeof state !== 'string' ||
      !cookieState ||
      state.length !== cookieState.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))
    ) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'oauth_state_invalid',
        '로그인 요청이 만료되었거나 올바르지 않습니다. 처음부터 다시 로그인해 주세요.',
      );
    }
    if (typeof code !== 'string' || !code) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'oauth_failed', '구글 로그인에 실패했습니다. 다시 시도해 주세요.');
    }
    let profile: GoogleProfile;
    try {
      const verified = await this.google.verifyCode(google, code);
      profile = { ...verified, email: verified.email.trim().toLowerCase() };
    } catch (error) {
      this.logger.warn(`구글 code 교환·ID 토큰 검증 실패: ${googleVerifyFailureReason(error)}`);
      throw apiError(HttpStatus.UNAUTHORIZED, 'oauth_failed', '구글 로그인에 실패했습니다. 다시 시도해 주세요.');
    }
    try {
      return await this.login(profile);
    } catch (error) {
      // 같은 구글 계정의 첫 로그인이 동시에 들어오면 user_identities UNIQUE에 걸립니다. 한 번 더 시도하면 기존 사용자로 로그인합니다.
      if (isUniqueViolation(error)) return this.login(profile);
      throw error;
    }
  }

  private login(profile: GoogleProfile): Promise<{ user: SessionUser; token: string }> {
    // 운영자 권한은 구글이 검증한 이메일이 OPERATOR_EMAILS에 있을 때만 줍니다. 목록에서 빠지면 다음 로그인 때 creator로 돌아갑니다.
    const role: UserRole =
      profile.emailVerified && this.config.operatorEmails.has(profile.email) ? 'operator' : 'creator';
    return this.database.transaction(async (client) => {
      const identity = await client.query<{ user_id: string }>(
        "SELECT user_id FROM user_identities WHERE provider = 'google' AND provider_subject = $1 FOR UPDATE",
        [profile.subject],
      );
      let userId = identity.rows[0]?.user_id;
      if (userId) {
        await client.query(
          "UPDATE user_identities SET email = $2, last_login_at = now() WHERE provider = 'google' AND provider_subject = $1",
          [profile.subject, profile.email],
        );
        await client.query('UPDATE users SET email = $2, role = $3 WHERE id = $1', [userId, profile.email, role]);
      } else {
        userId = await this.provision(client, profile, role);
      }
      const user = await client.query<{ id: string; email: string; role: UserRole; suspended: boolean }>(
        'SELECT id, email, role, suspended_at IS NOT NULL AS suspended FROM users WHERE id = $1',
        [userId],
      );
      const { suspended, ...sessionUser } = user.rows[0];
      if (suspended) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'account_suspended',
          '이용이 정지된 계정입니다. 운영자에게 문의해 주세요.',
        );
      }
      const token = randomBytes(32).toString('base64url');
      await client.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
        [userId, hashSessionToken(token), CRELINK_LIMITS.sessionDays],
      );
      return { user: sessionUser, token };
    });
  }

  /** 첫 로그인: users → user_identities → landings → landing_blocks(list) → short_links → short_slugs(자동). 한 트랜잭션입니다. */
  private async provision(client: PoolClient, profile: GoogleProfile, role: UserRole): Promise<string> {
    const user = await client.query<{ id: string }>('INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id', [
      profile.email,
      role,
    ]);
    const userId = user.rows[0].id;
    await client.query(
      "INSERT INTO user_identities (user_id, provider, provider_subject, email) VALUES ($1, 'google', $2, $3)",
      [userId, profile.subject, profile.email],
    );
    const landingId = await insertWithRandomId(CRELINK_LIMITS.landingPublicIdLength, async (publicId) => {
      const landing = await client.query<{ id: string }>(
        'INSERT INTO landings (user_id, public_id) VALUES ($1, $2) ON CONFLICT (public_id) DO NOTHING RETURNING id',
        [userId, publicId],
      );
      return landing.rows[0]?.id;
    });
    await client.query("INSERT INTO landing_blocks (landing_id, type, position) VALUES ($1, 'list', 0)", [landingId]);
    const shortLink = await client.query<{ id: string }>(
      'INSERT INTO short_links (user_id, landing_id) VALUES ($1, $2) RETURNING id',
      [userId, landingId],
    );
    await insertWithRandomId(CRELINK_LIMITS.autoSlugLength, async (slug) => {
      if (RESERVED_SLUGS.includes(slug)) return undefined;
      const inserted = await client.query(
        'INSERT INTO short_slugs (slug, short_link_id, is_auto) VALUES ($1, $2, true) ON CONFLICT (slug) DO NOTHING',
        [slug, shortLink.rows[0].id],
      );
      return inserted.rowCount ? slug : undefined;
    });
    return userId;
  }

  /** 유효한 세션의 사용자. 만료·없는 세션이나 정지 사용자는 null입니다. */
  async sessionUser(token: string): Promise<SessionUser | null> {
    const result = await this.database.query<SessionUser>(
      `SELECT u.id, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.suspended_at IS NULL`,
      [hashSessionToken(token)],
    );
    return result.rows[0] ?? null;
  }

  async logout(token: string | null): Promise<void> {
    if (token) await this.database.query('DELETE FROM sessions WHERE token_hash = $1', [hashSessionToken(token)]);
  }
}
