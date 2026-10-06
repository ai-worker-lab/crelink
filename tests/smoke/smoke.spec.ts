// 실행 중인 API·웹의 최소 동작을 확인합니다. 기준 문서: docs/development/verification.md
// API 경로와 응답 형식의 기준은 packages/shared/src/index.ts(API_PATHS, HealthResponse, ReadinessResponse)입니다.
// 웹 검사는 특정 화면 문구에 기대지 않는 불변 조건(200 응답, 내용 렌더링, 콘솔 오류 없음, 가로 넘침 없음)만 확인합니다.
// 화면별 시나리오와 웹→API 연결은 기능의 통합 티켓이 E2E로 확인합니다(docs/specs/README.md).
import { expect, test, type Page } from '@playwright/test';

const apiUrl = (process.env.API_URL ?? '').replace(/\/$/, '');

test('API liveness: GET /api/health가 200과 { status: "ok" }를 반환한다', async ({ request }) => {
  const response = await request.get(`${apiUrl}/api/health`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('API readiness: GET /api/health/ready가 200과 { status: "ready" }를 반환한다', async ({ request }) => {
  const response = await request.get(`${apiUrl}/api/health/ready`);
  expect(response.status(), 'DB에 연결되지 않으면 503입니다. API의 DATABASE_URL과 DB 상태를 확인하세요.').toBe(200);
  expect(await response.json()).toEqual({ status: 'ready' });
});

async function openFirstScreen(page: Page) {
  const response = await page.goto('/');
  expect(response?.status(), '웹 첫 화면 응답').toBe(200);
  await expect(page.locator('body'), '첫 화면에 보이는 내용이 없습니다').not.toBeEmpty();
}

test('웹 첫 화면이 렌더링되고 콘솔 오류가 없다', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await openFirstScreen(page);
  await page.waitForLoadState('networkidle');
  expect(errors, '브라우저 콘솔 오류').toEqual([]);
});

for (const { name, width, height } of [
  { name: '데스크톱', width: 1280, height: 800 },
  { name: '모바일', width: 390, height: 844 },
]) {
  test(`${name} 폭 ${width}px에서 가로 넘침이 없다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openFirstScreen(page);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `문서 폭 ${scrollWidth}px이 화면 폭 ${clientWidth}px보다 넓습니다`).toBeLessThanOrEqual(
      clientWidth,
    );
  });
}
