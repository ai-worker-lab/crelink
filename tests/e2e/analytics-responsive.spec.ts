// 0196: 실제 localhost API·합성 계정으로 날짜·표·차트·조회 조건과 공통 네 화면을 확인합니다.
import { devices } from '@playwright/test';
import { recentRange } from '../../apps/web/src/lib/format';
import { API_URL, expect, expectNoHorizontalOverflow, test } from './fixtures';

for (const role of ['creator', 'operator'] as const) {
  for (const mode of ['metrics', 'stats'] as const) {
    test(`${role} ${mode}: 모바일 입력·최근 표·가로 이동·기간 조회·데스크톱`, async ({
      data,
      browserName,
    }, testInfo) => {
      const creator = await data.user({ displayName: '반응형 검수 크리에이터' });
      const user = role === 'operator' ? await data.user({ role: 'operator' }) : creator;
      const mobile =
        browserName === 'webkit'
          ? devices['iPhone 13 Pro']
          : browserName === 'chromium'
            ? devices['Pixel 7']
            : { ...devices['Desktop Firefox'], hasTouch: true };
      const { page } = await data.session(user, { ...mobile, viewport: { width: 390, height: 844 } });
      const owner = role === 'operator' ? await data.session(creator) : { page };
      const visitor = await data.session();
      await visitor.page.goto(creator.landingUrl);
      // 실수집 경로에서 생성된 한 페이지뷰. 운영 자료나 가짜 API 응답을 사용하지 않습니다.
      await expect
        .poll(async () => {
          const response = await owner.page.request.get(
            `${API_URL}/api/me/analytics?from=${recentRange(30).from}&to=${recentRange(30).to}`,
          );
          return response.ok() ? (await response.json()).summary.pageViews : 0;
        })
        .toBeGreaterThan(0);

      const base = role === 'creator' ? `/me/landings/${creator.publicId}/${mode}` : `/admin/${mode}`;
      const selection = role === 'operator' ? `?creatorId=${creator.userId}&includeExcluded=1` : '';
      const url = `${base}${selection}`;
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('heading', { name: mode === 'metrics' ? '지표' : '통계', exact: true }),
      ).toBeVisible();
      const filters = page.getByRole('region', { name: '조회 조건', exact: true });
      for (const input of await filters.locator('input:not([type="hidden"]):not([type="checkbox"]), select').all()) {
        expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(filters.getByRole('link', { name: '최근 30일', exact: true })).toHaveAttribute(
        'aria-current',
        'date',
      );

      // 같은 context에서 CSS 경계를 확인합니다. Firefox는 데스크톱 엔진의 touch/viewport 검사입니다.
      for (const [width, height] of [
        [320, 740],
        [360, 800],
        [390, 844],
        [700, 844],
        [701, 844],
        [768, 1024],
        [844, 390],
      ]) {
        await page.setViewportSize({ width, height });
        await expectNoHorizontalOverflow(page, `${role}/${mode}/${browserName}/${width}`);
        const bounds = await filters.evaluate((node) => {
          const from = node.querySelector<HTMLInputElement>('[name="from"]')!.getBoundingClientRect();
          const to = node.querySelector<HTMLInputElement>('[name="to"]')!.getBoundingClientRect();
          const card = node.getBoundingClientRect();
          return {
            fits: from.left >= card.left && to.right <= card.right,
            separate: from.bottom <= to.top || from.right <= to.left,
          };
        });
        expect(bounds).toEqual({ fits: true, separate: true });
      }

      await page.setViewportSize({ width: 390, height: 844 });
      if (mode === 'metrics') await page.getByText('일별 데이터 표 보기', { exact: true }).click();
      const recent = page.getByRole('region', { name: '최근 일별 데이터 가로 스크롤', exact: true });
      await expect(recent.locator('tbody tr')).toHaveCount(7);
      const dates = await recent.locator('tbody th').allTextContents();
      expect(dates).toEqual([...dates].sort().reverse());
      expect(dates[0]).toBe(recentRange(30).to);
      expect(
        await recent
          .locator('tbody th')
          .first()
          .evaluate((node) => getComputedStyle(node).whiteSpace),
      ).toBe('nowrap');
      await recent.focus();
      // iOS 조건의 WebKit은 물리 키보드 스크롤을 제공하지 않아 내부 scroll/고정 열을 검사합니다.
      if (browserName === 'webkit') await recent.evaluate((node) => node.scrollBy(240, 0));
      else await page.keyboard.press('ArrowRight');
      await expect.poll(() => recent.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      const sticky = await recent.locator('tbody th').first().boundingBox();
      const scroll = await recent.boundingBox();
      expect(Math.abs(sticky!.x - scroll!.x)).toBeLessThan(3);
      await recent.evaluate((node) => {
        node.scrollLeft = 0;
      });
      const older = page.getByText('이전 23일 데이터 보기', { exact: true });
      await older.click();
      await expect(page.getByRole('region', { name: '이전 일별 데이터 가로 스크롤' }).locator('tbody tr')).toHaveCount(
        23,
      );
      await older.click();
      const labels = page.locator('.analytics-chart-dates');
      await expect(labels).toBeVisible();
      expect(await labels.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
      for (const link of await filters.getByRole('link').all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      if (mode === 'metrics') {
        expect(
          (await page
            .locator('#analytics-summary-title')
            .evaluate((node) => node.compareDocumentPosition(document.querySelector('.analytics-coverage')!))) & 4,
        ).toBe(4);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath('mobile-top.png'), caret: 'initial' });
      await page.screenshot({ path: testInfo.outputPath('mobile-full.png'), fullPage: true, caret: 'initial' });

      await filters.getByRole('link', { name: '최근 7일', exact: true }).tap();
      await expect(filters.getByRole('link', { name: '최근 7일', exact: true })).toHaveAttribute(
        'aria-current',
        'date',
      );
      if (role === 'operator') {
        expect(new URL(page.url()).searchParams.get('creatorId')).toBe(creator.userId);
        await expect(filters.getByLabel('시험 계정 포함')).toBeChecked();
      }
      await filters.getByLabel('시작일', { exact: true }).fill('2020-01-01');
      await filters.getByLabel('종료일', { exact: true }).fill('2020-01-02');
      await filters.getByRole('button', { name: '조회', exact: true }).tap();
      await expect(page.getByRole('status')).toContainText('수집된 페이지 표시가 없어요');
      await expect(page.locator('.analytics-trend')).toHaveCount(0);
      await expect(filters.locator('[aria-current="date"]')).toHaveCount(0);
      // 다음 독립 URL 검사로 강제 이동하기 전에 현 문서의 prefetch가 끝나야 WebKit이 이를 취소하지 않습니다.
      await page.waitForLoadState('networkidle');
      await page.goto(
        `${base}?from=2026-11-06&to=2026-11-05${role === 'operator' ? `&creatorId=${creator.userId}` : ''}`,
      );
      await expect(page.getByText('조회 조건을 확인해 주세요.', { exact: true })).toBeVisible();
      // 잘못된 기간 화면의 요청도 초기화 탐색 전에 완료시켜 두 검사를 분리합니다.
      await page.waitForLoadState('networkidle');
      await page.getByRole('link', { name: '조회 조건 초기화', exact: true }).click();
      await expect(filters).toBeVisible();

      const desktopName =
        browserName === 'webkit' ? 'Desktop Safari' : browserName === 'firefox' ? 'Desktop Firefox' : 'Desktop Chrome';
      const desktop = await data.session(user, { ...devices[desktopName], viewport: { width: 1440, height: 900 } });
      await desktop.page.goto(url);
      await desktop.page.waitForLoadState('networkidle');
      for (const width of [1280, 1440]) {
        await desktop.page.setViewportSize({ width, height: 900 });
        await expectNoHorizontalOverflow(desktop.page, `${role}/${mode}/${browserName}/${width}`);
      }
      await desktop.page.screenshot({ path: testInfo.outputPath('desktop-top.png'), caret: 'initial' });
      await desktop.page.screenshot({
        path: testInfo.outputPath('desktop-full.png'),
        fullPage: true,
        caret: 'initial',
      });
      await testInfo.attach('environment', {
        body: JSON.stringify({
          role,
          mode,
          browserName,
          version: desktop.page.context().browser()!.version(),
          host: process.platform,
          mobile: {
            isMobile: mobile.isMobile ?? false,
            userAgent: await page.evaluate(() => navigator.userAgent),
            deviceScaleFactor: await page.evaluate(() => devicePixelRatio),
          },
          widths: [320, 360, 390, 700, 701, 768, 844, 1280, 1440],
        }),
        contentType: 'application/json',
      });
    });
  }
}
