// ego-browser 런타임 안에서 쓰는 보조 함수. 이 파일은 Playwright를 쓰지 않으며 ego의 Page API와 page.cdp만 씁니다.
// 지우는 쿠키는 이 시험이 심는 cl_session 하나뿐입니다. 같은 프로필의 다른 쿠키·저장소는 어떤 경우에도 지우지 않습니다.
/* global console, document, navigator, performance, requestAnimationFrame, setTimeout, CSSStyleSheet, URL */
export const EXPECT_TIMEOUT = 15_000;
export const NAVIGATION_TIMEOUT = 90_000;
export const NETWORK_IDLE = { timeout: 30_000, idleMs: 500 };
export const SESSION_COOKIE = 'cl_session';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Report.must만 던지는, 이미 Report에 기록된 실패. 다른 예외는 시나리오 catch가 실패로 기록합니다. */
export class RecordedFailure extends Error {}

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
    if (!this.record(scope, ok, detail)) throw new RecordedFailure(`${scope} ${detail}`);
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

/** 대상 주소에 남은 cl_session. 다른 이름의 쿠키는 결과에서 바로 버립니다. */
export async function sessionCookies(page, config) {
  const { cookies } = await page.cdp('Network.getCookies', { urls: [config.webUrl, config.apiUrl] });
  return cookies.filter((cookie) => cookie.name === SESSION_COOKIE);
}

/** 이 시험이 심는 쿠키(이름·호스트·경로가 모두 같은 것)만 지웁니다. */
export async function clearSessionCookie(page, config) {
  await page.cdp('Network.deleteCookies', {
    name: SESSION_COOKIE,
    domain: new URL(config.webUrl).hostname,
    path: '/',
  });
}

/** 쿠키 값을 읽기만 합니다. cl_vid처럼 앱이 심은 쿠키는 지우거나 바꾸지 않습니다. */
export async function readCookie(page, url, name) {
  const { cookies } = await page.cdp('Network.getCookies', { urls: [url] });
  return cookies.find((cookie) => cookie.name === name)?.value;
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
  if (point.count !== 1) throw new Error(`탭 대상 ${JSON.stringify(target)}: ${point.count}개 일치`);
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

/**
 * fixtures.ts의 context.route(외부 요청 가짜 응답)의 목적인 `네트워크로 나가지 않게`를 CDP 차단으로 옮깁니다. 이 시험의 검사는 가짜 응답 본문을 읽지 않습니다.
 * 차단은 요청을 멈추지 않아 교착이 없습니다. Fetch로 응답하면 page.goto가 load를 기다리는 동안 멈춘 하위 자원에 응답하지 못합니다(0230 실측).
 * 합성 링크 도메인만 막고, 그 밖의 외부 요청은 ConsoleWatch가 `로컬 밖 요청`으로 실패시킵니다.
 */
export const blockHosts = (page, urlPatterns) => page.cdp('Network.setBlockedURLs', { urls: urlPatterns });

/** Playwright goto의 referer와 같은 CDP 호출입니다. ego goto는 referrerPolicy를 넘기지 않아 https Referer가 http 대상에서 빠집니다. */
export async function gotoWithReferer(page, url, referrer, options = {}) {
  await page.cdp('Page.navigate', { url, referrer, referrerPolicy: 'unsafeUrl' }, { timeout: options.timeout });
  await page.waitForLoadState('load', { timeout: options.timeout });
}

/** CDP 헤더 이름은 서버가 보낸 대소문자를 유지하므로 소문자로 맞춰 찾습니다. */
const headerOf = (headers, name) => Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];

// fetch의 keepalive·sendBeacon(Ping)과 EventSource는 페이지 안정 여부와 무관하게 오래 남을 수 있습니다.
const QUIET_IGNORED_TYPES = new Set(['Ping', 'EventSource']);

/** 앱 콘솔 오류 수집. fixtures.ts watch와 같은 규칙이며 외부 사이트 리소스 실패만 뺍니다. */
export class ConsoleWatch {
  buffer = [];
  chains = new Map();
  inflight = new Map();

  constructor(page, config) {
    this.page = page;
    this.origins = new Set(
      [config.webUrl, config.apiUrl, config.shortUrl, config.aliasShortUrl]
        .filter(Boolean)
        .map((url) => new URL(url).origin),
    );
  }

  /** keepEarlier는 이미 열린 팝업에서 enable이 재생하는 지난 콘솔 기록을 남길 때 씁니다. */
  async start({ keepEarlier = false } = {}) {
    await this.page.cdp('egoAutomated.disable');
    await this.page.cdp('Runtime.enable');
    await this.page.cdp('Log.enable');
    if (!keepEarlier) await this.page.events();
  }

  isLocal(url) {
    try {
      return this.origins.has(new URL(url).origin) || url.startsWith('data:');
    } catch {
      return false;
    }
  }

