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

  // 새 주소: 인스타그램에서 온 것처럼 Referer를 붙여 엽니다. 단축 주소가 붙인 통과 표시(?pass=)는 화면이 주소창에서 지웁니다.
  await page.goto(creator.shortUrl, { referer: 'https://www.instagram.com/' });
  await expect(page).toHaveURL(creator.landingUrl);
  await expect(page.getByRole('heading', { name: 'E2E 방문 테스트', level: 1 })).toBeVisible();
  await expect(page.locator('.link-title')).toHaveText([first.title, second.title]);
  await expect(page.getByText(hidden.title)).toHaveCount(0);
  await expect(page.getByRole('link', { name: first.title })).toHaveAttribute('href', first.clickUrl);

  // 옛 주소(바꾼 지 90일 안)도 같은 랜딩
  await page.goto(`${SHORT_URL}/${creator.oldSlug}`);
  await expect(page).toHaveURL(creator.landingUrl);
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

test('외부에서 랜딩 주소로 바로 열면 단축 주소를 거쳐 방문 1건이 기록되고, 주소창에는 통과 표시 없는 랜딩 주소가 남는다. 관리 화면의 공개 페이지 열기는 기록 없이 열린다', async ({
  data,
}) => {
  const name = `E2E 직접 접속 ${data.run}`;
  const creator = await data.user({ displayName: name });

  // 크리에이터가 관리 화면 미리보기 무대 주소 막대의 `공개 페이지 열기`(같은 출처, 새 창)로 열면 단축 주소를 거치지 않고 바로 열림
  const own = await data.session(creator);
  await own.page.goto('/me');
  const openLink = own.page
    .getByRole('region', { name: '미리보기', exact: true })
    .getByRole('link', { name: '공개 페이지 열기 (새 창)', exact: true });
  await expect(openLink).toHaveAttribute('target', '_blank');
  const [opened] = await Promise.all([own.context.waitForEvent('page'), openLink.click()]);
  await expect(opened.getByRole('heading', { name, level: 1 })).toBeVisible();
  expect(opened.url()).toBe(creator.landingUrl);

  // 메신저에 공유된 랜딩 주소를 연 방문자: /p/{id} → 단축 주소(방문 기록) → /p/{id}?pass=… → 주소창은 /p/{id}
  const { page } = await data.session();
  const response = await page.goto(creator.landingUrl, { referer: 'https://open.kakao.com/' });
  const landed = response!.request();
  expect(landed.url()).toMatch(new RegExp(`^${creator.landingUrl.replace(/\./g, '\\.')}\\?pass=\\d+\\.[\\w-]{22}$`));
  expect(landed.redirectedFrom()?.url()).toBe(creator.shortUrl);
  expect(landed.redirectedFrom()?.redirectedFrom()?.url()).toBe(creator.landingUrl);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(creator.landingUrl);

  await waitForCount(data, 'visits', creator.shortLinkId, 1);
  const { rows } = await data.db.query<{ slug: string; referrer_host: string | null }>(
    'SELECT slug, referrer_host FROM visits WHERE short_link_id = $1',
    [creator.shortLinkId],
  );
  expect(rows, '관리 화면에서 연 공개 페이지는 방문으로 세지 않고, 직접 접속은 단축 주소에서 1건').toEqual([
    { slug: creator.slug, referrer_host: 'open.kakao.com' },
  ]);

  // 통과 표시가 지워진 주소를 새로 열면(다시 공유된 경우) 또 단축 주소를 거침
  const again = await (await data.session()).page.goto(creator.landingUrl);
  expect(again!.request().redirectedFrom()?.url()).toBe(creator.shortUrl);
  await waitForCount(data, 'visits', creator.shortLinkId, 2);
});
