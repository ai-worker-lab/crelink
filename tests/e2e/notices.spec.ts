// 검증 계획 E2E 4: 빈 랜딩·없는 주소·정지 크리에이터 안내 화면. 기준: docs/specs/crelink-mvp.md#검증-계획
import { expect, expectMobileFits, SHORT_URL, test, WEB_URL } from './fixtures';

test('빈 랜딩은 크리링 표시와 함께 열리고, 없는 단축 주소는 link_not_found 안내', async ({ data }) => {
  const creator = await data.user();
  const { page } = await data.session();

  await page.goto(creator.shortUrl);
  await expect(page).toHaveURL(creator.landingUrl);
  await expect(page.getByText('아직 준비 중인 페이지예요.')).toBeVisible();
  // 프로필 사진이 없으면 기본 프로필(PRD R17)
  await expect(page.locator('.profile-head .default-avatar')).toBeVisible();
  await expect(page.getByRole('contentinfo').getByRole('link', { name: '크리링', exact: true })).toBeVisible();
  await expect(page.locator('.link-card')).toHaveCount(0);
  await expectMobileFits(page, '빈 /p/{publicId}');

  await page.goto(`${SHORT_URL}/${data.unique('nope')}`);
  expect(page.url()).toBe(`${WEB_URL}/notice?reason=link_not_found`);
  await expect(page.getByRole('heading', { name: '없는 주소예요.' })).toBeVisible();
});

test('운영자가 정지한 크리에이터: 단축 URL은 creator_suspended 안내, /p/{id}도 안내, 편집 화면은 로그인 해제', async ({
  data,
}) => {
  const creator = await data.user({
    displayName: `E2E 정지 대상 ${data.run}`,
    links: [{ title: '정지 전 링크', url: data.externalUrl('before') }],
  });
  const operator = await data.user({ role: 'operator' });
  const visitor = await data.session();

  await visitor.page.goto(creator.shortUrl);
  await expect(visitor.page.getByRole('link', { name: '정지 전 링크' })).toBeVisible();

  const { page } = await data.session(operator);
  await page.goto(`/admin/creators/${creator.userId}`);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '이용 정지' }).click();
  await expect(page.getByText('정지했어요.')).toBeVisible();
  await expect(page.getByText('현재 상태: 정지')).toBeVisible();

  await visitor.page.goto(creator.shortUrl);
  expect(visitor.page.url()).toBe(`${WEB_URL}/notice?reason=creator_suspended`);
  await expect(visitor.page.getByRole('heading', { name: '운영이 중지된 페이지예요.' })).toBeVisible();

  await visitor.page.goto(creator.landingUrl);
  await expect(visitor.page.getByRole('heading', { name: '운영이 중지된 페이지예요.' })).toBeVisible();
  await expect(visitor.page.getByRole('link', { name: '정지 전 링크' })).toHaveCount(0);
  const click = await visitor.context.request.get(creator.links[0].clickUrl, { maxRedirects: 0 });
  expect(click.headers().location).toBe(`${WEB_URL}/notice?reason=link_unavailable`);

  // 정지하면 세션이 지워져 `/me`와 관리 화면은 홈으로 돌아갑니다.
  const suspended = await data.session(creator);
  await suspended.page.goto('/me');
  await expect(suspended.page).toHaveURL(`${WEB_URL}/`);
  await suspended.page.goto(`/me/landings/${creator.publicId}`);
  await expect(suspended.page).toHaveURL(`${WEB_URL}/`);
});
