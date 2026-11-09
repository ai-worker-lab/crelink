// tests/e2e/analytics-responsive.spec.ts의 chromium 경로를 ego-browser Page API로 옮긴 시나리오. ego-browser 런타임에서만 실행됩니다.
// 원본과 다른 점: 두 날짜 입력의 좌우 네 변을 모두 카드와 비교합니다(원본 68행은 from.left와 to.right만 봐서 세로 배치의 넘침을 놓칩니다).
/* global console, document, getComputedStyle, window, fetch, URL */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  applyDevice,
  browserUserAgent,
  clearSessionCookie,
  ConsoleWatch,
  framesPerHalfSecond,
  injectCss,
  injectedSheetCount,
  NAVIGATION_TIMEOUT,
  NETWORK_IDLE,
  poll,
  RecordedFailure,
  Report,
  SESSION_COOKIE,
  sessionCookies,
  setSessionCookie,
  setViewport,
  startFramePump,
  stopFramePump,
  tap,
} from './lib/browser.mjs';

const FILTERS = 'section[aria-label="조회 조건"]';
const RECENT = '[role="region"][aria-label="최근 일별 데이터 가로 스크롤"]';
const OLDER = '[role="region"][aria-label="이전 일별 데이터 가로 스크롤"]';
const PIXEL_7_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';
const MOBILE = { mobile: true, hasTouch: true, deviceScaleFactor: 2.625, userAgent: PIXEL_7_USER_AGENT };
// React가 '이전 ', 23, '일 데이터 보기'를 별도 텍스트 노드로 렌더링해 ego의 quoted text= 는 일치하지 않습니다. :text-is는 요소 전체 글자를 정확히 비교합니다.
const OLDER_TOGGLE = 'summary:text-is("이전 23일 데이터 보기")';
const MOBILE_SIZES = [
  [320, 740],
  [360, 800],
  [390, 844],
  [700, 844],
  [701, 844],
  [768, 1024],
  [844, 390],
];
// 시나리오가 끝까지 돌았을 때의 검사 수. 예외가 기록되지 않거나 단계가 조용히 건너뛰어지면 이 수를 밑돕니다.
const MIN_CHECKS = { 'creator/metrics': 34, 'creator/stats': 33, 'operator/metrics': 36, 'operator/stats': 35 };

const stamp = (from, to) => `from=${from}&to=${to}`;

/** 원본의 fits/separate 측정. legacyFits는 변이 검사에서 원본 조건이 놓치는지 비교하려고 함께 냅니다. */
const measureBounds = (page) =>
  page.evaluate((scope) => {
    const node = document.querySelector(scope);
    const from = node.querySelector('[name="from"]').getBoundingClientRect();
    const to = node.querySelector('[name="to"]').getBoundingClientRect();
    const card = node.getBoundingClientRect();
    const inside = (box) => box.left >= card.left && box.right <= card.right;
    return {
      fits: inside(from) && inside(to),
      legacyFits: from.left >= card.left && to.right <= card.right,
      separate: from.bottom <= to.top || from.right <= to.left,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      card: [card.left, card.right],
      from: [from.left, from.right],
      to: [to.left, to.right],
    };
  }, FILTERS);

/** getByRole('status')처럼 숨겨지지 않은 status 요소를 전부 읽습니다. 원본의 strict 동작에 맞춰 호출자가 1개인지 확인합니다. */
const statusTexts = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="status"], output')]
      .filter(
        (node) =>
          node.getClientRects().length > 0 &&
          getComputedStyle(node).visibility !== 'hidden' &&
          !node.closest('[aria-hidden="true"]'),
      )
      .map((node) => node.textContent.trim()),
  );
const countOf = (page, selector) => page.evaluate((target) => document.querySelectorAll(target).length, selector);
const filterLinkCurrent = (page, name) =>
  page.evaluate(
    ({ scope, label }) => {
      const links = [...document.querySelectorAll(`${scope} a`)].filter((node) => node.textContent.trim() === label);
      return links.length === 1 ? links[0].getAttribute('aria-current') : `일치 ${links.length}개`;
    },
    { scope: FILTERS, label: name },
  );

async function pageViews(config, creator) {
  const { from, to } = config.ranges.recent30;
  const response = await fetch(`${config.apiUrl}/api/me/analytics?${stamp(from, to)}`, {
    headers: { cookie: `cl_session=${creator.sessionToken}` },
  });
  return response.ok ? (await response.json()).summary.pageViews : 0;
}

async function waitForApp(page, url) {
  await page.goto(url, { timeout: NAVIGATION_TIMEOUT });
  await page.waitForLoadState('networkidle', NETWORK_IDLE);
}

