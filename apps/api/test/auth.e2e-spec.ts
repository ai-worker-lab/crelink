import { CreatorLandingState, GoogleAuthStartResponse, MeResponse } from '@crelink/shared';
import { createHash } from 'node:crypto';
import { api, createTestApp, login, TestApp, WEB_URL } from './test-app';

describe('구글 로그인과 세션 (R15)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('start는 authorizationUrl과 10분짜리 HttpOnly state 쿠키를 준다', async () => {
    const response = await fetch(`${t.baseUrl}/api/auth/google/start`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as GoogleAuthStartResponse;
    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toMatch(/^cl_oauth_state=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax$/);
    const state = cookie.split(';')[0].split('=')[1];
    expect(body.authorizationUrl).toContain(`state=${state}`);
    expect(body.authorizationUrl).toContain(encodeURIComponent(`${WEB_URL}/auth/google/callback`));
  });

  it('구글 키가 비어 있으면 start·callback 모두 503 auth_not_configured', async () => {
    const saved = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_SECRET = '';
    try {
      const start = await api(t.baseUrl, 'GET', '/api/auth/google/start');
      expect(start.status).toBe(503);
      expect(start.body.code).toBe('auth_not_configured');
      const callback = await api(t.baseUrl, 'POST', '/api/auth/google/callback', { body: { code: 'x', state: 'y' } });
      expect(callback.status).toBe(503);
      expect(callback.body.code).toBe('auth_not_configured');
    } finally {
      process.env.GOOGLE_CLIENT_SECRET = saved;
    }
  });

  it('state가 쿠키와 다르면 400 oauth_state_invalid', async () => {
    const response = await api(t.baseUrl, 'POST', '/api/auth/google/callback', {
      cookie: 'cl_oauth_state=abc',
      body: { code: 's|a@example.com', state: 'abd' },
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('oauth_state_invalid');
  });

  it('code 교환·검증에 실패하면 401 oauth_failed', async () => {
    const result = await login(t.baseUrl, 'bad');
    expect(result.status).toBe(401);
    expect(result.body.code).toBe('oauth_failed');
  });

  it('첫 로그인은 한 트랜잭션으로 사용자·identity·랜딩·리스트 구역·단축 URL·자동 주소를 만들고 세션 쿠키를 준다', async () => {
    const result = await login(t.baseUrl, 'google-sub-1|New@Example.com');
    expect(result.status).toBe(200);
    expect(result.body.user).toEqual({ id: expect.any(String), email: 'new@example.com', role: 'creator' });
    const session = result.setCookies.find((cookie) => cookie.startsWith('cl_session='));
    expect(session).toMatch(/^cl_session=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax$/);
    expect(
      result.setCookies.some((cookie) => cookie.startsWith('cl_oauth_state=;') && cookie.includes('Max-Age=0')),
    ).toBe(true);

    const userId = result.body.user!.id;
    const rows = await t.pool.query(
      `SELECT u.role, i.provider, i.provider_subject, l.public_id, b.type, s.slug, s.is_auto, s.retired_at, sl.slug_changed_at
       FROM users u
       JOIN user_identities i ON i.user_id = u.id
       JOIN landings l ON l.user_id = u.id
       JOIN landing_blocks b ON b.landing_id = l.id
       JOIN short_links sl ON sl.user_id = u.id AND sl.landing_id = l.id
       JOIN short_slugs s ON s.short_link_id = sl.id
       WHERE u.id = $1`,
      [userId],
    );
    expect(rows.rows).toHaveLength(1);
    const row = rows.rows[0];
    expect(row).toMatchObject({
      role: 'creator',
      provider: 'google',
      provider_subject: 'google-sub-1',
      type: 'list',
      is_auto: true,
      retired_at: null,
      slug_changed_at: null,
    });
    expect(row.public_id).toMatch(/^[a-z0-9]{10}$/);
    expect(row.slug).toMatch(/^[a-z0-9]{7}$/);

    const token = result.cookie!.split('=')[1];
    const stored = await t.pool.query('SELECT token_hash, expires_at FROM sessions WHERE user_id = $1', [userId]);
    expect(stored.rows[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    const days = (stored.rows[0].expires_at.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);

    const me = await api<MeResponse>(t.baseUrl, 'GET', '/api/me', { cookie: result.cookie });
    expect(me.status).toBe(200);
    expect(me.body).toEqual(result.body.user);
    const landing = await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: result.cookie });
    expect(landing.body.shortLink).toMatchObject({ slug: row.slug, isAutoSlug: true, nextChangeAvailableAt: null });
  });

  it('같은 구글 계정으로 다시 로그인하면 기존 사용자를 쓰고 새 세션만 만든다', async () => {
    const first = await login(t.baseUrl, 'google-sub-2|again@example.com');
    const second = await login(t.baseUrl, 'google-sub-2|again@example.com');
    expect(second.body.user!.id).toBe(first.body.user!.id);
    const counts = await t.pool.query(
      `SELECT (SELECT count(*)::int FROM landings WHERE user_id = $1) AS landings,
              (SELECT count(*)::int FROM sessions WHERE user_id = $1) AS sessions`,
      [first.body.user!.id],
    );
    expect(counts.rows[0]).toEqual({ landings: 1, sessions: 2 });
  });

  it('OPERATOR_EMAILS의 검증된 이메일만 operator가 된다', async () => {
    const unverified = await login(t.baseUrl, 'op-unverified|operator@example.com|unverified');
    expect(unverified.body.user!.role).toBe('creator');
    const verified = await login(t.baseUrl, 'op-verified|Operator@Example.com');
    expect(verified.body.user!.role).toBe('operator');
  });

  it('로그인하지 않으면 /api/me는 401 unauthenticated', async () => {
    const response = await api(t.baseUrl, 'GET', '/api/me');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: 'unauthenticated', message: expect.any(String) });
    const bogus = await api(t.baseUrl, 'GET', '/api/me', { cookie: 'cl_session=not-a-session' });
    expect(bogus.status).toBe(401);
  });

  it('정지된 사용자는 기존 세션이 무효가 되고 로그인하면 403 account_suspended', async () => {
    const result = await login(t.baseUrl, 'google-sub-3|suspended@example.com');
    await t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [result.body.user!.id]);
    expect((await api(t.baseUrl, 'GET', '/api/me', { cookie: result.cookie })).status).toBe(401);
    const again = await login(t.baseUrl, 'google-sub-3|suspended@example.com');
    expect(again.status).toBe(403);
    expect(again.body.code).toBe('account_suspended');
    expect(again.cookie).toBeNull();
  });

  it('logout은 204와 삭제 쿠키를 주고 세션을 지운다', async () => {
    const result = await login(t.baseUrl, 'google-sub-4|logout@example.com');
    const response = await api(t.baseUrl, 'POST', '/api/auth/logout', { cookie: result.cookie });
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()[0]).toMatch(/^cl_session=; Path=\/; Max-Age=0;/);
    expect((await api(t.baseUrl, 'GET', '/api/me', { cookie: result.cookie })).status).toBe(401);
  });
});
