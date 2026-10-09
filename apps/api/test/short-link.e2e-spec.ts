import {
  CreatorLandingState,
  LinkView,
  OperatorCreatorStats,
  PublicLandingResponse,
  UploadFileResponse,
} from '@crelink/shared';
import { RetentionService } from '../src/retention/retention.service';
import { LandingPassService } from '../src/short-link/landing-pass.service';
import { PNG_STILL } from './image-samples';
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

    // 만료: 61초 전에 발급한 것과 같은 표시(같은 프로세스 키)는 거부, 50초 전 것은 아직 유효.
    // 만료 시각은 초 단위로 내림하므로 59초 전 발급이면 남은 시간이 1~1000ms뿐이라 느린 CI에서 요청 중에 만료됩니다.
    const passes = t.app.get(LandingPassService);
    const expired = passes.issue(creator.publicId, Date.now() - 61_000);
    expect((await publicLanding(creator.publicId, expired)).body.passAccepted).toBe(false);
    const fresh = passes.issue(creator.publicId, Date.now() - 50_000);
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
          // 게시 중 크리링 배너가 없으면 광고 블록은 숨김(no_banners)입니다.
          slot: null,
        },
      ],
      guestbookEnabled: true,
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

  describe('배너 클릭 주소(R20 ⑧, R21 ④)와 보존(R11)', () => {
    const unavailable = `${WEB_URL}/notice?reason=link_unavailable`;
    let imageFileId: string;
    let bannerCount = 0;

    /** 크리링 배너 행(SQL). 기본은 지금 게시 중. */
    const insertAdBanner = async (options: { startsAt?: string; endsAt?: string | null } = {}) => {
      bannerCount += 1;
      const publicId = `clickad${String(bannerCount).padStart(3, '0')}`;
      const url = `https://ad${bannerCount}.example/landing?x=1`;
      const inserted = await t.pool.query<{ id: string }>(
        `INSERT INTO ad_banners (public_id, image_file_id, alt, url, host, starts_at, ends_at, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          publicId,
          imageFileId,
          `광고 ${bannerCount}`,
          url,
          new URL(url).hostname,
          options.startsAt ?? '2026-01-01T00:00:00+09:00',
          options.endsAt ?? null,
          bannerCount,
        ],
      );
      return { id: inserted.rows[0].id, publicId, url };
    };
    /** 크리에이터 배너 행(SQL, 쓰기 API는 0070). */
    const insertCreatorBanner = async (creator: { userId: string; publicId: string }, url: string | null) => {
      bannerCount += 1;
      const publicId = `clickcr${String(bannerCount).padStart(3, '0')}`;
      const inserted = await t.pool.query<{ id: string }>(
        `INSERT INTO creator_banners (public_id, user_id, landing_id, image_file_id, alt, url, host, position)
         VALUES ($1, $2, (SELECT id FROM landings WHERE public_id = $3), $4, $5, $6, $7, $8) RETURNING id`,
        [
          publicId,
          creator.userId,
          creator.publicId,
          imageFileId,
          `내 배너 ${bannerCount}`,
          url,
          url ? new URL(url).hostname : null,
          bannerCount,
        ],
      );
      return { id: inserted.rows[0].id, publicId, url, alt: `내 배너 ${bannerCount}` };
    };
    const adStats = async () =>
      (
        await t.pool.query<{ landing_public_id: string; impressions: number; clicks: number }>(
          'SELECT landing_public_id, impressions, clicks FROM ad_banner_daily_stats ORDER BY landing_public_id',
        )
      ).rows;
    /** 공개 응답의 단축 도메인 주소를 시험 서버 주소로 바꿉니다. */
    const local = (clickUrl: string) => clickUrl.replace(SHORT_URL, '');

    beforeAll(async () => {
      const owner = await newCreator();
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(PNG_STILL)], { type: 'image/png' }), 'banner.png');
      const response = await fetch(`${t.baseUrl}/api/me/files`, {
        method: 'POST',
        headers: { cookie: owner.cookie },
        body: form,
      });
      imageFileId = ((await response.json()) as UploadFileResponse).fileId;
    });

    afterEach(async () => {
      // 크리링 배너는 모든 랜딩이 함께 쓰므로 시험마다 지웁니다(카운터는 연쇄 삭제).
      await t.pool.query('DELETE FROM ad_banners');
    });

    it('GET /a/{배너}/{랜딩}은 게시 중이면 쿠키 없이 날짜·배너·랜딩 카운터를 올리고 저장된 URL로, 아니면 link_unavailable', async () => {
      const creator = await newCreator();
      // 광고 블록은 보이는 링크나 포트폴리오가 있어야 보입니다(no_content).
      await addLink(creator.cookie, { title: '링크', url: 'https://link.example' });
      const banner = await insertAdBanner();
      // 공개 랜딩이 passAccepted일 때 내려 주는 광고 clickUrl이 이 경로입니다(노출 1건도 함께 기록).
      const landing = await publicLanding(creator.publicId, t.app.get(LandingPassService).issue(creator.publicId));
      const clickUrl = landing.body.blocks[0].slot!.banners[0].clickUrl!;
      expect(clickUrl).toBe(`${SHORT_URL}/a/${banner.publicId}/${creator.publicId}`);

      const response = await get(local(clickUrl), { 'user-agent': IPHONE_UA });
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(banner.url);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
      await waitForRows(async () => (await adStats()).filter((row) => row.clicks === 1));
      await get(local(clickUrl));
      await waitForRows(async () => (await adStats()).filter((row) => row.clicks === 2));
      expect(await adStats()).toEqual([{ landing_public_id: creator.publicId, impressions: 1, clicks: 2 }]);

      const ended = await insertAdBanner({ endsAt: new Date(Date.now() - 1000).toISOString() });
      const scheduled = await insertAdBanner({ startsAt: new Date(Date.now() + 60_000).toISOString() });
      const suspended = await newCreator();
      await t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [suspended.userId]);
      for (const path of [
        `/a/${ended.publicId}/${creator.publicId}`,
        `/a/${scheduled.publicId}/${creator.publicId}`,
        `/a/zzzzzzzzzz/${creator.publicId}`,
        `/a/${banner.publicId}/zzzzzzzzzz`,
        `/a/${banner.publicId}/${suspended.publicId}`,
        `/a/${banner.publicId.toUpperCase()}/${creator.publicId}`,
        `/a/${banner.publicId}/${creator.publicId.slice(0, 9)}`,
      ]) {
        const blocked = await get(path);
        expect([path, blocked.status, blocked.headers.get('location')]).toEqual([path, 302, unavailable]);
        expect(blocked.headers.get('set-cookie')).toBeNull();
      }
      // 끝난 배너도 게시 중이던 때의 누적은 그대로이고, 안내로 보낸 요청은 세지 않습니다.
      expect(await adStats()).toEqual([{ landing_public_id: creator.publicId, impressions: 1, clicks: 2 }]);
    });

    it('GET /b/{배너}는 creator_banner_clicks 원본을 남기고 저장된 URL로, 숨김·차단·URL 없음·회수·정지·삭제면 link_unavailable', async () => {
      const creator = await newCreator();
      await t.pool.query('UPDATE users SET banner_slot_granted_at = now() WHERE id = $1', [creator.userId]);
      const banner = await insertCreatorBanner(creator, 'https://mine.example/shop?id=7');
      const shortLinkId = (
        await t.pool.query<{ id: string }>('SELECT id FROM short_links WHERE user_id = $1', [creator.userId])
      ).rows[0].id;
      const landing = await publicLanding(creator.publicId);
      const clickUrl = landing.body.blocks[0].slot!.banners[0].clickUrl!;
      expect(clickUrl).toBe(`${SHORT_URL}/b/${banner.publicId}`);

      const visitorId = '66666666-7777-4888-8999-aaaaaaaaaaaa';
      const response = await get(local(clickUrl), {
        cookie: `cl_vid=${visitorId}`,
        referer: `${WEB_URL}/p/${creator.publicId}`,
        'user-agent': IPHONE_UA,
      });
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://mine.example/shop?id=7');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
      const [click] = await waitForRows(async () => (await t.pool.query('SELECT * FROM creator_banner_clicks')).rows);
      expect(click).toMatchObject({
        banner_id: banner.id,
        banner_public_id: banner.publicId,
        short_link_id: shortLinkId,
        visitor_id: visitorId,
        ip: '127.0.0.1',
        country: 'KR',
        city: 'Seoul',
        referrer_host: 'web.test',
        user_agent: IPHONE_UA,
        device_type: 'mobile',
        browser: 'Safari',
        os: 'iOS',
      });
      // 쿠키가 없으면 링크 클릭처럼 cl_vid를 발급하고 그 값으로 남깁니다.
      const fresh = await get(`/b/${banner.publicId}`);
      const issued = /^cl_vid=([0-9a-f-]{36});/.exec(fresh.headers.get('set-cookie') ?? '')?.[1];
      expect(issued).toBeDefined();
      await waitForRows(
        async () => (await t.pool.query('SELECT 1 FROM creator_banner_clicks WHERE visitor_id = $1', [issued])).rows,
      );
      // 배너 클릭은 링크 클릭(link_clicks)에 섞지 않습니다.
      const linkClicks = await t.pool.query('SELECT 1 FROM link_clicks WHERE short_link_id = $1', [shortLinkId]);
      expect(linkClicks.rows).toEqual([]);

      const noUrl = await insertCreatorBanner(creator, null);
      const cases: Array<[string, string, () => Promise<unknown>, () => Promise<unknown>]> = [
        [
          '숨김',
          banner.publicId,
          () => t.pool.query('UPDATE creator_banners SET hidden = true WHERE id = $1', [banner.id]),
          () => t.pool.query('UPDATE creator_banners SET hidden = false WHERE id = $1', [banner.id]),
        ],
        [
          '차단',
          banner.publicId,
          () => t.pool.query('UPDATE creator_banners SET blocked_at = now() WHERE id = $1', [banner.id]),
          () => t.pool.query('UPDATE creator_banners SET blocked_at = NULL WHERE id = $1', [banner.id]),
        ],
        ['URL 없음', noUrl.publicId, async () => undefined, async () => undefined],
        [
          '회수',
          banner.publicId,
          () => t.pool.query('UPDATE users SET banner_slot_granted_at = NULL WHERE id = $1', [creator.userId]),
          () => t.pool.query('UPDATE users SET banner_slot_granted_at = now() WHERE id = $1', [creator.userId]),
        ],
        [
          '정지',
          banner.publicId,
          () => t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [creator.userId]),
          () => t.pool.query('UPDATE users SET suspended_at = NULL WHERE id = $1', [creator.userId]),
        ],
        ['없음', 'zzzzzzzzzz', async () => undefined, async () => undefined],
        ['대문자', banner.publicId.toUpperCase(), async () => undefined, async () => undefined],
        ['11자', `${banner.publicId}0`, async () => undefined, async () => undefined],
      ];
      for (const [name, publicId, apply, restore] of cases) {
        await apply();
        const blocked = await get(`/b/${publicId}`);
        expect([name, blocked.status, blocked.headers.get('location')]).toEqual([name, 302, unavailable]);
        await restore();
      }
      // 되돌리면 다시 보냅니다(조건이 하나씩만 막았다는 확인).
      expect((await get(`/b/${banner.publicId}`)).headers.get('location')).toBe('https://mine.example/shop?id=7');
      await waitForRows(async () => (await t.pool.query('SELECT 1 FROM creator_banner_clicks')).rows, 3);

      // 배너를 지워도 클릭 기록은 공개 ID 사본으로 남고, 주소는 안내로 보냅니다.
      await t.pool.query('DELETE FROM creator_banners WHERE id = $1', [banner.id]);
      expect((await get(`/b/${banner.publicId}`)).headers.get('location')).toBe(unavailable);
      const kept = await t.pool.query(
        'SELECT DISTINCT banner_id, banner_public_id FROM creator_banner_clicks WHERE short_link_id = $1',
        [shortLinkId],
      );
      expect(kept.rows).toEqual([{ banner_id: null, banner_public_id: banner.publicId }]);
    });

    it('단축 도메인 접두사 회귀: 경로 모양이 다르면 단축 주소나 404이고 /api 두 단계 경로는 그대로다', async () => {
      // 1~2자는 단축 주소(`/:slug`)로 해석되어 없는 주소 안내입니다.
      for (const path of ['/a', '/b', '/c']) {
        expect([path, (await get(path)).headers.get('location')]).toEqual([
          path,
          `${WEB_URL}/notice?reason=link_not_found`,
        ]);
      }
      // 세그먼트 수가 다른 경로는 어느 라우트에도 맞지 않아 404입니다.
      for (const path of ['/a/abcde12345', '/b/abcde12345/fghij67890', '/a/abcde12345/fghij67890/extra']) {
        const response = await get(path);
        expect([path, response.status]).toEqual([path, 404]);
      }
      expect((await get('/api/health')).status).toBe(200);
      expect((await get('/api/health/ready')).status).toBe(200);
      expect((await get('/api/me/landing')).status).toBe(401);
    });

    it('보존 작업은 366일 전 배너 클릭을 배너별 집계로 옮기고 지우며, 운영자 통계 bannerClicks가 원본과 집계를 합친다', async () => {
      const creator = await newCreator();
      await t.pool.query('UPDATE users SET banner_slot_granted_at = now() WHERE id = $1', [creator.userId]);
      const kept = await insertCreatorBanner(creator, 'https://kept.example/');
      const removed = await insertCreatorBanner(creator, 'https://removed.example/');
      const shortLinkId = (
        await t.pool.query<{ id: string }>('SELECT id FROM short_links WHERE user_id = $1', [creator.userId])
      ).rows[0].id;
      await t.pool.query(
        `INSERT INTO creator_banner_clicks (banner_id, banner_public_id, short_link_id, visitor_id, occurred_at, ip)
         VALUES ($1, $2, $5, gen_random_uuid(), now() - interval '366 days', '1.2.3.4'),
                ($1, $2, $5, gen_random_uuid(), now() - interval '366 days', '1.2.3.4'),
                ($1, $2, $5, gen_random_uuid(), now() - interval '1 day', '1.2.3.5'),
                ($3, $4, $5, gen_random_uuid(), now() - interval '366 days', '1.2.3.6')`,
        [kept.id, kept.publicId, removed.id, removed.publicId, shortLinkId],
      );
      const { from, to } = (
        await t.pool.query<{ from: string; to: string }>(
          `SELECT ((now() - interval '366 days') AT TIME ZONE 'Asia/Seoul')::date::text AS from,
                  ((now() - interval '1 day') AT TIME ZONE 'Asia/Seoul')::date::text AS to`,
        )
      ).rows[0];

      const moved = await t.app.get(RetentionService).runOnce();
      expect(moved.bannerClicks).toBe(3);
      const raw = await t.pool.query('SELECT banner_public_id FROM creator_banner_clicks WHERE short_link_id = $1', [
        shortLinkId,
      ]);
      expect(raw.rows).toEqual([{ banner_public_id: kept.publicId }]);
      const rollups = async () =>
        (
          await t.pool.query(
            `SELECT day::text, banner_public_id, clicks FROM creator_banner_click_rollups
             WHERE short_link_id = $1 ORDER BY banner_public_id`,
            [shortLinkId],
          )
        ).rows;
      expect(await rollups()).toEqual([
        { day: from, banner_public_id: kept.publicId, clicks: 2 },
        { day: from, banner_public_id: removed.publicId, clicks: 1 },
      ]);
      // 링크 클릭 집계(visit_daily_rollups.link_clicks)에는 섞지 않습니다.
      const daily = await t.pool.query('SELECT 1 FROM visit_daily_rollups WHERE short_link_id = $1', [shortLinkId]);
      expect(daily.rows).toEqual([]);
      // 다시 실행해도 옮길 원본이 없으므로 집계가 늘지 않습니다.
      expect((await t.app.get(RetentionService).runOnce()).bannerClicks).toBe(0);
      expect((await rollups()).map((row) => row.clicks)).toEqual([2, 1]);

      await t.pool.query('DELETE FROM creator_banners WHERE id = $1', [removed.id]);
      const operator = (await login(t.baseUrl, 'operator-sub|operator@example.com')).cookie!;
      const stats = await api<OperatorCreatorStats>(
        t.baseUrl,
        'GET',
        `/api/admin/creators/${creator.userId}/stats?from=${from}&to=${to}`,
        { cookie: operator },
      );
      expect(stats.status).toBe(200);
      expect(stats.body.bannerClicks).toEqual([
        { bannerId: kept.publicId, alt: kept.alt, clicks: 3 },
        { bannerId: removed.publicId, alt: null, clicks: 1 },
      ]);
      expect(stats.body.totals.linkClicks).toBe(0);
      expect(stats.body.daily.every((day) => day.linkClicks === 0)).toBe(true);
      expect(stats.body.linkClicks).toEqual([]);
    });
  });
});
