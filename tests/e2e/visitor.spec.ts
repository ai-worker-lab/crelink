// 검증 계획 E2E 2: 방문자 흐름(단축 URL → 랜딩 → 외부 링크)과 방문·클릭 기록. 기준: docs/specs/crelink-mvp.md#검증-계획
import { expect, expectMobileFits, SHORT_URL, test, waitForCount } from './fixtures';

test('방문자: 단축 URL(새·옛 주소) → 랜딩, 외부 링크 클릭은 /c/{id}를 거쳐 302, 방문·클릭 기록과 같은 visitor_id', async ({
  data,
}) => {
  const creator = await data.user({
    displayName: 'E2E 방문 테스트',
    bio: '방문자 시나리오',
    renamed: true,
    links: [
      { title: '첫 번째 링크', url: data.externalUrl('first?ref=e2e') },
      { title: '두 번째 링크', url: data.externalUrl('second') },
      { title: '숨긴 링크', url: data.externalUrl('hidden'), hidden: true },
    ],
  });
  const [first, second, hidden] = creator.links;
  const { context, page } = await data.session();

  // 새 주소: 인스타그램에서 온 것처럼 Referer를 붙여 엽니다.
  await page.goto(creator.shortUrl, { referer: 'https://www.instagram.com/' });
  expect(page.url()).toBe(creator.landingUrl);
  await expect(page.getByRole('heading', { name: 'E2E 방문 테스트', level: 1 })).toBeVisible();
  await expect(page.locator('.link-title')).toHaveText([first.title, second.title]);
  await expect(page.getByText(hidden.title)).toHaveCount(0);
  await expect(page.getByRole('link', { name: first.title })).toHaveAttribute('href', first.clickUrl);

  // 옛 주소(바꾼 지 90일 안)도 같은 랜딩
  await page.goto(`${SHORT_URL}/${creator.oldSlug}`);
  expect(page.url()).toBe(creator.landingUrl);
  await expect(page.getByRole('heading', { name: 'E2E 방문 테스트', level: 1 })).toBeVisible();

  // 외부 링크 클릭: {SHORT}/c/{id}가 저장된 URL로 302 → 브라우저가 그 URL을 요청.
  // 도착지(*.e2e.test)는 실제로 열리지 않습니다(route는 리디렉트된 요청을 가로채지 않으므로 DNS 실패로 끝남).
  const redirect = page.waitForResponse((response) => response.url() === first.clickUrl);
  const arrival = page.waitForRequest((request) => request.url() === first.url && request.isNavigationRequest());
  await page.getByRole('link', { name: first.title }).click();
  const response = await redirect;
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe(first.url);
  expect((await arrival).redirectedFrom()?.url()).toBe(first.clickUrl);

  // 숨긴 링크의 클릭 주소는 안내로 보냄
  const blocked = await context.request.get(hidden.clickUrl, { maxRedirects: 0 });
  expect(blocked.status()).toBe(302);
  expect(blocked.headers().location).toMatch(/\/notice\?reason=link_unavailable$/);

  // 방문·클릭 기록
  await waitForCount(data, 'visits', creator.shortLinkId, 2);
  await waitForCount(data, 'link_clicks', creator.shortLinkId, 1);
  const { rows: visits } = await data.db.query<{
    slug: string;
    visitor_id: string;
    referrer_host: string | null;
    device_type: string | null;
    browser: string | null;
    os: string | null;
    ip: string | null;
  }>(
    `SELECT slug, visitor_id, referrer_host, device_type, browser, os, host(ip) AS ip
     FROM visits WHERE short_link_id = $1 ORDER BY id`,
    [creator.shortLinkId],
  );
  expect(visits.map((visit) => visit.slug)).toEqual([creator.slug, creator.oldSlug]);
  expect(visits[0].referrer_host).toBe('www.instagram.com');
  for (const visit of visits) {
    expect(visit).toMatchObject({ device_type: 'desktop', browser: 'Chrome' });
    expect(visit.os).toBeTruthy();
    expect(visit.ip).toBeTruthy();
  }
  const visitorId = visits[0].visitor_id;
  expect(visitorId).toMatch(/^[0-9a-f-]{36}$/);
  expect(visits[1].visitor_id, '같은 브라우저 재방문은 같은 visitor_id').toBe(visitorId);
  const cookie = (await context.cookies(SHORT_URL)).find((item) => item.name === 'cl_vid');
  expect(cookie?.value).toBe(visitorId);

  const { rows: clicks } = await data.db.query<{
    link_id: string;
    link_public_id: string;
    visitor_id: string;
    device_type: string | null;
    browser: string | null;
  }>(`SELECT link_id, link_public_id, visitor_id, device_type, browser FROM link_clicks WHERE short_link_id = $1`, [
    creator.shortLinkId,
  ]);
  expect(clicks).toEqual([
    {
      link_id: first.id,
      link_public_id: first.publicId,
      visitor_id: visitorId,
      device_type: 'desktop',
      browser: 'Chrome',
    },
  ]);

  // 다른 브라우저는 다른 visitor_id
  const other = await data.session();
  await other.page.goto(creator.shortUrl);
  await expect(other.page.getByRole('heading', { name: 'E2E 방문 테스트', level: 1 })).toBeVisible();
  await waitForCount(data, 'visits', creator.shortLinkId, 3);
  const { rows: unique } = await data.db.query<{ count: string }>(
    'SELECT count(DISTINCT visitor_id) FROM visits WHERE short_link_id = $1',
    [creator.shortLinkId],
  );
  expect(Number(unique[0].count)).toBe(2);

  await page.goto(creator.landingUrl);
  await expectMobileFits(page, '/p/{publicId}');
});
