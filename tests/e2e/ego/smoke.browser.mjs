// tests/smoke/smoke.spec.ts를 ego-browser Page API로 옮긴 시나리오. ego-browser 런타임에서만 실행됩니다.
// 원본과 다른 점: 보이는 글자가 있는지 봅니다(원본 not.toBeEmpty는 숨긴 글자도 통과). 로컬 밖 요청 0건을 추가로 봅니다(ego에는 Playwright route가 없음).
/* global document, fetch */
import { applyDevice, clearSessionCookie, NAVIGATION_TIMEOUT, poll, setViewport } from './lib/browser.mjs';
import { runSuite } from './lib/suite.mjs';

// 시나리오가 끝까지 돌았을 때의 검사 수. 예외가 기록되지 않거나 단계가 조용히 건너뛰어지면 이 수를 밑돕니다.
const MIN_CHECKS = {
  'api/liveness': 2,
  'api/readiness': 2,
  'web/first-screen': 6,
  'web/desktop-1280': 3,
  'web/mobile-390': 3,
};

async function checkHealth({ config, must }, path, expected) {
  const response = await fetch(`${config.apiUrl}${path}`);
  must(response.status === 200, `GET ${path} ${response.status} = 200`);
  const body = await response.json();
  must(JSON.stringify(body) === JSON.stringify(expected), `응답 본문 ${JSON.stringify(body)}`);
}

async function openFirstScreen({ page, config, watch, must, report, name }) {
  await watch.clearDocumentChains();
  await page.goto(`${config.webUrl}/`, { timeout: NAVIGATION_TIMEOUT });
  const status = (await watch.documentChains()).at(-1)?.status;
  must(status === 200, `웹 첫 화면 응답 ${status} = 200`);
  if (config.fault === 'empty-body') await page.evaluate(() => document.body.replaceChildren());
  const text = await poll(
    // innerText는 렌더링되지 않은 요소에서 textContent를 돌려주므로 body가 실제로 보이는지 함께 봅니다.
    () =>
      page.evaluate(() =>
        document.body.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })
          ? document.body.innerText.trim().length
          : 0,
      ),
    (length) => length > 0,
  );
  report.record(name, text.ok, `첫 화면에 보이는 글자 ${text.value}자 > 0`);
}

async function checkOverflow(context, width, height) {
  const { page, desktop, report, name } = context;
  await setViewport(page, desktop, width, height);
  await openFirstScreen(context);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  report.record(name, scrollWidth <= clientWidth, `문서 폭 ${scrollWidth}px <= 화면 폭 ${clientWidth}px`);
}

async function checkConsole({ watch, report, name, must }) {
  const quiet = await watch.waitForNetworkQuiet();
  must(quiet.ok, `네트워크 안정 ${JSON.stringify(quiet.inflight).slice(0, 400)}`);
  const observed = await watch.drain();
  // 이벤트가 하나도 없으면 아래 두 검사는 아무것도 보지 못한 것이므로 실패로 봅니다.
  report.record(name, observed.eventCount > 0, `CDP 이벤트 수집 ${observed.eventCount}건`);
  report.record(
    name,
    observed.problems.length === 0,
    `브라우저 콘솔 오류 ${observed.problems.length}건 ${observed.problems.join(' | ').slice(0, 800)}`,
  );
  report.record(
    name,
    observed.external.length === 0,
    `로컬 밖 요청 ${observed.external.length}건 ${observed.external.join(' | ').slice(0, 800)}`,
  );
}

async function runScenario(context) {
  const { name, page, config, desktop } = context;
  if (name === 'api/liveness') return checkHealth(context, '/api/health', { status: 'ok' });
  if (name === 'api/readiness') return checkHealth(context, '/api/health/ready', { status: 'ready' });
  await clearSessionCookie(page, config);
  if (name === 'web/first-screen') {
    await applyDevice(page, desktop, 1280, 720);
    await openFirstScreen(context);
    return checkConsole(context);
  }
  if (name === 'web/desktop-1280') return checkOverflow(context, 1280, 800);
  if (name === 'web/mobile-390') return checkOverflow(context, 390, 844);
  throw new Error(`알 수 없는 시나리오 ${name}`);
}

export const run = ({ taskSpace, config }) =>
  runSuite({ taskSpace, config, scenarios: config.scenarios, minChecks: MIN_CHECKS, run: runScenario });
