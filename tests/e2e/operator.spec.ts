// 검증 계획 E2E 3: 운영자 흐름(통계, 추가 슬롯, 도메인 차단, 권한). 기준: docs/specs/crelink-mvp.md#검증-계획
import { expect, expectMobileFits, test, waitForCount } from './fixtures';

test('운영자: 크리에이터 통계·분포, 슬롯 부여 후 6번째 링크, 도메인 차단 반영·저장 거부, 크리에이터의 /admin 접근 거부', async ({
  data,
}) => {
  const domain = data.blockedDomain();
  const creator = await data.user({
    displayName: `E2E 운영 대상 ${data.run}`,
    links: [
      { title: '쇼핑몰', url: `https://shop.${domain}/item` },
      { title: '블로그', url: data.externalUrl('blog') },
      { title: '유튜브', url: data.externalUrl('yt') },
      { title: '카페', url: data.externalUrl('cafe') },
      { title: '공지', url: data.externalUrl('notice') },
    ],
  });
  const operator = await data.user({ role: 'operator' });
  const [shop, blog] = creator.links;

  // 방문 기록 만들기: 브라우저 A가 2번 방문·1번 클릭, 브라우저 B가 1번 방문 → 방문 3, 순 방문자 2, 클릭 1
  const visitorA = await data.session();
  await visitorA.page.goto(creator.shortUrl, { referer: 'https://www.instagram.com/' });
  await visitorA.page.goto(creator.shortUrl);
  const arrival = visitorA.page.waitForRequest((request) => request.url() === blog.url);
  await visitorA.page.getByRole('link', { name: blog.title }).click();
  await arrival;
  const visitorB = await data.session();
  await visitorB.page.goto(creator.shortUrl);
  await expect(visitorB.page.getByRole('link', { name: shop.title })).toBeVisible();
  await waitForCount(data, 'visits', creator.shortLinkId, 3);
  await waitForCount(data, 'link_clicks', creator.shortLinkId, 1);
  const { rows } = await data.db.query<{ visits: string; unique_visitors: string; clicks: string }>(
    `SELECT (SELECT count(*) FROM visits WHERE short_link_id = $1) AS visits,
            (SELECT count(DISTINCT visitor_id) FROM visits WHERE short_link_id = $1) AS unique_visitors,
            (SELECT count(*) FROM link_clicks WHERE short_link_id = $1) AS clicks`,
    [creator.shortLinkId],
  );
  expect(rows[0]).toEqual({ visits: '3', unique_visitors: '2', clicks: '1' });

  // 목록에서 찾아 상세로
  const admin = await data.session(operator);
  const page = admin.page;
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '크리에이터', level: 1 })).toBeVisible();
  await page.getByLabel('이메일·이름·주소 검색').fill(creator.email);
  await page.getByRole('button', { name: '검색' }).click();
  await expect(page).toHaveURL(/\/admin\?/);
  const row = page.getByRole('row', { name: new RegExp(creator.email.replace(/[.+]/g, '\\$&')) });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('cell').nth(3)).toHaveText('3');
  await row.getByRole('link', { name: creator.email }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/creators/${creator.userId}`));
  await expect(page.getByRole('heading', { name: `E2E 운영 대상 ${data.run}`, level: 1 })).toBeVisible();

  // 통계 합계와 분포
  const tile = (name: string) =>
    page.locator('.stat-tiles > div').filter({ has: page.getByText(name, { exact: true }) });
  await expect(tile('방문').locator('dd')).toHaveText('3');
  await expect(tile('순 방문자').locator('dd')).toHaveText('2');
  await expect(tile('링크 클릭').locator('dd')).toHaveText('1');
  for (const name of ['유입 경로', '기기', '브라우저', '운영체제']) {
    await expect(page.getByRole('table', { name: `${name}별 방문 수` })).toBeVisible();
  }
  await expect(
    page.getByRole('table', { name: '유입 경로별 방문 수' }).getByRole('row', { name: /www\.instagram\.com/ }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('table', { name: '기기별 방문 수' }).getByRole('row', { name: /desktop\s+3/ }),
  ).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '국가' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: '링크별 클릭 수' }).getByRole('row', { name: /블로그\s+1/ }),
  ).toHaveCount(1);
  await expectMobileFits(page, '/admin/creators/{id}');

  // 추가 슬롯 1개 → 크리에이터가 보이는 링크 6번째 추가
  const creatorSession = await data.session(creator);
  const me = creatorSession.page;
  await me.goto('/me');
  const links = me.getByRole('region', { name: '외부 링크' });
  await expect(links.getByText('보이는 링크 5/5')).toBeVisible();
  await expect(links.getByRole('button', { name: '링크 추가' })).toHaveCount(0);

  await page.getByLabel('추가 링크 슬롯').fill('1');
  await page.getByRole('button', { name: '슬롯 저장' }).click();
  await expect(page.getByText('추가 슬롯을 저장했어요.')).toBeVisible();
  await expect(page.getByText('보이는 링크 5/6', { exact: false })).toBeVisible();

  await me.reload();
  await expect(links.getByText('보이는 링크 5/6')).toBeVisible();
  await links.getByRole('button', { name: '링크 추가' }).click();
  await links.getByLabel('표시 이름 (필수)').fill('여섯 번째');
  await links.getByLabel('주소 (필수)').fill(data.externalUrl('sixth'));
  await links.getByRole('button', { name: '저장', exact: true }).click();
  await expect(links.getByText('링크를 추가했어요.')).toBeVisible();
  await expect(links.getByText('보이는 링크 6/6')).toBeVisible();

  // 도메인 차단 → 기존 링크 차단
  await page.goto('/admin/blocked-domains');
  await page.getByRole('textbox', { name: '도메인', exact: true }).fill(domain);
  await page.getByLabel('사유 (선택)').fill('E2E 차단');
  await page.getByRole('button', { name: '차단 목록에 추가' }).click();
  await expect(page.getByText(`${domain}을(를) 차단했어요.`, { exact: false })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(domain.replace(/\./g, '\\.')) })).toBeVisible();

  // 랜딩에서 사라짐
  await visitorB.page.goto(creator.landingUrl);
  await expect(visitorB.page.getByRole('link', { name: blog.title })).toBeVisible();
  await expect(visitorB.page.getByRole('link', { name: shop.title })).toHaveCount(0);
  const click = await visitorB.context.request.get(shop.clickUrl, { maxRedirects: 0 });
  expect(click.headers().location).toMatch(/\/notice\?reason=link_unavailable$/);

  // 편집 화면에 차단 표시, 같은 도메인(하위 도메인 포함) 저장 거부
  await me.reload();
  const shopItem = links.locator('li', { hasText: shop.title });
  await expect(shopItem.getByText('차단됨', { exact: true })).toBeVisible();
  await expect(shopItem.getByText('크리링이 이 링크를 차단해 방문자에게 보이지 않아요. 사유: E2E 차단')).toBeVisible();
  await expect(links.getByText('보이는 링크 5/6')).toBeVisible();
  await links.getByRole('button', { name: '링크 추가' }).click();
  await links.getByLabel('표시 이름 (필수)').fill('차단 도메인 링크');
  await links.getByLabel('주소 (필수)').fill(`https://www.${domain}/other`);
  data.allowConsoleError(/status of 422 .*\/api\/backend\/api\/me\/links$/);
  await links.getByRole('button', { name: '저장', exact: true }).click();
  await expect(links.getByText('크리링 차단 목록에 있는 도메인이라 저장할 수 없어요.')).toBeVisible();
  await expect(links.locator('.item-title', { hasText: '차단 도메인 링크' })).toHaveCount(0);

  // 크리에이터 권한으로 /admin 접근
  await me.goto('/admin');
  await expect(me.getByRole('heading', { name: '권한이 없어요.' })).toBeVisible();
  await me.goto(`/admin/creators/${creator.userId}`);
  await expect(me.getByRole('heading', { name: '권한이 없어요.' })).toBeVisible();
});
