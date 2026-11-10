import { randomBytes } from 'node:crypto';
import {
  CreatorLandingState,
  InstagramConnectionView,
  InstagramIntegrationView,
  PageInviteResponse,
} from '@crelink/shared';
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  InstagramConnectionService,
  signOAuthState,
} from '../src/instagram/connection.service';
import { decryptToken, encryptToken, parseTokenKeyring } from '../src/instagram/crypto';
import { GraphInstagramAccount, InstagramGraph, InstagramGraphError } from '../src/instagram/graph';
import { InstagramTokenHealthService } from '../src/instagram/token-health.service';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

const b64Key = () => randomBytes(32).toString('base64');
const OLD_KEY = b64Key();
const CURRENT_KEY = b64Key();
const APP_SECRET = 'test-meta-app-secret';
const KEYS_VALUE = `1:${OLD_KEY},2:${CURRENT_KEY}`;
const META_ENV = {
  META_APP_ID: 'test-app',
  META_APP_SECRET: APP_SECRET,
  META_LOGIN_CONFIG_ID: 'test-config',
  META_WEBHOOK_VERIFY_TOKEN: 'test-verify',
  INSTAGRAM_TOKEN_KEYS: KEYS_VALUE,
  INSTAGRAM_TOKEN_KEY_CURRENT: '2',
  INSTAGRAM_COMMENTER_HASH_KEY: b64Key(),
  INSTAGRAM_OPT_OUT_KEY: b64Key(),
};
const keyring = parseTokenKeyring(KEYS_VALUE, '2');

const CALLBACK = '/api/me/instagram/callback';
const CONNECT = '/api/me/instagram/connect';

interface Member {
  cookie: string;
  userId: string;
  publicId: string;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  ig_user_id: string;
  status: string;
  token_ciphertext: Buffer | null;
  token_key_version: number | null;
  token_expires_at: Date | null;
  token_revision: number;
  dm_paused_at: Date | null;
}