async function runScenario({ page, config, report, watch, desktop }, scenario) {
  const { role, mode, creator, user } = scenario;
  const name = `${role}/${mode}`;
  const scope = `${name}/chromium`;
  const { recent30 } = config.ranges;
  const shot = (file) => join(config.outputDir, `${role}-${mode}-${file}.png`);
  const must = (ok, detail) => report.must(scope, ok, detail);

  // Playwright의 독립 context 대신 같은 프로필에서 순서대로 익명 방문 → 사용자 세션으로 전환합니다. 앱이 심은 다른 쿠키는 지우지 않습니다.
  await clearSessionCookie(page, config);
  await applyDevice(page, desktop, 1280, 800);
  await page.goto(creator.landingUrl, { timeout: NAVIGATION_TIMEOUT });
  const views = await poll(
    () => pageViews(config, creator),
    (value) => value > 0,
  );
  must(views.ok, `실수집 페이지뷰 ${JSON.stringify(views.value)} > 0`);

  must((await framesPerHalfSecond(page)) >= 10, '브라우저 프레임 생산 500ms당 10회 이상');
  await setSessionCookie(page, config, user.sessionToken);
  await applyDevice(page, MOBILE, 390, 844);
  const base = role === 'creator' ? `/me/landings/${creator.publicId}/${mode}` : `/admin/${mode}`;
  const selection = role === 'operator' ? `?creatorId=${creator.userId}&includeExcluded=1` : '';
  const url = `${config.webUrl}${base}${selection}`;
  await waitForApp(page, url);
  const headingName = mode === 'metrics' ? '지표' : '통계';
  await page.waitForSelector(`loc=role:heading[name='${headingName}']`, { state: 'visible', timeout: 15_000 });
  report.record(scope, true, `제목 '${headingName}' 표시`);

  const inputHeights = await page.evaluate(
    (target) =>
      [
        ...document.querySelectorAll(`${target} input:not([type="hidden"]):not([type="checkbox"]), ${target} select`),
      ].map((node) => node.getBoundingClientRect().height),
    FILTERS,
  );
  must(
    inputHeights.length > 0 && inputHeights.every((height) => height >= 44),
    `입력 높이 ${inputHeights.join(',')} >= 44`,
  );
  must((await filterLinkCurrent(page, '최근 30일')) === 'date', '최근 30일 aria-current=date');

  for (const [width, height] of MOBILE_SIZES) {
    await setViewport(page, MOBILE, width, height);
    const label = `${scope}/${width}x${height}`;
    const bounds = await measureBounds(page);
    const detail = `overflow=${bounds.overflow} fits=${bounds.fits} legacyFits=${bounds.legacyFits} separate=${bounds.separate} card=${bounds.card} from=${bounds.from} to=${bounds.to}`;
    report.record(label, bounds.overflow <= 0 && bounds.fits && bounds.separate, detail);
  }

  await setViewport(page, MOBILE, 390, 844);
  if (mode === 'metrics') await page.click('text="일별 데이터 표 보기"');
  const rows = await poll(
    () => countOf(page, `${RECENT} tbody tr`),
    (value) => value === 7,
  );
  must(rows.ok, `최근 표 ${rows.value}행 = 7`);
  const dates = await page.evaluate(
    (target) => [...document.querySelectorAll(`${target} tbody th`)].map((node) => node.textContent),
    RECENT,
  );
  must(JSON.stringify(dates) === JSON.stringify([...dates].sort().reverse()), `최근 날짜 내림차순 ${dates[0]}…`);
  must(dates[0] === recent30.to, `첫 행 ${dates[0]} = ${recent30.to}`);
  const nowrap = await page.evaluate(
    (target) => getComputedStyle(document.querySelector(`${target} tbody th`)).whiteSpace,
    RECENT,
  );
  must(nowrap === 'nowrap', `날짜 열 white-space=${nowrap}`);

  await page.focus(RECENT);
  await page.keyboard.press('ArrowRight');
  const scrolled = await poll(
    () => page.evaluate((target) => document.querySelector(target).scrollLeft, RECENT),
    (value) => value > 0,
  );
  must(scrolled.ok, `키보드 가로 스크롤 scrollLeft=${scrolled.value}`);
  const stickyGap = await page.evaluate((target) => {
    const scroller = document.querySelector(target);
    return Math.abs(scroller.querySelector('tbody th').getBoundingClientRect().x - scroller.getBoundingClientRect().x);
  }, RECENT);
  must(stickyGap < 3, `고정 열 간격 ${stickyGap}px < 3`);
  await page.evaluate((target) => {
    document.querySelector(target).scrollLeft = 0;
  }, RECENT);

  await page.click(OLDER_TOGGLE);
  const olderRows = await poll(
    () => countOf(page, `${OLDER} tbody tr`),
    (value) => value === 23,
  );
  must(olderRows.ok, `이전 표 ${olderRows.value}행 = 23`);
  await page.click(OLDER_TOGGLE);

  await page.waitForSelector('.analytics-chart-dates', { state: 'visible', timeout: 15_000 });
  const chartFont = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.analytics-chart-dates')).fontSize),
  );
  must(chartFont >= 12, `차트 날짜 글자 ${chartFont}px >= 12`);
  const linkHeights = await page.evaluate(
    (target) => [...document.querySelectorAll(`${target} a`)].map((node) => node.getBoundingClientRect().height),
    FILTERS,
  );
  must(
    linkHeights.length > 0 && linkHeights.every((height) => height >= 44),
    `기간 링크 높이 ${linkHeights.join(',')} >= 44`,
  );
  if (mode === 'metrics') {
    const order = await page.evaluate(
      () =>
        document
          .querySelector('#analytics-summary-title')
          .compareDocumentPosition(document.querySelector('.analytics-coverage')) & 4,
    );
    must(order === 4, '요약 제목이 수집 범위 안내보다 앞');
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: shot('mobile-top') });
  await page.screenshot({ path: shot('mobile-full'), fullPage: true });
  const widthAfterShot = await page.evaluate(() => document.documentElement.clientWidth);
  must(widthAfterShot === 390, `전체 화면 캡처 뒤 폭 유지 ${widthAfterShot}`);

  const presetSelector = config.fault === 'missing-tap-target' ? `${FILTERS} a.ego-no-such-target` : `${FILTERS} a`;
  await tap(page, { selector: presetSelector, text: '최근 7일' });
  const preset = await poll(
    () => filterLinkCurrent(page, '최근 7일'),
    (value) => value === 'date',
  );
  must(preset.ok, `터치로 최근 7일 선택 aria-current=${preset.value}`);
  if (role === 'operator') {
    const params = new URL(await page.url()).searchParams;
    must(params.get('creatorId') === creator.userId, '기간 이동 뒤 creatorId 유지');
    const included = await poll(
      () =>
        page.evaluate((target) => document.querySelector(`${target} input[name="includeExcluded"]`).checked, FILTERS),
      (value) => value === true,
    );
    must(included.ok, '시험 계정 포함 유지');
  }

  await page.fill('#analytics-from', '2020-01-01');
  await page.fill('#analytics-to', '2020-01-02');
  await tap(page, { selector: `${FILTERS} .period-form button[type="submit"]`, text: '조회' });
  const empty = await poll(
    () => statusTexts(page),
    (value) => value.length === 1 && value[0].includes('수집된 페이지 표시가 없어요'),
  );
  must(empty.ok, `빈 기간 안내(status 1개) ${JSON.stringify(empty.value)}`);
  must((await countOf(page, '.analytics-trend')) === 0, '빈 기간 차트 없음');
  must((await countOf(page, `${FILTERS} [aria-current="date"]`)) === 0, '빈 기간 빠른 선택 해제');
  await page.waitForLoadState('networkidle', NETWORK_IDLE);

  await page.goto(
    `${config.webUrl}${base}?from=2026-11-06&to=2026-11-05${role === 'operator' ? `&creatorId=${creator.userId}` : ''}`,
    {
      timeout: NAVIGATION_TIMEOUT,
    },
  );
  await page.waitForSelector('text="조회 조건을 확인해 주세요."', { state: 'visible', timeout: 15_000 });
  report.record(scope, true, '잘못된 기간 안내 표시');
  await page.click("loc=role:link[name='조회 조건 초기화']");
  await page.waitForSelector(FILTERS, { state: 'visible', timeout: 15_000 });
  const reset = await poll(
    async () => {
      const current = new URL(await page.url());
      const values = await page.evaluate(
        (target) => [
          document.querySelector(`${target} [name="from"]`).value,
          document.querySelector(`${target} [name="to"]`).value,
        ],
        FILTERS,
      );
      return { path: current.pathname, hasFrom: current.searchParams.has('from'), values };
    },
    (value) =>
      value.path === base && !value.hasFrom && value.values[0] === recent30.from && value.values[1] === recent30.to,
  );
  must(reset.ok, `초기화 뒤 ${JSON.stringify(reset.value)}`);

  await applyDevice(page, desktop, 1440, 900);
  await waitForApp(page, url);
  for (const width of [1280, 1440]) {
    await setViewport(page, desktop, width, 900);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    report.record(`${scope}/${width}x900`, overflow <= 0, `overflow=${overflow}`);
  }
  await page.screenshot({ path: shot('desktop-top') });
  await page.screenshot({ path: shot('desktop-full'), fullPage: true });

  const observed = await watch.drain();
  // 이벤트가 하나도 없으면 아래 두 검사는 아무것도 보지 못한 것이므로 실패로 봅니다.
  report.record(scope, observed.eventCount > 0, `CDP 이벤트 수집 ${observed.eventCount}건`);
  report.record(
    scope,
    observed.problems.length === 0,
    `콘솔 오류 ${observed.problems.length}건 ${observed.problems.join(' | ').slice(0, 800)}`,
  );
  report.record(
    scope,
    observed.external.length === 0,
    `로컬 밖 요청 ${observed.external.length}건 ${observed.external.join(' | ').slice(0, 800)}`,
  );
}

