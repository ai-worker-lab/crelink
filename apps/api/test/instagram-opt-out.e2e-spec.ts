import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Event } from '@sentry/nestjs';
import { ChannelLinkView } from '@crelink/shared';
import { createHmac, randomBytes } from 'node:crypto';
import { randomId } from '../src/common/http';
import { AppConfig } from '../src/config.service';
import { Database } from '../src/database';
import { commenterHash, signOptOutToken } from '../src/instagram/crypto';
import { InstagramOptOutService } from '../src/instagram/opt-out.service';
import { sentryOptions } from '../src/monitoring/sentry';
import { api, createTestApp, login, TestApp } from './test-app';

const APP_SECRET = randomBytes(32).toString('hex');
const HASH_KEY = randomBytes(32);
const OPT_OUT_KEY = randomBytes(32);
const INSTAGRAM_ENV: Record<string, string> = {
  META_APP_ID: 'test-app-id',
  META_APP_SECRET: APP_SECRET,
  META_LOGIN_CONFIG_ID: 'test-login-config',
  META_WEBHOOK_VERIFY_TOKEN: randomBytes(16).toString('hex'),
  INSTAGRAM_TOKEN_KEYS: `1:${randomBytes(32).toString('base64')}`,
  INSTAGRAM_TOKEN_KEY_CURRENT: '1',
  INSTAGRAM_COMMENTER_HASH_KEY: HASH_KEY.toString('base64'),
  INSTAGRAM_OPT_OUT_KEY: OPT_OUT_KEY.toString('base64'),
  TRUSTED_PROXY_HOPS: '1',
};

const OPT_OUT_PATH = '/api/public/instagram-dm-opt-outs';
const WEBHOOK_PATH = '/api/webhooks/instagram';
const KEYWORD = '신청';
const PERSON_LIMIT = 10;
const SOURCE_LIMIT = 240;

interface Account {
  userId: string;
  cookie: string;
  igUserId: string;
  mediaId: string;
  connectionId: string;
  ruleId: string;
  code: string;
}

interface DeliveryRow {
  id: string;
  commenter_hash: Buffer;
  message_body: string;
  status: string;
}

/** 보낸 envelope 원문과 오류 이벤트. 네트워크로 보내지 않습니다(`sentry.e2e-spec.ts`와 같은 방식). */
const envelopes: string[] = [];
const events: Event[] = [];

function memoryTransport(options: Parameters<typeof Sentry.createTransport>[0]) {
  return Sentry.createTransport(options, async (request) => {
    const text = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
    envelopes.push(text);
    const lines = text.split('\n').filter(Boolean);
    for (let index = 1; index + 1 < lines.length; index += 2) {
      if ((JSON.parse(lines[index]) as { type: string }).type === 'event') events.push(JSON.parse(lines[index + 1]));
    }
    return { statusCode: 200 };
  });
}

const tokenFor = (igUserId: string, fromId: string, key = OPT_OUT_KEY) =>
  signOptOutToken(key, igUserId, commenterHash(HASH_KEY, igUserId, fromId));

/** 토큰의 `offset` 바이트를 한 비트 뒤집습니다. */
function flipByte(token: string, offset: number): string {
  const raw = Buffer.from(token, 'base64url');
  raw[offset < 0 ? raw.length + offset : offset] ^= 1;
  return raw.toString('base64url');
}

// 요청 한도 시험은 240건 넘게 보내므로 전체 실행의 부하에서도 기본 5초에 걸리지 않게 늘립니다.
jest.setTimeout(60_000);

