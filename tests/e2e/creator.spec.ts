// 검증 계획 E2E 1: 크리에이터 편집 흐름. 기준: docs/specs/crelink-mvp.md#검증-계획, 화면 `/me`.
import type { Locator } from '@playwright/test';
import { expect, expectMobileFits, SHORT_URL, test, TINY_PNG, WEB_URL } from './fixtures';

async function addLink(links: Locator, title: string, url: string) {
  await links.getByRole('button', { name: '링크 추가' }).click();
  await links.getByLabel('표시 이름 (필수)').fill(title);
  await links.getByLabel('주소 (필수)').fill(url);
  await links.getByRole('button', { name: '저장', exact: true }).click();
  await expect(links.locator('.item-title', { hasText: new RegExp(`^${title}$`) })).toBeVisible();
  await expect(links.getByRole('heading', { name: '새 링크' })).toHaveCount(0);
}

test('크리에이터: 단축 URL 확인·복사, 프로필·SNS·포트폴리오, 링크 한도·숨기기·순서·삭제, 주소 변경과 30일 제한', async ({
  data,
}) => {
  const creator = await data.user();
  const { context, page } = await data.session(creator);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB_URL });

  await page.goto('/me');
  await expect(page.getByRole('heading', { name: '내 크리링', level: 1 })).toBeVisible();
  await expect(page.getByText(creator.email)).toBeVisible();

  // 단축 URL 표시·복사
  const short = page.getByRole('region', { name: '내 크리링 링크' });
  await expect(short.locator('code.url-text')).toHaveText(creator.shortUrl);
  await short.getByRole('button', { name: '내 크리링 링크 복사' }).click();
  await expect(short.getByText('복사했어요.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(creator.shortUrl);

  // 프로필: 사진(작은 PNG)·이름·소개
  const profile = page.getByRole('region', { name: '프로필' });
  await expect(profile.locator('.default-avatar')).toBeVisible();
  await profile
    .getByLabel('프로필 사진')
    .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(profile.getByRole('img', { name: '프로필 사진 미리보기' })).toBeVisible();
  await expect(profile.locator('.default-avatar')).toHaveCount(0);
  await profile.getByLabel('이름(닉네임)').fill('E2E 크리에이터');
  await profile.getByLabel('소개').fill('E2E 소개 문구입니다.');
  await profile.getByRole('button', { name: '프로필 저장' }).click();
  await expect(profile.getByText('프로필을 저장했어요.')).toBeVisible();

  // SNS
  const socials = page.getByRole('region', { name: 'SNS 채널' });
  await socials.getByRole('button', { name: 'SNS 채널 추가' }).click();
  await socials.getByLabel('플랫폼 1').selectOption('youtube');
  const socialUrl = data.externalUrl('@e2e');
  await socials.getByLabel('계정 주소 1').fill(socialUrl);
  await socials.getByRole('button', { name: 'SNS 채널 저장' }).click();
  await expect(socials.getByText('SNS 채널을 저장했어요.')).toBeVisible();

  // 포트폴리오
  const portfolio = page.getByRole('region', { name: '포트폴리오' });
  await portfolio.getByRole('button', { name: '포트폴리오 추가' }).click();
  await portfolio.getByLabel('제목 (필수)').fill('E2E 협업');
  await portfolio.getByLabel('링크', { exact: true }).fill(data.externalUrl('work'));
  await portfolio.getByLabel('설명').fill('브랜드 협업 이력');
  await portfolio.getByRole('button', { name: '저장', exact: true }).click();
  await expect(portfolio.getByText('포트폴리오 항목을 추가했어요.')).toBeVisible();
  await expect(portfolio.locator('.item-title')).toHaveText(['E2E 협업']);

  // 외부 링크 5개 → 한도 안내, 6번째 불가
  const links = page.getByRole('region', { name: '외부 링크' });
  const titles = links.locator('.item-title');
  for (let index = 1; index <= 5; index += 1) await addLink(links, `링크 ${index}`, data.externalUrl(`l${index}`));
  await expect(links.getByText('보이는 링크 5/5')).toBeVisible();
  await expect(links.getByText('보이는 링크 한도(5개)에 도달했어요.', { exact: false })).toBeVisible();
  await expect(links.getByRole('button', { name: '링크 추가' })).toHaveCount(0);
  const sixth = await page.request.post(`${WEB_URL}/api/backend/api/me/links`, {
    headers: { Origin: WEB_URL },
    data: { title: '링크 6', url: data.externalUrl('l6') },
  });
  expect(sixth.status(), '보이는 링크 6번째 추가는 API도 거부').toBe(409);
  expect((await sixth.json()).code).toBe('link_limit_reached');

  // 숨기기 후 추가 가능
  await links.getByRole('button', { name: '링크 1 숨기기' }).click();
  await expect(links.getByText("'링크 1' 링크를 숨겼어요.")).toBeVisible();
  await expect(links.locator('li', { hasText: '링크 1' }).getByText('숨김', { exact: true })).toBeVisible();
  await expect(links.getByText('보이는 링크 4/5')).toBeVisible();
  await addLink(links, '링크 6', data.externalUrl('l6'));
  await expect(links.getByText('보이는 링크 5/5')).toBeVisible();
  await expect(
    links.locator('li', { hasText: '링크 1' }).getByText('한도가 차서 다시 보이게 할 수 없어요'),
  ).toBeVisible();

  // 순서 변경(위·아래 버튼) — 새로고침 뒤에도 유지
  await expect(titles).toHaveText(['링크 1', '링크 2', '링크 3', '링크 4', '링크 5', '링크 6']);
  await links.getByRole('button', { name: '링크 6 위로 이동' }).click();
  await expect(links.getByText('순서를 바꿨어요.')).toBeVisible();
  await expect(titles).toHaveText(['링크 1', '링크 2', '링크 3', '링크 4', '링크 6', '링크 5']);

  // 삭제(확인 창)
  page.once('dialog', (dialog) => void dialog.accept());
  await links.getByRole('button', { name: '링크 2 삭제' }).click();
  await expect(links.getByText('링크를 지웠어요.')).toBeVisible();
  await expect(titles).toHaveText(['링크 1', '링크 3', '링크 4', '링크 6', '링크 5']);
  await page.reload();
  await expect(titles).toHaveText(['링크 1', '링크 3', '링크 4', '링크 6', '링크 5']);
  await expect(links.getByText('보이는 링크 4/5')).toBeVisible();

  // 주소 변경: 자동 주소는 바로 바꿀 수 있음
  const newSlug = data.unique('e2e-me');
  await expect(short.getByText('자동 발급 주소는 지금 바로 바꿀 수 있어요.', { exact: false })).toBeVisible();
  await short.getByLabel('새 주소').fill(newSlug);
  await expect(short.getByText('사용할 수 있는 주소예요.')).toBeVisible();
  await short.getByRole('button', { name: '주소 바꾸기' }).click();
  await expect(short.getByText('주소를 바꿨어요.', { exact: false })).toBeVisible();
  await expect(short.locator('code.url-text')).toHaveText(`${SHORT_URL}/${newSlug}`);

  // 다시 바꾸려 하면 30일 제한 안내(화면은 입력을 막고, API도 429)
  await expect(
    short.getByText('주소는 30일에 한 번 바꿀 수 있어요. 다음 변경 가능일:', { exact: false }),
  ).toBeVisible();
  await expect(short.getByLabel('새 주소')).toBeDisabled();
  const again = await page.request.put(`${WEB_URL}/api/backend/api/me/short-link/slug`, {
    headers: { Origin: WEB_URL },
    data: { slug: data.unique('e2e-again') },
  });
  expect(again.status()).toBe(429);
  expect((await again.json()).code).toBe('slug_change_too_soon');
  await page.reload();
  await expect(
    short.getByText('주소는 30일에 한 번 바꿀 수 있어요. 다음 변경 가능일:', { exact: false }),
  ).toBeVisible();

  await expectMobileFits(page, '/me');

  // 저장한 내용이 랜딩에 반영됨(숨긴 링크 제외, 바꾼 순서)
  await page.goto(creator.landingUrl);
  await expect(page.getByRole('heading', { name: 'E2E 크리에이터', level: 1 })).toBeVisible();
  await expect(page.getByText('E2E 소개 문구입니다.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'E2E 크리에이터 프로필 사진' })).toBeVisible();
  await expect(page.locator('.profile-head .default-avatar')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'SNS 채널' }).getByRole('link', { name: '유튜브' })).toHaveAttribute(
    'href',
    socialUrl,
  );
  await expect(page.locator('.link-title')).toHaveText(['링크 3', '링크 4', '링크 6', '링크 5']);
  await expect(page.getByRole('region', { name: '포트폴리오' }).getByText('E2E 협업')).toBeVisible();
  await expectMobileFits(page, '/p/{publicId}');
});
