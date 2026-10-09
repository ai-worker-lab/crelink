import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AccountKind, AI_TOKEN_PATTERN, COOKIE_NAMES, CRELINK_LIMITS, SessionUser, UserRole } from '@crelink/shared';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config.service';
import { Database, isUniqueViolation } from '../database';
import { apiError, readCookie } from '../common/http';
import { setUserId } from '../monitoring/sentry';
import type { AuthenticatedRequest, RequestActor } from './actor';
import { GoogleClientConfig, GoogleOAuth, googleVerifyFailureReason, GoogleProfile } from './google-oauth';
import { provisionAccount } from './provision';
import { hashToken } from './token-hash';

type AccountRow = SessionUser & { kind: AccountKind };

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
        // 첫 로그인: 계정(랜딩·단축 주소 포함) → 구글 신원. 한 트랜잭션입니다.
        userId = await provisionAccount(client, { email: profile.email, role, kind: 'human' });
        await client.query(
          "INSERT INTO user_identities (user_id, provider, provider_subject, email) VALUES ($1, 'google', $2, $3)",
          [userId, profile.subject, profile.email],
        );
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
        [userId, hashToken(token), CRELINK_LIMITS.sessionDays],
      );
      return { user: sessionUser, token };
    });
  }

  /**
   * 세 가드(`SessionGuard`·`OperatorGuard`·`OptionalSessionGuard`)의 공용 인증. `request.sessionUser`·`request.actor`를 채우고
   * Sentry 요청 user에 내부 ID를 넣습니다. 로그인 정보가 없거나 쿠키 세션이 무효면 null(가드가 401 또는 비회원으로 판단)입니다.
   * `Authorization: Bearer`가 있으면 쿠키를 보지 않고 토큰으로만 인증하며, 형식 오류·없음·폐기·정지·AI 아닌 계정은 바로 401입니다.
   */
  async authenticateRequest(request: AuthenticatedRequest): Promise<RequestActor | null> {
    const authorization = request.headers.authorization;
    let account: AccountRow | null;
    if (authorization && /^bearer(?:\s|$)/i.test(authorization)) {
      const token = authorization.slice('bearer'.length).trim();
      account = AI_TOKEN_PATTERN.test(token) ? await this.apiTokenAccount(token) : null;
      if (!account) {
        throw apiError(HttpStatus.UNAUTHORIZED, 'unauthenticated', 'API 토큰이 올바르지 않거나 폐기되었습니다.');
      }
    } else {
      const token = readCookie(request, COOKIE_NAMES.session);
      account = token ? await this.sessionAccount(token) : null;
      if (!account) return null;
    }
    const { kind, ...user } = account;
    request.sessionUser = user;
    request.actor = { userId: user.id, email: user.email, kind, runId: null };
    setUserId(user.id);
    return request.actor;
  }

  /** 유효한 세션의 사용자. 만료·없는 세션이나 정지 사용자는 null입니다. */
  private async sessionAccount(token: string): Promise<AccountRow | null> {
    const result = await this.database.query<AccountRow>(
      `SELECT u.id, u.email, u.role, u.kind FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.suspended_at IS NULL`,
      [hashToken(token)],
    );
    return result.rows[0] ?? null;
  }

  /**
   * 폐기되지 않은 토큰의 정지되지 않은 AI 계정. 같은 문장에서 `last_used_at`을 1분에 한 번만 갱신합니다
   * (`token_hash` UNIQUE 인덱스 조회 1회, 설계 `비기능 요구`).
   */
  private async apiTokenAccount(token: string): Promise<AccountRow | null> {
    const result = await this.database.query<AccountRow>(
      `WITH found AS (
         SELECT t.id AS token_id, u.id, u.email, u.role, u.kind
         FROM api_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND u.kind = 'ai' AND u.suspended_at IS NULL
       ), touched AS (
         UPDATE api_tokens t SET last_used_at = now() FROM found f
         WHERE t.id = f.token_id AND (t.last_used_at IS NULL OR t.last_used_at < now() - interval '1 minute')
       )
       SELECT id, email, role, kind FROM found`,
      [hashToken(token)],
    );
    return result.rows[0] ?? null;
  }

  async logout(token: string | null): Promise<void> {
    if (token) await this.database.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  }
}
