import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { ChannelLinkView } from '@crelink/shared';
import { createHmac, randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client, type PoolClient } from 'pg';
import { randomId } from '../src/common/http';
import { Database } from '../src/database';
import { commenterHash } from '../src/instagram/crypto';
import { LOCK_CONNECTIONS, LOCK_RULES, LOCK_SETTINGS } from '../src/instagram/lock-order';
import { INSTAGRAM_WEBHOOK_BODY_LIMIT } from '../src/instagram/raw-body';
import { api, createTestApp, login, TestApp, WEB_URL } from './test-app';

const APP_SECRET = randomBytes(32).toString('hex');
const VERIFY_TOKEN = randomBytes(16).toString('hex');
const HASH_KEY = randomBytes(32);
const OPT_OUT_KEY = randomBytes(32);
const INSTAGRAM_ENV: Record<string, string> = {
  META_APP_ID: 'test-app-id',
  META_APP_SECRET: APP_SECRET,
  META_LOGIN_CONFIG_ID: 'test-login-config',
  META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
  INSTAGRAM_TOKEN_KEYS: `1:${randomBytes(32).toString('base64')}`,
  INSTAGRAM_TOKEN_KEY_CURRENT: '1',
  INSTAGRAM_COMMENTER_HASH_KEY: HASH_KEY.toString('base64'),
  INSTAGRAM_OPT_OUT_KEY: OPT_OUT_KEY.toString('base64'),
};

const WEBHOOK_PATH = '/api/webhooks/instagram';
const DELETION_PATH = '/api/webhooks/instagram/data-deletion';
const KEYWORD = '신청';
const MATCHING_TEXT = '저도 신청합니다 고유문구';
const RULE_MESSAGE = '신청해 주셔서 고마워요';
const INSERT_SQL = 'INSERT INTO instagram_dm_deliveries';

interface Account {
  cookie: string;
  publicId: string;
  userId: string;
  igUserId: string;
  metaUserId: string;
  mediaId: string;
  connectionId: string;
  ruleId: string;
  code: string;
}

