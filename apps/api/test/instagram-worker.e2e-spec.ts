import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppConfig } from '../src/config.service';
import { Database } from '../src/database';
import { InstagramConnectionService } from '../src/instagram/connection.service';
import { encryptToken } from '../src/instagram/crypto';
import { InstagramGraph, InstagramGraphError } from '../src/instagram/graph';
import { InstagramWorkerService } from '../src/instagram/worker.service';
import { createTestApp, TestApp } from './test-app';

const TOKEN = 'plain-test-access-token';
const RAW_GRAPH_TEXT = 'raw-graph-response-body fbtrace_id=abc';
const CODES = { messagesAccess: new Set([990001]), policyRestriction: new Set([990002]) };

function key(): string {
  return randomBytes(32).toString('base64');
}

function graphError(
  kind: 'connect_failed' | 'indeterminate' | 'rejected',
  status: number | null,
  code: number | null = null,
  subcode: number | null = null,
  retryAfterSeconds: number | null = null,
) {
  return new InstagramGraphError('sendPrivateReply', kind, status, code, subcode, retryAfterSeconds);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await sleep(10);
  }
  throw new Error('조건을 기다리다 시간이 지났습니다.');
}

describe('Instagram DM 발송 worker', () => {
  let t: TestApp;
  let send: jest.SpiedFunction<InstagramGraph['sendPrivateReply']>;
  let reauth: jest.SpiedFunction<InstagramConnectionService['markReauthRequired']>;
  let captureMessage: jest.SpiedFunction<typeof Sentry.captureMessage>;
  let logs: jest.SpyInstance[];
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
        // 시험은 runOnce를 직접 부릅니다. 앱의 2초 타이머가 끼어들면 호출 횟수를 셀 수 없습니다.
        jest.spyOn(app.get(InstagramWorkerService), 'onApplicationBootstrap').mockImplementation(() => undefined);
      },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await t.pool.query('TRUNCATE instagram_connections, instagram_dm_opt_outs CASCADE');
    await t.pool.query(`UPDATE platform_settings SET instagram_dm_audience = 'everyone'`);
    send = jest.spyOn(t.app.get(InstagramGraph), 'sendPrivateReply').mockResolvedValue({ messageId: 'm' });
    reauth = jest.spyOn(t.app.get(InstagramConnectionService), 'markReauthRequired').mockResolvedValue(true);
    captureMessage = jest.spyOn(Sentry, 'captureMessage').mockReturnValue('event');
    logs = (['log', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function worker(): InstagramWorkerService {
    const created = new InstagramWorkerService(
      t.app.get(Database),
      t.app.get(AppConfig),
      t.app.get(InstagramGraph),
      t.app.get(InstagramConnectionService),
    );
    created.errorCodes = CODES;
    return created;
  }

  async function tick(target: InstagramWorkerService) {
    const result = await target.runOnce();
    await target.drain();
    return result;
  }

  async function seedAccount(options: { role?: string; revision?: number; expires?: string } = {}) {
    sequence += 1;
    const user = await t.pool.query<{ id: string }>(`INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id`, [
      `worker-${sequence}@example.com`,
      options.role ?? 'creator',
    ]);
    const connectionId = randomUUID();
    const encrypted = encryptToken(t.app.get(AppConfig).instagram!.tokenKeyring, connectionId, TOKEN);
    await t.pool.query(
      `INSERT INTO instagram_connections
         (id, user_id, ig_user_id, ig_username, status, token_ciphertext, token_key_version, token_revision, token_expires_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8)`,
      [
        connectionId,
        user.rows[0].id,
        `ig-${sequence}`,
        `name${sequence}`,
        encrypted.ciphertext,
        encrypted.keyVersion,
        options.revision ?? 3,
        options.expires ?? null,
      ],
    );
    const code = `code${String(sequence).padStart(4, '0')}`;
    await t.pool.query('INSERT INTO channel_link_codes (code) VALUES ($1) ON CONFLICT DO NOTHING', [code]);
    const rule = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, media_permalink, keyword, message, channel_link_code)
       VALUES ($1, $2, $3, 'https://example.com/p', '키워드', '지금 규칙 문구', $4) RETURNING id`,
      [`r${String(sequence).padStart(9, '0')}`, connectionId, `media-${sequence}`, code],
    );
    return { userId: user.rows[0].id, connectionId, ruleId: rule.rows[0].id, igUserId: `ig-${sequence}` };
  }

  type Account = Awaited<ReturnType<typeof seedAccount>>;

  async function seedDelivery(account: Account, options: { commentedAt?: string; hash?: Buffer } = {}) {
    sequence += 1;
    const commentId = `comment-${sequence}`;
    const hash = options.hash ?? randomBytes(32);
    const body = `저장된 본문 ${sequence}`;
    const { rows } = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_dm_deliveries (connection_id, rule_id, comment_id, commenter_hash, commented_at, message_body, status)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now() - interval '1 minute'), $6, 'pending') RETURNING id`,
      [account.connectionId, account.ruleId, commentId, hash, options.commentedAt ?? null, body],
    );
    return { id: rows[0].id, commentId, body, hash };
  }

  async function row(id: string) {
    const { rows } = await t.pool.query<{
      status: string;
      attempts: number;
      failure_code: string | null;
      lease_until: Date | null;
      sent_at: Date | null;
      retry_in: number;
    }>(
      `SELECT status, attempts, failure_code, lease_until, sent_at,
              extract(epoch FROM next_attempt_at - now())::float AS retry_in
       FROM instagram_dm_deliveries WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  async function connection(id: string) {
    const { rows } = await t.pool.query<{
      status: string;
      token_ciphertext: Buffer | null;
      operator_paused_at: Date | null;
      rate_window_count: number;
      rate_limited_in: number | null;
    }>(
      `SELECT status, token_ciphertext, operator_paused_at, rate_window_count,
              extract(epoch FROM rate_limited_until - now())::float AS rate_limited_in
       FROM instagram_connections WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  function makeDue(id: string) {
    return t.pool.query(`UPDATE instagram_dm_deliveries SET next_attempt_at = now() WHERE id = $1`, [id]);
  }

  /** 선점이 끝난 직후, 호출 직전 재확인 앞에 상태를 바꿉니다. */
  function afterClaim(target: InstagramWorkerService, change: () => Promise<unknown>) {
    const spied = target as unknown as { claim(slots: number, limit: number): Promise<unknown[]> };
    const original = spied.claim.bind(target);
    jest.spyOn(spied, 'claim').mockImplementation(async (slots, limit) => {
      const claims = await original(slots, limit);
      await change();
      return claims;
    });
  }

  function loggedText(): string {
    return JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
  }

  describe('선점', () => {
    it('worker 2개가 동시에 돌아도 한 건은 Graph를 1회만 부른다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      const [first, second] = [worker(), worker()];

      await Promise.all([first.runOnce(), second.runOnce()]);
      await Promise.all([first.drain(), second.drain()]);

      expect(send).toHaveBeenCalledTimes(1);
      expect(await row(delivery.id)).toMatchObject({ status: 'sent', attempts: 0, lease_until: null });
      expect((await row(delivery.id)).sent_at).not.toBeNull();
    });

    it('여러 건을 worker 2개가 나눠도 댓글마다 정확히 1회만 호출한다', async () => {
      const account = await seedAccount();
      const deliveries = [];
      for (let index = 0; index < 12; index += 1) deliveries.push(await seedDelivery(account));
      const [first, second] = [worker(), worker()];

      for (let round = 0; round < 8; round += 1) {
        await Promise.all([first.runOnce(), second.runOnce()]);
        await Promise.all([first.drain(), second.drain()]);
      }

      const called = send.mock.calls.map((call) => call[2]).sort();
      expect(called).toEqual(deliveries.map((delivery) => delivery.commentId).sort());
    });

    it.each([
      ['발송 행', 'SELECT 1 FROM instagram_dm_deliveries FOR UPDATE'],
      ['연결 행', 'SELECT 1 FROM instagram_connections FOR UPDATE'],
    ])('다른 트랜잭션이 잠근 %s은 기다리지 않고 건너뛴다', async (_name, lockSql) => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      const client = await t.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(lockSql);
        expect((await tick(worker())).claimed).toBe(0);
        expect(send).not.toHaveBeenCalled();
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      expect((await tick(worker())).claimed).toBe(1);
      expect((await row(delivery.id)).status).toBe('sent');
    });

    it('빈 슬롯 수만큼만 선점한다(프로세스당 5건, 메모리 대기열 없음)', async () => {
      const account = await seedAccount();
      const deliveries = [];
      for (let index = 0; index < 7; index += 1) deliveries.push(await seedDelivery(account));
      const held = [deferred<{ messageId: string | null }>()];
      for (let index = 0; index < 4; index += 1) held.push(deferred());
      let call = 0;
      send.mockImplementation(() => held[call++]?.promise ?? Promise.resolve({ messageId: 'm' }));
      const target = worker();

      expect((await target.runOnce()).claimed).toBe(5);
      await waitUntil(() => send.mock.calls.length === 5);
      const statuses = await Promise.all(deliveries.map((delivery) => row(delivery.id)));
      expect(statuses.filter((item) => item.status === 'sending')).toHaveLength(5);
      expect(statuses.filter((item) => item.status === 'pending')).toHaveLength(2);
      expect((await target.runOnce()).claimed).toBe(0);

      held[0].resolve({ messageId: 'm' });
      await waitUntil(() => (target as unknown as { inFlight: Set<unknown> }).inFlight.size === 4);
      expect((await target.runOnce()).claimed).toBe(1);
      for (const item of held.slice(1)) item.resolve({ messageId: 'm' });
      await target.drain();
      expect((await tick(target)).claimed).toBe(1);
      expect(send).toHaveBeenCalledTimes(7);
    });

    it.each([
      ['전체 스위치 off', `UPDATE platform_settings SET instagram_dm_audience = 'off'`],
      ['크리에이터 정지', `UPDATE instagram_connections SET dm_paused_at = now()`],
      ['운영자 정지', `UPDATE instagram_connections SET operator_paused_at = now()`],
      ['메시지 접근 꺼짐', `UPDATE instagram_connections SET status = 'messages_access_required'`],
      ['레이트 대기 중', `UPDATE instagram_connections SET rate_limited_until = now() + interval '1 minute'`],
      ['규칙 비활성', `UPDATE instagram_dm_rules SET enabled = false`],
      ['규칙 보관', `UPDATE instagram_dm_rules SET archived_at = now()`],
      ['사용자 정지', `UPDATE users SET suspended_at = now()`],
      ['토큰 만료', `UPDATE instagram_connections SET token_expires_at = now() - interval '1 second'`],
      ['다음 시도 전', `UPDATE instagram_dm_deliveries SET next_attempt_at = now() + interval '1 minute'`],
    ])('%s이면 선점도 호출도 하지 않는다', async (_name, sql) => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      await t.pool.query(sql);

      expect((await tick(worker())).claimed).toBe(0);

      expect(send).not.toHaveBeenCalled();
      expect((await row(delivery.id)).status).toBe('pending');
    });

    it('수신 거부 대상은 선점하지 않는다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      await t.pool.query('INSERT INTO instagram_dm_opt_outs (ig_user_id, commenter_hash) VALUES ($1, $2)', [
        account.igUserId,
        delivery.hash,
      ]);

      expect((await tick(worker())).claimed).toBe(0);
      expect(send).not.toHaveBeenCalled();
    });

    it('audience=operators면 운영자 계정의 건만 보낸다', async () => {
      await t.pool.query(`UPDATE platform_settings SET instagram_dm_audience = 'operators'`);
      const operator = await seedDelivery(await seedAccount({ role: 'operator' }));
      const creator = await seedDelivery(await seedAccount());

      await tick(worker());

      expect((await row(operator.id)).status).toBe('sent');
      expect((await row(creator.id)).status).toBe('pending');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('시간당 예산을 넘겨 선점하지 않고 창이 지나면 다시 센다', async () => {
      const account = await seedAccount();
      for (let index = 0; index < 4; index += 1) await seedDelivery(account);
      process.env.INSTAGRAM_DM_HOURLY_LIMIT = '2';
      try {
        const target = worker();
        expect((await tick(target)).claimed).toBe(2);
        expect((await tick(target)).claimed).toBe(0);
        expect((await connection(account.connectionId)).rate_window_count).toBe(2);

        await t.pool.query(`UPDATE instagram_connections SET rate_window_started_at = now() - interval '61 minutes'`);
        expect((await tick(target)).claimed).toBe(2);
        expect((await connection(account.connectionId)).rate_window_count).toBe(2);
        expect(send).toHaveBeenCalledTimes(4);
      } finally {
        delete process.env.INSTAGRAM_DM_HOURLY_LIMIT;
      }
    });

    it('worker 2개가 동시에 돌아도 시간당 예산을 겹쳐 쓰지 않는다', async () => {
      const account = await seedAccount();
      for (let index = 0; index < 10; index += 1) await seedDelivery(account);
      process.env.INSTAGRAM_DM_HOURLY_LIMIT = '6';
      try {
        const [first, second] = [worker(), worker()];
        for (let round = 0; round < 5; round += 1) {
          await Promise.all([first.runOnce(), second.runOnce()]);
          await Promise.all([first.drain(), second.drain()]);
        }
        expect(send).toHaveBeenCalledTimes(6);
        expect((await connection(account.connectionId)).rate_window_count).toBe(6);
      } finally {
        delete process.env.INSTAGRAM_DM_HOURLY_LIMIT;
      }
    });

    it('24시간 지난 pending은 expired로 끝나고 보내지 않는다', async () => {
      const account = await seedAccount();
      const old = await seedDelivery(account, {
        commentedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000).toISOString(),
      });

      expect(await tick(worker())).toMatchObject({ claimed: 0, expired: 1 });

      expect((await row(old.id)).status).toBe('expired');
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('호출 직전 재확인과 본문', () => {
    it('규칙 문구가 아니라 저장된 message_body를 복호화한 토큰으로 보낸다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);

      await tick(worker());

      expect(send).toHaveBeenCalledWith(TOKEN, account.igUserId, delivery.commentId, delivery.body);
      expect(send.mock.calls[0][3]).not.toContain('지금 규칙 문구');
    });

    it.each([
      ['전체 스위치 off', `UPDATE platform_settings SET instagram_dm_audience = 'off'`],
      ['크리에이터 정지', `UPDATE instagram_connections SET dm_paused_at = now()`],
      ['운영자 정지', `UPDATE instagram_connections SET operator_paused_at = now()`],
      ['규칙 비활성', `UPDATE instagram_dm_rules SET enabled = false`],
      ['규칙 보관', `UPDATE instagram_dm_rules SET archived_at = now()`],
    ])('선점 뒤 %s이면 호출 0건이고 취소로 끝난다', async (_name, sql) => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      const target = worker();
      afterClaim(target, () => t.pool.query(sql));

      expect((await tick(target)).claimed).toBe(1);

      expect(send).not.toHaveBeenCalled();
      expect(await row(delivery.id)).toMatchObject({
        status: 'cancelled',
        failure_code: 'stopped_before_send',
        lease_until: null,
      });
    });

    it('자기 lease가 끝났으면 호출하지 않고 만료 처리가 unknown으로 끝낸다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      const target = worker();
      afterClaim(target, () =>
        t.pool.query(`UPDATE instagram_dm_deliveries SET lease_until = now() - interval '1 second'`),
      );

      await tick(target);
      expect(send).not.toHaveBeenCalled();
      expect((await row(delivery.id)).status).toBe('sending');

      jest.restoreAllMocks();
      send = jest.spyOn(t.app.get(InstagramGraph), 'sendPrivateReply').mockResolvedValue({ messageId: 'm' });
      expect((await tick(worker())).leaseExpired).toBe(1);
      expect(await row(delivery.id)).toMatchObject({ status: 'unknown', failure_code: 'lease_expired' });
      expect(send).not.toHaveBeenCalled();
    });

    it('다른 값으로 바뀐 lease는 자기 lease가 아니므로 호출하지 않는다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      const target = worker();
      afterClaim(target, () =>
        t.pool.query(`UPDATE instagram_dm_deliveries SET lease_until = now() + interval '1 hour'`),
      );

      await tick(target);

      expect(send).not.toHaveBeenCalled();
      expect((await row(delivery.id)).status).toBe('sending');
    });
  });

  describe('결과 기록', () => {
    it('lease가 만료된 sending은 unknown이고 다시 보내지 않는다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      await t.pool.query(
        `UPDATE instagram_dm_deliveries SET status = 'sending', lease_until = now() - interval '1 second'`,
      );

      expect((await tick(worker())).leaseExpired).toBe(1);
      expect(await row(delivery.id)).toMatchObject({ status: 'unknown', lease_until: null, attempts: 0 });

      await tick(worker());
      expect(send).not.toHaveBeenCalled();
    });

    it('lease 만료로 unknown이 된 뒤 늦게 온 응답은 결과를 덮어쓰지 않는다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      const held = deferred<{ messageId: string | null }>();
      send.mockReturnValue(held.promise);
      const target = worker();
      await target.runOnce();
      await waitUntil(() => send.mock.calls.length === 1);

      await t.pool.query(`UPDATE instagram_dm_deliveries SET status = 'unknown', lease_until = NULL`);
      held.resolve({ messageId: 'm' });
      await target.drain();

      expect(await row(delivery.id)).toMatchObject({ status: 'unknown', sent_at: null });
    });

    it.each([
      ['타임아웃', graphError('indeterminate', null)],
      ['5xx', graphError('indeterminate', 503)],
      ['응답 전 끊김', graphError('indeterminate', null)],
      ['분류할 수 없는 예외', new Error(RAW_GRAPH_TEXT)],
    ])('%s은 unknown이고 재시도 0회다', async (_name, error) => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      send.mockRejectedValue(error);
      const target = worker();

      await tick(target);
      await makeDue(delivery.id);
      await tick(target);

      expect(send).toHaveBeenCalledTimes(1);
      expect(await row(delivery.id)).toMatchObject({ status: 'unknown', failure_code: 'indeterminate', attempts: 0 });
    });

    it('연결 전 실패만 30초·2분·10분·1시간 간격으로 재시도하고 4회 뒤 failed다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      send.mockRejectedValue(graphError('connect_failed', null));
      const target = worker();

      for (const [index, delay] of [30, 120, 600, 3600].entries()) {
        await tick(target);
        const current = await row(delivery.id);
        expect(current).toMatchObject({ status: 'pending', attempts: index + 1, failure_code: 'connect_failed' });
        expect(current.retry_in).toBeGreaterThan(delay - 5);
        expect(current.retry_in).toBeLessThanOrEqual(delay);
        await tick(target);
        expect(send).toHaveBeenCalledTimes(index + 1);
        await makeDue(delivery.id);
      }

      await tick(target);
      expect(send).toHaveBeenCalledTimes(5);
      expect(await row(delivery.id)).toMatchObject({ status: 'failed', attempts: 5, lease_until: null });

      await tick(target);
      expect(send).toHaveBeenCalledTimes(5);
    });

    it('재시도 뒤 성공하면 실패 표시를 지운다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      send.mockRejectedValueOnce(graphError('connect_failed', null));
      const target = worker();

      await tick(target);
      await makeDue(delivery.id);
      await tick(target);

      expect(await row(delivery.id)).toMatchObject({ status: 'sent', failure_code: null, attempts: 1 });
    });

    it.each<[string, number, number | null, number | null, number | null, number]>([
      ['613 헤더 대기', 400, 613, null, 120, 120],
      ['서브코드 2534040', 400, null, 2534040, 300, 300],
      ['80002 헤더 대기', 400, 80002, null, 60, 60],
      ['429 헤더 대기', 429, null, null, 45, 45],
      ['613 대기 값 없음', 400, 613, null, null, 3600],
      ['429 대기 값 없음', 429, null, null, null, 3600],
    ])('%s은 레이트 대기를 걸고 시도 횟수를 쓰지 않는다', async (_name, status, code, subcode, wait, expected) => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      const other = await seedDelivery(account);
      send.mockRejectedValueOnce(graphError('rejected', status, code, subcode, wait));
      send.mockResolvedValue({ messageId: 'm' });
      await t.pool.query(
        `UPDATE instagram_dm_deliveries SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`,
        [other.id],
      );
      const target = worker();

      await tick(target);

      const limited = await connection(account.connectionId);
      expect(limited.rate_limited_in).toBeGreaterThan(expected - 5);
      expect(limited.rate_limited_in).toBeLessThanOrEqual(expected);
      const current = await row(delivery.id);
      expect(current).toMatchObject({ status: 'pending', attempts: 0, lease_until: null });
      expect(current.retry_in).toBeGreaterThan(expected - 5);

      await makeDue(delivery.id);
      expect((await tick(target)).claimed).toBe(0);
      expect(send).toHaveBeenCalledTimes(1);

      await t.pool.query(`UPDATE instagram_connections SET rate_limited_until = now() - interval '1 second'`);
      await tick(target);
      expect(await row(delivery.id)).toMatchObject({ status: 'sent', attempts: 0 });
    });

    it('이미 긴 레이트 대기를 더 짧은 응답이 줄이지 않는다', async () => {
      const account = await seedAccount();
      await seedDelivery(account);
      await t.pool.query(`UPDATE instagram_connections SET rate_limited_until = now() - interval '1 second'`);
      send.mockImplementationOnce(async () => {
        await t.pool.query(`UPDATE instagram_connections SET rate_limited_until = now() + interval '1 hour'`);
        throw graphError('rejected', 429, null, null, 10);
      });

      await tick(worker());

      expect((await connection(account.connectionId)).rate_limited_in).toBeGreaterThan(3000);
    });

    it('토큰 무효는 재시도 0회이고 읽은 revision으로 재인증 전이를 부른다', async () => {
      const account = await seedAccount({ revision: 7 });
      const delivery = await seedDelivery(account);
      send.mockRejectedValue(graphError('rejected', 401, 190));
      const target = worker();

      await tick(target);
      await tick(target);

      expect(send).toHaveBeenCalledTimes(1);
      expect(reauth).toHaveBeenCalledTimes(1);
      expect(reauth).toHaveBeenCalledWith(account.connectionId, 7);
      expect(await row(delivery.id)).toMatchObject({ status: 'failed', failure_code: 'token_invalid', attempts: 0 });
    });

    it('호출 중 토큰이 바뀌어도 호출 직전에 읽은 revision을 넘긴다', async () => {
      const account = await seedAccount({ revision: 4 });
      await seedDelivery(account);
      send.mockImplementationOnce(async () => {
        await t.pool.query('UPDATE instagram_connections SET token_revision = 5');
        throw graphError('rejected', 401, 190);
      });

      await tick(worker());

      expect(reauth).toHaveBeenCalledWith(account.connectionId, 4);
    });

    it('재인증 전이가 실패해도 발송 건은 failed로 남고 원문을 로그에 쓰지 않는다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      send.mockRejectedValue(graphError('rejected', 401, 190));
      reauth.mockRejectedValue(new Error(RAW_GRAPH_TEXT));

      await tick(worker());

      expect((await row(delivery.id)).status).toBe('failed');
      expect(loggedText()).not.toContain(RAW_GRAPH_TEXT);
    });

    it('메시지 접근 꺼짐은 연결 상태를 바꾸고 pending을 취소하되 토큰을 유지한다', async () => {
      const account = await seedAccount();
      const first = await seedDelivery(account);
      const waiting = await seedDelivery(account);
      await t.pool.query(
        `UPDATE instagram_dm_deliveries SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`,
        [waiting.id],
      );
      send.mockRejectedValue(graphError('rejected', 403, 990001));

      await tick(worker());

      const changed = await connection(account.connectionId);
      expect(changed.status).toBe('messages_access_required');
      expect(changed.token_ciphertext).not.toBeNull();
      expect(reauth).not.toHaveBeenCalled();
      expect(await row(first.id)).toMatchObject({ status: 'failed', failure_code: 'messages_access_required' });
      expect((await row(waiting.id)).status).toBe('cancelled');
    });

    it('호출 중 토큰이 바뀌었으면 메시지 접근 오류로 연결을 바꾸지 않는다', async () => {
      const account = await seedAccount();
      const first = await seedDelivery(account);
      const waiting = await seedDelivery(account);
      await t.pool.query(
        `UPDATE instagram_dm_deliveries SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`,
        [waiting.id],
      );
      send.mockImplementationOnce(async () => {
        await t.pool.query('UPDATE instagram_connections SET token_revision = token_revision + 1');
        throw graphError('rejected', 403, 990001);
      });

      await tick(worker());

      expect((await connection(account.connectionId)).status).toBe('active');
      expect((await row(first.id)).status).toBe('failed');
      expect((await row(waiting.id)).status).toBe('pending');
    });

    it('정책 제재는 계정을 자동 정지하고 pending을 취소하며 운영 알림을 남긴다', async () => {
      const account = await seedAccount();
      const first = await seedDelivery(account);
      const waiting = await seedDelivery(account);
      await t.pool.query(
        `UPDATE instagram_dm_deliveries SET next_attempt_at = now() + interval '1 hour' WHERE id = $1`,
        [waiting.id],
      );
      send.mockRejectedValue(graphError('rejected', 403, 990002));
      const target = worker();

      await tick(target);

      expect((await connection(account.connectionId)).operator_paused_at).not.toBeNull();
      expect(await row(first.id)).toMatchObject({ status: 'failed', failure_code: 'policy_restricted' });
      expect((await row(waiting.id)).status).toBe('cancelled');
      expect(captureMessage).toHaveBeenCalledTimes(1);
      expect(captureMessage.mock.calls[0][1]).toMatchObject({
        level: 'warning',
        extra: { connectionId: account.connectionId },
      });

      await tick(target);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('코드표에 없는 거절은 재시도 없이 failed다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      send.mockRejectedValue(graphError('rejected', 400));
      const target = worker();

      await tick(target);
      await makeDue(delivery.id);
      await tick(target);

      expect(send).toHaveBeenCalledTimes(1);
      expect(await row(delivery.id)).toMatchObject({ status: 'failed', failure_code: 'rejected' });
      expect((await connection(account.connectionId)).status).toBe('active');
    });

    it('토큰을 복호화하지 못하면 호출 없이 failed다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      await t.pool.query(
        `UPDATE instagram_connections SET token_ciphertext = '\\x00112233445566778899aabbccddeeff00112233445566778899aabb'`,
      );

      await tick(worker());

      expect(send).not.toHaveBeenCalled();
      expect(await row(delivery.id)).toMatchObject({ status: 'failed', failure_code: 'token_unreadable' });
    });

    it('로그에 Graph 원문·토큰·댓글 ID·본문을 남기지 않는다', async () => {
      const account = await seedAccount();
      const raw = await seedDelivery(account);
      const rejected = await seedDelivery(account);
      // 두 건은 동시에 나가므로 호출 순서가 아니라 댓글 ID로 응답을 고릅니다.
      send.mockImplementation(async (_token, _igUserId, commentId) => {
        throw commentId === raw.commentId ? new Error(RAW_GRAPH_TEXT) : graphError('rejected', 429, null, null, 30);
      });

      await tick(worker());

      expect((await row(raw.id)).status).toBe('unknown');
      expect((await row(rejected.id)).status).toBe('pending');
      const text = loggedText();
      for (const secret of [RAW_GRAPH_TEXT, TOKEN, raw.commentId, rejected.commentId, raw.body, rejected.body]) {
        expect(text).not.toContain(secret);
      }
    });
  });

  describe('시작과 종료', () => {
    it('onModuleDestroy는 선점을 멈추고 진행 중 호출을 기다린다', async () => {
      const account = await seedAccount();
      const delivery = await seedDelivery(account);
      const later = await seedDelivery(account);
      const held = deferred<{ messageId: string | null }>();
      send.mockReturnValueOnce(held.promise);
      process.env.INSTAGRAM_DM_HOURLY_LIMIT = '1';
      const target = worker();
      try {
        await target.runOnce();
        await waitUntil(() => send.mock.calls.length === 1);
      } finally {
        delete process.env.INSTAGRAM_DM_HOURLY_LIMIT;
      }

      let closed = false;
      const closing = target.onModuleDestroy().then(() => {
        closed = true;
      });
      await sleep(50);
      expect(closed).toBe(false);
      expect((await target.runOnce()).claimed).toBe(0);

      held.resolve({ messageId: 'm' });
      await closing;
      expect((await row(delivery.id)).status).toBe('sent');
      expect((await row(later.id)).status).toBe('pending');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('설정이 없으면 타이머를 시작하지 않고 runOnce도 DB를 건드리지 않는다', async () => {
      const interval = jest.spyOn(global, 'setInterval');
      const database = { query: jest.fn() };
      const target = new InstagramWorkerService(
        database as unknown as Database,
        { instagram: null } as unknown as AppConfig,
        t.app.get(InstagramGraph),
        t.app.get(InstagramConnectionService),
      );

      target.onApplicationBootstrap();

      expect(interval).not.toHaveBeenCalled();
      expect(await target.runOnce()).toEqual({ claimed: 0, leaseExpired: 0, expired: 0 });
      expect(database.query).not.toHaveBeenCalled();
    });

    it('설정이 있으면 2초 타이머로 시작하고 종료 때 멈춘다', async () => {
      const interval = jest.spyOn(global, 'setInterval');
      const clear = jest.spyOn(global, 'clearInterval');
      const target = worker();

      target.onApplicationBootstrap();

      expect(interval).toHaveBeenCalledTimes(1);
      expect(interval.mock.calls[0][1]).toBe(2000);
      await target.onModuleDestroy();
      expect(clear).toHaveBeenCalledWith(interval.mock.results[0].value);
    });
  });
});
