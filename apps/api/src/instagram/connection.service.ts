import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  INSTAGRAM_DM_LIMITS,
  InstagramConnectionStatus,
  InstagramConnectionView,
  InstagramDmAudience,
  InstagramIntegrationView,
  SessionUser,
} from '@crelink/shared';
import type { HttpException } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { apiError } from '../common/http';
import { booleanField } from '../common/input';
import { AppConfig, InstagramSettings } from '../config.service';
import { Database, isUniqueViolation, type Queryable } from '../database';
import { decryptToken, encryptToken } from './crypto';
import {
  GraphAccessToken,
  GraphInstagramAccount,
  InstagramGraph,
  InstagramGraphConfig,
  InstagramGraphError,
} from './graph';

/** OAuth state 쿠키. Google 로그인의 `cl_oauth_state`와 섞이지 않게 따로 둡니다(docs/specs/instagram-comment-dm.md#oauth토큰삭제). */
export const INSTAGRAM_OAUTH_STATE_COOKIE = 'cl_ig_oauth_state';
export const INSTAGRAM_OAUTH_STATE_SECONDS = 10 * 60;

const STATE_MAX_LENGTH = 512;
const CODE_MAX_LENGTH = 4096;

/**
 * state 서명 내용. `rev`는 시작 시점의 `token_revision`(연결이 없으면 0)입니다. 표를 만들지 않아도 성공한 state가
 * 다시 통과하지 못합니다. 저장이 revision을 올리기 때문입니다.
 */
export interface InstagramOAuthState {
  uid: string;
  exp: number;
  nonce: string;
  rev: number;
}

/** 앱 시크릿에서 state 전용 키를 파생합니다. 웹훅·`signed_request` 서명과 같은 키를 그대로 쓰지 않습니다. */
function oauthStateKey(appSecret: string): Buffer {
  return createHmac('sha256', appSecret).update('crelink/instagram-oauth-state/v1').digest();
}