  /** page.events()는 읽으면 비워지고 소비자가 둘(콘솔 검사, 문서 요청 사슬)이라 이 메서드로만 읽습니다. */
  async pull() {
    const events = await this.page.events();
    for (const event of events) {
      this.buffer.push(event);
      this.trackDocument(event);
      this.trackInflight(event);
    }
  }

  /** 새 문서로 바뀌면 이전 문서의 요청은 셀 필요가 없습니다. 전환 중 나간 beacon(Ping)은 완료 이벤트가 오지 않아 처음부터 세지 않습니다. */
  trackInflight({ method, params }) {
    if (method === 'Page.frameNavigated' && !params.frame?.parentId) {
      this.inflight.clear();
    } else if (method === 'Network.requestWillBeSent' && !QUIET_IGNORED_TYPES.has(params.type)) {
      this.inflight.set(params.requestId, params.request.url);
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      this.inflight.delete(params.requestId);
    }
  }

  /**
   * Playwright networkidle과 같이 진행 중인 요청이 idleMs 동안 0이면 끝납니다. ego의 waitForLoadState('networkidle')은 문서 전환 때 나간 beacon을
   * 진행 중으로 남겨 같은 탭의 뒤 대기까지 30초 초과로 실패시킵니다(0230 실측). 호출 결과를 must로 판정합니다.
   */
  async waitForNetworkQuiet({ timeout = NETWORK_IDLE.timeout, idleMs = NETWORK_IDLE.idleMs } = {}) {
    const deadline = Date.now() + timeout;
    let quietSince = null;
    for (;;) {
      await this.pull();
      if (this.inflight.size === 0) {
        quietSince ??= Date.now();
        if (Date.now() - quietSince >= idleMs) return { ok: true, inflight: [] };
      } else {
        quietSince = null;
      }
      if (Date.now() >= deadline) return { ok: false, inflight: [...this.inflight.values()] };
      await sleep(50);
    }
  }

  /** CDP는 리디렉트 사슬 전체에 같은 requestId를 쓰고, 다음 홉의 requestWillBeSent에 이전 홉의 응답(redirectResponse)을 싣습니다. */
  trackDocument({ method, params }) {
    if (method === 'Network.requestWillBeSent' && params.type === 'Document') {
      const chain = this.chains.get(params.requestId) ?? { hops: [], status: undefined };
      if (params.redirectResponse && chain.hops.length > 0) {
        const previous = chain.hops[chain.hops.length - 1];
        previous.status = params.redirectResponse.status;
        previous.location = headerOf(params.redirectResponse.headers, 'location');
      }
      chain.hops.push({ url: params.request.url });
      this.chains.set(params.requestId, chain);
    } else if (method === 'Network.responseReceived' && params.type === 'Document') {
      const chain = this.chains.get(params.requestId);
      if (chain) {
        chain.status = params.response.status;
        chain.hops[chain.hops.length - 1].status = params.response.status;
      }
    }
  }

  /** 지난 clearDocumentChains 이후의 문서 요청 사슬을 시작 순서로 돌려줍니다. 사슬이 자라는 동안 재시도해도 되도록 비우지 않습니다. */
  async documentChains() {
    await this.pull();
    return [...this.chains.values()];
  }

  async clearDocumentChains() {
    await this.pull();
    this.chains.clear();
  }

  /** 지난 호출 이후의 콘솔 문제와 로컬 밖으로 나간 요청을 돌려주고 버퍼를 비웁니다. */
  async drain() {
    await this.pull();
    const problems = [];
    const external = new Set();
    const events = this.buffer;
    this.buffer = [];
    let blocked = 0;
    for (const event of events) {
      const params = event.params ?? {};
      if (event.method === 'Network.loadingFailed' && params.blockedReason) {
        blocked += 1;
      } else if (event.method === 'Network.requestWillBeSent') {
        const target = params.request?.url ?? '';
        if (/^https?:/.test(target) && !this.isLocal(target)) external.add(target);
      } else if (event.method === 'Runtime.exceptionThrown') {
        problems.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception');
      } else if (event.method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        problems.push((params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' '));
      } else if (event.method === 'Log.entryAdded' && params.entry?.level === 'error') {
        const { text, url } = params.entry;
        if (text.startsWith('Failed to load resource') && url && !this.isLocal(url)) continue;
        // 실제 브라우저가 스스로 요청하는 파비콘입니다(Playwright는 요청하지 않음). 앱 코드의 요청이 아니고 사이트에 파비콘이 아직 없습니다.
        if (text.startsWith('Failed to load resource') && url && new URL(url).pathname === '/favicon.ico') continue;
        problems.push(`${text} ${url ?? ''}`.trim());
      }
    }
    return { problems, external: [...external], eventCount: events.length, blocked };
  }
}