describe('Instagram 연결 API', () => {
  let t: TestApp;
  let graph: InstagramGraph;
  let n = 0;
  let spies: {
    exchange: jest.SpyInstance;
    accounts: jest.SpyInstance;
    subscribe: jest.SpyInstance;
    unsubscribe: jest.SpyInstance;
    check: jest.SpyInstance;
  };

  const member = async (email = `ig-${++n}@example.com`): Promise<Member> => {
    const result = await login(t.baseUrl, `ig-${email}|${email}`);
    const state = await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: result.cookie });
    return { cookie: result.cookie!, userId: result.body.user!.id, publicId: state.body.landing.publicId };
  };
  const igId = () => `1784${String(++n).padStart(8, '0')}`;
  const account = (igUserId: string, overrides: Partial<GraphInstagramAccount> = {}): GraphInstagramAccount => ({
    igUserId,
    username: `user_${igUserId}`,
    isProfessional: true,
    ...overrides,
  });
  const setAudience = (audience: string) =>
    t.pool.query('UPDATE platform_settings SET instagram_dm_audience = $1', [audience]);
  const startFlow = async (who: Member) => {
    const response = await api<{ authorizationUrl: string }>(t.baseUrl, 'POST', CONNECT, { cookie: who.cookie });
    expect(response.status).toBe(200);
    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith(`${INSTAGRAM_OAUTH_STATE_COOKIE}=`))!;
    const stateCookie = setCookie.split(';')[0];
    return { stateCookie, state: decodeURIComponent(stateCookie.slice(stateCookie.indexOf('=') + 1)), response };
  };
  const callback = <T = { code: string }>(
    who: Member,
    state: unknown,
    stateCookie?: string,
    code: unknown = 'code-1',
  ) =>
    api<T>(t.baseUrl, 'POST', CALLBACK, {
      cookie: stateCookie ? `${who.cookie}; ${stateCookie}` : who.cookie,
      body: { code, state },
    });
  /** 시작부터 저장까지 한 번에 진행합니다. Graph는 spy입니다. */
  const connect = async (
    who: Member,
    igUserId: string,
    accessToken = `plain-token-${igUserId}`,
    expiresAt: Date | null = null,
  ) => {
    spies.exchange.mockResolvedValueOnce({ accessToken, expiresAt });
    spies.accounts.mockResolvedValueOnce({ metaUserId: `meta-${igUserId}`, accounts: [account(igUserId)] });
    const { state, stateCookie } = await startFlow(who);
    const response = await callback<InstagramConnectionView>(who, state, stateCookie);
    expect(response.status).toBe(200);
    return response;
  };
  const row = async (userId: string): Promise<ConnectionRow | undefined> =>
    (await t.pool.query<ConnectionRow>('SELECT * FROM instagram_connections WHERE user_id = $1', [userId])).rows[0];
  const requireRow = async (userId: string): Promise<ConnectionRow> => {
    const found = await row(userId);
    if (!found) throw new Error('연결 행이 없습니다.');
    return found;
  };
  const makeDue = (id: string) =>
    t.pool.query("UPDATE instagram_connections SET token_checked_at = now() - interval '25 hours' WHERE id = $1", [id]);

  /** 규칙 1개와 `pending`·`sending` 발송 행을 만듭니다. */
  const seedDeliveries = async (connectionId: string) => {
    const code = `c${randomBytes(4).toString('hex')}`;
    await t.pool.query('INSERT INTO channel_link_codes (code) VALUES ($1)', [code]);
    const rule = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, media_permalink, keyword, message, channel_link_code)
       VALUES ($1, $2, 'media-1', 'https://www.instagram.com/p/x/', '키워드', '메시지', $3) RETURNING id`,
      [randomBytes(5).toString('hex'), connectionId, code],
    );
    for (const status of ['pending', 'sending']) {
      await t.pool.query(
        `INSERT INTO instagram_dm_deliveries (connection_id, rule_id, comment_id, commenter_hash, commented_at, message_body, status)
         VALUES ($1, $2, $3, $4, now(), '본문', $5)`,
        [connectionId, rule.rows[0].id, `comment-${status}`, randomBytes(32), status],
      );
    }
  };
  const deliveryStatuses = async (connectionId: string): Promise<Record<string, string>> => {
    const result = await t.pool.query<{ comment_id: string; status: string }>(
      'SELECT comment_id, status FROM instagram_dm_deliveries WHERE connection_id = $1',
      [connectionId],
    );
    return Object.fromEntries(result.rows.map((r) => [r.comment_id, r.status]));
  };
  const health = () => t.app.get(InstagramTokenHealthService, { strict: false });
  const connections = () => t.app.get(InstagramConnectionService, { strict: false });
  const graphError = (code: number | null = null) =>
    new InstagramGraphError('test', 'indeterminate', 500, code, null, null);

  beforeAll(async () => {
    t = await createTestApp({ env: META_ENV });
    graph = t.app.get(InstagramGraph, { strict: false });
  });
  afterAll(async () => {
    await t?.close();
  });
  beforeEach(async () => {
    await setAudience('everyone');
    // 실제 Meta를 부르지 않도록 네트워크를 쓰는 메서드를 모두 교체합니다.
    spies = {
      exchange: jest.spyOn(graph, 'exchangeCode').mockRejectedValue(new Error('exchangeCode 미지정')),
      accounts: jest.spyOn(graph, 'fetchAccounts').mockRejectedValue(new Error('fetchAccounts 미지정')),
      subscribe: jest.spyOn(graph, 'subscribeApp').mockResolvedValue(undefined),
      unsubscribe: jest.spyOn(graph, 'unsubscribeApp').mockResolvedValue(undefined),
      check: jest.spyOn(graph, 'checkToken').mockResolvedValue('valid'),
    };
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('권한', () => {
    const routes: [string, string][] = [
      ['GET', '/api/me/instagram'],
      ['POST', CONNECT],
      ['POST', CALLBACK],
      ['POST', '/api/me/instagram/recheck'],
      ['DELETE', '/api/me/instagram'],
      ['PUT', '/api/me/instagram/pause'],
    ];

    it('로그인 없이는 401', async () => {
      for (const [method, path] of routes) {
        expect((await api(t.baseUrl, method, path)).status).toBe(401);
      }
    });

    it('AI 행위자는 모든 경로에서 403 forbidden', async () => {
      const ai = await createAiOperator(t.pool);
      for (const [method, path] of routes) {
        const response = await api(t.baseUrl, method, path, {
          token: ai.token,
          body: method === 'GET' ? undefined : {},
        });
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('forbidden');
      }
    });

    it('편집자는 모든 경로에서 403 page_owner_only', async () => {
      const owner = await member();
      const editor = await member();
      const invite = await api<PageInviteResponse>(t.baseUrl, 'POST', '/api/me/page-invites', {
        cookie: owner.cookie,
        headers: { 'X-Crelink-Page': owner.publicId },
      });
      expect(invite.status).toBe(201);
      const accepted = await api(t.baseUrl, 'POST', '/api/page-invites/accept', {
        cookie: editor.cookie,
        body: { token: invite.body.token },
      });
      expect(accepted.status).toBe(200);
      for (const [method, path] of routes) {
        const response = await api(t.baseUrl, method, path, {
          cookie: editor.cookie,
          headers: { 'X-Crelink-Page': owner.publicId },
          body: method === 'GET' ? undefined : {},
        });
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('page_owner_only');
      }
      expect(spies.exchange).not.toHaveBeenCalled();
    });

    it('audience가 off면 시작은 403 instagram_unavailable', async () => {
      const owner = await member();
      await setAudience('off');
      const response = await api(t.baseUrl, 'POST', CONNECT, { cookie: owner.cookie });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('instagram_unavailable');
      expect(response.headers.getSetCookie()).toEqual([]);
    });

    it('audience가 operators면 운영자 역할만 시작한다', async () => {
      const creator = await member();
      const operator = await member('operator@example.com');
      await setAudience('operators');
      const denied = await api(t.baseUrl, 'POST', CONNECT, { cookie: creator.cookie });
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('instagram_unavailable');
      await startFlow(operator);
    });

    it('동의 화면에 있는 사이 스위치가 꺼지면 콜백도 403이고 외부 호출이 없다', async () => {
      const owner = await member();
      const { state, stateCookie } = await startFlow(owner);
      await setAudience('off');
      const response = await callback(owner, state, stateCookie);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('instagram_unavailable');
      expect(spies.exchange).not.toHaveBeenCalled();
      expect(await row(owner.userId)).toBeUndefined();
    });
  });

  describe('state', () => {
    it('시작 응답은 authorizationUrl과 HttpOnly 쿠키를 주고 저장하지 않는다', async () => {
      const owner = await member();
      const { response, state } = await startFlow(owner);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const url = new URL(response.body.authorizationUrl);
      expect(url.searchParams.get('state')).toBe(state);
      expect(url.searchParams.get('redirect_uri')).toBe('http://web.test/me/integrations/instagram/callback');
      expect(response.headers.getSetCookie()[0]).toContain('HttpOnly');
      expect(await row(owner.userId)).toBeUndefined();
    });

    it('서명을 위조하면 400', async () => {
      const owner = await member();
      const { state, stateCookie } = await startFlow(owner);
      const forged = `${state.split('.')[0]}.${Buffer.alloc(32, 7).toString('base64url')}`;
      const forgedCookie = `${INSTAGRAM_OAUTH_STATE_COOKIE}=${encodeURIComponent(forged)}`;
      const response = await callback(owner, forged, forgedCookie);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('oauth_state_invalid');
      expect(spies.exchange).not.toHaveBeenCalled();
      // 쿠키와 값이 다른 경우도 같습니다.
      const mismatch = await callback(owner, forged, stateCookie);
      expect(mismatch.status).toBe(400);
    });

    it('다른 비밀로 서명한 state는 쿠키가 같아도 400', async () => {
      const owner = await member();
      const forged = signOAuthState('other-secret', {
        uid: owner.userId,
        exp: Math.floor(Date.now() / 1000) + 600,
        nonce: 'x',
        rev: 0,
      });
      const response = await callback(owner, forged, `${INSTAGRAM_OAUTH_STATE_COOKIE}=${encodeURIComponent(forged)}`);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('oauth_state_invalid');
    });

    it('만료된 state는 400', async () => {
      const owner = await member();
      const expired = signOAuthState(APP_SECRET, {
        uid: owner.userId,
        exp: Math.floor(Date.now() / 1000) - 1,
        nonce: 'x',
        rev: 0,
      });
      const response = await callback(owner, expired, `${INSTAGRAM_OAUTH_STATE_COOKIE}=${encodeURIComponent(expired)}`);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('oauth_state_invalid');
    });

    it('쿠키가 없으면 400', async () => {
      const owner = await member();
      const { state } = await startFlow(owner);
      const response = await callback(owner, state);
      expect(response.status).toBe(400);
      expect(spies.exchange).not.toHaveBeenCalled();
    });

    it('다른 세션이 쿠키까지 함께 가져와도 400', async () => {
      const victim = await member();
      const other = await member();
      const { state, stateCookie } = await startFlow(victim);
      const response = await callback(other, state, stateCookie);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('oauth_state_invalid');
      expect(spies.exchange).not.toHaveBeenCalled();
    });

    it('성공·실패 모두 쿠키를 지운다', async () => {
      const owner = await member();
      const failed = await callback(owner, 'nope', `${INSTAGRAM_OAUTH_STATE_COOKIE}=nope`);
      expect(failed.status).toBe(400);
      expect(failed.headers.getSetCookie()[0]).toContain('Max-Age=0');
      const done = await connect(owner, igId());
      expect(done.headers.getSetCookie()[0]).toContain('Max-Age=0');
    });

    it('성공한 state는 쿠키를 보관해 다시 보내도 400이고 code를 다시 교환하지 않는다', async () => {
      const owner = await member();
      const ig = igId();
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-reuse', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(ig)] });
      const { state, stateCookie } = await startFlow(owner);
      expect((await callback(owner, state, stateCookie)).status).toBe(200);
      const replay = await callback(owner, state, stateCookie);
      expect(replay.status).toBe(400);
      expect(replay.body.code).toBe('oauth_state_invalid');
      expect(spies.exchange).toHaveBeenCalledTimes(1);
      // 브라우저처럼 쿠키가 지워진 경우도 같습니다.
      expect((await callback(owner, state)).status).toBe(400);
    });

    it('code가 없으면 400 validation_failed', async () => {
      const owner = await member();
      const { state, stateCookie } = await startFlow(owner);
      const response = await callback(owner, state, stateCookie, '');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('validation_failed');
    });
  });

  describe('연결', () => {
    it('토큰이 암호화돼 저장되고 DB 평문·응답에 없다', async () => {
      const owner = await member();
      const ig = igId();
      const secret = `plain-secret-${randomBytes(6).toString('hex')}`;
      const response = await connect(owner, ig, secret);
      expect(response.body).toEqual({
        igUsername: `user_${ig}`,
        status: 'active',
        paused: false,
        operatorPaused: false,
        connectedAt: expect.any(String),
        tokenExpiresAt: null,
      });
      expect(JSON.stringify(response.body)).not.toContain(secret);
      expect(spies.subscribe).toHaveBeenCalledWith(secret, ig);
      const stored = await requireRow(owner.userId);
      expect(stored.token_ciphertext!.includes(Buffer.from(secret))).toBe(false);
      const dump = await t.pool.query<{ dump: string }>(
        'SELECT row_to_json(c)::text AS dump FROM instagram_connections c WHERE id = $1',
        [stored.id],
      );
      expect(dump.rows[0].dump).not.toContain(secret);
      expect(dump.rows[0].dump).not.toContain(Buffer.from(secret).toString('hex'));
      expect(stored.token_key_version).toBe(2);
      expect(decryptToken(keyring, stored.id, stored.token_ciphertext!, stored.token_key_version!)).toBe(secret);
      // 다른 행에 복사한 암호문은 풀리지 않습니다(AAD).
      expect(() =>
        decryptToken(
          keyring,
          '00000000-0000-0000-0000-000000000000',
          stored.token_ciphertext!,
          stored.token_key_version!,
        ),
      ).toThrow();
      const view = await api<InstagramIntegrationView>(t.baseUrl, 'GET', '/api/me/instagram', { cookie: owner.cookie });
      expect(JSON.stringify(view.body)).not.toContain(secret);
      expect(view.body.connection?.igUsername).toBe(`user_${ig}`);
      expect(view.body.available).toBe(true);
      expect(view.headers.get('cache-control')).toBe('no-store');
    });

    it('만료 값이 있으면 저장하고 응답한다', async () => {
      const owner = await member();
      const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const response = await connect(owner, igId(), 'plain-exp', expiresAt);
      expect(response.body.tokenExpiresAt).toBe(expiresAt.toISOString());
      expect((await requireRow(owner.userId)).token_expires_at?.toISOString()).toBe(expiresAt.toISOString());
    });

    it('만료 값이 없으면 null로 저장한다', async () => {
      const owner = await member();
      const response = await connect(owner, igId(), 'plain-noexp', null);
      expect(response.body.tokenExpiresAt).toBeNull();
      expect((await requireRow(owner.userId)).token_expires_at).toBeNull();
    });

    it('계정이 2개면 409, 구독하지 않는다', async () => {
      const owner = await member();
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-multi', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(igId()), account(igId())] });
      const { state, stateCookie } = await startFlow(owner);
      const response = await callback(owner, state, stateCookie);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('instagram_account_selection_required');
      expect(spies.subscribe).not.toHaveBeenCalled();
      expect(await row(owner.userId)).toBeUndefined();
    });

    it('계정이 없어도 409 selection', async () => {
      const owner = await member();
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-zero', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [] });
      const { state, stateCookie } = await startFlow(owner);
      const response = await callback(owner, state, stateCookie);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('instagram_account_selection_required');
    });

    it('프로페셔널 계정이 아니면 422', async () => {
      const owner = await member();
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-personal', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({
        metaUserId: null,
        accounts: [account(igId(), { isProfessional: false })],
      });
      const { state, stateCookie } = await startFlow(owner);
      const response = await callback(owner, state, stateCookie);
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('instagram_account_not_professional');
      expect(spies.subscribe).not.toHaveBeenCalled();
    });

    it.each(['exchange', 'accounts', 'subscribe'] as const)('%s 실패는 502이고 저장하지 않는다', async (step) => {
      const owner = await member();
      const ig = igId();
      spies.exchange.mockResolvedValue({ accessToken: 'plain-fail', expiresAt: null });
      spies.accounts.mockResolvedValue({ metaUserId: null, accounts: [account(ig)] });
      spies[step].mockReset();
      spies[step].mockRejectedValue(graphError());
      const { state, stateCookie } = await startFlow(owner);
      const response = await callback(owner, state, stateCookie);
      expect(response.status).toBe(502);
      expect(response.body.code).toBe('instagram_upstream_failed');
      expect(await row(owner.userId)).toBeUndefined();
    });

    it('이미 다른 계정을 연결한 페이지는 409, 구독·교체하지 않는다', async () => {
      const owner = await member();
      const original = igId();
      await connect(owner, original, 'plain-original');
      spies.subscribe.mockClear();
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-second', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(igId())] });
      const { state, stateCookie } = await startFlow(owner);
      const response = await callback(owner, state, stateCookie);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('instagram_account_in_use');
      expect(spies.subscribe).not.toHaveBeenCalled();
      expect((await requireRow(owner.userId)).ig_user_id).toBe(original);
    });

    it('같은 계정 재연결은 토큰을 갈고 revision을 올린다', async () => {
      const owner = await member();
      const ig = igId();
      await connect(owner, ig, 'plain-first');
      const before = await requireRow(owner.userId);
      await connect(owner, ig, 'plain-second');
      const after = await requireRow(owner.userId);
      expect(after.id).toBe(before.id);
      expect(after.token_revision).toBe(before.token_revision + 1);
      expect(decryptToken(keyring, after.id, after.token_ciphertext!, after.token_key_version!)).toBe('plain-second');
    });

    it('응답에 어느 페이지인지 드러내지 않고 다른 페이지의 유효한 계정은 409', async () => {
      const first = await member();
      const second = await member();
      const ig = igId();
      await connect(first, ig, 'plain-first-owner');
      spies.subscribe.mockClear();
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-second-owner', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(ig)] });
      spies.check.mockResolvedValueOnce('valid');
      const { state, stateCookie } = await startFlow(second);
      const response = await callback(second, state, stateCookie);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('instagram_account_in_use');
      expect(JSON.stringify(response.body)).not.toContain(first.publicId);
      expect(JSON.stringify(response.body)).not.toContain(first.userId);
      expect(spies.check).toHaveBeenCalledWith('plain-first-owner', ig);
      expect(spies.subscribe).not.toHaveBeenCalled();
      expect(await row(second.userId)).toBeUndefined();
      expect((await requireRow(first.userId)).status).toBe('active');
    });

    it('충돌 시 기존 토큰이 무효이면 기존 행을 파기·취소하고 연결한다', async () => {
      const first = await member();
      const second = await member();
      const ig = igId();
      await connect(first, ig, 'plain-stale-owner');
      const original = await requireRow(first.userId);
      await seedDeliveries(original.id);
      spies.subscribe.mockClear();
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-new-owner', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(ig)] });
      spies.check.mockResolvedValueOnce('invalid');
      const { state, stateCookie } = await startFlow(second);
      const response = await callback<InstagramConnectionView>(second, state, stateCookie);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('active');
      expect(spies.subscribe).toHaveBeenCalledTimes(1);
      expect(spies.subscribe).toHaveBeenCalledWith('plain-new-owner', ig);
      const stale = await requireRow(first.userId);
      expect(stale.status).toBe('reauth_required');
      expect(stale.token_ciphertext).toBeNull();
      expect(stale.token_key_version).toBeNull();
      expect(stale.token_revision).toBe(original.token_revision + 1);
      expect(await deliveryStatuses(original.id)).toEqual({
        'comment-pending': 'cancelled',
        'comment-sending': 'sending',
      });
      expect((await requireRow(second.userId)).status).toBe('active');
    });

    it('충돌 점검이 실패하면 502이고 기존 연결을 건드리지 않는다', async () => {
      const first = await member();
      const second = await member();
      const ig = igId();
      await connect(first, ig, 'plain-keep');
      const before = await requireRow(first.userId);
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-other', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(ig)] });
      spies.check.mockRejectedValueOnce(graphError());
      const { state, stateCookie } = await startFlow(second);
      const response = await callback(second, state, stateCookie);
      expect(response.status).toBe(502);
      const after = await requireRow(first.userId);
      expect(after.status).toBe('active');
      expect(after.token_revision).toBe(before.token_revision);
    });

    it('충돌 점검 중 기존 토큰이 바뀌면 무효 결과를 버리고 409', async () => {
      const first = await member();
      const second = await member();
      const ig = igId();
      await connect(first, ig, 'plain-rotate');
      const before = await requireRow(first.userId);
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-late', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(ig)] });
      spies.check.mockImplementationOnce(async () => {
        await t.pool.query('UPDATE instagram_connections SET token_revision = token_revision + 1 WHERE id = $1', [
          before.id,
        ]);
        return 'invalid';
      });
      const { state, stateCookie } = await startFlow(second);
      const response = await callback(second, state, stateCookie);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('instagram_account_in_use');
      const after = await requireRow(first.userId);
      expect(after.status).toBe('active');
      expect(after.token_ciphertext).not.toBeNull();
      expect(after.token_revision).toBe(before.token_revision + 1);
    });

    it('만료 지난 기존 토큰은 외부 호출 없이 무효로 처리한다', async () => {
      const first = await member();
      const second = await member();
      const ig = igId();
      await connect(first, ig, 'plain-expired', new Date(Date.now() + 1000));
      await t.pool.query(
        "UPDATE instagram_connections SET token_expires_at = now() - interval '1 minute' WHERE user_id = $1",
        [first.userId],
      );
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-after-expiry', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(ig)] });
      const { state, stateCookie } = await startFlow(second);
      expect((await callback(second, state, stateCookie)).status).toBe(200);
      expect(spies.check).not.toHaveBeenCalled();
      expect((await requireRow(first.userId)).status).toBe('reauth_required');
    });

    it('재인증 뒤 원래 소유자가 같은 계정으로 다시 연결하면 복구하고, 남이 살아 있으면 409', async () => {
      const first = await member();
      const ig = igId();
      await connect(first, ig, 'plain-before-reauth');
      const stale = await requireRow(first.userId);
      expect(await connections().markReauthRequired(stale.id, stale.token_revision)).toBe(true);
      const restored = await connect(first, ig, 'plain-restored');
      expect(restored.body.status).toBe('active');
      const row1 = await requireRow(first.userId);
      expect(row1.id).toBe(stale.id);
      expect(row1.token_revision).toBe(stale.token_revision + 2);

      // 다른 페이지가 무효 처리 뒤 차지했으면 원래 소유자는 409입니다.
      const second = await member();
      expect(await connections().markReauthRequired(row1.id, row1.token_revision)).toBe(true);
      await connect(second, ig, 'plain-taken');
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-too-late', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(ig)] });
      spies.check.mockResolvedValueOnce('valid');
      const { state, stateCookie } = await startFlow(first);
      const response = await callback(first, state, stateCookie);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('instagram_account_in_use');
    });

    it('재인증 상태에서 다른 계정으로는 바꿀 수 없다', async () => {
      const owner = await member();
      const ig = igId();
      await connect(owner, ig, 'plain-swap');
      const current = await requireRow(owner.userId);
      await connections().markReauthRequired(current.id, current.token_revision);
      spies.exchange.mockResolvedValueOnce({ accessToken: 'plain-other-account', expiresAt: null });
      spies.accounts.mockResolvedValueOnce({ metaUserId: null, accounts: [account(igId())] });
      const { state, stateCookie } = await startFlow(owner);
      const response = await callback(owner, state, stateCookie);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('instagram_account_in_use');
      expect((await requireRow(owner.userId)).ig_user_id).toBe(ig);
    });

    it('동시 콜백으로 같은 계정을 연결하면 한쪽만 성공한다', async () => {
      const first = await member();
      const second = await member();
      const ig = igId();
      spies.exchange.mockResolvedValue({ accessToken: 'plain-race', expiresAt: null });
      spies.accounts.mockResolvedValue({ metaUserId: null, accounts: [account(ig)] });
      const [a, b] = await Promise.all([startFlow(first), startFlow(second)]);
      const results = await Promise.all([
        callback(first, a.state, a.stateCookie),
        callback(second, b.state, b.stateCookie),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const live = await t.pool.query(
        "SELECT 1 FROM instagram_connections WHERE ig_user_id = $1 AND status <> 'reauth_required'",
        [ig],
      );
      expect(live.rowCount).toBe(1);
    });
  });

  describe('markReauthRequired', () => {
    it('상태·토큰 NULL·revision 증가·pending 취소를 함께 처리한다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-mark');
      const before = await requireRow(owner.userId);
      await seedDeliveries(before.id);
      expect(await connections().markReauthRequired(before.id, before.token_revision)).toBe(true);
      const after = await requireRow(owner.userId);
      expect(after).toMatchObject({
        status: 'reauth_required',
        token_ciphertext: null,
        token_key_version: null,
        token_revision: before.token_revision + 1,
      });
      expect(await deliveryStatuses(before.id)).toEqual({
        'comment-pending': 'cancelled',
        'comment-sending': 'sending',
      });
    });

    it('revision이 다르면 false이고 아무것도 바꾸지 않는다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-stale');
      const before = await requireRow(owner.userId);
      await seedDeliveries(before.id);
      expect(await connections().markReauthRequired(before.id, before.token_revision - 1)).toBe(false);
      const after = await requireRow(owner.userId);
      expect(after.status).toBe('active');
      expect(after.token_revision).toBe(before.token_revision);
      expect(after.token_ciphertext).not.toBeNull();
      expect((await deliveryStatuses(before.id))['comment-pending']).toBe('pending');
    });

    it('이미 재인증 상태면 false이고 revision을 올리지 않는다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-twice');
      const before = await requireRow(owner.userId);
      expect(await connections().markReauthRequired(before.id, before.token_revision)).toBe(true);
      const after = await requireRow(owner.userId);
      expect(await connections().markReauthRequired(before.id, after.token_revision)).toBe(false);
      expect((await requireRow(owner.userId)).token_revision).toBe(after.token_revision);
    });

    it('대기 건 취소가 실패하면 상태·토큰 변경도 되돌린다(한 트랜잭션)', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-atomic');
      const before = await requireRow(owner.userId);
      await seedDeliveries(before.id);
      await t.pool.query(`
        CREATE FUNCTION reject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'cancel blocked'; END $$;
        CREATE TRIGGER reject_cancel BEFORE UPDATE ON instagram_dm_deliveries
          FOR EACH ROW EXECUTE FUNCTION reject_cancel();
      `);
      try {
        await expect(connections().markReauthRequired(before.id, before.token_revision)).rejects.toThrow();
      } finally {
        await t.pool.query('DROP TRIGGER reject_cancel ON instagram_dm_deliveries; DROP FUNCTION reject_cancel();');
      }
      const after = await requireRow(owner.userId);
      expect(after.status).toBe('active');
      expect(after.token_ciphertext).not.toBeNull();
      expect(after.token_revision).toBe(before.token_revision);
    });
  });

  describe('일일 점검', () => {
    it('24시간이 안 지난 연결은 점검하지 않는다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-fresh');
      const result = await health().runOnce();
      expect(result.checked).toBe(0);
      expect(spies.check).not.toHaveBeenCalled();
    });

    it('유효하면 그대로 두고 token_checked_at을 갱신한다', async () => {
      const owner = await member();
      const ig = igId();
      await connect(owner, ig, 'plain-valid');
      const before = await requireRow(owner.userId);
      await makeDue(before.id);
      const result = await health().runOnce();
      expect(result).toEqual({ checked: 1, invalidated: 0, reencrypted: 0, failed: 0 });
      expect(spies.check).toHaveBeenCalledWith('plain-valid', ig);
      const after = await requireRow(owner.userId);
      expect(after.status).toBe('active');
      expect(after.token_revision).toBe(before.token_revision);
    });

    it('무효이면 토큰을 파기하고 대기 건을 취소한다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-invalid');
      const before = await requireRow(owner.userId);
      await seedDeliveries(before.id);
      await makeDue(before.id);
      spies.check.mockResolvedValueOnce('invalid');
      const result = await health().runOnce();
      expect(result.invalidated).toBe(1);
      const after = await requireRow(owner.userId);
      expect(after.status).toBe('reauth_required');
      expect(after.token_ciphertext).toBeNull();
      expect(after.token_revision).toBe(before.token_revision + 1);
      expect(await deliveryStatuses(before.id)).toEqual({
        'comment-pending': 'cancelled',
        'comment-sending': 'sending',
      });
    });

    it('만료 시각이 지났으면 호출 없이 재인증으로 바꾼다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-expired-daily', new Date(Date.now() + 1000));
      const before = await requireRow(owner.userId);
      await t.pool.query(
        "UPDATE instagram_connections SET token_expires_at = now() - interval '1 minute', token_checked_at = now() - interval '25 hours' WHERE id = $1",
        [before.id],
      );
      const result = await health().runOnce();
      expect(result.invalidated).toBe(1);
      expect(spies.check).not.toHaveBeenCalled();
      expect((await requireRow(owner.userId)).status).toBe('reauth_required');
    });

    it('Graph가 실패하면 토큰을 그대로 두고 키 회전은 진행한다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-transient');
      const before = await requireRow(owner.userId);
      const oldRing = parseTokenKeyring(KEYS_VALUE, '1');
      const encrypted = encryptToken(oldRing, before.id, 'plain-transient');
      await t.pool.query(
        'UPDATE instagram_connections SET token_ciphertext = $1, token_key_version = 1 WHERE id = $2',
        [encrypted.ciphertext, before.id],
      );
      await makeDue(before.id);
      spies.check.mockRejectedValueOnce(graphError());
      const result = await health().runOnce();
      expect(result).toEqual({ checked: 1, invalidated: 0, reencrypted: 1, failed: 1 });
      const after = await requireRow(owner.userId);
      expect(after.status).toBe('active');
      expect(after.token_key_version).toBe(2);
      expect(after.token_revision).toBe(before.token_revision);
      expect(decryptToken(keyring, after.id, after.token_ciphertext!, 2)).toBe('plain-transient');
    });

    it('복호화에 실패해도 토큰을 파기하지 않는다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-broken-key');
      const before = await requireRow(owner.userId);
      await t.pool.query(
        "UPDATE instagram_connections SET token_ciphertext = '\\x00' || token_ciphertext WHERE id = $1",
        [before.id],
      );
      await makeDue(before.id);
      const result = await health().runOnce();
      expect(result).toEqual({ checked: 1, invalidated: 0, reencrypted: 0, failed: 1 });
      expect(spies.check).not.toHaveBeenCalled();
      expect((await requireRow(owner.userId)).status).toBe('active');
    });

    it('키 버전이 다르면 재암호화하고 revision은 올리지 않는다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-rotate-key');
      const before = await requireRow(owner.userId);
      const oldRing = parseTokenKeyring(KEYS_VALUE, '1');
      const encrypted = encryptToken(oldRing, before.id, 'plain-rotate-key');
      await t.pool.query(
        'UPDATE instagram_connections SET token_ciphertext = $1, token_key_version = 1 WHERE id = $2',
        [encrypted.ciphertext, before.id],
      );
      await makeDue(before.id);
      const result = await health().runOnce();
      expect(result.reencrypted).toBe(1);
      const after = await requireRow(owner.userId);
      expect(after.token_key_version).toBe(2);
      expect(after.token_revision).toBe(before.token_revision);
      expect(decryptToken(keyring, after.id, after.token_ciphertext!, 2)).toBe('plain-rotate-key');
    });

    it('호출 중 revision이 바뀌면 무효 결과를 버린다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-race-invalid');
      const before = await requireRow(owner.userId);
      await makeDue(before.id);
      spies.check.mockImplementationOnce(async () => {
        await t.pool.query('UPDATE instagram_connections SET token_revision = token_revision + 1 WHERE id = $1', [
          before.id,
        ]);
        return 'invalid';
      });
      const result = await health().runOnce();
      expect(result.invalidated).toBe(0);
      const after = await requireRow(owner.userId);
      expect(after.status).toBe('active');
      expect(after.token_ciphertext).not.toBeNull();
    });

    it('호출 중 revision이 바뀌면 재암호화를 버린다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-race-rotate');
      const before = await requireRow(owner.userId);
      const oldRing = parseTokenKeyring(KEYS_VALUE, '1');
      const encrypted = encryptToken(oldRing, before.id, 'plain-race-rotate');
      await t.pool.query(
        'UPDATE instagram_connections SET token_ciphertext = $1, token_key_version = 1 WHERE id = $2',
        [encrypted.ciphertext, before.id],
      );
      await makeDue(before.id);
      const replacement = encryptToken(keyring, before.id, 'plain-newer-token');
      spies.check.mockImplementationOnce(async () => {
        await t.pool.query(
          'UPDATE instagram_connections SET token_ciphertext = $1, token_key_version = 2, token_revision = token_revision + 1 WHERE id = $2',
          [replacement.ciphertext, before.id],
        );
        return 'valid';
      });
      const result = await health().runOnce();
      expect(result.reencrypted).toBe(0);
      const after = await requireRow(owner.userId);
      expect(decryptToken(keyring, after.id, after.token_ciphertext!, after.token_key_version!)).toBe(
        'plain-newer-token',
      );
      expect(after.token_revision).toBe(before.token_revision + 1);
    });

    it('두 실행이 겹쳐도 한 번만 호출하고 재인증 상태는 건너뛴다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-once');
      const live = await requireRow(owner.userId);
      await makeDue(live.id);
      const gone = await member();
      await connect(gone, igId(), 'plain-gone');
      const goneRow = await requireRow(gone.userId);
      await connections().markReauthRequired(goneRow.id, goneRow.token_revision);
      await makeDue(goneRow.id);
      const results = await Promise.all([health().runOnce(), health().runOnce()]);
      expect(results.map((r) => r.checked).sort()).toEqual([0, 1]);
      expect(spies.check).toHaveBeenCalledTimes(1);
    });
  });

  describe('조회·재확인·해제·정지', () => {
    it('연결 전 조회는 connection null, 스위치에 따라 available', async () => {
      const owner = await member();
      const on = await api<InstagramIntegrationView>(t.baseUrl, 'GET', '/api/me/instagram', { cookie: owner.cookie });
      expect(on.body).toEqual({ available: true, connection: null, limits: { activeRules: 10, totalRules: 100 } });
      await setAudience('operators');
      const off = await api<InstagramIntegrationView>(t.baseUrl, 'GET', '/api/me/instagram', { cookie: owner.cookie });
      expect(off.body.available).toBe(false);
    });

    it('recheck는 messages_access_required만 active로 되돌린다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-recheck');
      await t.pool.query("UPDATE instagram_connections SET status = 'messages_access_required' WHERE user_id = $1", [
        owner.userId,
      ]);
      const response = await api<InstagramConnectionView>(t.baseUrl, 'POST', '/api/me/instagram/recheck', {
        cookie: owner.cookie,
      });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('active');
    });

    it('recheck는 재인증 상태를 되돌리지 않고, 연결이 없으면 409', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-recheck-reauth');
      const current = await requireRow(owner.userId);
      await connections().markReauthRequired(current.id, current.token_revision);
      const response = await api<InstagramConnectionView>(t.baseUrl, 'POST', '/api/me/instagram/recheck', {
        cookie: owner.cookie,
      });
      expect(response.body.status).toBe('reauth_required');
      const none = await member();
      const missing = await api(t.baseUrl, 'POST', '/api/me/instagram/recheck', { cookie: none.cookie });
      expect(missing.status).toBe(409);
      expect(missing.body.code).toBe('instagram_reauth_required');
    });

    it('해제는 구독을 풀고 행과 규칙을 지운다', async () => {
      const owner = await member();
      const ig = igId();
      await connect(owner, ig, 'plain-disconnect');
      const current = await requireRow(owner.userId);
      await seedDeliveries(current.id);
      const response = await api(t.baseUrl, 'DELETE', '/api/me/instagram', { cookie: owner.cookie });
      expect(response.status).toBe(204);
      expect(spies.unsubscribe).toHaveBeenCalledWith('plain-disconnect', ig);
      expect(await row(owner.userId)).toBeUndefined();
      const rules = await t.pool.query('SELECT 1 FROM instagram_dm_rules WHERE connection_id = $1', [current.id]);
      expect(rules.rowCount).toBe(0);
    });

    it('구독 해제 실패는 무시하고 지운다. 재인증 상태는 호출 없이 지운다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-unsub-fail');
      spies.unsubscribe.mockRejectedValueOnce(graphError());
      expect((await api(t.baseUrl, 'DELETE', '/api/me/instagram', { cookie: owner.cookie })).status).toBe(204);
      expect(await row(owner.userId)).toBeUndefined();

      const stale = await member();
      await connect(stale, igId(), 'plain-unsub-stale');
      const current = await requireRow(stale.userId);
      await connections().markReauthRequired(current.id, current.token_revision);
      spies.unsubscribe.mockClear();
      expect((await api(t.baseUrl, 'DELETE', '/api/me/instagram', { cookie: stale.cookie })).status).toBe(204);
      expect(spies.unsubscribe).not.toHaveBeenCalled();
    });

    it('연결이 없어도 해제는 204', async () => {
      const owner = await member();
      expect((await api(t.baseUrl, 'DELETE', '/api/me/instagram', { cookie: owner.cookie })).status).toBe(204);
    });

    it('정지는 대기 건을 취소하고 재개해도 되살리지 않는다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-pause');
      const current = await requireRow(owner.userId);
      await seedDeliveries(current.id);
      const paused = await api<InstagramConnectionView>(t.baseUrl, 'PUT', '/api/me/instagram/pause', {
        cookie: owner.cookie,
        body: { paused: true },
      });
      expect(paused.status).toBe(200);
      expect(paused.body.paused).toBe(true);
      expect((await deliveryStatuses(current.id))['comment-pending']).toBe('cancelled');
      const resumed = await api<InstagramConnectionView>(t.baseUrl, 'PUT', '/api/me/instagram/pause', {
        cookie: owner.cookie,
        body: { paused: false },
      });
      expect(resumed.body.paused).toBe(false);
      expect((await deliveryStatuses(current.id))['comment-pending']).toBe('cancelled');
      expect((await requireRow(owner.userId)).dm_paused_at).toBeNull();
    });

    it('운영자 정지 중에는 크리에이터가 바꿀 수 없다', async () => {
      const owner = await member();
      await connect(owner, igId(), 'plain-operator-pause');
      await t.pool.query('UPDATE instagram_connections SET operator_paused_at = now() WHERE user_id = $1', [
        owner.userId,
      ]);
      const response = await api(t.baseUrl, 'PUT', '/api/me/instagram/pause', {
        cookie: owner.cookie,
        body: { paused: false },
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('instagram_operator_paused');
    });

    it('정지 요청 형식이 틀리면 400, 연결이 없으면 409', async () => {
      const owner = await member();
      const noConnection = await api(t.baseUrl, 'PUT', '/api/me/instagram/pause', {
        cookie: owner.cookie,
        body: { paused: true },
      });
      expect(noConnection.status).toBe(409);
      expect(noConnection.body.code).toBe('instagram_reauth_required');
      const invalid = await api(t.baseUrl, 'PUT', '/api/me/instagram/pause', {
        cookie: owner.cookie,
        body: { paused: 'yes' },
      });
      expect(invalid.status).toBe(400);
    });
  });
});

describe('Instagram 연결 API 설정 없음', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({
      env: Object.fromEntries(Object.keys(META_ENV).map((key) => [key, ''])),
    });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('설정이 없으면 503 instagram_not_configured이고 점검은 하지 않는다', async () => {
    const owner = await login(t.baseUrl, 'ig-none|ig-none@example.com');
    for (const [method, path] of [
      ['GET', '/api/me/instagram'],
      ['POST', CONNECT],
      ['POST', CALLBACK],
      ['POST', '/api/me/instagram/recheck'],
      ['DELETE', '/api/me/instagram'],
      ['PUT', '/api/me/instagram/pause'],
    ]) {
      const response = await api(t.baseUrl, method, path, {
        cookie: owner.cookie,
        body: method === 'GET' ? undefined : {},
      });
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('instagram_not_configured');
    }
    expect(await t.app.get(InstagramTokenHealthService, { strict: false }).runOnce()).toEqual({
      checked: 0,
      invalidated: 0,
      reencrypted: 0,
      failed: 0,
    });
  });
});
