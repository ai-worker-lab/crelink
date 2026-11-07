import AxeBuilder from '@axe-core/playwright';
import { API_URL, expect, expectNoHorizontalOverflow, test } from './fixtures';

test('Instabio 외부 합성 원본: 기존 프로필·링크·표시 방식 보존과 중복 없는 추가 저장', async ({ data }, info) => {
  const user = await data.user({
    displayName: '기존 프로필',
    bio: '기존 소개와 광고 고지',
    links: [{ title: '기존 작업', url: 'https://import.e2e.test/existing' }],
  });
  const { page } = await data.session(user);
  expect(
    (await page.request.patch(`${API_URL}/api/me/landing`, { data: { linkLayout: 'grid', listDensity: 12 } })).status(),
  ).toBe(200);
  await page.goto(`/me/landings/${user.publicId}`);
  await page.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  await page.getByText('Instabio에서 가져오기', { exact: true }).click();
  const panel = page.locator('.instabio-import');
  await panel.getByLabel('Instabio 페이지 주소').fill('https://instabio.cc/CrelinkE2E0200');
  await panel.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '가져오기 미리보기 · 2개' })).toBeVisible();
  await expect(panel.getByLabel('현재 프로필 이름·소개·사진을 원본으로 교체')).not.toBeChecked();
  await panel.getByLabel('링크 제목 1', { exact: true }).fill('직접 고친 가져온 작업');
  await panel.getByLabel('현재 프로필 이름·소개·사진을 원본으로 교체').check();
  for (const width of [320, 390, 768, 1023, 1024, 1023, 1024, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    // 실제 패널↔하단 시트 전환 완료를 기다리고 초안을 재입력하지 않습니다.
    const sheet = page.getByRole('dialog', { name: '외부 링크', exact: true });
    if (width < 1024) await expect(sheet).toBeVisible();
    else await expect(sheet).toHaveCount(0);
    await expect(panel.getByRole('heading', { name: '가져오기 미리보기 · 2개' })).toBeVisible();
    await expect(panel.getByLabel('1. 가져오기', { exact: true })).toBeChecked();
    await expect(panel.getByLabel('링크 제목 1', { exact: true })).toHaveValue('직접 고친 가져온 작업');
    await expect(panel.getByLabel('현재 프로필 이름·소개·사진을 원본으로 교체')).toBeChecked();
    await expect(panel.getByRole('button', { name: '선택 항목 저장 · 프로필 교체', exact: true })).toBeEnabled();
    await expectNoHorizontalOverflow(page, `import-preview/${width}`);
  }
  // 교체 초안 보존을 확인한 뒤 해제하여 기존 프로필 보존도 같은 실제 저장에서 검사합니다.
  await panel.getByLabel('현재 프로필 이름·소개·사진을 원본으로 교체').uncheck();
  const accessibility = await new AxeBuilder({ page })
    .include('.instabio-import')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await info.attach('instabio-preview-axe', { body: JSON.stringify(accessibility), contentType: 'application/json' });
  expect(accessibility.violations).toEqual([]);
  const before = await page.request.get(`${API_URL}/api/me/landing`);
  expect((await before.json()).links.map((link: { title: string }) => link.title)).toEqual(['기존 작업']);
  await panel.getByRole('button', { name: '선택 항목 저장', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '가져오기 미리보기 · 2개' })).toHaveCount(0);
  await page.reload();
  const state = await (await page.request.get(`${API_URL}/api/me/landing`)).json();
  expect(state.landing.linkLayout).toBe('grid');
  expect(state.landing.listDensity).toBe(12);
  expect(state.landing).toMatchObject({ displayName: '기존 프로필', bio: '기존 소개와 광고 고지' });
  expect(state.links.map((link: { title: string; url: string }) => ({ title: link.title, url: link.url }))).toEqual([
    { title: '기존 작업', url: 'https://import.e2e.test/existing' },
    { title: '직접 고친 가져온 작업', url: 'https://import.e2e.test/work?affiliate=keep' },
  ]);
  const visitor = await data.session();
  await visitor.page.goto(user.shortUrl);
  await expect(visitor.page.getByRole('heading', { name: '기존 프로필', exact: true })).toBeVisible();
  await expect(visitor.page.locator('.link-grid .link-title')).toHaveText(['기존 작업', '직접 고친 가져온 작업']);
  await info.attach('instabio-preserved-public', {
    body: await visitor.page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
