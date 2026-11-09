// ego-browser 런타임 안에서 쓰는 보조 함수. 이 파일은 Playwright를 쓰지 않으며 ego의 Page API와 page.cdp만 씁니다.
// 쿠키는 프로필 전체가 아니라 대상 URL 범위로만 읽고 지웁니다(Network.clearBrowserCookies 금지).
/* global console, document, navigator, performance, requestAnimationFrame, setTimeout, CSSStyleSheet, URL */
export const EXPECT_TIMEOUT = 15_000;
export const NAVIGATION_TIMEOUT = 90_000;
export const NETWORK_IDLE = { timeout: 30_000, idleMs: 500 };
const SESSION_COOKIE = 'cl_session';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** 시나리오를 멈춰야 하는 실패. 뷰포트별 측정처럼 계속 볼 수 있는 실패는 Report.record로 남깁니다. */
export class CheckFailure extends Error {}

export class Report {
  passed = 0;
  failed = 0;
  failures = [];

  record(scope, ok, detail) {
    if (ok) this.passed += 1;
    else {
      this.failed += 1;
      this.failures.push(`${scope} ${detail}`);
    }
    console.log(`${ok ? 'PASS' : 'FAIL'} ${scope} ${detail}`);
    return ok;
  }

  /** 앞 단계가 성립해야 뒤 단계가 의미 있는 검사입니다. 실패하면 이 시나리오를 멈춥니다. */
  must(scope, ok, detail) {
    if (!this.record(scope, ok, detail)) throw new CheckFailure(`${scope} ${detail}`);
  }
}

/** Playwright expect.poll과 같은 15초 재시도. 이동 중의 평가 오류는 아직 조건이 안 된 것으로 봅니다. */
export async function poll(read, accept, { timeout = EXPECT_TIMEOUT, interval = 150 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await read();
      if (accept(last)) return { ok: true, value: last };
    } catch (error) {
      last = `오류: ${error.message.split('\n')[0]}`;
    }
    if (Date.now() >= deadline) return { ok: false, value: last };
    await sleep(interval);
  }
}

/** Playwright page.setViewportSize와 같은 값의 CDP 호출. clientWidth가 바뀔 때까지 기다립니다. */
export async function setViewport(page, emulation, width, height) {
  const landscape = width > height;
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: emulation.deviceScaleFactor,
    mobile: emulation.mobile,
    screenWidth: width,
    screenHeight: height,
    screenOrientation: emulation.mobile
      ? { angle: landscape ? 90 : 0, type: landscape ? 'landscapePrimary' : 'portraitPrimary' }
      : { angle: 0, type: 'landscapePrimary' },
  });
  await page.waitForFunction((expected) => document.documentElement.clientWidth === expected, width, {
    timeout: 5_000,
  });
}

/** Playwright 컨텍스트 설정(isMobile·hasTouch·userAgent)에 대응합니다. 이 설정은 ego 런타임 프로세스 안에서만 유지됩니다. */
export async function applyDevice(page, emulation, width, height) {
  await page.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.cdp('Emulation.setTouchEmulationEnabled', {
    enabled: emulation.hasTouch,
    maxTouchPoints: emulation.hasTouch ? 5 : 1,
  });
  await page.cdp('Emulation.setUserAgentOverride', { userAgent: emulation.userAgent });
  await setViewport(page, emulation, width, height);
}

export const browserUserAgent = (page) => page.evaluate(() => navigator.userAgent);

const cookieUrls = (config) => [config.webUrl, config.apiUrl];

export async function listLocalCookies(page, config) {
  const { cookies } = await page.cdp('Network.getCookies', { urls: cookieUrls(config) });
  return cookies;
}

/** 대상 주소의 쿠키만 지웁니다. 같은 프로필의 다른 사이트 세션은 건드리지 않습니다. */
export async function clearLocalCookies(page, config) {
  for (const cookie of await listLocalCookies(page, config)) {
    await page.cdp('Network.deleteCookies', { name: cookie.name, domain: cookie.domain, path: cookie.path });
  }
}

export async function clearOriginStorage(page, config) {
  await page.cdp('Storage.clearDataForOrigin', {
    origin: new URL(config.webUrl).origin,
    storageTypes: 'local_storage,indexeddb,cache_storage,service_workers',
  });
}