describe('Instagram DM 수신 거부 API (0271, docs/specs/instagram-comment-dm.md)', () => {
  let t: TestApp;
  let database: Database;
  let accounts = 0;
  let ips = 0;

  /** 시험마다 다른 방문자 IP를 써서 IP 한도가 서로 영향을 주지 않게 합니다. */
  const nextIp = () => {
    ips += 1;
    return `10.${(ips >> 16) & 255}.${(ips >> 8) & 255}.${ips & 255}`;
  };

  /** `ip`가 null이면 지금의 BFF 전달처럼 `X-Forwarded-For` 없이 보냅니다. */
  const optOut = (token: unknown, ip: string | null = nextIp()) =>
    api(t.baseUrl, 'POST', OPT_OUT_PATH, {
      body: { token },
      headers: ip === null ? {} : { 'x-forwarded-for': ip },
    });

  const newAccount = async (): Promise<Account> => {
    accounts += 1;
    const signedIn = await login(t.baseUrl, `opt-${accounts}|opt${accounts}@example.com`);
    const cookie = signedIn.cookie!;
    const link = await api<ChannelLinkView>(t.baseUrl, 'POST', '/api/me/channel-links', {
      cookie,
      body: { channel: 'instagram', placement: 'dm' },
    });
    expect(link.status).toBe(201);
    const igUserId = `1785${String(accounts).padStart(6, '0')}`;
    const mediaId = `m${igUserId}`;
    const account = { userId: signedIn.body.user!.id, cookie, igUserId, mediaId, code: link.body.code };
    return { ...account, ...(await connect(account)) };
  };

  /** 연결과 규칙을 만듭니다. 재연결 시험은 같은 `ig_user_id`로 다시 부릅니다. */
  const connect = async (account: Pick<Account, 'userId' | 'igUserId' | 'mediaId' | 'code'>) => {
    const connection = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_connections (user_id, ig_user_id, ig_username, status, token_ciphertext, token_key_version)
       VALUES ($1,$2,$3,'active','\\x00',1) RETURNING id`,
      [account.userId, account.igUserId, `user${account.igUserId}`],
    );
    const connectionId = connection.rows[0].id;
    const rule = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, media_permalink, keyword, message, channel_link_code, created_at)
       VALUES ($1,$2,$3,'https://instagram.test/p/1',$4,'고마워요',$5, now() - interval '48 hours') RETURNING id`,
      [randomId(10), connectionId, account.mediaId, KEYWORD, account.code],
    );
    return { connectionId, ruleId: rule.rows[0].id };
  };

  /** 서명한 웹훅으로 댓글을 보냅니다. 발송 행은 실제 웹훅 경로로 만듭니다. */
  const comment = async (account: Account, fromId: string) => {
    const raw = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: account.igUserId,
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: 'comments',
              value: {
                id: `c${randomId(16)}`,
                text: `저도 ${KEYWORD}합니다`,
                from: { id: fromId, username: 'commenter_name' },
                media: { id: account.mediaId, media_product_type: 'FEED' },
              },
            },
          ],
        },
      ],
    });
    const response = await fetch(`${t.baseUrl}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`,
      },
      body: raw,
    });
    expect(response.status).toBe(200);
  };

  const deliveries = async (account: Pick<Account, 'connectionId'>) =>
    (
      await t.pool.query<DeliveryRow>(
        'SELECT id, commenter_hash, message_body, status FROM instagram_dm_deliveries WHERE connection_id=$1 ORDER BY created_at, id',
        [account.connectionId],
      )
    ).rows;
  const hashOf = (account: Account, fromId: string) => commenterHash(HASH_KEY, account.igUserId, fromId);
  const statusesOf = async (account: Account, fromId: string) =>
    (await deliveries(account))
      .filter((row) => row.commenter_hash.equals(hashOf(account, fromId)))
      .map((row) => row.status);
  const optOutRows = async (igUserId: string) =>
    (
      await t.pool.query<{ commenter_hash: Buffer; created_at: Date }>(
        'SELECT commenter_hash, created_at FROM instagram_dm_opt_outs WHERE ig_user_id=$1',
        [igUserId],
      )
    ).rows;

  const newPerson = () => `f${randomId(16)}`;

  /** 계정과, 그 계정의 게시물에 댓글을 달아 `pending`이 하나 있는 사람. */
  const accountWithPending = async () => {
    const account = await newAccount();
    const fromId = newPerson();
    await comment(account, fromId);
    const rows = await deliveries(account);
    expect(rows.map((row) => row.status)).toEqual(['pending']);
    const token = signOptOutToken(OPT_OUT_KEY, account.igUserId, hashOf(account, fromId));
    return { account, fromId, token };
  };

  beforeAll(async () => {
    Sentry.init({
      ...sentryOptions({ SENTRY_DSN: 'http://public@127.0.0.1:9/1' })!,
      tracesSampleRate: 1,
      transport: memoryTransport,
      enableRuntimeChannelInjection: false,
    });
    t = await createTestApp({ env: INSTAGRAM_ENV });
    database = t.app.get(Database);
    await t.pool.query("UPDATE platform_settings SET instagram_dm_audience='everyone'");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await t?.close();
    await Sentry.close(2000);
  });

  describe('수신 거부 처리', () => {
    it('웹훅이 DM에 넣은 토큰으로 거부하면 기록이 생기고 그 사람의 pending만 취소된다', async () => {
      const { account, fromId, token } = await accountWithPending();
      const other = newPerson();
      await comment(account, other);

      const response = await optOut(token);
      expect(response.status).toBe(204);
      expect(response.body).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');

      const rows = await optOutRows(account.igUserId);
      expect(rows).toHaveLength(1);
      expect(rows[0].commenter_hash.equals(hashOf(account, fromId))).toBe(true);
      expect(await statusesOf(account, fromId)).toEqual(['cancelled']);
      expect(await statusesOf(account, other)).toEqual(['pending']);
    });

    // 호출이 끝난 `sent`는 되돌릴 수 없고, `sending`의 취소는 worker의 호출 직전 재확인이 맡습니다(instagram-worker 시험).
    it.each(['sent', 'sending'])('%s 행은 이 API가 바꾸지 않는다', async (status) => {
      const { account, fromId, token } = await accountWithPending();
      await t.pool.query('UPDATE instagram_dm_deliveries SET status=$1 WHERE connection_id=$2', [
        status,
        account.connectionId,
      ]);
      expect((await optOut(token)).status).toBe(204);
      expect(await statusesOf(account, fromId)).toEqual([status]);
    });

    it('거부 뒤 같은 사람의 새 댓글은 저장되지 않고, 다른 사람의 댓글은 저장된다', async () => {
      const { account, fromId, token } = await accountWithPending();
      expect((await optOut(token)).status).toBe(204);
      const before = await deliveries(account);

      await comment(account, fromId);
      expect(await deliveries(account)).toEqual(before);

      const other = newPerson();
      await comment(account, other);
      expect(await statusesOf(account, other)).toEqual(['pending']);
    });

    it('다른 IG 계정의 같은 해시는 거부되지 않는다', async () => {
      const { account, fromId } = await accountWithPending();
      const otherAccountToken = signOptOutToken(OPT_OUT_KEY, 'other-ig-account', hashOf(account, fromId));
      expect((await optOut(otherAccountToken)).status).toBe(204);
      expect(await optOutRows(account.igUserId)).toHaveLength(0);
      expect(await statusesOf(account, fromId)).toEqual(['pending']);
    });

    it('운영자 스위치가 off여도 거부할 수 있다', async () => {
      const { account, fromId, token } = await accountWithPending();
      await t.pool.query("UPDATE platform_settings SET instagram_dm_audience='off'");
      try {
        expect((await optOut(token)).status).toBe(204);
      } finally {
        await t.pool.query("UPDATE platform_settings SET instagram_dm_audience='everyone'");
      }
      expect(await statusesOf(account, fromId)).toEqual(['cancelled']);
    });

    it('같은 토큰 재요청은 204이고 기록은 한 건이며 처음 시각을 유지한다', async () => {
      const { account, token } = await accountWithPending();
      expect((await optOut(token)).status).toBe(204);
      const [first] = await optOutRows(account.igUserId);
      const again = await optOut(token);
      expect(again.status).toBe(204);
      expect(again.body).toBeNull();
      const rows = await optOutRows(account.igUserId);
      expect(rows).toHaveLength(1);
      expect(rows[0].created_at).toEqual(first.created_at);
    });

    it('같은 토큰을 동시에 보내도 모두 204이고 기록은 한 건이다', async () => {
      const { account, token } = await accountWithPending();
      const responses = await Promise.all(Array.from({ length: PERSON_LIMIT }, () => optOut(token)));
      expect(responses.map((response) => response.status)).toEqual(Array(PERSON_LIMIT).fill(204));
      expect(await optOutRows(account.igUserId)).toHaveLength(1);
    });

    it('재요청은 웹훅과 경합해 남은 pending도 취소한다', async () => {
      const { account, fromId, token } = await accountWithPending();
      expect((await optOut(token)).status).toBe(204);
      // 거부 기록을 보지 못한 웹훅이 먼저 저장한 경우를 흉내 냅니다.
      await t.pool.query("UPDATE instagram_dm_deliveries SET status='pending' WHERE connection_id=$1", [
        account.connectionId,
      ]);
      expect((await optOut(token)).status).toBe(204);
      expect(await statusesOf(account, fromId)).toEqual(['cancelled']);
    });

    it('연결이 해제되고 같은 IG 계정을 다시 연결해도 거부가 유지된다', async () => {
      const { account, fromId, token } = await accountWithPending();
      expect((await optOut(token)).status).toBe(204);

      // 해제와 같은 결과(연결 행 삭제, 발송 행 CASCADE)입니다. 해제 API는 Graph 호출이 있어 여기서 쓰지 않습니다.
      await t.pool.query('DELETE FROM instagram_connections WHERE id=$1', [account.connectionId]);
      expect(await optOutRows(account.igUserId)).toHaveLength(1);

      const reconnected = { ...account, ...(await connect(account)) };
      await comment(reconnected, fromId);
      expect(await deliveries(reconnected)).toEqual([]);

      const other = newPerson();
      await comment(reconnected, other);
      expect(await statusesOf(reconnected, other)).toEqual(['pending']);
    });

    it('90일 파기로 발송 행이 사라진 뒤에도 옛 토큰이 동작한다', async () => {
      const { account, fromId, token } = await accountWithPending();
      await t.pool.query('DELETE FROM instagram_dm_deliveries WHERE connection_id=$1', [account.connectionId]);
      expect((await optOut(token)).status).toBe(204);
      const rows = await optOutRows(account.igUserId);
      expect(rows).toHaveLength(1);
      expect(rows[0].commenter_hash.equals(hashOf(account, fromId))).toBe(true);
    });

    it('연결이 없는 계정의 토큰도 연결이 있을 때와 같은 응답이다', async () => {
      const { token } = await accountWithPending();
      const withConnection = await optOut(token);
      const without = await optOut(tokenFor(`9${randomId(10)}`, newPerson()));
      expect(without.status).toBe(withConnection.status);
      expect(without.body).toEqual(withConnection.body);
      expect(Object.fromEntries(without.headers)).toMatchObject({ 'cache-control': 'no-store' });
      expect([...without.headers.keys()].sort()).toEqual([...withConnection.headers.keys()].sort());
    });

    it('Instagram 설정이 없으면 503 instagram_not_configured이다', async () => {
      jest.spyOn(AppConfig.prototype, 'instagram', 'get').mockReturnValue(null);
      const response = await optOut(tokenFor('1', newPerson()));
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('instagram_not_configured');
    });
  });

  describe('GET으로는 거부되지 않는다', () => {
    it.each(['GET', 'HEAD'])('%s는 404이고 기록과 pending이 그대로다', async (method) => {
      const { account, fromId, token } = await accountWithPending();
      const responses = [
        await fetch(`${t.baseUrl}${OPT_OUT_PATH}`, { method }),
        await fetch(`${t.baseUrl}${OPT_OUT_PATH}?token=${token}`, { method }),
        await fetch(`${t.baseUrl}${OPT_OUT_PATH}?t=${token}`, { method }),
      ];
      expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
      expect(await optOutRows(account.igUserId)).toHaveLength(0);
      expect(await statusesOf(account, fromId)).toEqual(['pending']);
    });

    it('POST도 쿼리의 토큰은 읽지 않는다', async () => {
      const { account, token } = await accountWithPending();
      const response = await fetch(`${t.baseUrl}${OPT_OUT_PATH}?token=${token}`, { method: 'POST' });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe('opt_out_invalid');
      expect(await optOutRows(account.igUserId)).toHaveLength(0);
    });
  });

  describe('잘못된 토큰', () => {
    const igUserId = '17850000001';

    it.each<[string, () => unknown]>([
      ['다른 키로 서명', () => tokenFor(igUserId, 'from-1', randomBytes(32))],
      ['ig_user_id 변조', () => flipByte(tokenFor(igUserId, 'from-1'), 1)],
      ['commenter_hash 변조', () => flipByte(tokenFor(igUserId, 'from-1'), 1 + igUserId.length)],
      ['MAC 변조', () => flipByte(tokenFor(igUserId, 'from-1'), -1)],
      ['끝을 자른 토큰', () => tokenFor(igUserId, 'from-1').slice(0, -4)],
      ['덧붙인 토큰', () => `${tokenFor(igUserId, 'from-1')}AAAA`],
      ['base64url 문자가 아님', () => `${tokenFor(igUserId, 'from-1').slice(0, -1)}!`],
      ['빈 문자열', () => ''],
      ['문자열이 아님', () => 1234],
      ['객체', () => ({ token: 'x' })],
      ['null', () => null],
      ['길이 상한 초과', () => 'A'.repeat(513)],
    ])('%s는 400 opt_out_invalid이고 DB를 건드리지 않는다', async (_label, make) => {
      const query = jest.spyOn(database.pool, 'query');
      const checkout = jest.spyOn(database.pool, 'connect');
      const response = await optOut(make());
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('opt_out_invalid');
      expect(query).not.toHaveBeenCalled();
      expect(checkout).not.toHaveBeenCalled();
      expect(await optOutRows(igUserId)).toHaveLength(0);
    });

    it('token이 없는 본문, 객체가 아닌 본문, 본문 없음도 400 opt_out_invalid이다', async () => {
      const send = (body: string | undefined, contentType = 'application/json') =>
        fetch(`${t.baseUrl}${OPT_OUT_PATH}`, { method: 'POST', headers: { 'content-type': contentType }, body });
      for (const response of [
        await send('{}'),
        await send('[1,2]'),
        await send(undefined),
        await send('x', 'text/plain'),
      ]) {
        expect(response.status).toBe(400);
        expect(((await response.json()) as { code: string }).code).toBe('opt_out_invalid');
      }
    });
  });

  describe('요청 한도', () => {
    const newToken = () => tokenFor(`9${randomId(10)}`, newPerson());

    /** 다른 토큰 `count`개를 같은 IP로 보내고 상태 코드를 돌려줍니다. */
    const flood = async (count: number, ip: string | null) => {
      const statuses: number[] = [];
      for (let sent = 0; sent < count; sent += 20) {
        const batch = Array.from({ length: Math.min(20, count - sent) }, () => optOut(newToken(), ip));
        statuses.push(...(await Promise.all(batch)).map((response) => response.status));
      }
      return statuses;
    };

    it('같은 사람은 IP를 바꿔도 1분에 10번까지이고, 창이 지나면 다시 된다', async () => {
      const { account, token } = await accountWithPending();
      for (let index = 0; index < PERSON_LIMIT; index += 1) expect((await optOut(token)).status).toBe(204);

      const limited = await optOut(token);
      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe('telemetry_rate_limited');
      expect(await optOutRows(account.igUserId)).toHaveLength(1);

      await t.pool.query(
        "UPDATE landing_event_limits SET window_start = now() - interval '2 minutes' WHERE bucket LIKE 'instagram-opt-out:person:%'",
      );
      expect((await optOut(token)).status).toBe(204);
    });

    it('한도에 걸린 요청은 수신 거부를 기록하지 않는다', async () => {
      const ip = nextIp();
      expect(await flood(SOURCE_LIMIT, ip)).toEqual(Array(SOURCE_LIMIT).fill(204));

      const igUserId = `9${randomId(10)}`;
      const limited = await optOut(tokenFor(igUserId, newPerson()), ip);
      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe('telemetry_rate_limited');
      expect(await optOutRows(igUserId)).toHaveLength(0);

      // 다른 IP는 영향받지 않습니다.
      expect((await optOut(newToken())).status).toBe(204);
    });

    it('X-Forwarded-For 앞쪽 값을 바꿔도 IP 한도를 피하지 못한다', async () => {
      const ip = nextIp();
      await flood(SOURCE_LIMIT, ip);
      const spoofed = await optOut(newToken(), `${nextIp()}, ${ip}`);
      expect(spoofed.status).toBe(429);
    });

    it('토큰 하나의 반복은 한도를 넘긴 뒤 IP 한도를 쓰지 않는다', async () => {
      const ip = nextIp();
      const token = newToken();
      for (let index = 0; index < PERSON_LIMIT + 50; index += 1) await optOut(token, ip);
      const statuses = await flood(SOURCE_LIMIT - PERSON_LIMIT, ip);
      expect(statuses).toEqual(Array(SOURCE_LIMIT - PERSON_LIMIT).fill(204));
    });

    describe('IP 한도의 키는 실제 방문자다', () => {
      const sourceBuckets = async () =>
        (
          await t.pool.query<{ bucket: string; used: number }>(
            "SELECT bucket, used FROM landing_event_limits WHERE bucket LIKE 'instagram-opt-out:source:%' ORDER BY bucket",
          )
        ).rows;
      const newSourceBuckets = async (run: () => Promise<unknown>) => {
        const before = new Set((await sourceBuckets()).map((row) => row.bucket));
        await run();
        return (await sourceBuckets()).filter((row) => !before.has(row.bucket));
      };

      it('X-Forwarded-For 없는 BFF 전달은 IP 한도를 넘게 보내도 전부 204이고 IP 버킷을 만들지 않는다', async () => {
        let statuses: number[] = [];
        const created = await newSourceBuckets(async () => {
          statuses = await flood(SOURCE_LIMIT + 10, null);
        });
        expect(statuses).toEqual(Array(SOURCE_LIMIT + 10).fill(204));
        expect(created).toEqual([]);
      });

      it('X-Forwarded-For가 없어도 사람별 한도는 적용된다', async () => {
        const token = newToken();
        for (let index = 0; index < PERSON_LIMIT; index += 1) expect((await optOut(token, null)).status).toBe(204);
        expect((await optOut(token, null)).status).toBe(429);
      });

      it('방문자마다 버킷이 따로이고 같은 방문자는 같은 버킷을 쓴다', async () => {
        const [first, second] = [nextIp(), nextIp()];
        const created = await newSourceBuckets(async () => {
          await optOut(newToken(), first);
          await optOut(newToken(), first);
          await optOut(newToken(), second);
        });
        expect(created.map((row) => row.used).sort()).toEqual([1, 2]);
      });

      it('한 방문자가 한도를 다 써도 같은 웹 서버를 거치는 다른 방문자는 204이다', async () => {
        const ip = nextIp();
        await flood(SOURCE_LIMIT, ip);
        expect((await optOut(newToken(), ip)).status).toBe(429);
        expect((await optOut(newToken(), nextIp())).status).toBe(204);
        expect((await optOut(newToken(), null)).status).toBe(204);
      });

      it.each([
        ['IP가 아닌 값', 'not-an-ip'],
        ['포트가 붙은 값', '203.0.113.9:443'],
        ['빈 값', ''],
      ])('X-Forwarded-For가 %s이면 IP 버킷을 만들지 않는다', async (_label, value) => {
        const created = await newSourceBuckets(async () => {
          expect((await optOut(newToken(), value)).status).toBe(204);
        });
        expect(created).toEqual([]);
      });

      it('신뢰 프록시가 없으면(TRUSTED_PROXY_HOPS=0) X-Forwarded-For를 믿지 않는다', async () => {
        jest.spyOn(AppConfig.prototype, 'trustedProxyHops', 'get').mockReturnValue(0);
        const created = await newSourceBuckets(async () => {
          expect((await optOut(newToken(), nextIp())).status).toBe(204);
        });
        expect(created).toEqual([]);
      });
    });

    it('위조 토큰은 IP 한도를 쓰지 않는다', async () => {
      const ip = nextIp();
      for (let index = 0; index < SOURCE_LIMIT + 10; index += 1) {
        expect((await optOut(tokenFor('17850000002', newPerson(), randomBytes(32)), ip)).status).toBe(400);
      }
      expect((await optOut(newToken(), ip)).status).toBe(204);
    });
  });

  describe('트랜잭션', () => {
    it('pending 취소가 실패하면 거부 기록도 남지 않고 503이다', async () => {
      const { account, fromId, token } = await accountWithPending();
      await t.pool.query(`
        CREATE FUNCTION opt_out_test_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked by test'; END $$ LANGUAGE plpgsql;
        CREATE TRIGGER opt_out_test_fail BEFORE UPDATE ON instagram_dm_deliveries FOR EACH ROW EXECUTE FUNCTION opt_out_test_fail();
      `);
      try {
        const response = await optOut(token);
        expect(response.status).toBe(503);
        expect(response.body.code).toBe('database_unavailable');
      } finally {
        await t.pool.query(`
          DROP TRIGGER opt_out_test_fail ON instagram_dm_deliveries;
          DROP FUNCTION opt_out_test_fail();
        `);
      }
      expect(await optOutRows(account.igUserId)).toHaveLength(0);
      expect(await statusesOf(account, fromId)).toEqual(['pending']);

      expect((await optOut(token)).status).toBe(204);
      expect(await optOutRows(account.igUserId)).toHaveLength(1);
      expect(await statusesOf(account, fromId)).toEqual(['cancelled']);
    });
  });

  describe('로그와 Sentry', () => {
    const logSpies = () => [
      jest.spyOn(Logger.prototype, 'log'),
      jest.spyOn(Logger.prototype, 'error'),
      jest.spyOn(Logger.prototype, 'warn'),
      jest.spyOn(Logger.prototype, 'debug'),
      jest.spyOn(Logger.prototype, 'verbose'),
      jest.spyOn(Logger.prototype, 'fatal'),
      jest.spyOn(console, 'log'),
      jest.spyOn(console, 'error'),
      jest.spyOn(console, 'warn'),
    ];
    const logged = (spies: ReturnType<typeof logSpies>) => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));

    beforeEach(async () => {
      await Sentry.flush(2000);
      envelopes.length = 0;
      events.length = 0;
    });

    it('전역 예외 필터(500)는 메서드와 경로만 기록하고 토큰과 본문은 로그·Sentry에 남지 않는다', async () => {
      const { token } = await accountWithPending();
      const spies = logSpies();
      jest.spyOn(t.app.get(InstagramOptOutService), 'optOut').mockRejectedValueOnce(new Error('opt-out-e2e boom'));

      const response = await optOut(token);
      expect(response.status).toBe(500);
      expect(response.body.code).toBe('internal_error');
      await Sentry.flush(2000);

      expect(Logger.prototype.error).toHaveBeenCalledWith(`POST ${OPT_OUT_PATH} 처리 중 오류`, expect.any(String));
      expect(logged(spies)).not.toContain(token);

      expect(events).toHaveLength(1);
      expect(events[0].exception?.values?.[0]?.value).toBe('opt-out-e2e boom');
      expect(events[0].request?.data).toBeUndefined();
      expect(envelopes.join('\n')).not.toContain(token);
    });

    it('정상·400·429·DB 실패 어디서도 토큰과 해시가 로그·Sentry에 남지 않는다', async () => {
      const { account, fromId, token } = await accountWithPending();
      const spies = logSpies();
      const hashHex = hashOf(account, fromId).toString('hex');
      const tampered = flipByte(token, -1);

      expect((await optOut(token)).status).toBe(204);
      expect((await optOut(tampered)).status).toBe(400);
      for (let index = 0; index < PERSON_LIMIT; index += 1) await optOut(token);
      expect((await optOut(token)).status).toBe(429);

      const original = database.pool.query.bind(database.pool) as (...args: unknown[]) => Promise<unknown>;
      jest
        .spyOn(database.pool, 'query')
        .mockImplementation(((...args: unknown[]) =>
          String(args[0]).includes('landing_event_limits')
            ? Promise.reject(Object.assign(new Error(`value (${token}) ${hashHex}`), { code: '23514' }))
            : original(...args)) as never);
      expect((await optOut(token)).status).toBe(503);
      await Sentry.flush(2000);

      const text = logged(spies);
      expect(text).toContain('23514');
      for (const secret of [token, tampered, hashHex, fromId]) {
        expect(text).not.toContain(secret);
        expect(envelopes.join('\n')).not.toContain(secret);
      }
      expect(events).toHaveLength(0);
    });

    it('JSON이 깨진 본문의 토큰도 로그·Sentry에 남지 않는다', async () => {
      const { token } = await accountWithPending();
      const spies = logSpies();
      const response = await fetch(`${t.baseUrl}${OPT_OUT_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: `{"token":"${token}"`,
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe('validation_failed');
      await Sentry.flush(2000);
      expect(logged(spies)).not.toContain(token);
      expect(envelopes.join('\n')).not.toContain(token);
      expect(events).toHaveLength(0);
    });
  });
});
