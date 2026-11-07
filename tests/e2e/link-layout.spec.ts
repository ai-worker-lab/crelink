import AxeBuilder from '@axe-core/playwright';
import { devices } from '@playwright/test';
import { API_URL, expect, expectNoHorizontalOverflow, test, TINY_PNG } from './fixtures';

test('생성자 표시 설정: 저장·미리보기·공개 그리드·모바일·실패 복구', async ({ data, browserName }, info) => {
  const user = await data.user({
    displayName: '그리드 QA',
    links: Array.from({ length: 5 }, (_, i) => ({
      title: i === 2 ? '긴제목'.repeat(20) : `링크 ${i + 1}`,
      url: data.externalUrl(`item-${i}`),
      hidden: i === 4,
    })),
  });
  const mobile =
    browserName === 'webkit'
      ? devices['iPhone 13 Pro']
      : browserName === 'chromium'
        ? devices['Pixel 7']
        : { hasTouch: true };
  const { page } = await data.session(user, { ...mobile, viewport: { width: 390, height: 844 } });
  const uploaded = await page.request.post(`${API_URL}/api/me/files`, {
    multipart: { file: { name: 'image.png', mimeType: 'image/png', buffer: TINY_PNG } },
  });
  expect(uploaded.ok()).toBe(true);
  const image = await uploaded.json();
  expect(
    (
      await page.request.patch(`${API_URL}/api/me/links/${user.links[0].id}`, {
        data: { thumbnailFileId: image.fileId },
      })
    ).ok(),
  ).toBe(true);
  await data.db.query('UPDATE users SET banner_slot_granted_at=now() WHERE id=$1', [user.userId]);
  expect(
    (
      await page.request.post(`${API_URL}/api/me/banners`, { data: { imageFileId: image.fileId, alt: '검수 배너' } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.put(`${API_URL}/api/me/links/order`, {
        data: { ids: user.links.map((link) => link.id), slotIndex: 1 },
      })
    ).ok(),
  ).toBe(true);
  const url = `/me/landings/${user.publicId}`;
  await page.goto(url);
  await page.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  await expect(page.getByRole('radio', { name: '리스트', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: '카드형 그리드', exact: true }).check();
  await expect(page.locator('.preview-screen .link-grid')).toHaveCount(1);
  // 관리 정렬 목록은 가로 카드 그리드로 바뀌지 않습니다.
  await expect(page.locator('.link-edit-list.link-grid')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('creator-mobile.png') });
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.reload();
  await expect(page.locator('.link-grid')).toHaveCount(1);
  const visitor = await data.session(undefined, { ...mobile, viewport: { width: 390, height: 844 } });
  await visitor.page.goto(user.landingUrl);
  const grid = visitor.page.locator('.link-grid');
  await expect(grid.locator('a.link-card')).toHaveCount(4);
  await expect(visitor.page.getByRole('radio')).toHaveCount(0);
  expect(await grid.locator('a.link-card').first().getAttribute('href')).toBe(user.links[0].clickUrl);
  await expect(grid.locator('.link-thumb')).toHaveCount(1);
  await expect(grid.locator('.link-grid-placeholder')).toHaveCount(3);
  const slot = grid.locator('.banner-slot-item');
  await expect(slot).toBeVisible();
  expect(await grid.locator('> li').nth(1).getAttribute('class')).toContain('banner-slot-item');
  for (const width of [320, 390, 768, 1280]) {
    await visitor.page.setViewportSize({ width, height: 844 });
    await expectNoHorizontalOverflow(visitor.page, `grid/${browserName}/${width}`);
    const metrics = await grid.evaluate((node) => {
      const cards = [...node.querySelectorAll<HTMLElement>('.link-card')];
      const banner = node.querySelector<HTMLElement>('.banner-slot-item')!;
      return {
        columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
        cardMin: Math.min(...cards.map((card) => card.getBoundingClientRect().height)),
        bannerWidth: banner.getBoundingClientRect().width,
        width: node.getBoundingClientRect().width,
        fits: cards.every((card) => card.scrollWidth <= card.clientWidth + 1),
        objectFit: getComputedStyle(node.querySelector('.link-thumb')!).objectFit,
      };
    });
    expect(metrics.columns).toBe(2);
    expect(metrics.cardMin).toBeGreaterThanOrEqual(44);
    expect(metrics.fits).toBe(true);
    expect(Math.abs(metrics.bannerWidth - metrics.width)).toBeLessThan(2);
    expect(metrics.objectFit).toBe('contain');
    if ([390, 1280].includes(width))
      await visitor.page.screenshot({ path: info.outputPath(`visitor-${width}.png`), fullPage: true });
  }
  await visitor.page.setViewportSize({ width: 844, height: 390 });
  await expectNoHorizontalOverflow(visitor.page, `grid/${browserName}/landscape`);
  expect(await grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(2);
  await visitor.page.screenshot({ path: info.outputPath('visitor-landscape-844x390.png'), fullPage: true });
  // 200% 글자 확대: 페이지 배율/실물 OS 확대와 구분합니다.
  await visitor.page.setViewportSize({ width: 320, height: 740 });
  await visitor.page.addStyleTag({ content: '.link-card { font-size: 200%; } .link-title { font-size: inherit; }' });
  await expectNoHorizontalOverflow(visitor.page, `grid/${browserName}/text-200-percent`);
  expect(
    await grid
      .locator('.link-card')
      .evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth + 1)),
  ).toBe(true);
  await visitor.page.screenshot({ path: info.outputPath('visitor-text-200-percent-320.png'), fullPage: true });
  await visitor.page.reload();
  await expect(grid).toBeVisible();
  const accessibility = await new AxeBuilder({ page: visitor.page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await info.attach('public-grid-axe', { body: JSON.stringify(accessibility), contentType: 'application/json' });
  expect(accessibility.violations).toEqual([]);
  await info.attach('environment', {
    body: JSON.stringify({
      browserName,
      version: visitor.context.browser()!.version(),
      host: process.platform,
      widths: [320, 390, 768, 1280],
      landscape: [844, 390],
      textScalePercent: 200,
      visualComparison: process.platform === 'linux' && info.project.name === 'chromium' ? 'required' : 'not-run',
    }),
    contentType: 'application/json',
  });
  // Linux PR CI만 시각 비교합니다. macOS 결과를 Linux 기준선으로 승인하지 않습니다.
  if (process.platform === 'linux' && info.project.name === 'chromium') {
    await visitor.page.setViewportSize({ width: 390, height: 844 });
    await visitor.page.evaluate(() => document.fonts.ready);
    await expect(grid).toHaveScreenshot('public-two-column.png', { animations: 'disabled', maxDiffPixels: 0 });
  }
  await page.goto(url);
  await page.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  // 이전 API가 알 수 없는 필드를 무시하고200을 주는 배포 겹침도 저장 실패로 복구합니다.
  const path = '**/api/backend/api/me/landing';
  await page.route(path, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const current = await (await page.request.get(`${API_URL}/api/me/landing`)).json();
    delete current.landing.linkLayout;
    await route.fulfill({ status: 200, json: current });
  });
  // 실패 응답이 즉시 grid로 복구하므로 check()의 최종 checked=true 조건은 이 전환과 모순됩니다.
  await page.getByRole('radio', { name: '리스트', exact: true }).click();
  await expect(page.locator('.form-error[role="alert"]')).toBeVisible();
  await expect(page.getByRole('radio', { name: '카드형 그리드', exact: true })).toBeChecked();
  await page.unroute(path);
  await page.getByRole('radio', { name: '카드형 그리드', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: '리스트', exact: true })).toBeFocused();
  await visitor.page.reload();
  await expect(visitor.page.locator('.link-grid')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  await expect(page.getByRole('radio', { name: '리스트', exact: true })).toBeChecked();
  await expect(visitor.page.locator('a.link-card')).toHaveCount(4);
});
