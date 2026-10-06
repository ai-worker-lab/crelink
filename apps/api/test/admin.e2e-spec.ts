import {
  BlockedDomainView,
  CreatorLandingState,
  LinkView,
  OperatorCreatorDetail,
  OperatorCreatorListResponse,
  OperatorCreatorStats,
  PublicLandingResponse,
} from '@crelink/shared';
import { RetentionService } from '../src/retention/retention.service';
import { api, createTestApp, login, SHORT_URL, TestApp, WEB_URL } from './test-app';

describe('운영자 API (R10, R13, R14)와 보존 작업 (R11)', () => {
  let t: TestApp;
  let operator: string;
  let n = 0;

  const newCreator = async (name = `creator${n + 1}`) => {
    n += 1;
    const result = await login(t.baseUrl, `admin-${n}|${name}@example.com`);
    const cookie = result.cookie!;
    const landing = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    return { cookie, userId: result.body.user!.id, landing };
  };
  const addLink = async (cookie: string, body: Record<string, unknown>) =>
    (await api<LinkView>(t.baseUrl, 'POST', '/api/me/links', { cookie, body })).body;
  const shortLinkId = async (userId: string) =>
    (await t.pool.query<{ id: string }>('SELECT id FROM short_links WHERE user_id = $1', [userId])).rows[0].id;

  beforeAll(async () => {
    t = await createTestApp();
    operator = (await login(t.baseUrl, 'operator-sub|operator@example.com')).cookie!;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('로그인하지 않으면 401, 크리에이터는 403 forbidden', async () => {
    const creator = await newCreator();
    const paths: Array<[string, string]> = [
      ['GET', '/api/admin/creators'],
      ['GET', `/api/admin/creators/${creator.userId}`],
      ['GET', `/api/admin/creators/${creator.userId}/stats`],
      ['PUT', `/api/admin/creators/${creator.userId}/extra-slots`],
      ['PUT', `/api/admin/creators/${creator.userId}/suspension`],
      ['PUT', `/api/admin/links/${creator.userId}/block`],
      ['GET', '/api/admin/blocked-domains'],
      ['POST', '/api/admin/blocked-domains'],
      ['DELETE', '/api/admin/blocked-domains/a.com'],
    ];
    for (const [method, path] of paths) {
      const anonymous = await api(t.baseUrl, method, path, { body: method === 'GET' ? undefined : {} });
      expect([path, anonymous.status, anonymous.body.code]).toEqual([path, 401, 'unauthenticated']);
      const forbidden = await api(t.baseUrl, method, path, {
        cookie: creator.cookie,
        body: method === 'GET' ? undefined : {},
      });
      expect([path, forbidden.status, forbidden.body.code]).toEqual([path, 403, 'forbidden']);
    }
  });

  it('목록은 이메일·이름·주소로 검색하고 최근 30일 방문 수와 페이지를 준다', async () => {
    const creator = await newCreator('searchable');
    await api(t.baseUrl, 'PATCH', '/api/me/landing', { cookie: creator.cookie, body: { displayName: '찾을이름' } });
    const id = await shortLinkId(creator.userId);
    await t.pool.query(
      `INSERT INTO visits (short_link_id, slug, visitor_id, occurred_at)
       VALUES ($1, 's', gen_random_uuid(), now() - interval '1 day'), ($1, 's', gen_random_uuid(), now() - interval '40 days')`,
      [id],
    );
    for (const query of ['searchable@', '찾을', creator.landing.shortLink.slug]) {
      const list = await api<OperatorCreatorListResponse>(
        t.baseUrl,
        'GET',
        `/api/admin/creators?query=${encodeURIComponent(query)}`,
        { cookie: operator },
      );
      expect(list.status).toBe(200);
      expect(list.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(list.body.items[0]).toEqual({
        userId: creator.userId,
        email: 'searchable@example.com',
        displayName: '찾을이름',
        slug: creator.landing.shortLink.slug,
        shortUrl: `${SHORT_URL}/${creator.landing.shortLink.slug}`,
        landingUrl: `${WEB_URL}/p/${creator.landing.landing.publicId}`,
        visitsLast30Days: 1,
        suspended: false,
        createdAt: expect.any(String),
      });
    }
    const all = await api<OperatorCreatorListResponse>(t.baseUrl, 'GET', '/api/admin/creators?page=1', {
      cookie: operator,
    });
    expect(all.body.total).toBeGreaterThanOrEqual(3);
    const empty = await api<OperatorCreatorListResponse>(t.baseUrl, 'GET', '/api/admin/creators?page=99', {
      cookie: operator,
    });
    expect(empty.body).toMatchObject({ items: [], page: 99, total: all.body.total });
    const literal = await api<OperatorCreatorListResponse>(t.baseUrl, 'GET', '/api/admin/creators?query=%25', {
      cookie: operator,
    });
    expect(literal.body.total).toBe(0);
    const badPage = await api(t.baseUrl, 'GET', '/api/admin/creators?page=0', { cookie: operator });
    expect([badPage.status, badPage.body.code]).toEqual([400, 'validation_failed']);
  });

  it('상세·추가 슬롯·정지, 없는 크리에이터는 404 creator_not_found', async () => {
    const creator = await newCreator();
    await addLink(creator.cookie, { title: '숨김', url: 'https://a.example', hidden: true });
    const detail = await api<OperatorCreatorDetail>(t.baseUrl, 'GET', `/api/admin/creators/${creator.userId}`, {
      cookie: operator,
    });
    expect(detail.body).toMatchObject({
      userId: creator.userId,
      extraLinkSlots: 0,
      limits: { visibleMax: 5, visibleUsed: 0, totalMax: 50, totalUsed: 1 },
      links: [expect.objectContaining({ title: '숨김', hidden: true })],
    });
    const slots = await api<OperatorCreatorDetail>(
      t.baseUrl,
      'PUT',
      `/api/admin/creators/${creator.userId}/extra-slots`,
      {
        cookie: operator,
        body: { extraSlots: 2 },
      },
    );
    expect(slots.body).toMatchObject({ extraLinkSlots: 2, limits: { visibleMax: 7 } });
    for (const extraSlots of [-1, 1.5, 46, '1']) {
      const bad = await api(t.baseUrl, 'PUT', `/api/admin/creators/${creator.userId}/extra-slots`, {
        cookie: operator,
        body: { extraSlots },
      });
      expect(bad.status).toBe(400);
    }

    const suspended = await api<OperatorCreatorDetail>(
      t.baseUrl,
      'PUT',
      `/api/admin/creators/${creator.userId}/suspension`,
      { cookie: operator, body: { suspended: true } },
    );
    expect(suspended.body.suspended).toBe(true);
    // 정지하면 기존 세션은 바로 무효입니다.
    expect((await api(t.baseUrl, 'GET', '/api/me', { cookie: creator.cookie })).status).toBe(401);
    const restored = await api<OperatorCreatorDetail>(
      t.baseUrl,
      'PUT',
      `/api/admin/creators/${creator.userId}/suspension`,
      { cookie: operator, body: { suspended: false } },
    );
    expect(restored.body.suspended).toBe(false);

    for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
      const missing = await api(t.baseUrl, 'GET', `/api/admin/creators/${id}`, { cookie: operator });
      expect([missing.status, missing.body.code]).toEqual([404, 'creator_not_found']);
    }
  });

  it('링크 차단·해제: 차단된 링크는 공개 랜딩에서 빠지고 편집 화면에 사유가 보인다', async () => {
    const creator = await newCreator();
    const link = await addLink(creator.cookie, { title: '문제 링크', url: 'https://bad.example' });
    const blocked = await api<LinkView>(t.baseUrl, 'PUT', `/api/admin/links/${link.id}/block`, {
      cookie: operator,
      body: { blocked: true, reason: '신고 접수' },
    });
    expect(blocked.body).toMatchObject({ id: link.id, blocked: true, blockedReason: '신고 접수' });
    const landing = await api<PublicLandingResponse>(
      t.baseUrl,
      'GET',
      `/api/public/landings/${creator.landing.landing.publicId}`,
    );
    expect(landing.body.blocks[0].links).toEqual([]);
    const own = await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: creator.cookie });
    expect(own.body.links[0]).toMatchObject({ blocked: true, blockedReason: '신고 접수' });
    expect(own.body.limits.visibleUsed).toBe(0);
    const unblocked = await api<LinkView>(t.baseUrl, 'PUT', `/api/admin/links/${link.id}/block`, {
      cookie: operator,
      body: { blocked: false },
    });
    expect(unblocked.body).toMatchObject({ blocked: false, blockedReason: null });
    const missing = await api(t.baseUrl, 'PUT', '/api/admin/links/00000000-0000-0000-0000-000000000000/block', {
      cookie: operator,
      body: { blocked: true },
    });
    expect([missing.status, missing.body.code]).toEqual([404, 'link_not_found']);
  });

  it('차단 도메인 추가는 그 도메인·하위 도메인의 기존 링크를 차단하고, 중복 409·형식 400·삭제 204/404', async () => {
    const creator = await newCreator();
    const exact = await addLink(creator.cookie, { title: '1', url: 'https://spam.example/a' });
    const sub = await addLink(creator.cookie, { title: '2', url: 'https://www.spam.example/b' });
    const other = await addLink(creator.cookie, { title: '3', url: 'https://notspam.example/c' });
    const added = await api<BlockedDomainView[]>(t.baseUrl, 'POST', '/api/admin/blocked-domains', {
      cookie: operator,
      body: { domain: ' Spam.Example ', reason: '스팸' },
    });
    expect(added.status).toBe(201);
    expect(added.body).toEqual([{ domain: 'spam.example', reason: '스팸', createdAt: expect.any(String) }]);
    const links = await t.pool.query<{ id: string; blocked: boolean }>(
      'SELECT id, blocked_at IS NOT NULL AS blocked FROM links WHERE id = ANY($1::uuid[])',
      [[exact.id, sub.id, other.id]],
    );
    expect(Object.fromEntries(links.rows.map((row) => [row.id, row.blocked]))).toEqual({
      [exact.id]: true,
      [sub.id]: true,
      [other.id]: false,
    });
    const duplicate = await api(t.baseUrl, 'POST', '/api/admin/blocked-domains', {
      cookie: operator,
      body: { domain: 'spam.example' },
    });
    expect([duplicate.status, duplicate.body.code]).toEqual([409, 'domain_exists']);
    for (const domain of ['https://x.com/path', 'nodot', '', 'a..b']) {
      const invalid = await api(t.baseUrl, 'POST', '/api/admin/blocked-domains', {
        cookie: operator,
        body: { domain },
      });
      expect([domain, invalid.status, invalid.body.code]).toEqual([domain, 400, 'domain_invalid']);
    }
    const list = await api<BlockedDomainView[]>(t.baseUrl, 'GET', '/api/admin/blocked-domains', { cookie: operator });
    expect(list.body.map((row) => row.domain)).toEqual(['spam.example']);
    expect(
      (await api(t.baseUrl, 'DELETE', '/api/admin/blocked-domains/spam.example', { cookie: operator })).status,
    ).toBe(204);
    const again = await api(t.baseUrl, 'DELETE', '/api/admin/blocked-domains/spam.example', { cookie: operator });
    expect([again.status, again.body.code]).toEqual([404, 'domain_not_found']);
    // 목록에서 빼도 이미 차단된 링크는 그대로입니다.
    const still = await t.pool.query('SELECT blocked_at FROM links WHERE id = $1', [exact.id]);
    expect(still.rows[0].blocked_at).not.toBeNull();
  });

  it('통계는 기간 검증 후 원본과 집계를 합쳐 합계·일별·분포·링크별 클릭을 준다', async () => {
    const creator = await newCreator();
    const link = await addLink(creator.cookie, { title: '클릭 링크', url: 'https://click.example' });
    const linkPublicId = (await t.pool.query('SELECT public_id FROM links WHERE id = $1', [link.id])).rows[0].public_id;
    const id = await shortLinkId(creator.userId);
    // Asia/Seoul 기준 2026-01-10 정오.
    await t.pool.query(
      `INSERT INTO visits (short_link_id, slug, visitor_id, occurred_at, referrer_host, device_type, browser, os, country)
       VALUES ($1, 's', '11111111-1111-4111-8111-111111111111', '2026-01-10 12:00+09', 'l.instagram.com', 'mobile', 'Safari', 'iOS', 'KR'),
              ($1, 's', '11111111-1111-4111-8111-111111111111', '2026-01-10 13:00+09', NULL, 'desktop', 'Chrome', 'Windows', NULL),
              ($1, 's', '22222222-2222-4222-8222-222222222222', '2026-01-11 00:30+09', 'l.instagram.com', 'mobile', 'Safari', 'iOS', 'KR')`,
      [id],
    );
    await t.pool.query(
      `INSERT INTO link_clicks (link_id, link_public_id, short_link_id, visitor_id, occurred_at)
       VALUES ($1, $2, $3, gen_random_uuid(), '2026-01-10 12:01+09'), (NULL, 'deletedlnk', $3, gen_random_uuid(), '2026-01-11 09:00+09')`,
      [link.id, linkPublicId, id],
    );
    await t.pool.query(
      `INSERT INTO visit_daily_rollups (day, short_link_id, visits, unique_visitors, link_clicks)
       VALUES ('2026-01-09', $1, 5, 4, 2)`,
      [id],
    );
    await t.pool.query(
      `INSERT INTO visit_dimension_rollups (day, short_link_id, dimension, value, visits)
       VALUES ('2026-01-09', $1, 'country', 'KR', 5), ('2026-01-09', $1, 'device_type', 'mobile', 5)`,
      [id],
    );
    await t.pool.query(
      `INSERT INTO link_click_rollups (day, short_link_id, link_public_id, clicks) VALUES ('2026-01-09', $1, $2, 2)`,
      [id, linkPublicId],
    );
    const stats = await api<OperatorCreatorStats>(
      t.baseUrl,
      'GET',
      `/api/admin/creators/${creator.userId}/stats?from=2026-01-09&to=2026-01-11`,
      { cookie: operator },
    );
    expect(stats.status).toBe(200);
    expect(stats.body).toEqual({
      from: '2026-01-09',
      to: '2026-01-11',
      totals: { visits: 8, uniqueVisitors: 6, linkClicks: 4 },
      daily: [
        { day: '2026-01-09', visits: 5, uniqueVisitors: 4, linkClicks: 2 },
        { day: '2026-01-10', visits: 2, uniqueVisitors: 1, linkClicks: 1 },
        { day: '2026-01-11', visits: 1, uniqueVisitors: 1, linkClicks: 1 },
      ],
      referrers: [
        { value: 'l.instagram.com', count: 2 },
        { value: 'unknown', count: 1 },
      ],
      devices: [
        { value: 'mobile', count: 7 },
        { value: 'desktop', count: 1 },
      ],
      browsers: [
        { value: 'Safari', count: 2 },
        { value: 'Chrome', count: 1 },
      ],
      operatingSystems: [
        { value: 'iOS', count: 2 },
        { value: 'Windows', count: 1 },
      ],
      countries: [
        { value: 'KR', count: 7 },
        { value: 'unknown', count: 1 },
      ],
      linkClicks: [
        { linkId: linkPublicId, title: '클릭 링크', clicks: 3 },
        { linkId: 'deletedlnk', title: null, clicks: 1 },
      ],
    });

    for (const query of [
      'from=2026-01-12&to=2026-01-11',
      'from=2025-01-01&to=2026-01-11',
      'from=2026-02-30&to=2026-03-01',
      'from=x',
    ]) {
      const bad = await api(t.baseUrl, 'GET', `/api/admin/creators/${creator.userId}/stats?${query}`, {
        cookie: operator,
      });
      expect([query, bad.status, bad.body.code]).toEqual([query, 400, 'date_range_invalid']);
    }
    const recent = await api<OperatorCreatorStats>(t.baseUrl, 'GET', `/api/admin/creators/${creator.userId}/stats`, {
      cookie: operator,
    });
    expect(recent.body.daily).toHaveLength(30);
  });

  it('보존 작업은 366일 전 원본을 날짜별 집계로 옮기고 지우며 최근 원본은 남긴다', async () => {
    const creator = await newCreator();
    const id = await shortLinkId(creator.userId);
    await t.pool.query(
      `INSERT INTO visits (short_link_id, slug, visitor_id, occurred_at, ip, referrer_host, device_type, browser, os, country)
       VALUES ($1, 's', '33333333-3333-4333-8333-333333333333', now() - interval '366 days', '1.2.3.4', 'l.instagram.com', 'mobile', 'Safari', 'iOS', 'KR'),
              ($1, 's', '33333333-3333-4333-8333-333333333333', now() - interval '366 days', '1.2.3.4', NULL, 'mobile', 'Safari', 'iOS', 'KR'),
              ($1, 's', '44444444-4444-4444-8444-444444444444', now() - interval '1 day', '1.2.3.5', NULL, 'desktop', 'Chrome', 'Windows', NULL)`,
      [id],
    );
    await t.pool.query(
      `INSERT INTO link_clicks (link_public_id, short_link_id, visitor_id, occurred_at)
       VALUES ('oldlinkabc', $1, gen_random_uuid(), now() - interval '366 days'),
              ('newlinkabc', $1, gen_random_uuid(), now() - interval '1 day')`,
      [id],
    );
    const day = (
      await t.pool.query<{ day: string }>(
        `SELECT ((now() - interval '366 days') AT TIME ZONE 'Asia/Seoul')::date::text AS day`,
      )
    ).rows[0].day;

    await t.app.get(RetentionService).runOnce();

    const raw = await t.pool.query(
      `SELECT (SELECT count(*)::int FROM visits WHERE short_link_id = $1) AS visits,
              (SELECT count(*)::int FROM link_clicks WHERE short_link_id = $1) AS clicks`,
      [id],
    );
    expect(raw.rows[0]).toEqual({ visits: 1, clicks: 1 });
    const daily = await t.pool.query(
      'SELECT day::text, visits, unique_visitors, link_clicks FROM visit_daily_rollups WHERE short_link_id = $1',
      [id],
    );
    expect(daily.rows).toEqual([{ day, visits: 2, unique_visitors: 1, link_clicks: 1 }]);
    const dimensions = await t.pool.query(
      'SELECT dimension, value, visits FROM visit_dimension_rollups WHERE short_link_id = $1 ORDER BY dimension, value',
      [id],
    );
    expect(dimensions.rows).toEqual([
      { dimension: 'browser', value: 'Safari', visits: 2 },
      { dimension: 'country', value: 'KR', visits: 2 },
      { dimension: 'device_type', value: 'mobile', visits: 2 },
      { dimension: 'os', value: 'iOS', visits: 2 },
      { dimension: 'referrer_host', value: 'l.instagram.com', visits: 1 },
      { dimension: 'referrer_host', value: 'unknown', visits: 1 },
    ]);
    const clicks = await t.pool.query(
      'SELECT link_public_id, clicks FROM link_click_rollups WHERE short_link_id = $1',
      [id],
    );
    expect(clicks.rows).toEqual([{ link_public_id: 'oldlinkabc', clicks: 1 }]);

    // 다시 실행해도 옮길 원본이 없으므로 집계가 늘지 않습니다.
    await t.app.get(RetentionService).runOnce();
    const after = await t.pool.query('SELECT visits FROM visit_daily_rollups WHERE short_link_id = $1', [id]);
    expect(after.rows).toEqual([{ visits: 2 }]);

    const stats = await api<OperatorCreatorStats>(
      t.baseUrl,
      'GET',
      `/api/admin/creators/${creator.userId}/stats?from=${day}&to=${day}`,
      { cookie: operator },
    );
    expect(stats.body.totals).toEqual({ visits: 2, uniqueVisitors: 1, linkClicks: 1 });
  });
});