interface DeliveryRow {
  id: string;
  comment_id: string;
  rule_id: string;
  connection_id: string;
  commenter_hash: Buffer;
  commented_at: Date;
  message_body: string;
  status: string;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const HOURS = 3600;

const sign = (raw: Buffer | string) => `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;

const change = (account: Account, value: Record<string, unknown> = {}) => ({
  field: 'comments',
  value: {
    id: `c${randomId(16)}`,
    text: MATCHING_TEXT,
    from: { id: `f${randomId(16)}`, username: 'commenter_name' },
    media: { id: account.mediaId, media_product_type: 'FEED' },
    ...value,
  },
});

const webhook = (account: Account, changes: unknown[], time: unknown = nowSeconds()) => ({
  object: 'instagram',
  entry: [{ id: account.igUserId, time, changes }],
});

describe('Instagram 웹훅 수신·데이터 삭제 콜백 (0257, docs/specs/instagram-comment-dm.md)', () => {
  let t: TestApp;
  let database: Database;
  let n = 0;

  const send = (raw: Buffer | string, signature: string | null = sign(raw)) =>
    fetch(`${t.baseUrl}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature === null ? {} : { 'x-hub-signature-256': signature }),
      },
      body: typeof raw === 'string' ? raw : new Uint8Array(raw),
    });
  const post = (payload: unknown) => send(JSON.stringify(payload));

  const rowsOf = async (account: Account) =>
    (
      await t.pool.query<DeliveryRow>('SELECT * FROM instagram_dm_deliveries WHERE connection_id=$1', [
        account.connectionId,
      ])
    ).rows;
  const setAudience = (audience: 'off' | 'operators' | 'everyone') =>
    t.pool.query('UPDATE platform_settings SET instagram_dm_audience=$1', [audience]);

  const newAccount = async (options: { ruleCreatedAt?: string } = {}): Promise<Account> => {
    n += 1;
    const signedIn = await login(t.baseUrl, `ig-${n}|ig${n}@example.com`);
    const cookie = signedIn.cookie!;
    const publicId = randomId(10);
    const created = await api<ChannelLinkView>(t.baseUrl, 'POST', '/api/me/channel-links', {
      cookie,
      body: { channel: 'instagram', placement: 'dm' },
    });
    expect(created.status).toBe(201);
    const userId = signedIn.body.user!.id;
    const igUserId = `1784${String(n).padStart(6, '0')}`;
    const metaUserId = `9${igUserId}`;
    const mediaId = `m${igUserId}`;
    const connection = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_connections (user_id, ig_user_id, meta_user_id, ig_username, status, token_ciphertext, token_key_version)
       VALUES ($1,$2,$3,$4,'active','\\x00',1) RETURNING id`,
      [userId, igUserId, metaUserId, `user${n}`],
    );
    const connectionId = connection.rows[0].id;
    const rule = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, media_permalink, keyword, message, channel_link_code, created_at)
       VALUES ($1,$2,$3,'https://instagram.test/p/1',$4,$5,$6, COALESCE($7::timestamptz, now() - interval '48 hours')) RETURNING id`,
      [publicId, connectionId, mediaId, KEYWORD, RULE_MESSAGE, created.body.code, options.ruleCreatedAt ?? null],
    );
    return {
      cookie,
      publicId,
      userId,
      igUserId,
      metaUserId,
      mediaId,
      connectionId,
      ruleId: rule.rows[0].id,
      code: created.body.code,
    };
  };

  /**
   * 저장 트랜잭션(`database.transaction`)의 쿼리를 관찰하거나 끼어듭니다. 돌려주는 배열에 SQL이 순서대로 쌓입니다.
   * `intercept`가 없으면 그대로 실행합니다.
   */
  const interceptTransaction = (intercept?: (sql: string, forward: () => Promise<unknown>) => Promise<unknown>) => {
    const real = database.transaction.bind(database);
    const sqls: string[] = [];
    jest.spyOn(database, 'transaction').mockImplementation(((run: (client: PoolClient) => Promise<unknown>) =>
      real((client) => {
        const query = (...args: unknown[]) => {
          sqls.push(String(args[0]));
          const forward = () => (client.query as (...values: unknown[]) => Promise<unknown>)(...args);
          return intercept ? intercept(String(args[0]), forward) : forward();
        };
        return run({ query } as unknown as PoolClient);
      })) as never);
    return sqls;
  };

  beforeAll(async () => {
    t = await createTestApp({ env: INSTAGRAM_ENV });
    database = t.app.get(Database);
    await setAudience('everyone');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('GET 구독 확인', () => {
    const verify = (query: string) => fetch(`${t.baseUrl}${WEBHOOK_PATH}?${query}`);

    it('verify_token이 맞으면 challenge를 text/plain으로 돌려준다', async () => {
      const response = await verify(`hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await response.text()).toBe('1158201444');
    });

    it.each([
      ['틀린 토큰', 'hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1'],
      ['틀린 mode', `hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`],
      ['형식이 틀린 challenge', `hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=%3Cscript%3E`],
      ['challenge 없음', `hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}`],
    ])('%s는 403', async (_name, query) => {
      expect((await verify(query)).status).toBe(403);
    });
  });

  describe('설정 없음', () => {
    it('Instagram 설정이 없으면 GET·POST·삭제 콜백 모두 503 instagram_not_configured', async () => {
      const saved = Object.keys(INSTAGRAM_ENV).map((key) => [key, process.env[key]] as const);
      for (const [key] of saved) delete process.env[key];
      try {
        const responses = await Promise.all([
          fetch(`${t.baseUrl}${WEBHOOK_PATH}?hub.mode=subscribe`),
          send('{}'),
          fetch(`${t.baseUrl}${DELETION_PATH}`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: 'signed_request=a.b',
          }),
        ]);
        for (const response of responses) {
          expect(response.status).toBe(503);
          expect(await response.json()).toMatchObject({ code: 'instagram_not_configured' });
        }
      } finally {
        for (const [key, value] of saved) process.env[key] = value;
      }
    });
  });

  describe('서명', () => {
    it('위조 서명은 403이고 DB를 조회하지 않는다', async () => {
      const account = await newAccount();
      const query = jest.spyOn(database.pool, 'query');
      const raw = JSON.stringify(webhook(account, [change(account)]));
      const response = await send(raw, `sha256=${'0'.repeat(64)}`);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'forbidden' });
      expect(query).not.toHaveBeenCalled();
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('본문을 1바이트 바꾸면 403', async () => {
      const account = await newAccount();
      const raw = Buffer.from(JSON.stringify(webhook(account, [change(account)])));
      const signature = sign(raw);
      const tampered = Buffer.from(raw);
      tampered[tampered.length - 2] ^= 1;
      expect((await send(tampered, signature)).status).toBe(403);
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('다른 시크릿으로 서명하면 403', async () => {
      const account = await newAccount();
      const raw = JSON.stringify(webhook(account, [change(account)]));
      const signature = `sha256=${createHmac('sha256', 'other-secret').update(raw).digest('hex')}`;
      expect((await send(raw, signature)).status).toBe(403);
    });

    it.each([
      ['헤더 없음', null],
      ['접두어 없음', 'a'.repeat(64)],
      ['짧은 값', 'sha256=abcd'],
      ['긴 값', `sha256=${'a'.repeat(66)}`],
      ['hex 아님', `sha256=${'z'.repeat(64)}`],
    ])('%s은 403', async (_name, signature) => {
      expect((await send('{}', signature)).status).toBe(403);
    });

    it('다른 표기의 경로는 원문을 보관하지 않아 서명이 맞아도 403', async () => {
      const raw = '{"entry":[]}';
      const response = await fetch(`${t.baseUrl}${WEBHOOK_PATH}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw) },
        body: raw,
      });
      expect(response.status).toBe(403);
    });

    it('JSON 공백까지 포함한 원문 바이트로 검증한다', async () => {
      const account = await newAccount();
      const raw = `  ${JSON.stringify(webhook(account, [change(account)]), null, 2)}\n`;
      expect((await send(raw)).status).toBe(200);
      expect(await rowsOf(account)).toHaveLength(1);
    });
  });

  describe('원문 상한', () => {
    it('상한과 같은 크기는 처리한다', async () => {
      const account = await newAccount();
      const json = JSON.stringify(webhook(account, [change(account)]));
      const raw = Buffer.alloc(INSTAGRAM_WEBHOOK_BODY_LIMIT, ' ');
      raw.write(json);
      const response = await send(raw);
      expect(response.status).toBe(200);
      expect(await rowsOf(account)).toHaveLength(1);
    });

    it('상한을 넘긴 Content-Length는 413', async () => {
      const raw = Buffer.alloc(INSTAGRAM_WEBHOOK_BODY_LIMIT + 1, ' ');
      const response = await send(raw);
      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ code: 'validation_failed' });
    });

    it('Content-Length 없이 상한을 넘기면 413이고 서버는 계속 동작한다', async () => {
      const { hostname, port } = new URL(t.baseUrl);
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          { hostname, port, path: WEBHOOK_PATH, method: 'POST', headers: { 'transfer-encoding': 'chunked' } },
          (response) => {
            response.resume();
            resolve(response.statusCode!);
          },
        );
        request.on('error', reject);
        request.write(Buffer.alloc(INSTAGRAM_WEBHOOK_BODY_LIMIT + 1, ' '));
      });
      expect(status).toBe(413);
      const account = await newAccount();
      expect((await post(webhook(account, [change(account)]))).status).toBe(200);
    });
  });

  describe('저장', () => {
    it.each([RULE_MESSAGE, '  신청해 주셔서 고마워요 💌\n\nhttps://creator.test/content?from=dm  '])(
      '규칙 문구를 접미사 없이 그대로 저장하고 댓글 원문·from.id를 저장하지 않는다 (%s)',
      async (message) => {
        const account = await newAccount();
        await t.pool.query('UPDATE instagram_dm_rules SET message = $2 WHERE id = $1', [account.ruleId, message]);
        const fromId = `from${randomId(16)}`;
        const commentId = `comment${randomId(16)}`;
        const response = await post(
          webhook(account, [change(account, { id: commentId, from: { id: fromId, username: 'secret_name' } })]),
        );
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('');

        const [row, ...rest] = await rowsOf(account);
        expect(rest).toHaveLength(0);
        expect(row).toMatchObject({ comment_id: commentId, rule_id: account.ruleId, status: 'pending' });

        const expectedHash = commenterHash(HASH_KEY, account.igUserId, fromId);
        expect(row.commenter_hash.equals(expectedHash)).toBe(true);

        expect(row.message_body).toBe(message);

        const dump = (
          await t.pool.query<{ text: string }>(
            'SELECT to_jsonb(d)::text AS text FROM instagram_dm_deliveries d WHERE connection_id=$1',
            [account.connectionId],
          )
        ).rows[0].text;
        expect(dump).not.toContain(MATCHING_TEXT);
        expect(dump).not.toContain(fromId);
        expect(dump).not.toContain('secret_name');
      },
    );

    it('value.id와 value.comment_id를 모두 받는다', async () => {
      const account = await newAccount();
      const byId = change(account);
      const byCommentId = change(account);
      const { id: commentId, ...withoutId } = byCommentId.value;
      expect(
        (await post(webhook(account, [byId, { field: 'comments', value: { ...withoutId, comment_id: commentId } }])))
          .status,
      ).toBe(200);
      const ids = (await rowsOf(account)).map((row) => row.comment_id).sort();
      expect(ids).toEqual([byId.value.id as string, commentId as string].sort());
    });

    it('둘 다 있으면 value.id를 쓴다', async () => {
      const account = await newAccount();
      await post(webhook(account, [change(account, { id: 'primary-id', comment_id: 'secondary-id' })]));
      expect((await rowsOf(account))[0].comment_id).toBe('primary-id');
    });

    it('commented_at은 entry.time이고 초와 밀리초를 받는다', async () => {
      const seconds = await newAccount();
      const secondsTime = nowSeconds() - 2 * HOURS;
      await post(webhook(seconds, [change(seconds)], secondsTime));
      expect((await rowsOf(seconds))[0].commented_at.getTime()).toBe(secondsTime * 1000);

      const milliseconds = await newAccount();
      const millisecondsTime = Date.now() - 3 * HOURS * 1000;
      await post(webhook(milliseconds, [change(milliseconds)], millisecondsTime));
      expect((await rowsOf(milliseconds))[0].commented_at.getTime()).toBe(millisecondsTime);
    });

    it.each([
      ['없음', undefined],
      ['문자열', '2026-01-01'],
      ['0', 0],
      ['음수', -1],
      ['먼 미래', nowSeconds() + 365 * 24 * HOURS],
    ])('entry.time이 %s이면 수신 시각을 쓴다', async (_name, time) => {
      const account = await newAccount();
      const before = Date.now();
      const body = {
        object: 'instagram',
        entry: [{ id: account.igUserId, ...(time === undefined ? {} : { time }), changes: [change(account)] }],
      };
      expect((await post(body)).status).toBe(200);
      const [row] = await rowsOf(account);
      expect(row.commented_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(row.commented_at.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('규칙의 자식 게시물 ID도 일치로 본다', async () => {
      const account = await newAccount();
      await t.pool.query('UPDATE instagram_dm_rules SET ig_media_child_ids=$1 WHERE id=$2', [
        ['child-1'],
        account.ruleId,
      ]);
      await post(webhook(account, [change(account, { media: { id: 'child-1' } })]));
      expect(await rowsOf(account)).toHaveLength(1);
    });
  });

  describe('저장하지 않는 경우', () => {
    it('키워드나 게시물이 맞지 않으면 저장 0, INSERT 없음', async () => {
      const account = await newAccount();
      const sqls = interceptTransaction();
      const response = await post(
        webhook(account, [
          change(account, { text: '전혀 다른 댓글' }),
          change(account, { media: { id: 'other-media' } }),
        ]),
      );
      expect(response.status).toBe(200);
      expect(sqls.filter((sql) => sql.includes(INSERT_SQL))).toHaveLength(0);
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('연결되지 않은 계정의 웹훅은 저장 0', async () => {
      const account = await newAccount();
      const other = { ...account, igUserId: '99999999' };
      expect((await post(webhook(other, [change(account)]))).status).toBe(200);
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('답글, 본인 댓글, comments 외 필드는 저장 0', async () => {
      const account = await newAccount();
      const response = await post(
        webhook(account, [
          change(account, { parent_id: 'parent-1' }),
          change(account, { from: { id: account.igUserId } }),
          { field: 'mentions', value: change(account).value },
        ]),
      );
      expect(response.status).toBe(200);
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('수신 거부 대상은 저장 0, 다른 사람은 저장', async () => {
      const account = await newAccount();
      const optedOut = `from${randomId(16)}`;
      await t.pool.query('INSERT INTO instagram_dm_opt_outs (ig_user_id, commenter_hash) VALUES ($1,$2)', [
        account.igUserId,
        commenterHash(HASH_KEY, account.igUserId, optedOut),
      ]);
      const allowed = change(account);
      await post(webhook(account, [change(account, { from: { id: optedOut } }), allowed]));
      expect((await rowsOf(account)).map((row) => row.comment_id)).toEqual([allowed.value.id]);
    });

    it('24시간을 넘긴 댓글은 저장 0', async () => {
      const account = await newAccount();
      await post(webhook(account, [change(account)], nowSeconds() - 25 * HOURS));
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('규칙 생성 전 댓글은 저장 0', async () => {
      const account = await newAccount({ ruleCreatedAt: new Date(Date.now() - HOURS * 1000).toISOString() });
      await post(webhook(account, [change(account)], nowSeconds() - 2 * HOURS));
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('audience off면 저장 0', async () => {
      const account = await newAccount();
      await setAudience('off');
      try {
        expect((await post(webhook(account, [change(account)]))).status).toBe(200);
        expect(await rowsOf(account)).toHaveLength(0);
      } finally {
        await setAudience('everyone');
      }
    });

    it('audience operators면 운영자 계정만 저장한다', async () => {
      const creator = await newAccount();
      const operator = await newAccount();
      await t.pool.query(`UPDATE users SET role='operator' WHERE id=$1`, [operator.userId]);
      await setAudience('operators');
      try {
        await post(webhook(creator, [change(creator)]));
        await post(webhook(operator, [change(operator)]));
        expect(await rowsOf(creator)).toHaveLength(0);
        expect(await rowsOf(operator)).toHaveLength(1);
      } finally {
        await setAudience('everyone');
      }
    });

    it.each([
      ['크리에이터 정지', `UPDATE instagram_connections SET dm_paused_at=now() WHERE id=$1`],
      ['운영자 정지', `UPDATE instagram_connections SET operator_paused_at=now() WHERE id=$1`],
      ['메시지 접근 꺼짐', `UPDATE instagram_connections SET status='messages_access_required' WHERE id=$1`],
    ])('%s 연결은 저장 0', async (_name, sql) => {
      const account = await newAccount();
      await t.pool.query(sql, [account.connectionId]);
      await post(webhook(account, [change(account)]));
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('정지된 사용자는 저장 0', async () => {
      const account = await newAccount();
      await t.pool.query('UPDATE users SET suspended_at=now() WHERE id=$1', [account.userId]);
      await post(webhook(account, [change(account)]));
      expect(await rowsOf(account)).toHaveLength(0);
    });
  });

  describe('불량 항목', () => {
    it('불량 항목은 건너뛰고 지표를 남기며 정상분만 한 INSERT로 저장한다', async () => {
      const account = await newAccount();
      const count = jest.spyOn(Sentry.metrics, 'count');
      const sqls = interceptTransaction();
      const first = change(account);
      const second = change(account);
      const noMedia = change(account);
      delete (noMedia.value as { media?: unknown }).media;
      const payload = {
        object: 'instagram',
        entry: [
          'not-an-object',
          { id: 12345, changes: [] },
          { id: account.igUserId, changes: 'not-an-array' },
          {
            id: account.igUserId,
            time: nowSeconds(),
            changes: [
              null,
              first,
              { field: 'comments' },
              { field: 'comments', value: 'text' },
              change(account, { id: 123 }),
              change(account, { id: 'bad\u0000id' }),
              change(account, { from: {} }),
              change(account, { text: 42 }),
              noMedia,
              second,
            ],
          },
        ],
      };
      const response = await post(payload);
      expect(response.status).toBe(200);
      expect((await rowsOf(account)).map((row) => row.comment_id).sort()).toEqual(
        [first.value.id as string, second.value.id as string].sort(),
      );
      expect(sqls.filter((sql) => sql.includes(INSERT_SQL))).toHaveLength(1);
      expect(count).toHaveBeenCalledWith('crelink.instagram.webhook', 11, { attributes: { result: 'malformed' } });
      expect(count).toHaveBeenCalledWith('crelink.instagram.webhook', 2, { attributes: { result: 'stored' } });
    });

    it('서명이 맞는 깨진 JSON은 200이고 저장 0', async () => {
      const count = jest.spyOn(Sentry.metrics, 'count');
      const query = jest.spyOn(database.pool, 'query');
      expect((await send('{broken')).status).toBe(200);
      expect(query).not.toHaveBeenCalled();
      expect(count).toHaveBeenCalledWith('crelink.instagram.webhook', 1, { attributes: { result: 'malformed' } });
    });

    it.each([
      ['entry 없음', {}],
      ['배열 본문', []],
      ['null', null],
    ])('%s은 200', async (_name, body) => {
      expect((await post(body)).status).toBe(200);
    });
  });

  describe('멱등성과 배치', () => {
    it('같은 웹훅을 동시에 20회 보내도 행은 1개다', async () => {
      const account = await newAccount();
      const raw = JSON.stringify(webhook(account, [change(account)]));
      const responses = await Promise.all(Array.from({ length: 20 }, () => send(raw)));
      expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
      expect(await rowsOf(account)).toHaveLength(1);
    });

    it('같은 사람의 다른 댓글은 규칙당 1건이다', async () => {
      const account = await newAccount();
      const from = { id: `from${randomId(16)}` };
      await post(webhook(account, [change(account, { from }), change(account, { from })]));
      await post(webhook(account, [change(account, { from })]));
      expect(await rowsOf(account)).toHaveLength(1);
    });

    it('순서가 반대인 겹치는 배치를 동시에 보내도 모두 200이다', async () => {
      const account = await newAccount();
      const changes = Array.from({ length: 50 }, () => change(account));
      const forward = JSON.stringify(webhook(account, changes));
      const backward = JSON.stringify(webhook(account, [...changes].reverse()));
      const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => send(i % 2 ? forward : backward)));
      expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
      expect(await rowsOf(account)).toHaveLength(50);
    });

    it('1000건 배치는 규칙 조회 1회와 저장 트랜잭션(설정 → 연결 → 규칙 잠금, INSERT 1회)으로 저장한다', async () => {
      const account = await newAccount();
      const query = jest.spyOn(database.pool, 'query');
      const sqls = interceptTransaction();
      const changes = Array.from({ length: 1000 }, () => change(account));
      const response = await post(webhook(account, changes));
      expect(response.status).toBe(200);
      expect(query).toHaveBeenCalledTimes(1);
      expect(sqls.slice(0, 3)).toEqual([LOCK_SETTINGS, LOCK_CONNECTIONS, LOCK_RULES]);
      expect(sqls).toHaveLength(4);
      expect(sqls[3].trim().startsWith(INSERT_SQL)).toBe(true);
      expect(await rowsOf(account)).toHaveLength(1000);
    });

    it('여러 계정의 항목도 한 번의 조회로 처리한다', async () => {
      const first = await newAccount();
      const second = await newAccount();
      const query = jest.spyOn(database.pool, 'query');
      const sqls = interceptTransaction();
      const response = await post({
        object: 'instagram',
        entry: [...webhook(first, [change(first)]).entry, ...webhook(second, [change(second)]).entry],
      });
      expect(response.status).toBe(200);
      expect(query).toHaveBeenCalledTimes(1);
      expect(sqls.filter((sql) => sql.includes(INSERT_SQL))).toHaveLength(1);
      expect(await rowsOf(first)).toHaveLength(1);
      expect(await rowsOf(second)).toHaveLength(1);
    });
  });

  describe('규칙 변경 경합', () => {
    /** 규칙을 읽은 뒤, 저장 트랜잭션의 잠금 전에 상태를 바꿉니다. 잠금 뒤의 INSERT가 새 값을 보는지 확인합니다. */
    const changeBeforeInsert = (mutate: () => Promise<unknown>) => {
      const real = database.transaction.bind(database);
      jest
        .spyOn(database, 'transaction')
        .mockImplementation(((run: (client: PoolClient) => Promise<unknown>) =>
          mutate().then(() => real(run))) as never);
    };

    /** 웹훅의 저장 트랜잭션이 잠금에서 기다릴 때까지 폴링합니다. */
    const waitForWebhookLock = async (match: string) => {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const activity = await t.pool.query(
          `SELECT 1 FROM pg_stat_activity
           WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1`,
          [match],
        );
        if (activity.rowCount) return true;
        await sleep(20);
      }
      return false;
    };

    it.each([
      ['version 증가', 'UPDATE instagram_dm_rules SET version=version+1 WHERE id=$1'],
      ['비활성화', 'UPDATE instagram_dm_rules SET enabled=false WHERE id=$1'],
      ['보관', 'UPDATE instagram_dm_rules SET archived_at=now() WHERE id=$1'],
    ])('규칙을 읽은 뒤 %s면 저장 0', async (_name, sql) => {
      const account = await newAccount();
      changeBeforeInsert(() => t.pool.query(sql, [account.ruleId]));
      expect((await post(webhook(account, [change(account)]))).status).toBe(200);
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('규칙을 읽은 뒤 수신 거부하면 저장 0', async () => {
      const account = await newAccount();
      const from = { id: `from${randomId(16)}` };
      changeBeforeInsert(() =>
        t.pool.query('INSERT INTO instagram_dm_opt_outs (ig_user_id, commenter_hash) VALUES ($1,$2)', [
          account.igUserId,
          commenterHash(HASH_KEY, account.igUserId, from.id),
        ]),
      );
      await post(webhook(account, [change(account, { from })]));
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('규칙을 읽은 뒤 audience가 off가 되면 저장 0', async () => {
      const account = await newAccount();
      changeBeforeInsert(() => setAudience('off'));
      try {
        await post(webhook(account, [change(account)]));
        expect(await rowsOf(account)).toHaveLength(0);
      } finally {
        await setAudience('everyone');
      }
    });

    it('규칙 변경 트랜잭션이 진행 중이면 커밋을 기다렸다가 새 version으로 판단한다', async () => {
      const account = await newAccount();
      const client = await t.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE instagram_dm_rules SET version=version+1 WHERE id=$1', [account.ruleId]);
        let settled = false;
        const pending = post(webhook(account, [change(account)])).then((response) => {
          settled = true;
          return response;
        });
        // 저장 트랜잭션이 규칙 행의 FOR SHARE에서 기다리는 것을 확인합니다.
        expect(await waitForWebhookLock('%instagram_dm_rules%FOR SHARE%')).toBe(true);
        expect(settled).toBe(false);
        await client.query('COMMIT');
        expect((await pending).status).toBe(200);
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('규칙 변경이 연결 행을 쥔 채 규칙 행을 기다려도 웹훅과 교착하지 않는다', async () => {
      const account = await newAccount();
      const client = await t.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM instagram_connections WHERE id=$1 FOR UPDATE', [account.connectionId]);
        const pending = post(webhook(account, [change(account)]));
        // 웹훅은 연결 행(FOR SHARE)에서 기다립니다. 옛 순서(규칙 → 연결)였다면 규칙 행을 이미 쥐고 있어 다음 줄이 교착됩니다.
        expect(await waitForWebhookLock('%instagram_connections%FOR SHARE%')).toBe(true);
        await client.query('SELECT id FROM instagram_dm_rules WHERE id=$1 FOR UPDATE', [account.ruleId]);
        await client.query('UPDATE instagram_dm_rules SET version=version+1 WHERE id=$1', [account.ruleId]);
        await client.query('COMMIT');
        expect((await pending).status).toBe(200);
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('규칙 변경과 웹훅을 40회 겹쳐도 40P01·500이 없다', async () => {
      const account = await newAccount();
      const errors = jest.spyOn(Logger.prototype, 'error');
      for (let i = 0; i < 40; i += 1) {
        const [patch, ...hooks] = await Promise.all([
          api(t.baseUrl, 'PATCH', `/api/me/instagram/rules/${account.publicId}`, {
            cookie: account.cookie,
            body: { message: `문구 ${i}` },
          }),
          ...Array.from({ length: 5 }, () => post(webhook(account, [change(account)]))),
        ]);
        expect(patch.status).toBe(200);
        expect(hooks.map((hook) => hook.status)).toEqual(Array(5).fill(200));
      }
      expect(JSON.stringify(errors.mock.calls)).not.toContain('40P01');
    }, 60_000);
  });

  describe('DB 실패', () => {
    it('규칙 조회가 실패하면 503이고 재전송으로 저장된다', async () => {
      const account = await newAccount();
      const raw = JSON.stringify(webhook(account, [change(account)]));
      const query = jest.spyOn(database.pool, 'query').mockRejectedValueOnce(new Error('connection refused') as never);
      const failed = await send(raw);
      expect(failed.status).toBe(503);
      expect(await failed.json()).toMatchObject({ code: 'database_unavailable' });
      query.mockRestore();
      expect((await send(raw)).status).toBe(200);
      expect(await rowsOf(account)).toHaveLength(1);
    });

    it('INSERT가 실패하면 503이다', async () => {
      const account = await newAccount();
      interceptTransaction((sql, forward) =>
        sql.includes(INSERT_SQL) ? Promise.reject(new Error('down')) : forward(),
      );
      expect((await post(webhook(account, [change(account)]))).status).toBe(503);
      expect(await rowsOf(account)).toHaveLength(0);
    });

    it('교착(40P01)으로 트랜잭션이 실패하면 503이고 재전송으로 저장된다', async () => {
      const account = await newAccount();
      const raw = JSON.stringify(webhook(account, [change(account)]));
      interceptTransaction((sql, forward) =>
        sql.includes(INSERT_SQL) ? Promise.reject(Object.assign(new Error('deadlock'), { code: '40P01' })) : forward(),
      );
      const failed = await send(raw);
      expect(failed.status).toBe(503);
      expect(await failed.json()).toMatchObject({ code: 'database_unavailable' });
      jest.restoreAllMocks();
      expect((await send(raw)).status).toBe(200);
      expect(await rowsOf(account)).toHaveLength(1);
    });

    it('INSERT가 끝나기 전에는 응답하지 않는다', async () => {
      const account = await newAccount();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      interceptTransaction((sql, forward) => (sql.includes(INSERT_SQL) ? gate.then(forward) : forward()));
      let settled = false;
      const pending = post(webhook(account, [change(account)])).then((response) => {
        settled = true;
        return response;
      });
      await sleep(150);
      expect(settled).toBe(false);
      release();
      expect((await pending).status).toBe(200);
      expect(await rowsOf(account)).toHaveLength(1);
    });

    it('로그와 지표에 comment_id·작성자 ID·본문을 남기지 않는다', async () => {
      const account = await newAccount();
      const commentId = `comment${randomId(16)}`;
      const fromId = `from${randomId(16)}`;
      const spies = [
        jest.spyOn(Logger.prototype, 'error'),
        jest.spyOn(Logger.prototype, 'warn'),
        jest.spyOn(Logger.prototype, 'log'),
        jest.spyOn(console, 'error'),
        jest.spyOn(console, 'log'),
        jest.spyOn(Sentry.metrics, 'count'),
        jest.spyOn(Sentry.metrics, 'distribution'),
      ];
      interceptTransaction((sql, forward) =>
        sql.includes(INSERT_SQL)
          ? Promise.reject(Object.assign(new Error(`values (${commentId}, ${fromId})`), { code: '23514' }))
          : forward(),
      );
      const response = await post(webhook(account, [change(account, { id: commentId, from: { id: fromId } })]));
      expect(response.status).toBe(503);
      const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
      expect(logged).toContain('23514');
      expect(logged).not.toContain(commentId);
      expect(logged).not.toContain(fromId);
      expect(logged).not.toContain(MATCHING_TEXT);
    });
  });

  describe('데이터 삭제 콜백', () => {
    const signedRequest = (payload: unknown, secret = APP_SECRET) => {
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${createHmac('sha256', secret).update(encoded).digest('base64url')}.${encoded}`;
    };
    const deleteCallback = (value: string | null) =>
      fetch(`${t.baseUrl}${DELETION_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: value === null ? '' : new URLSearchParams({ signed_request: value }).toString(),
      });
    const payloadFor = (account: Pick<Account, 'metaUserId'>) => ({
      algorithm: 'HMAC-SHA256',
      issued_at: nowSeconds(),
      user_id: account.metaUserId,
    });
    const optOutCount = async (igUserId: string) =>
      Number(
        (
          await t.pool.query<{ count: string }>('SELECT count(*) FROM instagram_dm_opt_outs WHERE ig_user_id=$1', [
            igUserId,
          ])
        ).rows[0].count,
      );
    const addOptOut = (igUserId: string) =>
      t.pool.query('INSERT INTO instagram_dm_opt_outs (ig_user_id, commenter_hash) VALUES ($1,$2)', [
        igUserId,
        randomBytes(32),
      ]);
    const connectionExists = async (account: Account) =>
      (await t.pool.query('SELECT 1 FROM instagram_connections WHERE id=$1', [account.connectionId])).rowCount === 1;

    it('연결·규칙·내역·수신 거부 기록을 지우고 확인 코드를 돌려주며, 다른 계정은 그대로다', async () => {
      const account = await newAccount();
      const other = await newAccount();
      await post(webhook(account, [change(account)]));
      await addOptOut(account.igUserId);
      await addOptOut(other.igUserId);

      const response = await deleteCallback(signedRequest(payloadFor(account)));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { url: string; confirmation_code: string };
      expect(body.confirmation_code).toMatch(/^[a-z0-9]{16}$/);
      expect(body.url).toBe(`${WEB_URL}/privacy/instagram-deletion/${body.confirmation_code}`);

      expect(await connectionExists(account)).toBe(false);
      expect(await rowsOf(account)).toHaveLength(0);
      expect((await t.pool.query('SELECT 1 FROM instagram_dm_rules WHERE id=$1', [account.ruleId])).rowCount).toBe(0);
      expect(await optOutCount(account.igUserId)).toBe(0);
      expect(await connectionExists(other)).toBe(true);
      expect(await optOutCount(other.igUserId)).toBe(1);

      const status = await api<{ processedAt: string }>(
        t.baseUrl,
        'GET',
        `/api/public/instagram-deletions/${body.confirmation_code}`,
      );
      expect(status.status).toBe(200);
      expect(Number.isNaN(Date.parse(status.body.processedAt))).toBe(false);
      expect(Object.keys(status.body)).toEqual(['processedAt']);
    });

    it('일반 해제로 연결 행이 사라진 뒤에도 대응표로 수신 거부 기록과 대응표 행을 지운다', async () => {
      const account = await newAccount();
      const other = await newAccount();
      for (const target of [account, other]) {
        await t.pool.query('INSERT INTO instagram_opt_out_owners (ig_user_id, meta_user_id) VALUES ($1,$2)', [
          target.igUserId,
          target.metaUserId,
        ]);
        await addOptOut(target.igUserId);
      }
      await t.pool.query('DELETE FROM instagram_connections WHERE id=$1', [account.connectionId]);

      const response = await deleteCallback(signedRequest(payloadFor(account)));
      expect(response.status).toBe(200);

      expect(await optOutCount(account.igUserId)).toBe(0);
      expect(
        (await t.pool.query('SELECT 1 FROM instagram_opt_out_owners WHERE ig_user_id=$1', [account.igUserId])).rowCount,
      ).toBe(0);
      expect(await optOutCount(other.igUserId)).toBe(1);
      expect(
        (await t.pool.query('SELECT 1 FROM instagram_opt_out_owners WHERE ig_user_id=$1', [other.igUserId])).rowCount,
      ).toBe(1);
    });

    it('연결을 못 찾아도 같은 형식으로 응답한다', async () => {
      const response = await deleteCallback(signedRequest(payloadFor({ metaUserId: 'no-such-user' })));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        url: expect.stringContaining('/privacy/instagram-deletion/'),
        confirmation_code: expect.stringMatching(/^[a-z0-9]{16}$/),
      });
    });

    it('숫자 user_id도 받는다', async () => {
      const account = await newAccount();
      const response = await deleteCallback(
        signedRequest({ algorithm: 'HMAC-SHA256', user_id: Number(account.metaUserId) }),
      );
      expect(response.status).toBe(200);
      expect(await connectionExists(account)).toBe(false);
    });

    it.each([
      ['다른 시크릿', () => signedRequest({ algorithm: 'HMAC-SHA256', user_id: 'x' }, 'other-secret')],
      ['형식 오류', () => 'not-signed'],
      ['빈 값', () => ''],
      ['알고리즘 다름', () => signedRequest({ algorithm: 'none', user_id: 'x' })],
      ['user_id 없음', () => signedRequest({ algorithm: 'HMAC-SHA256' })],
      [
        'JSON 아님',
        () => {
          const encoded = Buffer.from('not json').toString('base64url');
          return `${createHmac('sha256', APP_SECRET).update(encoded).digest('base64url')}.${encoded}`;
        },
      ],
    ])('%s는 403', async (_name, build) => {
      expect((await deleteCallback(build())).status).toBe(403);
    });

    it('signed_request가 없으면 403', async () => {
      expect((await deleteCallback(null)).status).toBe(403);
    });

    it('위조 요청은 아무것도 지우지 않는다', async () => {
      const account = await newAccount();
      await addOptOut(account.igUserId);
      const valid = signedRequest(payloadFor(account));
      const [signature, encoded] = valid.split('.');
      const flipped = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}.${encoded}`;
      expect((await deleteCallback(flipped)).status).toBe(403);
      expect(await connectionExists(account)).toBe(true);
      expect(await optOutCount(account.igUserId)).toBe(1);
    });

    it('중간에 DB가 실패하면 503이고 모두 되돌린다', async () => {
      const account = await newAccount();
      await addOptOut(account.igUserId);
      const original = Client.prototype.query as (...args: unknown[]) => unknown;
      jest.spyOn(Client.prototype, 'query').mockImplementation(function (this: Client, ...args: unknown[]) {
        if (String(args[0]).includes('INSERT INTO instagram_deletion_requests')) {
          return Promise.reject(new Error('down'));
        }
        return original.apply(this, args);
      } as never);
      const response = await deleteCallback(signedRequest(payloadFor(account)));
      jest.restoreAllMocks();
      expect(response.status).toBe(503);
      expect(await connectionExists(account)).toBe(true);
      expect(await optOutCount(account.igUserId)).toBe(1);
    });

    it.each(['aaaaaaaaaaaaaaaa', 'short', 'UPPERCASEUPPERCA'])('없거나 형식이 틀린 코드 %s는 404', async (code) => {
      const status = await api(t.baseUrl, 'GET', `/api/public/instagram-deletions/${code}`);
      expect(status.status).toBe(404);
    });
  });
});
