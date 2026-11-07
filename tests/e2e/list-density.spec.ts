import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices } from '@playwright/test';
import { API_URL, expect, expectNoHorizontalOverflow, test } from './fixtures';

const path = '**/api/backend/api/me/landing';
const option = (value: number) => new RegExp(`^${value}개형`);

test('리스트 밀도: 실제 저장·새 세션·공개/미리보기·740px 실측·가독성', async ({ data, browserName }, info) => {
  const user = await data.user({
    displayName: '밀도 QA',
    links: Array.from({ length: 14 }, (_, i) => ({ title: `작업 ${i + 1}`, url: data.externalUrl(`density-${i}`) })),
  });
  const mobile =
    browserName === 'webkit'
      ? devices['iPhone 13 Pro']
      : browserName === 'chromium'
        ? devices['Pixel 7']
        : { hasTouch: true };
  const { page } = await data.session(user, { ...mobile, viewport: { width: 390, height: 844 } });
  const upload = await page.request.post(`${API_URL}/api/me/files`, {
    multipart: {
      file: {
        name: 'density.jpg',
        mimeType: 'image/jpeg',
        buffer: readFileSync(join(__dirname, 'fixtures/list-density-landscape.jpg')),
      },
    },
  });
  expect(upload.ok()).toBe(true);
  const image = await upload.json();
  for (const link of user.links)
    expect(
      (
        await page.request.patch(`${API_URL}/api/me/links/${link.id}`, { data: { thumbnailFileId: image.fileId } })
      ).ok(),
    ).toBe(true);
  await page.goto(`/me/landings/${user.publicId}`);
  await page.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  await expect(page.getByRole('radio', { name: option(8) })).toBeChecked();
  expect(
    await page
      .locator('.link-layout-picker label')
      .evaluateAll((labels) => labels.every((label) => label.getBoundingClientRect().height >= 44)),
  ).toBe(true);
  const visitor = await data.session(undefined, { ...mobile, viewport: { width: 390, height: 740 } });
  const measurements = [];
  for (const density of [8, 10, 12]) {
    if (density !== 8) {
      const saved = page.waitForResponse(
        (response) => response.url().endsWith('/api/backend/api/me/landing') && response.request().method() === 'PATCH',
      );
      await page.getByRole('radio', { name: option(density) }).click();
      expect((await saved).status()).toBe(200);
    }
    await expect(page.locator('.preview-screen .link-list')).toHaveAttribute('data-list-density', String(density));
    const previewMetrics = await page.locator('.preview-screen .link-list').evaluate((node) => {
      const start = node.getBoundingClientRect().top;
      const cards = [...node.querySelectorAll<HTMLElement>('.link-card')];
      return {
        count: cards.filter((card) => card.getBoundingClientRect().bottom <= start + 740).length,
        height: cards[0].getBoundingClientRect().height,
      };
    });
    expect(previewMetrics.count).toBe(density);
    expect(
      (await data.db.query('SELECT list_density FROM landings WHERE user_id=$1', [user.userId])).rows[0].list_density,
    ).toBe(density);
    expect((await (await page.request.get(`${API_URL}/api/me/landing`)).json()).landing.listDensity).toBe(density);
    await visitor.page.goto(user.landingUrl);
    const list = visitor.page.locator('.link-list');
    await expect(list).toHaveAttribute('data-list-density', String(density));
    await visitor.page.evaluate(() => document.fonts.ready);
    const metrics = await list.evaluate((node) => {
      const start = node.getBoundingClientRect().top;
      const cards = [...node.querySelectorAll<HTMLElement>('a.link-card')];
      return {
        count: cards.filter((card) => card.getBoundingClientRect().bottom <= start + 740).length,
        height: cards[0].getBoundingClientRect().height,
        gap: getComputedStyle(node).gap,
        font: getComputedStyle(node.querySelector('.link-title')!).fontSize,
        fit: getComputedStyle(node.querySelector('.link-thumb')!).objectFit,
      };
    });
    measurements.push({ density, ...metrics, preview: previewMetrics });
    expect(metrics.count).toBe(density);
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.fit).toBe('contain');
    expect(metrics.height).toBe(previewMetrics.height);
    await list.scrollIntoViewIfNeeded();
    await visitor.page.evaluate(() =>
      window.scrollTo(0, document.querySelector('.link-list')!.getBoundingClientRect().top + window.scrollY),
    );
    await visitor.page.screenshot({
      path: info.outputPath(`density-${density}-390.png`),
      clip: { x: 0, y: 0, width: 390, height: 740 },
    });
    await page.reload();
    await page.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
    await expect(page.getByRole('radio', { name: option(density) })).toBeChecked();
  }
  expect(new Set(measurements.map((row) => row.font)).size).toBe(1);
  await info.attach('density-measurements', {
    body: JSON.stringify({ browserName, version: visitor.context.browser()!.version(), measurements }),
    contentType: 'application/json',
  });
  const token = randomBytes(32).toString('base64url');
  await data.db.query(`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')`, [
    user.userId,
    createHash('sha256').update(token).digest('hex'),
  ]);
  const fresh = await data.session({ ...user, sessionToken: token });
  await fresh.page.goto(`/me/landings/${user.publicId}`);
  await expect(fresh.page.locator('.preview-screen .link-list')).toHaveAttribute('data-list-density', '12');
  await page.getByRole('radio', { name: '카드형 그리드', exact: true }).click();
  await expect(page.locator('.preview-screen .link-grid')).toHaveCount(1);
  await page.getByRole('radio', { name: '리스트', exact: true }).click();
  await expect(page.getByRole('radio', { name: option(12) })).toBeChecked();
  await data.db.query('UPDATE users SET banner_slot_granted_at=now() WHERE id=$1', [user.userId]);
  expect(
    (
      await page.request.post(`${API_URL}/api/me/banners`, { data: { imageFileId: image.fileId, alt: '밀도 배너' } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.patch(`${API_URL}/api/me/links/${user.links[0].id}`, {
        data: { title: '긴제목'.repeat(20), description: '긴 설명 '.repeat(24), thumbnailFileId: null },
      })
    ).ok(),
  ).toBe(true);
  for (const density of [8, 10, 12]) {
    expect((await page.request.patch(`${API_URL}/api/me/landing`, { data: { listDensity: density } })).ok()).toBe(true);
    await visitor.page.reload();
    for (const width of [320, 390, 768, 1280]) {
      await visitor.page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(visitor.page, `density/${density}/${width}`);
      const banner = visitor.page.locator('.banner-slot-item');
      expect(
        Math.abs((await banner.boundingBox())!.width - (await visitor.page.locator('.link-list').boundingBox())!.width),
      ).toBeLessThan(2);
      expect(
        await visitor.page
          .locator('.link-title,.link-description')
          .evaluateAll((nodes) => nodes.every((node) => node.scrollHeight <= node.clientHeight + 1)),
      ).toBe(true);
      expect(
        await visitor.page
          .locator('a.link-card')
          .evaluateAll((cards) =>
            cards.every(
              (card) => card.scrollWidth <= card.clientWidth + 1 && card.getBoundingClientRect().height >= 44,
            ),
          ),
      ).toBe(true);
    }
    await visitor.page.setViewportSize({ width: 320, height: 844 });
    await visitor.page.addStyleTag({
      content: '.link-card {font-size:200%} .link-title,.link-description {font-size:inherit}',
    });
    await expectNoHorizontalOverflow(visitor.page, `density/${density}/text200`);
    expect(
      await visitor.page
        .locator('.link-title,.link-description')
        .evaluateAll((nodes) =>
          nodes.every((node) => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1),
        ),
    ).toBe(true);
    await visitor.page.screenshot({ path: info.outputPath(`density-${density}-long-text200.png`), fullPage: true });
  }
});

test('리스트 밀도: 오류 복구·수동 재시도·동기 교차 잠금·세션 만료', async ({ data }, info) => {
  const user = await data.user({
    displayName: '보존할 프로필',
    links: [{ title: '보존할 링크', url: data.externalUrl('keep') }],
  });
  const { page } = await data.session(user);
  expect((await page.request.patch(`${API_URL}/api/me/landing`, { data: { listDensity: 10 } })).ok()).toBe(true);
  await page.goto(`/me/landings/${user.publicId}`);
  await page.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  await page.getByText('Instabio에서 가져오기', { exact: true }).click();
  const panel = page.locator('.instabio-import');
  await panel.getByLabel('Instabio 페이지 주소').fill('https://instabio.cc/CrelinkE2E0200');
  await panel.getByRole('button', { name: '미리보기', exact: true }).click();
  await expect(panel.getByLabel('링크 제목 1', { exact: true })).toBeVisible();
  await panel.getByLabel('링크 제목 1', { exact: true }).fill('밀도 오류 중 보존할 초안');
  for (const malformed of ['503', 'missing', '12', 10, null]) {
    await page.route(path, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      if (malformed === '503')
        return route.fulfill({ status: 503, json: { error: { code: 'unavailable', message: 'QA 저장 실패' } } });
      const current = await (await page.request.get(`${API_URL}/api/me/landing`)).json();
      if (malformed === 'missing') delete current.landing.listDensity;
      else current.landing.listDensity = malformed;
      await route.fulfill({ status: 200, json: current });
    });
    if (malformed === '503') data.allowConsoleError(/Failed to load resource.*503.*\/api\/backend\/api\/me\/landing/);
    await page.getByRole('radio', { name: option(12) }).click();
    await expect(page.getByRole('radio', { name: option(10) })).toBeChecked();
    await expect(page.locator('.form-error[role="alert"]')).toBeVisible();
    await expect(panel.getByLabel('링크 제목 1', { exact: true })).toHaveValue('밀도 오류 중 보존할 초안');
    expect(
      (await data.db.query('SELECT list_density FROM landings WHERE user_id=$1', [user.userId])).rows[0].list_density,
    ).toBe(10);
    await page.unroute(path);
  }
  const { promise: gate, resolve: release } = Promise.withResolvers<void>();
  let requests = 0;
  await page.route(path, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    requests++;
    await gate;
    await route.continue();
  });
  await page.getByRole('radio', { name: option(12) }).evaluate((radio) => {
    (radio as HTMLInputElement).click();
    (document.querySelector('input[value="10"]') as HTMLInputElement).click();
    (document.querySelector('input[value="grid"]') as HTMLInputElement).click();
  });
  await expect.poll(() => requests).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: '외부 링크', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: option(12) })).toHaveAttribute('aria-disabled', 'true');
  release();
  await expect(page.getByRole('radio', { name: option(12) })).not.toHaveAttribute('aria-disabled', 'true');
  await page.unroute(path);
  expect(requests).toBe(1);
  const state = await (await page.request.get(`${API_URL}/api/me/landing`)).json();
  expect(state.landing).toMatchObject({ listDensity: 12, linkLayout: 'list', displayName: '보존할 프로필' });
  expect(state.links[0].title).toBe('보존할 링크');
  await expect(panel.getByLabel('링크 제목 1', { exact: true })).toHaveValue('밀도 오류 중 보존할 초안');
  await panel.getByRole('button', { name: '선택 항목 저장', exact: true }).click();
  await expect(panel.getByLabel('링크 제목 1', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.preview-screen .link-list')).toHaveAttribute('data-list-density', '12');
  await expect(page.locator('.preview-screen .link-title')).toContainText(['보존할 링크', '밀도 오류 중 보존할 초안']);
  await page.getByRole('button', { name: '외부 링크 구역 편집', exact: true }).click();
  await data.db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [user.userId]);
  data.allowConsoleError(/Failed to load resource.*401.*\/api\/backend\/api\/me\/landing/);
  const expired = page.waitForResponse(
    (response) => response.url().endsWith('/api/backend/api/me/landing') && response.request().method() === 'PATCH',
  );
  await page.getByRole('radio', { name: option(10) }).click();
  expect((await expired).status()).toBe(401);
  await expect(page).toHaveURL(/\/$/);
  expect(
    (await data.db.query('SELECT list_density FROM landings WHERE user_id=$1', [user.userId])).rows[0].list_density,
  ).toBe(12);
  await info.attach('session-expired', { body: await page.screenshot(), contentType: 'image/png' });
});
