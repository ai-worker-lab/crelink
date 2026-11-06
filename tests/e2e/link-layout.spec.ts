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
  await expect(page.getByText('링크 표시 방식을 저장했어요. 방문자 화면에도 적용돼요.', { exact: true })).toBeVisible();
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
    expect(metrics.columns).toBe(3);
    expect(metrics.cardMin).toBeGreaterThanOrEqual(44);
    expect(metrics.fits).toBe(true);
    expect(Math.abs(metrics.bannerWidth - metrics.width)).toBeLessThan(2);
    expect(metrics.objectFit).toBe('contain');
    if ([390, 1280].includes(width))
      await visitor.page.screenshot({ path: info.outputPath(`visitor-${width}.png`), fullPage: true });
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
  await page.getByRole('radio', { name: '리스트', exact: true }).check();
  await expect(
    page.getByText('표시 방식을 저장하지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: '카드형 그리드', exact: true })).toBeChecked();
  await page.unroute(path);
  await page.getByRole('radio', { name: '카드형 그리드', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('링크 표시 방식을 저장했어요. 방문자 화면에도 적용돼요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: '리스트', exact: true })).toBeFocused();
  await visitor.page.reload();
  await expect(visitor.page.locator('.link-grid')).toHaveCount(0);
  await expect(visitor.page.locator('a.link-card')).toHaveCount(4);
});