export function signOAuthState(appSecret: string, payload: InstagramOAuthState): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${createHmac('sha256', oauthStateKey(appSecret)).update(body).digest('base64url')}`;
}

/** 서명·형식·만료를 검사합니다. 하나라도 틀리면 null입니다. 세션 일치와 revision은 호출자가 봅니다. */
export function verifyOAuthState(
  appSecret: string,
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): InstagramOAuthState | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, mac] = parts;
  const given = Buffer.from(mac, 'base64url');
  const expected = createHmac('sha256', oauthStateKey(appSecret)).update(body).digest();
  // 끝 글자의 남는 비트만 다른 표기가 같은 서명으로 통과하지 않게 정규형만 받습니다.
  if (given.toString('base64url') !== mac || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  let parsed: Partial<InstagramOAuthState>;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<InstagramOAuthState>;
  } catch {
    return null;
  }
  const { uid, exp, nonce, rev } = parsed;
  if (typeof uid !== 'string' || typeof nonce !== 'string') return null;
  if (typeof exp !== 'number' || !Number.isSafeInteger(rev) || (rev as number) < 0 || exp <= nowSeconds) return null;
  return { uid, exp, nonce, rev: rev as number };
}

const stateInvalid = (): HttpException =>
  apiError(
    HttpStatus.BAD_REQUEST,
    'oauth_state_invalid',
    '연결 요청이 만료되었거나 올바르지 않습니다. 처음부터 다시 연결해 주세요.',
  );
const accountInUse = (): HttpException =>
  apiError(HttpStatus.CONFLICT, 'instagram_account_in_use', '이 인스타그램 계정은 연결할 수 없습니다.');
const unavailable = (): HttpException =>
  apiError(HttpStatus.FORBIDDEN, 'instagram_unavailable', '인스타그램 자동 DM을 아직 사용할 수 없습니다.');
const upstreamFailed = (): HttpException =>
  apiError(
    HttpStatus.BAD_GATEWAY,
    'instagram_upstream_failed',
    '인스타그램에서 응답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  );
const notConnected = (): HttpException =>
  apiError(HttpStatus.CONFLICT, 'instagram_reauth_required', '연결된 인스타그램 계정이 없습니다.');
const operatorPaused = (): HttpException =>
  apiError(HttpStatus.CONFLICT, 'instagram_operator_paused', '운영자가 자동 DM을 멈춘 계정입니다.');

function audienceAllows(audience: InstagramDmAudience, user: SessionUser): boolean {
  return audience === 'everyone' || (audience === 'operators' && user.role === 'operator');
}

const CONNECTION_VIEW_COLUMNS = 'ig_username, status, dm_paused_at, operator_paused_at, created_at, token_expires_at';

interface ConnectionViewRow {
  ig_username: string;
  status: InstagramConnectionStatus;
  dm_paused_at: Date | null;
  operator_paused_at: Date | null;
  created_at: Date;
  token_expires_at: Date | null;
}

function toConnectionView(row: ConnectionViewRow): InstagramConnectionView {
  return {
    igUsername: row.ig_username,
    status: row.status,
    paused: row.dm_paused_at !== null,
    operatorPaused: row.operator_paused_at !== null,
    connectedAt: row.created_at.toISOString(),
    tokenExpiresAt: row.token_expires_at?.toISOString() ?? null,
  };
}

/** OAuth 연결·토큰 저장·재인증 전이. 근거: docs/specs/instagram-comment-dm.md (`OAuth·토큰·삭제`, `충돌 규칙`). */
@Injectable()
export class InstagramConnectionService {
  private readonly logger = new Logger(InstagramConnectionService.name);

  constructor(
    private readonly database: Database,
    private readonly config: AppConfig,
    private readonly graph: InstagramGraph,
  ) {}

  private settings(): InstagramSettings & InstagramGraphConfig {
    const settings = this.config.instagram;
    if (!settings) {
      throw apiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'instagram_not_configured',
        '인스타그램 자동 DM을 아직 사용할 수 없습니다.',
      );
    }
    return settings;
  }

  /** 스위치와 사용자의 현재 연결 revision을 한 번에 읽습니다. */
  private async access(
    userId: string,
  ): Promise<{ audience: InstagramDmAudience; revision: number; igUserId: string | null }> {
    const result = await this.database.query<{
      audience: InstagramDmAudience;
      token_revision: number | null;
      ig_user_id: string | null;
    }>(
      `SELECT s.instagram_dm_audience AS audience, c.token_revision, c.ig_user_id
       FROM platform_settings s LEFT JOIN instagram_connections c ON c.user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return { audience: row.audience, revision: row.token_revision ?? 0, igUserId: row.ig_user_id };
  }

  /** `GET /api/me/instagram`. */
  async view(user: SessionUser): Promise<InstagramIntegrationView> {
    this.settings();
    const result = await this.database.query<
      { audience: InstagramDmAudience } & { [K in keyof ConnectionViewRow]: ConnectionViewRow[K] | null }
    >(
      `SELECT s.instagram_dm_audience AS audience, ${CONNECTION_VIEW_COLUMNS}
       FROM platform_settings s LEFT JOIN instagram_connections c ON c.user_id = $1`,
      [user.id],
    );
    const row = result.rows[0];
    return {
      available: audienceAllows(row.audience, user),
      connection: row.status === null ? null : toConnectionView(row as ConnectionViewRow),
      limits: { activeRules: INSTAGRAM_DM_LIMITS.activeRules, totalRules: INSTAGRAM_DM_LIMITS.totalRules },
    };
  }

  /** `POST /api/me/instagram/connect`. 동의 URL과 쿠키에 넣을 state를 돌려줍니다. */
  async start(user: SessionUser): Promise<{ authorizationUrl: string; state: string }> {
    const settings = this.settings();
    const access = await this.access(user.id);
    if (!audienceAllows(access.audience, user)) throw unavailable();
    const state = signOAuthState(settings.appSecret, {
      uid: user.id,
      exp: Math.floor(Date.now() / 1000) + INSTAGRAM_OAUTH_STATE_SECONDS,
      nonce: randomBytes(16).toString('base64url'),
      rev: access.revision,
    });
    return { authorizationUrl: this.graph.authorizationUrl(settings, state), state };
  }

  /**
   * `POST /api/me/instagram/callback`. state 검증 → code 교환 → 계정 조회 → 운영자 정지 확인 → 충돌 검사 → 구독 → 암호화 저장 순서입니다.
   * 외부 호출은 트랜잭션 밖이고, 저장 트랜잭션이 revision과 계정을 다시 확인합니다.
   */
  async complete(
    user: SessionUser,
    code: unknown,
    state: unknown,
    cookieState: string | null,
  ): Promise<InstagramConnectionView> {
    const settings = this.settings();
    if (
      typeof state !== 'string' ||
      state.length > STATE_MAX_LENGTH ||
      !cookieState ||
      state.length !== cookieState.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))
    ) {
      throw stateInvalid();
    }
    const payload = verifyOAuthState(settings.appSecret, state);
    if (!payload || payload.uid !== user.id) throw stateInvalid();
    if (typeof code !== 'string' || !code || code.length > CODE_MAX_LENGTH) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'code가 올바르지 않습니다.');
    }
    const access = await this.access(user.id);
    // 동의 화면에 가 있는 사이 스위치가 꺼졌으면 저장·구독까지 가지 않습니다.
    if (!audienceAllows(access.audience, user)) throw unavailable();
    if (access.revision !== payload.rev) throw stateInvalid();

    const { token, account, metaUserId } = await this.exchange(settings, code);
    // 연결된 페이지의 계정을 바꾸면 규칙의 게시물 ID가 다른 계정을 가리키므로 해제부터 하도록 막습니다.
    if (access.igUserId !== null && access.igUserId !== account.igUserId) throw accountInUse();
    await this.assertNotPausedElsewhere(user.id, account.igUserId);
    await this.resolveConflict(settings, user.id, account.igUserId);
    await this.graphCall(() => this.graph.subscribeApp(token.accessToken, account.igUserId));
    return toConnectionView(await this.save(settings, user.id, payload.rev, account, metaUserId, token));
  }

  private async exchange(
    settings: InstagramGraphConfig,
    code: string,
  ): Promise<{ token: GraphAccessToken; account: GraphInstagramAccount; metaUserId: string | null }> {
    const token = await this.graphCall(() => this.graph.exchangeCode(settings, code));
    const lookup = await this.graphCall(() => this.graph.fetchAccounts(token.accessToken));
    if (lookup.accounts.length !== 1) {
      throw apiError(
        HttpStatus.CONFLICT,
        'instagram_account_selection_required',
        '인스타그램 계정을 하나만 골라 다시 연결해 주세요.',
      );
    }
    const account = lookup.accounts[0];
    if (!account.isProfessional) {
      throw apiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'instagram_account_not_professional',
        '프로페셔널 계정만 연결할 수 있습니다.',
      );
    }
    return { token, account, metaUserId: lookup.metaUserId };
  }

  /**
   * 다른 크리링 계정이 쥔 같은 IG 계정의 행에 운영자 정지가 있으면(재인증 대기 행 포함) 구독·저장 전에 409입니다.
   * 같은 크리링 계정의 재연결은 그 행을 갱신해 정지가 그대로 유지되므로 막지 않습니다. 저장 트랜잭션이 잠금 뒤 한 번 더 봅니다.
   */
  private async assertNotPausedElsewhere(userId: string, igUserId: string): Promise<void> {
    const paused = await this.database.query(
      `SELECT 1 FROM instagram_connections
       WHERE ig_user_id = $1 AND user_id <> $2 AND operator_paused_at IS NOT NULL LIMIT 1`,
      [igUserId, userId],
    );
    if (paused.rowCount) throw operatorPaused();
  }

  /**
   * 다른 페이지의 살아 있는 연결이 같은 계정을 쓰면 그 토큰을 1회 점검합니다. 유효이면 409, 무효이면 재인증으로 바꾸고 진행합니다.
   * 어느 페이지인지 밝히지 않습니다. 복호화·외부 호출 실패는 무효가 아니므로 기존 연결을 건드리지 않고 502입니다.
   */
  private async resolveConflict(settings: InstagramSettings, userId: string, igUserId: string): Promise<void> {
    const result = await this.database.query<{
      id: string;
      token_ciphertext: Buffer;
      token_key_version: number;
      token_revision: number;
      expired: boolean;
    }>(
      `SELECT id, token_ciphertext, token_key_version, token_revision,
              (token_expires_at IS NOT NULL AND token_expires_at <= now()) AS expired
       FROM instagram_connections
       WHERE ig_user_id = $1 AND status <> 'reauth_required' AND user_id <> $2`,
      [igUserId, userId],
    );
    const existing = result.rows[0];
    if (!existing) return;
    let verdict: 'valid' | 'invalid' = 'invalid';
    if (!existing.expired) {
      let accessToken: string;
      try {
        accessToken = decryptToken(
          settings.tokenKeyring,
          existing.id,
          existing.token_ciphertext,
          existing.token_key_version,
        );
      } catch {
        this.logger.error(`충돌 점검 중 기존 토큰을 복호화하지 못했습니다: ${existing.id}`);
        throw upstreamFailed();
      }
      verdict = await this.graphCall(() => this.graph.checkToken(accessToken, igUserId));
    }
    if (verdict === 'valid') throw accountInUse();
    // 점검 중 토큰이 바뀌었으면(false) 살아 있는 연결로 보고 409입니다.
    if (!(await this.markReauthRequired(existing.id, existing.token_revision))) throw accountInUse();
  }

  /** Graph 실패를 502로 바꿉니다. `InstagramGraphError`에는 원문이 없고, 그 밖의 오류는 버그이므로 그대로 던집니다. */
  private async graphCall<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof InstagramGraphError) throw upstreamFailed();
      throw error;
    }
  }

  private async save(
    settings: InstagramSettings,
    userId: string,
    expectedRevision: number,
    account: GraphInstagramAccount,
    metaUserId: string | null,
    token: GraphAccessToken,
  ): Promise<ConnectionViewRow> {
    try {
      return await this.database.transaction(async (client) => {
        // 내 행과 같은 IG 계정의 다른 행을 id 순으로 함께 잠급니다(`lock-order.ts`).
        const current = await client.query<{
          id: string;
          user_id: string;
          ig_user_id: string;
          token_revision: number;
          operator_paused_at: Date | null;
        }>(
          `SELECT id, user_id, ig_user_id, token_revision, operator_paused_at FROM instagram_connections
           WHERE user_id = $1 OR ig_user_id = $2 ORDER BY id FOR UPDATE`,
          [userId, account.igUserId],
        );
        const row = current.rows.find((candidate) => candidate.user_id === userId);
        if ((row?.token_revision ?? 0) !== expectedRevision) throw stateInvalid();
        if (row && row.ig_user_id !== account.igUserId) throw accountInUse();
        if (current.rows.some((candidate) => candidate.user_id !== userId && candidate.operator_paused_at)) {
          throw operatorPaused();
        }
        // 일반 해제 뒤에도 데이터 삭제 콜백이 수신 거부 기록을 찾도록 대응표를 남깁니다. 해제해도 지우지 않습니다.
        if (metaUserId !== null) {
          await client.query(
            `INSERT INTO instagram_opt_out_owners (ig_user_id, meta_user_id) VALUES ($1, $2)
             ON CONFLICT (ig_user_id) DO UPDATE SET meta_user_id = EXCLUDED.meta_user_id`,
            [account.igUserId, metaUserId],
          );
        }
        // AAD가 행 ID이므로 새 연결은 ID를 먼저 정합니다.
        const id = row?.id ?? randomUUID();
        const encrypted = encryptToken(settings.tokenKeyring, id, token.accessToken);
        if (row) {
          const updated = await client.query<ConnectionViewRow>(
            `UPDATE instagram_connections
             SET ig_username = $2, meta_user_id = $3, status = 'active', token_ciphertext = $4, token_key_version = $5,
                 token_expires_at = $6, token_revision = token_revision + 1, token_checked_at = now(), updated_at = now()
             WHERE id = $1 RETURNING ${CONNECTION_VIEW_COLUMNS}`,
            [id, account.username, metaUserId, encrypted.ciphertext, encrypted.keyVersion, token.expiresAt],
          );
          return updated.rows[0];
        }
        const inserted = await client.query<ConnectionViewRow>(
          `INSERT INTO instagram_connections
             (id, user_id, ig_user_id, meta_user_id, ig_username, status, token_ciphertext, token_key_version, token_expires_at)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
           RETURNING ${CONNECTION_VIEW_COLUMNS}`,
          [
            id,
            userId,
            account.igUserId,
            metaUserId,
            account.username,
            encrypted.ciphertext,
            encrypted.keyVersion,
            token.expiresAt,
          ],
        );
        return inserted.rows[0];
      });
    } catch (error) {
      // 같은 계정을 동시에 연결한 다른 페이지가 먼저 커밋했습니다(`instagram_connections_ig_live`).
      if (isUniqueViolation(error)) throw accountInUse();
      throw error;
    }
  }

  /** `POST /api/me/instagram/recheck`. 메시지 접근 꺼짐만 되돌리고, 실제 확인은 다음 발송 결과입니다. */
  async recheck(userId: string): Promise<InstagramConnectionView> {
    this.settings();
    await this.database.query(
      `UPDATE instagram_connections SET status = 'active', updated_at = now()
       WHERE user_id = $1 AND status = 'messages_access_required'`,
      [userId],
    );
    const result = await this.database.query<ConnectionViewRow>(
      `SELECT ${CONNECTION_VIEW_COLUMNS} FROM instagram_connections WHERE user_id = $1`,
      [userId],
    );
    if (!result.rows[0]) throw notConnected();
    return toConnectionView(result.rows[0]);
  }

  /**
   * `DELETE /api/me/instagram`. 구독 해제는 시도만 하고(실패 무시) 연결 행을 지웁니다. 규칙·내역은 CASCADE로 함께 지워집니다.
   * 운영자 정지 중이면 재연결로 정지가 풀리지 않도록 행은 남기고 토큰 파기·대기 취소·규칙 보관만 합니다.
   */
  async disconnect(userId: string): Promise<void> {
    const settings = this.settings();
    const result = await this.database.query<{
      id: string;
      ig_user_id: string;
      token_ciphertext: Buffer | null;
      token_key_version: number | null;
    }>('SELECT id, ig_user_id, token_ciphertext, token_key_version FROM instagram_connections WHERE user_id = $1', [
      userId,
    ]);
    const row = result.rows[0];
    if (!row) return;
    if (row.token_ciphertext && row.token_key_version !== null) {
      try {
        const accessToken = decryptToken(settings.tokenKeyring, row.id, row.token_ciphertext, row.token_key_version);
        await this.graph.unsubscribeApp(accessToken, row.ig_user_id);
      } catch {
        // Graph 경계가 허용된 코드만 로그에 남깁니다. 여기서는 오류 내용을 다시 남기지 않습니다.
        this.logger.warn(`Instagram 구독 해제 실패(무시): ${row.id}`);
      }
    }
    await this.removeConnection(row.id);
  }

  /** 구독 해제 호출 뒤에 행을 잠그고 다시 읽으므로 호출 중에 걸린 운영자 정지도 놓치지 않습니다. */
  private async removeConnection(connectionId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const current = await client.query<{ token_revision: number; operator_paused_at: Date | null }>(
        'SELECT token_revision, operator_paused_at FROM instagram_connections WHERE id = $1 FOR UPDATE',
        [connectionId],
      );
      const row = current.rows[0];
      if (!row) return;
      if (!row.operator_paused_at) {
        await client.query('DELETE FROM instagram_connections WHERE id = $1', [connectionId]);
        return;
      }
      // 연결(위 FOR UPDATE) → 규칙 → 발송 행 순서입니다(`lock-order.ts`).
      await client.query(
        `UPDATE instagram_dm_rules SET archived_at = now(), version = version + 1, updated_at = now()
         WHERE connection_id = $1 AND archived_at IS NULL`,
        [connectionId],
      );
      await this.applyReauthRequired(client, connectionId, row.token_revision);
    });
  }

  /** `PUT /api/me/instagram/pause`. 정지하면 같은 트랜잭션에서 대기 건을 취소하고, 운영자 정지 중에는 바꿀 수 없습니다. */
  async setPaused(userId: string, body: unknown): Promise<InstagramConnectionView> {
    this.settings();
    const paused = booleanField(body, 'paused');
    return this.database.transaction(async (client) => {
      const current = await client.query<{ id: string; operator_paused_at: Date | null }>(
        'SELECT id, operator_paused_at FROM instagram_connections WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
      const row = current.rows[0];
      if (!row) throw notConnected();
      if (row.operator_paused_at) {
        throw apiError(HttpStatus.CONFLICT, 'instagram_operator_paused', '운영자가 자동 DM을 멈춘 계정입니다.');
      }
      const updated = await client.query<ConnectionViewRow>(
        `UPDATE instagram_connections
         SET dm_paused_at = CASE WHEN $2 THEN coalesce(dm_paused_at, now()) END, updated_at = now()
         WHERE id = $1 RETURNING ${CONNECTION_VIEW_COLUMNS}`,
        [row.id, paused],
      );
      if (paused) {
        await client.query(
          "UPDATE instagram_dm_deliveries SET status = 'cancelled' WHERE connection_id = $1 AND status = 'pending'",
          [row.id],
        );
      }
      return toConnectionView(updated.rows[0]);
    });
  }

  /**
   * 재인증 전이 공통 함수입니다. 상태 변경, 토큰 파기, `pending` 취소를 한 트랜잭션에서 하고,
   * `token_revision`이 읽은 값과 다르면 아무것도 하지 않고 false를 돌려줍니다.
   */
  async markReauthRequired(connectionId: string, expectedRevision: number): Promise<boolean> {
    const changed = await this.database.transaction((client) =>
      this.applyReauthRequired(client, connectionId, expectedRevision),
    );
    if (changed) this.logger.warn(`Instagram 연결을 재인증 필요로 바꿨습니다: ${connectionId}`);
    return changed;
  }

  private async applyReauthRequired(
    client: Queryable,
    connectionId: string,
    expectedRevision: number,
  ): Promise<boolean> {
    const updated = await client.query(
      `UPDATE instagram_connections
       SET status = 'reauth_required', token_ciphertext = NULL, token_key_version = NULL,
           token_revision = token_revision + 1, updated_at = now()
       WHERE id = $1 AND token_revision = $2 AND status <> 'reauth_required'`,
      [connectionId, expectedRevision],
    );
    if (updated.rowCount !== 1) return false;
    await client.query(
      "UPDATE instagram_dm_deliveries SET status = 'cancelled' WHERE connection_id = $1 AND status = 'pending'",
      [connectionId],
    );
    return true;
  }
}
