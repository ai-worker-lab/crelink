import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { InstagramConnectionView, InstagramDmSettingsView } from '@crelink/shared';
import { AppConfig } from '../src/config.service';
import { Database } from '../src/database';
import { INSTAGRAM_OAUTH_STATE_COOKIE, InstagramConnectionService } from '../src/instagram/connection.service';
import { encryptToken } from '../src/instagram/crypto';
import { InstagramGraph } from '../src/instagram/graph';
import { InstagramTokenHealthService } from '../src/instagram/token-health.service';
import { InstagramWorkerService } from '../src/instagram/worker.service';
import { RetentionService } from '../src/retention/retention.service';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

const ADMIN_PATH = '/api/admin/instagram-dm';
const pausePath = (userId: string) => `${ADMIN_PATH}/connections/${userId}/pause`;
const key = () => randomBytes(32).toString('base64');

interface Account {
  userId: string;
  connectionId: string;
  ruleId: string;
  igUserId: string;
}

describe('Instagram DM 긴급 정지·보존', () => {
  let t: TestApp;
  let operatorCookie: string;
  let creatorCookie: string;
  let creatorId: string;
  let send: jest.SpiedFunction<InstagramGraph['sendPrivateReply']>;
  let sequence = 0;

  beforeAll(async () => {
    t = await createTestApp({
      env: {
        META_APP_ID: 'test-app',
        META_APP_SECRET: 'test-secret',
        META_LOGIN_CONFIG_ID: 'test-config',
        META_WEBHOOK_VERIFY_TOKEN: 'test-verify',
        INSTAGRAM_TOKEN_KEYS: `1:${key()}`,
        INSTAGRAM_TOKEN_KEY_CURRENT: '1',
        INSTAGRAM_COMMENTER_HASH_KEY: key(),
        INSTAGRAM_OPT_OUT_KEY: key(),
      },
      configure: (app) => {
        // 시험은 worker를 직접 부릅니다. 앱의 타이머가 끼어들면 선점 수를 셀 수 없습니다.
        jest.spyOn(app.get(InstagramWorkerService), 'onApplicationBootstrap').mockImplementation(() => undefined);
        jest.spyOn(app.get(InstagramTokenHealthService), 'onApplicationBootstrap').mockImplementation(() => undefined);
      },
    });
    operatorCookie = (await login(t.baseUrl, 'ig-admin-op|operator@example.com')).cookie!;
    const creator = await login(t.baseUrl, 'ig-admin-creator|ig-admin-creator@example.com');
    creatorCookie = creator.cookie!;
    creatorId = creator.body.user!.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await t.pool.query('TRUNCATE instagram_connections, instagram_dm_opt_outs, instagram_deletion_requests CASCADE');
    await t.pool.query(`UPDATE platform_settings SET instagram_dm_audience = 'everyone'`);
    // 실제 Meta를 부르지 않도록 네트워크를 쓰는 메서드를 모두 교체합니다.
    const graph = t.app.get(InstagramGraph);
    send = jest.spyOn(graph, 'sendPrivateReply').mockResolvedValue({ messageId: 'm' });
    jest.spyOn(graph, 'unsubscribeApp').mockResolvedValue(undefined);
    jest.spyOn(graph, 'subscribeApp').mockResolvedValue(undefined);
    jest.spyOn(graph, 'checkToken').mockResolvedValue('valid');
    jest.spyOn(graph, 'exchangeCode').mockRejectedValue(new Error('exchangeCode 미지정'));
    jest.spyOn(graph, 'fetchAccounts').mockRejectedValue(new Error('fetchAccounts 미지정'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function tick() {
    const worker = new InstagramWorkerService(
      t.app.get(Database),
      t.app.get(AppConfig),
      t.app.get(InstagramGraph),
      t.app.get(InstagramConnectionService),
    );
    const result = await worker.runOnce();
    await worker.drain();
    return result;
  }

  async function seedUser(role: 'creator' | 'operator'): Promise<string> {
    sequence += 1;
    const user = await t.pool.query<{ id: string }>('INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id', [
      `ig-admin-${sequence}@example.com`,
      role,
    ]);
    return user.rows[0].id;
  }

  async function seedAccount(userId: string, options: { igUserId?: string } = {}): Promise<Account> {
    sequence += 1;
    const igUserId = options.igUserId ?? `ig-${sequence}`;
    const connectionId = randomUUID();
    const encrypted = encryptToken(t.app.get(AppConfig).instagram!.tokenKeyring, connectionId, 'plain-test-token');
    await t.pool.query(
      `INSERT INTO instagram_connections (id, user_id, ig_user_id, ig_username, status, token_ciphertext, token_key_version)
       VALUES ($1, $2, $3, $4, 'active', $5, $6)`,
      [connectionId, userId, igUserId, `name${sequence}`, encrypted.ciphertext, encrypted.keyVersion],
    );
    const ruleId = await seedRule(connectionId);
    return { userId, connectionId, ruleId, igUserId };
  }

  async function seedRule(connectionId: string): Promise<string> {
    sequence += 1;
    const code = `adm${String(sequence).padStart(5, '0')}`;
    await t.pool.query('INSERT INTO channel_link_codes (code) VALUES ($1) ON CONFLICT DO NOTHING', [code]);
    const rule = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, media_permalink, keyword, message, channel_link_code)
       VALUES ($1, $2, $3, 'https://example.com/p', '키워드', '문구', $4) RETURNING id`,
      [`a${String(sequence).padStart(9, '0')}`, connectionId, `media-${sequence}`, code],
    );
    return rule.rows[0].id;
  }

  async function seedDelivery(
    account: Pick<Account, 'connectionId' | 'ruleId'>,
    options: {
      status?: string;
      hash?: Buffer;
      createdAt?: string;
      queryable?: { query: TestApp['pool']['query'] };
    } = {},
  ): Promise<string> {
    sequence += 1;
    const db = options.queryable ?? t.pool;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO instagram_dm_deliveries
         (connection_id, rule_id, comment_id, commenter_hash, commented_at, message_body, status, created_at)
       VALUES ($1, $2, $3, $4, now() - interval '1 minute', '본문', $5, COALESCE($6::timestamptz, now())) RETURNING id`,
      [
        account.connectionId,
        account.ruleId,
        `comment-${sequence}`,
        options.hash ?? randomBytes(32),
        options.status ?? 'pending',
        options.createdAt ?? null,
      ],
    );
    return rows[0].id;
  }

  async function status(id: string): Promise<string | undefined> {
    const { rows } = await t.pool.query<{ status: string }>(
      'SELECT status FROM instagram_dm_deliveries WHERE id = $1',
      [id],
    );
    return rows[0]?.status;
  }

  async function audience(): Promise<string> {
    const { rows } = await t.pool.query<{ audience: string }>(
      'SELECT instagram_dm_audience AS audience FROM platform_settings',
    );
    return rows[0].audience;
  }

  const setAudience = (value: unknown, cookie: string | null = operatorCookie) =>
    api<InstagramDmSettingsView>(t.baseUrl, 'PUT', ADMIN_PATH, { cookie, body: { audience: value } });
  const operatorPause = (userId: string, paused: unknown, cookie: string | null = operatorCookie) =>
    api(t.baseUrl, 'PUT', pausePath(userId), { cookie, body: { paused } });

  async function lastAction(action: string) {
    const { rows } = await t.pool.query<{
      actor_kind: string;
      actor_email: string;
      target_type: string;
      target_id: string;
      subject_user_id: string | null;
      before: unknown;
      after: unknown;
    }>(
      `SELECT actor_kind, actor_email, target_type, target_id, subject_user_id, before, after
       FROM operator_actions WHERE action = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [action],
    );
    return rows[0];
  }

  describe('권한', () => {
    const routes: [string, string, unknown][] = [
      ['GET', ADMIN_PATH, undefined],
      ['PUT', ADMIN_PATH, { audience: 'off' }],
      ['PUT', pausePath(randomUUID()), { paused: true }],
    ];

    it('로그인 없이는 401, 운영자가 아니면 403 forbidden이고 아무것도 바뀌지 않는다', async () => {
      const account = await seedAccount(await seedUser('creator'));
      const pending = await seedDelivery(account);
      for (const [method, path, body] of routes) {
        expect((await api(t.baseUrl, method, path, { body })).status).toBe(401);
        const response = await api(t.baseUrl, method, path, { cookie: creatorCookie, body });
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('forbidden');
      }
      expect((await operatorPause(account.userId, true, creatorCookie)).status).toBe(403);
      expect(await audience()).toBe('everyone');
      expect(await status(pending)).toBe('pending');
    });

    it('AI 운영자는 읽기만 하고 쓰기는 403 forbidden이다', async () => {
      const ai = await createAiOperator(t.pool, 'ig-admin-ai@crelink.invalid');
      expect((await api(t.baseUrl, 'GET', ADMIN_PATH, { token: ai.token })).status).toBe(200);
      for (const [method, path, body] of routes.slice(1)) {
        const response = await api(t.baseUrl, method, path, { token: ai.token, body });
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('forbidden');
      }
      expect(await audience()).toBe('everyone');
    });
  });

  describe('전체 스위치', () => {
    it('GET은 현재 값, PUT은 바꾼 값을 돌려주고 행동 기록을 남긴다', async () => {
      const read = await api<InstagramDmSettingsView>(t.baseUrl, 'GET', ADMIN_PATH, { cookie: operatorCookie });
      expect([read.status, read.body]).toEqual([200, { audience: 'everyone' }]);

      const updated = await setAudience('operators');
      expect([updated.status, updated.body]).toEqual([200, { audience: 'operators' }]);
      expect(await audience()).toBe('operators');
      expect(await lastAction('instagram_dm.audience')).toEqual({
        actor_kind: 'human',
        actor_email: 'operator@example.com',
        target_type: 'platform_setting',
        target_id: 'instagram_dm_audience',
        subject_user_id: null,
        before: { audience: 'everyone' },
        after: { audience: 'operators' },
      });
    });

    it('audience 값이 틀리면 400 validation_failed이고 값과 기록이 그대로다', async () => {
      const before = await t.pool.query('SELECT count(*)::int AS count FROM operator_actions');
      for (const value of ['on', '', null, 1]) {
        const response = await setAudience(value);
        expect(response.status).toBe(400);
        expect((response.body as unknown as { code: string }).code).toBe('validation_failed');
      }
      const body = await api(t.baseUrl, 'PUT', ADMIN_PATH, { cookie: operatorCookie, body: [] });
      expect(body.status).toBe(400);
      expect(await audience()).toBe('everyone');
      expect((await t.pool.query('SELECT count(*)::int AS count FROM operator_actions')).rows).toEqual(before.rows);
    });

    it('off는 모든 pending을 취소하고 선점 0이며 다시 켜도 보내지 않는다', async () => {
      const creator = await seedAccount(await seedUser('creator'));
      const operator = await seedAccount(await seedUser('operator'));
      const pending = [await seedDelivery(creator), await seedDelivery(operator)];
      const sent = await seedDelivery(creator, { status: 'sent' });
      const sending = await seedDelivery(operator, { status: 'sending' });

      expect((await setAudience('off')).status).toBe(200);

      expect(await Promise.all(pending.map(status))).toEqual(['cancelled', 'cancelled']);
      expect(await status(sent)).toBe('sent');
      expect(await status(sending)).toBe('sending');
      expect((await tick()).claimed).toBe(0);

      expect((await setAudience('everyone')).status).toBe(200);
      expect((await tick()).claimed).toBe(0);
      expect(send).not.toHaveBeenCalled();
      expect(await Promise.all(pending.map(status))).toEqual(['cancelled', 'cancelled']);
    });

    it('이미 off여도 다시 누르면 남은 pending을 치우고 행동 기록을 남긴다', async () => {
      await t.pool.query(`UPDATE platform_settings SET instagram_dm_audience = 'off'`);
      const account = await seedAccount(await seedUser('creator'));
      const pending = await seedDelivery(account);
      expect((await setAudience('off')).status).toBe(200);
      expect(await status(pending)).toBe('cancelled');
      expect(await lastAction('instagram_dm.audience')).toMatchObject({
        before: { audience: 'off' },
        after: { audience: 'off' },
      });
    });

    it('everyone에서 operators로 낮추면 비운영자 pending만 취소하고 운영자 건은 보낸다', async () => {
      const creator = await seedAccount(await seedUser('creator'));
      const operator = await seedAccount(await seedUser('operator'));
      const creatorPending = await seedDelivery(creator);
      const operatorPending = await seedDelivery(operator);

      expect((await setAudience('operators')).status).toBe(200);

      expect(await status(creatorPending)).toBe('cancelled');
      expect(await status(operatorPending)).toBe('pending');
      expect((await tick()).claimed).toBe(1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await status(operatorPending)).toBe('sent');
    });

    it('everyone으로 올려도 취소하지 않는다', async () => {
      await t.pool.query(`UPDATE platform_settings SET instagram_dm_audience = 'operators'`);
      const creator = await seedAccount(await seedUser('creator'));
      const pending = await seedDelivery(creator);
      expect((await setAudience('everyone')).status).toBe(200);
      expect(await status(pending)).toBe('pending');
    });

    it('진행 중인 웹훅 저장을 기다렸다가 그 행까지 취소한다', async () => {
      const account = await seedAccount(await seedUser('creator'));
      const client = await t.pool.connect();
      let cancelledRow: string;
      let response: ReturnType<typeof setAudience>;
      try {
        await client.query('BEGIN');
        await client.query('SELECT 1 FROM platform_settings FOR SHARE');
        cancelledRow = await seedDelivery(account, { queryable: client });
        response = setAudience('off');
        await waitForBlockedQuery();
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      expect((await response).status).toBe(200);
      expect(await status(cancelledRow)).toBe('cancelled');
    });

    async function waitForBlockedQuery(): Promise<void> {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        // 행 잠금 대기는 pg_locks에서 database가 NULL인 transactionid 대기로 보이므로 활동 뷰로 확인합니다.
        const { rows } = await t.pool.query<{ blocked: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
           ) AS blocked`,
        );
        if (rows[0].blocked) return;
        await sleep(10);
      }
      throw new Error('PUT이 설정 행 잠금을 기다리지 않았습니다.');
    }

    it('광고 블록 카드의 updated_by·updated_at을 건드리지 않는다', async () => {
      await t.pool.query(`UPDATE platform_settings SET updated_at = '2026-01-01T00:00:00Z', updated_by = NULL`);
      expect((await setAudience('off')).status).toBe(200);
      const { rows } = await t.pool.query<{ updated_at: Date; updated_by: string | null }>(
        'SELECT updated_at, updated_by FROM platform_settings',
      );
      expect(rows[0].updated_at.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(rows[0].updated_by).toBeNull();
    });
  });

  describe('계정 정지', () => {
    async function pausedColumns(userId: string) {
      const { rows } = await t.pool.query<{ operator_paused: boolean; creator_paused: boolean }>(
        `SELECT operator_paused_at IS NOT NULL AS operator_paused, dm_paused_at IS NOT NULL AS creator_paused
         FROM instagram_connections WHERE user_id = $1`,
        [userId],
      );
      return rows[0];
    }

    it('정지하면 그 계정의 pending만 취소하고 선점하지 않으며 행동 기록을 남긴다', async () => {
      const target = await seedAccount(await seedUser('creator'));
      const other = await seedAccount(await seedUser('creator'));
      const targetPending = await seedDelivery(target);
      const otherPending = await seedDelivery(other);

      const response = await operatorPause(target.userId, true);
      expect(response.status).toBe(204);

      expect(await pausedColumns(target.userId)).toEqual({ operator_paused: true, creator_paused: false });
      expect(await status(targetPending)).toBe('cancelled');
      expect(await status(otherPending)).toBe('pending');
      expect((await tick()).claimed).toBe(1);
      expect(await status(otherPending)).toBe('sent');
      expect(await lastAction('instagram_dm.connection_pause')).toEqual({
        actor_kind: 'human',
        actor_email: 'operator@example.com',
        target_type: 'user',
        target_id: target.userId,
        subject_user_id: target.userId,
        before: { operatorPaused: false },
        after: { operatorPaused: true },
      });
    });

    it('운영자 정지는 크리에이터가 풀 수 없다', async () => {
      await seedAccount(creatorId);
      expect((await operatorPause(creatorId, true)).status).toBe(204);

      for (const paused of [false, true]) {
        const response = await api(t.baseUrl, 'PUT', '/api/me/instagram/pause', {
          cookie: creatorCookie,
          body: { paused },
        });
        expect(response.status).toBe(409);
        expect(response.body.code).toBe('instagram_operator_paused');
      }
      expect(await pausedColumns(creatorId)).toEqual({ operator_paused: true, creator_paused: false });
    });

    it('운영자가 풀어도 크리에이터 정지는 그대로이고 취소된 건은 되살리지 않는다', async () => {
      const account = await seedAccount(await seedUser('creator'));
      await t.pool.query('UPDATE instagram_connections SET dm_paused_at = now() WHERE id = $1', [account.connectionId]);
      const pending = await seedDelivery(account);

      expect((await operatorPause(account.userId, true)).status).toBe(204);
      expect((await operatorPause(account.userId, false)).status).toBe(204);

      expect(await pausedColumns(account.userId)).toEqual({ operator_paused: false, creator_paused: true });
      expect(await status(pending)).toBe('cancelled');
      expect(await lastAction('instagram_dm.connection_pause')).toMatchObject({
        before: { operatorPaused: true },
        after: { operatorPaused: false },
      });
    });

    it('이미 정지여도 처음 시각을 유지하고 행동 기록을 남긴다', async () => {
      const account = await seedAccount(await seedUser('creator'));
      await t.pool.query(`UPDATE instagram_connections SET operator_paused_at = '2026-01-01T00:00:00Z' WHERE id = $1`, [
        account.connectionId,
      ]);
      expect((await operatorPause(account.userId, true)).status).toBe(204);
      const { rows } = await t.pool.query<{ operator_paused_at: Date }>(
        'SELECT operator_paused_at FROM instagram_connections WHERE id = $1',
        [account.connectionId],
      );
      expect(rows[0].operator_paused_at.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(await lastAction('instagram_dm.connection_pause')).toMatchObject({
        before: { operatorPaused: true },
        after: { operatorPaused: true },
      });
    });

    it('연결이 없거나 id 형식이 틀리면 404, paused가 틀리면 400', async () => {
      const missing = await operatorPause(await seedUser('creator'), true);
      expect(missing.status).toBe(404);
      expect((await operatorPause('not-a-uuid', true)).status).toBe(404);
      const invalid = await operatorPause(randomUUID(), 'yes');
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('validation_failed');
    });
  });

  describe('보존 작업', () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const retention = () => t.app.get(RetentionService).runOnce();

    it('90일이 지난 발송 행은 상태와 관계없이 지우고 90일 안쪽은 남긴다', async () => {
      const account = await seedAccount(await seedUser('creator'));
      const oldRows = [
        await seedDelivery(account, { status: 'sent', createdAt: daysAgo(91) }),
        await seedDelivery(account, { status: 'failed', createdAt: daysAgo(120) }),
      ];
      const kept = await seedDelivery(account, { status: 'sent', createdAt: daysAgo(89) });

      const result = await retention();

      expect(result.instagramDeliveries).toBe(2);
      expect(await Promise.all(oldRows.map(status))).toEqual([undefined, undefined]);
      expect(await status(kept)).toBe('sent');
    });

    it('90일이 지난 삭제 확인 코드만 지운다', async () => {
      await t.pool.query(
        `INSERT INTO instagram_deletion_requests (confirmation_code, created_at) VALUES
           ('aaaaaaaaaaaaaaaa', $1), ('bbbbbbbbbbbbbbbb', $2)`,
        [daysAgo(91), daysAgo(89)],
      );

      expect((await retention()).instagramDeletionCodes).toBe(1);

      const { rows } = await t.pool.query('SELECT confirmation_code FROM instagram_deletion_requests');
      expect(rows).toEqual([{ confirmation_code: 'bbbbbbbbbbbbbbbb' }]);
    });

    it('수신 거부 기록은 90일이 지나도 지우지 않는다', async () => {
      const hash = randomBytes(32);
      await t.pool.query(
        `INSERT INTO instagram_dm_opt_outs (ig_user_id, commenter_hash, created_at) VALUES ($1, $2, $3)`,
        ['ig-old', hash, daysAgo(400)],
      );

      await retention();

      expect((await t.pool.query('SELECT 1 FROM instagram_dm_opt_outs')).rowCount).toBe(1);
    });
  });

  describe('수신 거부 기록 유지', () => {
    async function connectThroughApi(igUserId: string): Promise<void> {
      const graph = t.app.get(InstagramGraph);
      jest.spyOn(graph, 'exchangeCode').mockResolvedValueOnce({ accessToken: 'plain-new-token', expiresAt: null });
      jest.spyOn(graph, 'fetchAccounts').mockResolvedValueOnce({
        metaUserId: `meta-${igUserId}`,
        accounts: [{ igUserId, username: `user_${igUserId}`, isProfessional: true }],
      });
      const started = await api<{ authorizationUrl: string }>(t.baseUrl, 'POST', '/api/me/instagram/connect', {
        cookie: creatorCookie,
      });
      expect(started.status).toBe(200);
      const stateCookie = started.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith(`${INSTAGRAM_OAUTH_STATE_COOKIE}=`))!
        .split(';')[0];
      const state = decodeURIComponent(stateCookie.slice(stateCookie.indexOf('=') + 1));
      const saved = await api<InstagramConnectionView>(t.baseUrl, 'POST', '/api/me/instagram/callback', {
        cookie: `${creatorCookie}; ${stateCookie}`,
        body: { code: 'code-1', state },
      });
      expect(saved.status).toBe(200);
    }

    const optOutCount = async () => (await t.pool.query('SELECT 1 FROM instagram_dm_opt_outs')).rowCount;

    it('일반 해제·재인증·재연결 뒤에도 남아 같은 사람에게 보내지 않는다', async () => {
      const hash = randomBytes(32);
      const igUserId = `ig-keep-${++sequence}`;
      const first = await seedAccount(creatorId, { igUserId });
      await t.pool.query('INSERT INTO instagram_dm_opt_outs (ig_user_id, commenter_hash) VALUES ($1, $2)', [
        igUserId,
        hash,
      ]);

      await t.app.get(InstagramConnectionService).markReauthRequired(first.connectionId, 1);
      expect(await optOutCount()).toBe(1);

      const disconnected = await api(t.baseUrl, 'DELETE', '/api/me/instagram', { cookie: creatorCookie });
      expect(disconnected.status).toBe(204);
      expect(
        (await t.pool.query('SELECT 1 FROM instagram_connections WHERE id = $1', [first.connectionId])).rowCount,
      ).toBe(0);
      expect(await optOutCount()).toBe(1);

      await connectThroughApi(igUserId);
      expect(await optOutCount()).toBe(1);

      const { rows } = await t.pool.query<{ id: string }>('SELECT id FROM instagram_connections WHERE user_id = $1', [
        creatorId,
      ]);
      const ruleId = await seedRule(rows[0].id);
      const blocked = await seedDelivery({ connectionId: rows[0].id, ruleId }, { hash });
      const allowed = await seedDelivery({ connectionId: rows[0].id, ruleId });

      expect((await tick()).claimed).toBe(1);
      expect(await status(blocked)).toBe('pending');
      expect(await status(allowed)).toBe('sent');
    });
  });
});