/** ego-browser 스크립트의 진입점. 종료 코드를 돌려줍니다. */
export async function run({ taskSpace, config }) {
  const started = Date.now();
  const report = new Report();
  await mkdir(config.outputDir, { recursive: true });
  const task = await taskSpace(config.taskSpaceName);
  let page;
  try {
    // 새 TaskSpace의 p1은 chrome://newtab에서 시작합니다. 그 문서의 끝나지 않은 요청이 ego의 networkidle 추적에 남아 실행 내내 대기가 실패하므로
    // (0206 반복 실행에서 8회 중 3회 재현) 요청 이력이 없는 빈 탭에서 시작합니다. p1은 finish가 닫습니다.
    page = await task.newPage();
    console.log(`[ego] TaskSpace ${task.spaceId} (${config.scenarios.length}개 시나리오)`);
    if (config.fault === 'outside-scenario') throw new Error('EGO_TEST_FAULT로 일으킨 시나리오 밖 예외');
    await page.goto(config.webUrl, { timeout: NAVIGATION_TIMEOUT });
    const desktop = { mobile: false, hasTouch: false, deviceScaleFactor: 1, userAgent: await browserUserAgent(page) };
    const watch = new ConsoleWatch(page, config);
    await watch.start();
    await startFramePump(page);
    if (config.injectCss) {
      await injectCss(page, config.injectCss);
      console.log(`[ego] CSS 주입 ${await injectedSheetCount(page)}개 적용`);
    }

    for (const scenario of config.scenarios) {
      const name = `${scenario.role}/${scenario.mode}`;
      const scenarioStarted = Date.now();
      const checksBefore = report.passed + report.failed;
      try {
        await runScenario({ page, config, report, watch, desktop }, scenario);
      } catch (error) {
        if (!(error instanceof RecordedFailure)) {
          report.record(`${name}/chromium`, false, `시나리오 오류: ${error.message}`);
        }
        await page
          .screenshot({ path: join(config.outputDir, `${scenario.role}-${scenario.mode}-failure.png`) })
          .catch(() => {});
        await watch.drain().catch(() => {});
      }
      const checks = report.passed + report.failed - checksBefore;
      report.record(`${name}/chromium`, checks >= MIN_CHECKS[name], `검사 ${checks}개 >= 최소 ${MIN_CHECKS[name]}개`);
      console.log(`[ego] ${name} ${((Date.now() - scenarioStarted) / 1000).toFixed(1)}s`);
    }
  } catch (error) {
    report.record('run', false, `실행 오류: ${error.message}`);
  } finally {
    await releaseBrowser({ task, page, config, report });
  }

  const seconds = (Date.now() - started) / 1000;
  console.log(`[ego] 결과: 통과 ${report.passed}, 실패 ${report.failed}, ${seconds.toFixed(1)}s`);
  for (const failure of report.failures) console.log(`[ego] 실패: ${failure}`);
  await mkdir(dirname(config.resultPath), { recursive: true });
  await writeFile(
    config.resultPath,
    JSON.stringify({ passed: report.passed, failed: report.failed, failures: report.failures, seconds }, null, 2),
  );
  return report.failed === 0 ? 0 : 1;
}

/** 어떤 경로로 끝나든 세션 쿠키와 TaskSpace를 정리합니다. 정리 실패는 실패로 보고하되 나머지 정리를 막지 않습니다. */
async function releaseBrowser({ task, page, config, report }) {
  if (page) {
    await stopFramePump(page).catch(() => {});
    try {
      await clearSessionCookie(page, config);
      const remaining = await sessionCookies(page, config);
      report.record('cleanup', remaining.length === 0, `남은 ${SESSION_COOKIE} ${remaining.length}개`);
    } catch (error) {
      report.record('cleanup', false, `세션 쿠키 정리 실패: ${error.message}`);
    }
  }
  try {
    await task.finish({ keep: [] });
  } catch (error) {
    report.record('cleanup', false, `TaskSpace 정리 실패: ${error.message}`);
  }
}
