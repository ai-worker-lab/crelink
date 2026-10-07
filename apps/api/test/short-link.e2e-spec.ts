import { CreatorLandingState, LinkView, PublicLandingResponse } from '@crelink/shared';
import { LandingPassService } from '../src/short-link/landing-pass.service';
import { api, createTestApp, login, SHORT_URL, TestApp, waitForRows, WEB_URL } from './test-app';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('단축 도메인과 공개 랜딩 (R2, R3, R7~R9)', () => {
  let t: TestApp;
  let n = 0;

  const newCreator = async () => {
    n += 1;
    const result = await login(t.baseUrl, `short-${n}|short${n}@example.com`);
    const cookie = result.cookie!;
    const landing = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    return { cookie, userId: result.body.user!.id, slug: landing.shortLink.slug, publicId: landing.landing.publicId };
  };
  const addLink = async (cookie: string, body: Record<string, unknown>) =>
    (await api<LinkView>(t.baseUrl, 'POST', '/api/me/links', { cookie, body })).body;
  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${t.baseUrl}${path}`, { redirect: 'manual', headers });
  const publicIdOf = async (linkId: string) =>
    (await t.pool.query<{ public_id: string }>('SELECT public_id FROM links WHERE id = $1', [linkId])).rows[0]
      .public_id;
  /** 단축 주소 302의 랜딩 주소. 통과 표시 `?pass=<만료 초>.<서명 22자>`가 붙습니다. */
  const landingLocation = (publicId: string) =>
    new RegExp(`^${WEB_URL.replace(/\./g, '\\.')}/p/${publicId}\\?pass=\\d+\\.[A-Za-z0-9_-]{22}$`);
  const publicLanding = (publicId: string, pass?: string) =>
    api<PublicLandingResponse>(
      t.baseUrl,
      'GET',
      `/api/public/landings/${publicId}${pass === undefined ? '' : `?pass=${encodeURIComponent(pass)}`}`,
    );

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('GET /{slug}는 302 랜딩(통과 표시 포함), 처음 방문이면 cl_vid 쿠키를 주고 visits 행에 항목을 남긴다', async () => {
    const creator = await newCreator();
    const response = await get(`/${creator.slug}`, {
      'user-agent': IPHONE_UA,
      referer: 'https://l.instagram.com/?u=x',
      // TRUSTED_PROXY_HOPS 기본값(0)에서는 프록시 헤더를 믿지 않고 소켓 주소를 씁니다.
      'x-forwarded-for': '203.0.113.9',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(landingLocation(creator.publicId));
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toMatch(
      /^cl_vid=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax$/,
    );
    const visitorId = cookie.split(';')[0].split('=')[1];

    const [visit] = await waitForRows(async () => (await t.pool.query('SELECT * FROM visits')).rows);
    expect(visit).toMatchObject({
      slug: creator.slug,
      visitor_id: visitorId,
      ip: '127.0.0.1',
      country: 'KR',
      city: 'Seoul',
      referrer: 'https://l.instagram.com/?u=x',
      referrer_host: 'l.instagram.com',
      user_agent: IPHONE_UA,
      device_type: 'mobile',
      browser: 'Safari',
      os: 'iOS',
    });
    expect(visit.occurred_at).toBeInstanceOf(Date);

    // 쿠키가 있으면 다시 발급하지 않고 같은 방문자로 기록합니다. 대문자 주소도 같은 주소입니다.
    const again = await get(`/${creator.slug.toUpperCase()}`, { cookie: `cl_vid=${visitorId}` });
    expect(again.status).toBe(302);
    expect(again.headers.getSetCookie()).toEqual([]);
    const rows = await waitForRows(async () => (await t.pool.query('SELECT visitor_id FROM visits')).rows, 2);
    expect(rows.map((row) => row.visitor_id)).toEqual([visitorId, visitorId]);
  });

  it('없는 주소·예약어·API 경로 이름은 302 notice?reason=link_not_found', async () => {
    for (const path of ['/zzzzzzzz', '/health', '/me', '/api']) {
      const response = await get(path);
      expect([path, response.status, response.headers.get('location')]).toEqual([
        path,
        302,
        `${WEB_URL}/notice?reason=link_not_found`,
      ]);
    }
    expect((await get('/api/health')).status).toBe(200);
  });

  it('옛 주소는 90일 동안 같은 랜딩으로 보내고 그 뒤에는 없는 주소가 된다', async () => {
    const creator = await newCreator();
    await api(t.baseUrl, 'PUT', '/api/me/short-link/slug', { cookie: creator.cookie, body: { slug: 'renamed-one' } });
    const old = await get(`/${creator.slug}`);
    expect(old.headers.get('location')).toMatch(landingLocation(creator.publicId));
    expect((await get('/renamed-one')).headers.get('location')).toMatch(landingLocation(creator.publicId));
    await t.pool.query("UPDATE short_slugs SET retired_at = now() - interval '91 days' WHERE slug = $1", [
      creator.slug,
    ]);
    expect((await get(`/${creator.slug}`)).headers.get('location')).toBe(`${WEB_URL}/notice?reason=link_not_found`);
  });

  it('통과 표시: 단축 주소가 준 pass는 그 랜딩에서 만료 전에만 passAccepted, shortUrl은 현재 주소', async () => {
    const creator = await newCreator();
    const other = await newCreator();
    const location = (await get(`/${creator.slug}`)).headers.get('location')!;
    const pass = new URL(location).searchParams.get('pass')!;

    const accepted = await publicLanding(creator.publicId, pass);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ passAccepted: true, shortUrl: `${SHORT_URL}/${creator.slug}` });

    // pass 없음, 다른 랜딩의 pass, 변조, 형식 오류
    expect((await publicLanding(creator.publicId)).body.passAccepted).toBe(false);
    expect((await publicLanding(other.publicId, pass)).body.passAccepted).toBe(false);
    const [expires, signature] = pass.split('.');
    const tampered = `${expires}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    expect((await publicLanding(creator.publicId, tampered)).body.passAccepted).toBe(false);
    expect((await publicLanding(creator.publicId, `${Number(expires) + 600}.${signature}`)).body.passAccepted).toBe(
      false,
    );
    expect((await publicLanding(creator.publicId, 'not-a-pass')).body.passAccepted).toBe(false);

    // 만료: 61초 전에 발급한 것과 같은 표시(같은 프로세스 키)는 거부, 59초 전 것은 아직 유효
    const passes = t.app.get(LandingPassService);
    const expired = passes.issue(creator.publicId, Date.now() - 61_000);
    expect((await publicLanding(creator.publicId, expired)).body.passAccepted).toBe(false);
    const fresh = passes.issue(creator.publicId, Date.now() - 59_000);
    expect((await publicLanding(creator.publicId, fresh)).body.passAccepted).toBe(true);

    // 주소를 바꾸면 shortUrl은 새 주소, 옛 주소 302의 pass도 같은 랜딩에서 유효
    await api(t.baseUrl, 'PUT', '/api/me/short-link/slug', { cookie: creator.cookie, body: { slug: 'pass-renamed' } });
    const oldLocation = (await get(`/${creator.slug}`)).headers.get('location')!;
    const oldPass = new URL(oldLocation).searchParams.get('pass')!;
    expect((await publicLanding(creator.publicId, oldPass)).body).toMatchObject({
      passAccepted: true,
      shortUrl: `${SHORT_URL}/pass-renamed`,
    });
  });

  it('클릭 주소는 link_clicks를 남기고 저장된 URL로, 숨김·차단·삭제면 link_unavailable', async () => {
    const creator = await newCreator();
    const link = await addLink(creator.cookie, { title: '쇼핑몰', url: 'https://shop.example/item?id=1' });
    const publicId = await publicIdOf(link.id);
    const visitorId = '11111111-2222-4333-8444-555555555555';
    const response = await get(`/c/${publicId}`, {
      cookie: `cl_vid=${visitorId}`,
      referer: `${WEB_URL}/p/${creator.publicId}`,
      'user-agent': IPHONE_UA,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://shop.example/item?id=1');
    const [click] = await waitForRows(async () => (await t.pool.query('SELECT * FROM link_clicks')).rows);
    expect(click).toMatchObject({
      link_id: link.id,
      link_public_id: publicId,
      visitor_id: visitorId,
      ip: '127.0.0.1',
      country: 'KR',
      referrer_host: 'web.test',
      device_type: 'mobile',
      browser: 'Safari',
      os: 'iOS',
    });

    const unavailable = `${WEB_URL}/notice?reason=link_unavailable`;
    await api(t.baseUrl, 'PATCH', `/api/me/links/${link.id}`, { cookie: creator.cookie, body: { hidden: true } });
    expect((await get(`/c/${publicId}`)).headers.get('location')).toBe(unavailable);
    await api(t.baseUrl, 'PATCH', `/api/me/links/${link.id}`, { cookie: creator.cookie, body: { hidden: false } });
    await t.pool.query('UPDATE links SET blocked_at = now() WHERE id = $1', [link.id]);
    expect((await get(`/c/${publicId}`)).headers.get('location')).toBe(unavailable);
    await api(t.baseUrl, 'DELETE', `/api/me/links/${link.id}`, { cookie: creator.cookie });
    expect((await get(`/c/${publicId}`)).headers.get('location')).toBe(unavailable);
    expect((await get('/c/nonexistent')).headers.get('location')).toBe(unavailable);
    // 링크를 지워도 클릭 기록은 공개 ID 사본으로 남습니다.
    const kept = await t.pool.query('SELECT link_id, link_public_id FROM link_clicks');
    expect(kept.rows).toEqual([{ link_id: null, link_public_id: publicId }]);
  });

  it('TRUSTED_PROXY_HOPS: 0이면 위조 X-Forwarded-For 무시, 1이면 마지막 값만 쓰고 앞쪽 위조 값 무시, 잘못된 값은 소켓 주소', async () => {
    const creator = await newCreator();
    const link = await addLink(creator.cookie, { title: '프록시', url: 'https://proxy.example/' });
    const publicId = await publicIdOf(link.id);
    const visitIps: string[] = [];
    const visit = async (hops: string, forwardedFor: string) => {
      process.env.TRUSTED_PROXY_HOPS = hops;
      expect((await get(`/${creator.slug}`, { 'x-forwarded-for': forwardedFor })).status).toBe(302);
      const rows = await waitForRows(
        async () =>
          (await t.pool.query('SELECT ip FROM visits WHERE slug = $1 ORDER BY occurred_at', [creator.slug])).rows,
        visitIps.length + 1,
      );
      visitIps.push(rows[rows.length - 1].ip);
    };
    try {
      await visit('0', '198.51.100.1');
      await visit('1', '198.51.100.1, 203.0.113.9');
      await visit('1', '::ffff:203.0.113.10');
      await visit('1', '198.51.100.1, not-an-ip');
      await visit('2', '203.0.113.9');
      expect(visitIps).toEqual(['127.0.0.1', '203.0.113.9', '203.0.113.10', '127.0.0.1', '127.0.0.1']);

      process.env.TRUSTED_PROXY_HOPS = '1';
      await get(`/c/${publicId}`, { 'x-forwarded-for': '198.51.100.1, 2001:DB8::7' });
      const [click] = await waitForRows(
        async () => (await t.pool.query('SELECT ip FROM link_clicks WHERE link_public_id = $1', [publicId])).rows,
      );
      expect(click.ip).toBe('2001:db8::7');
    } finally {
      delete process.env.TRUSTED_PROXY_HOPS;
    }
  });

  it('공개 랜딩은 보이는·차단 안 된 링크만 순서대로, 클릭 주소와 함께 준다', async () => {
    const creator = await newCreator();
    await api(t.baseUrl, 'PATCH', '/api/me/landing', { cookie: creator.cookie, body: { displayName: '공개 이름' } });
    await api(t.baseUrl, 'PUT', '/api/me/socials', {
      cookie: creator.cookie,
      body: { items: [{ platform: 'instagram', url: 'https://instagram.com/me' }] },
    });
    await api(t.baseUrl, 'POST', '/api/me/portfolio', { cookie: creator.cookie, body: { title: '작업' } });
    const visible = await addLink(creator.cookie, {
      title: '보임',
      url: 'https://visible.example',
      description: '설명',
    });
    await addLink(creator.cookie, { title: '숨김', url: 'https://hidden.example', hidden: true });
    const blocked = await addLink(creator.cookie, { title: '차단', url: 'https://blocked.example' });
    await t.pool.query("UPDATE links SET blocked_at = now(), blocked_reason = '정책' WHERE id = $1", [blocked.id]);

    const response = await api<PublicLandingResponse>(t.baseUrl, 'GET', `/api/public/landings/${creator.publicId}`);
    expect(response.status).toBe(200);
    const visiblePublicId = await publicIdOf(visible.id);
    expect(response.body).toEqual({
      publicId: creator.publicId,
      displayName: '공개 이름',
      bio: null,
      avatarUrl: null,
      socials: [{ platform: 'instagram', url: 'https://instagram.com/me' }],
      portfolio: [{ id: expect.any(String), title: '작업', url: null, description: null, imageUrl: null }],
      blocks: [
        {
          type: 'list',
          links: [
            {
              id: visiblePublicId,
              title: '보임',
              description: '설명',
              thumbnailUrl: null,
              faviconUrl: 'https://visible.example/favicon.ico',
              clickUrl: `${SHORT_URL}/c/${visiblePublicId}`,
            },
          ],
        },
      ],
      passAccepted: false,
      shortUrl: `${SHORT_URL}/${creator.slug}`,
    });
  });

  it('없는 랜딩은 404 landing_not_found, 정지 크리에이터는 410 creator_suspended와 단축 주소 안내', async () => {
    const missing = await api(t.baseUrl, 'GET', '/api/public/landings/zzzzzzzzzz');
    expect([missing.status, missing.body.code]).toEqual([404, 'landing_not_found']);

    const creator = await newCreator();
    const link = await addLink(creator.cookie, { title: 'x', url: 'https://x.example' });
    await t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [creator.userId]);
    const gone = await api(t.baseUrl, 'GET', `/api/public/landings/${creator.publicId}`);
    expect([gone.status, gone.body.code]).toEqual([410, 'creator_suspended']);
    expect((await get(`/${creator.slug}`)).headers.get('location')).toBe(`${WEB_URL}/notice?reason=creator_suspended`);
    expect((await get(`/c/${await publicIdOf(link.id)}`)).headers.get('location')).toBe(
      `${WEB_URL}/notice?reason=link_unavailable`,
    );
  });
});