export async function setSessionCookie(page, config, sessionToken) {
  await page.cdp('Network.setCookie', {
    name: SESSION_COOKIE,
    value: sessionToken,
    domain: new URL(config.webUrl).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
}

/** 탭 대상. Playwright tap과 같이 화면 안으로 옮긴 뒤 요소 중심에 터치 입력을 보냅니다. */
export async function tap(page, target) {
  const point = await page.evaluate(({ selector, text }) => {
    const matches = [...document.querySelectorAll(selector)].filter(
      (node) => text === undefined || node.textContent.trim() === text,
    );
    if (matches.length !== 1) return { count: matches.length };
    matches[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rect = matches[0].getBoundingClientRect();
    return { count: 1, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, target);
  if (point.count !== 1) throw new CheckFailure(`탭 대상 ${JSON.stringify(target)}: ${point.count}개 일치`);
  await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
  await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * ego-lite 탭은 창이 가려지면 합성이 멈춰 rAF가 약 1.4fps로 떨어지고(0206 실측), 키보드 부드러운 스크롤 같은 프레임 기반 동작이 진행되지 않습니다.
 * 화면 캡처 소비자가 있으면 합성이 계속되므로 가장 작은 screencast를 켜 둡니다. 프레임 자체는 쓰지 않습니다.
 */
export const startFramePump = (page) =>
  page.cdp('Page.startScreencast', { format: 'jpeg', quality: 1, everyNthFrame: 1, maxWidth: 64, maxHeight: 64 });

export const stopFramePump = (page) => page.cdp('Page.stopScreencast');

/** 500ms 동안의 rAF 횟수. 프레임 기반 검사의 전제를 시나리오마다 확인합니다. */
export const framesPerHalfSecond = (page) =>
  page.evaluate(
    () =>
      new Promise((done) => {
        let frames = 0;
        const started = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - started < 500) requestAnimationFrame(tick);
          else done(frames);
        };
        requestAnimationFrame(tick);
        setTimeout(() => done(frames), 2_000);
      }),
  );

/** 변이 검사용 CSS를 새 문서마다 붙입니다. adoptedStyleSheets는 DOM을 바꾸지 않아 hydration에 영향이 없습니다. */
export async function injectCss(page, css) {
  const source = `(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(${JSON.stringify(css)});
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  })();`;
  await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source });
  await page.evaluate((text) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, css);
}

export const injectedSheetCount = (page) => page.evaluate(() => document.adoptedStyleSheets.length);

/** 앱 콘솔 오류 수집. fixtures.ts watch와 같은 규칙이며 외부 사이트 리소스 실패만 뺍니다. */
export class ConsoleWatch {
  constructor(page, config) {
    this.page = page;
    this.origins = new Set([new URL(config.webUrl).origin, new URL(config.apiUrl).origin]);
  }

  async start() {
    await this.page.cdp('egoAutomated.disable');
    await this.page.cdp('Runtime.enable');
    await this.page.cdp('Log.enable');
    await this.page.events();
  }

  isLocal(url) {
    try {
      return this.origins.has(new URL(url).origin) || url.startsWith('data:');
    } catch {
      return false;
    }
  }

  /** 지난 호출 이후의 콘솔 문제와 로컬 밖으로 나간 요청을 돌려주고 버퍼를 비웁니다. */
  async drain() {
    const problems = [];
    const external = new Set();
    const events = await this.page.events();
    for (const event of events) {
      const params = event.params ?? {};
      if (event.method === 'Network.requestWillBeSent') {
        const target = params.request?.url ?? '';
        if (/^https?:/.test(target) && !this.isLocal(target)) external.add(target);
      } else if (event.method === 'Runtime.exceptionThrown') {
        problems.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception');
      } else if (event.method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        problems.push((params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' '));
      } else if (event.method === 'Log.entryAdded' && params.entry?.level === 'error') {
        const { text, url } = params.entry;
        if (text.startsWith('Failed to load resource') && url && !this.isLocal(url)) continue;
        problems.push(`${text} ${url ?? ''}`.trim());
      }
    }
    return { problems, external: [...external], eventCount: events.length };
  }
}
