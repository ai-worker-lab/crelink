// 앱 내 브라우저 가입 안내(0231) 시나리오. ego-browser 런타임에서만 실행됩니다.
// 지우는 쿠키는 cl_session뿐입니다. 실제 Google 로그인은 하지 않으며 Google 주소는 차단합니다.
/* global document, URL, navigator */
import { join } from 'node:path';
import pg from 'pg';
import { blockHosts, clearSessionCookie, NAVIGATION_TIMEOUT, poll, setViewport } from './lib/browser.mjs';
import { runSuite } from './lib/suite.mjs';

const IOS_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.2.12.87 (iPhone14,5; iOS 17_5; ko_KR; ko; scale=3.00; 1170x2532; 614259851)';
const ANDROID_INSTAGRAM =
  'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 Instagram 339.0.0.43.96 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 620000000)';
const HERO_BUTTON = '.home-hero .button-row a.primary';
const GUESTBOOK_BUTTON = '.guestbook-signin a.primary';
const NOTICE = 'dialog.sheet[open]';
// 시나리오가 끝까지 돌았을 때의 검사 수. 예외가 기록되지 않거나 단계가 조용히 건너뛰어지면 이 수를 밑돕니다.
const MIN_CHECKS = {
  'signup/instagram-ios-home': 16,
  'signup/instagram-android-return-to': 10,
  'signup/regular-browser': 7,
};

let pool;

const stepCount = async (config, step, kind) => {
  const { rows } = await pool.query(
    'SELECT coalesce(sum(events), 0)::int AS total FROM signup_funnel_daily WHERE step = $1 AND source = $2 AND in_app_kind = $3',
    [step, config.source, kind],
  );
  return rows[0].total;
};

const setUserAgent = (page, userAgent) => page.cdp('Network.setUserAgentOverride', { userAgent });

/** 합계에 쌓인 값으로 하이드레이션과 beacon 전송을 함께 확인합니다. */
const waitForCount = (config, step, kind, expected) =>
  poll(
    () => stepCount(config, step, kind),
    (total) => total === expected,
  );

async function openHome({ page, config, must, name }, kind) {
  const before = await stepCount(config, 'home_view', kind);
  await page.goto(`${config.webUrl}/?utm_source=${config.source}&utm_campaign=t0231`, { timeout: NAVIGATION_TIMEOUT });
  const view = await waitForCount(config, 'home_view', kind, before + 1);
  must(view.ok, `${name} home_view ${view.value} = ${before + 1}`);
}

/** 앱 콘솔 오류만 봅니다. Google·외부 시험 주소는 차단해 두었습니다. */
async function checkConsole({ watch, report, name }) {
  const observed = await watch.drain();
  report.record(
    name,
    observed.problems.length === 0,
    `콘솔 오류 ${observed.problems.length}건 ${observed.problems.join(' | ').slice(0, 400)}`,
  );
}

const documentUrls = async (watch) =>
  (await watch.documentChains()).flatMap((chain) => chain.hops.map((hop) => hop.url));
const authRequests = (urls) => urls.filter((url) => new URL(url).pathname.startsWith('/auth/google'));

async function checkNoGoogleNavigation({ page, watch, report, name }, path) {
  const urls = await documentUrls(watch);
  report.record(name, authRequests(urls).length === 0, `/auth/google 문서 요청 0건: ${urls.join(' ') || '없음'}`);
  report.record(
    name,
    urls.every((url) => !url.includes('accounts.google')),
    'Google 문서 요청 0건',
  );
  const current = new URL(await page.url());
  report.record(name, current.pathname === path, `주소 유지 ${current.pathname} = ${path}`);
}

const noticeState = (page) =>
  page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    if (!dialog) return null;
    const links = [...dialog.querySelectorAll('a')].map((node) => ({
      text: node.textContent.trim(),
      href: node.getAttribute('href'),
    }));
    return {
      text: dialog.innerText,
      links,
      address: dialog.querySelector('input[aria-label="로그인 주소"]')?.value ?? null,
      width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, NOTICE);

async function iosHome(context) {
  const { page, config, report, must, name, watch } = context;
  await setUserAgent(page, IOS_INSTAGRAM);
  const ua = await page.evaluate(() => navigator.userAgent);
  must(ua.includes('Instagram'), `UA 변경 적용 ${ua.slice(-40)}`);
  await openHome(context, 'instagram');
  await setViewport(page, { deviceScaleFactor: 1, mobile: true }, 390, 844);
  await watch.clearDocumentChains();
  const clicksBefore = await stepCount(config, 'signup_click', 'instagram');
  await page.click(HERO_BUTTON);
  await page.waitForSelector(NOTICE, { state: 'visible' });
  const state = await noticeState(page);
  must(state !== null, '안내 시트 표시');
  report.record(name, state.text.includes('인스타그램'), `앱 이름 안내 ${state.text.slice(0, 80)}`);
  report.record(name, state.text.includes('Safari로 열기'), 'iOS Safari 안내');
  report.record(name, !state.links.some((link) => link.href.startsWith('intent:')), 'iOS에는 intent 링크가 없음');
  report.record(
    name,
    state.links.some((link) => link.text === '그래도 계속' && link.href === state.address),
    '그래도 계속 경로',
  );
  report.record(name, new URL(state.address).pathname === '/auth/google', `복사 주소 ${state.address}`);
  report.record(name, !state.address.includes('utm_'), '복사 주소에 유입값 없음');
  report.record(name, state.width <= 0, `가로 넘침 ${state.width}px`);
  await page.screenshot({ path: join(config.outputDir, 'notice-ios-390.png') });
  await checkNoGoogleNavigation(context, '/');
  const clicks = await waitForCount(config, 'signup_click', 'instagram', clicksBefore + 1);
  report.record(name, clicks.ok, `signup_click(instagram) ${clicks.value} = ${clicksBefore + 1}`);
  await page.click(`${NOTICE} a.secondary`);
  const continued = await poll(
    () => documentUrls(watch),
    (urls) => authRequests(urls).length > 0,
  );
  report.record(name, continued.ok, `그래도 계속은 /auth/google로 이동 ${continued.value?.join(' ')}`);
  await checkConsole(context);
}

async function androidReturnTo(context) {
  const { page, report, must, name, watch, scenario } = context;
  await setUserAgent(page, ANDROID_INSTAGRAM);
  const { publicId } = scenario.creator;
  await page.goto(`${scenario.creator.landingUrl}#guestbook`, { timeout: NAVIGATION_TIMEOUT });
  await page.waitForSelector(GUESTBOOK_BUTTON, { state: 'visible' });
  await watch.clearDocumentChains();
  await page.click(GUESTBOOK_BUTTON);
  await page.waitForSelector(NOTICE, { state: 'visible' });
  const state = await noticeState(page);
  must(state !== null, '안내 시트 표시');
  const expected = `returnTo=${encodeURIComponent(`/p/${publicId}#guestbook`)}`;
  report.record(name, state.address.includes(expected), `복사 주소의 returnTo ${state.address}`);
  const intent = state.links.find((link) => link.href.startsWith('intent:'));
  must(Boolean(intent), 'Chrome으로 열기 링크');
  report.record(name, intent.href.includes(expected), `intent의 returnTo ${intent.href}`);
  report.record(name, intent.href.includes('package=com.android.chrome'), 'Chrome 지정');
  report.record(
    name,
    state.links.some((link) => link.text === '그래도 계속' && link.href.includes(expected)),
    '그래도 계속의 returnTo',
  );
  await checkNoGoogleNavigation(context, `/p/${publicId}`);
  await checkConsole(context);
}

async function regularBrowser(context) {
  const { page, config, report, must, name, watch, desktop } = context;
  await setUserAgent(page, desktop.userAgent);
  await openHome(context, 'none');
  await setViewport(page, desktop, 1280, 720);
  if (config.fault === 'always-notice') await setUserAgent(page, IOS_INSTAGRAM);
  await watch.clearDocumentChains();
  const clicksBefore = await stepCount(config, 'signup_click', 'none');
  await page.click(HERO_BUTTON);
  const chain = await poll(
    () => documentUrls(watch),
    (urls) => authRequests(urls).length > 0,
  );
  must(chain.ok, `/auth/google 문서 요청 ${chain.value?.join(' ')}`);
  report.record(
    name,
    new URL(authRequests(chain.value)[0]).search === '',
    `쿼리 없는 시작 ${authRequests(chain.value)[0]}`,
  );
  const dialogs = await page.evaluate((selector) => document.querySelectorAll(selector).length, NOTICE);
  report.record(name, dialogs === 0, `안내 없음 ${dialogs}`);
  report.record(
    name,
    !chain.value.some((url) => url.includes('accounts.google')),
    'Google로 이동하지 않음(로컬 키 없음·차단)',
  );
  const clicks = await waitForCount(config, 'signup_click', 'none', clicksBefore + 1);
  report.record(name, clicks.ok, `signup_click(none) ${clicks.value} = ${clicksBefore + 1}`);
  await checkConsole(context);
}

export const run = ({ taskSpace, config }) =>
  runSuite({
    taskSpace,
    config,
    scenarios: config.scenarios,
    minChecks: MIN_CHECKS,
    setup: async ({ page }) => {
      pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
      await blockHosts(page, ['*accounts.google.com*', '*.e2e.test*']);
      return () => pool.end();
    },
    run: async (context) => {
      await clearSessionCookie(context.page, context.config);
      if (context.name === 'signup/instagram-ios-home') return iosHome(context);
      if (context.name === 'signup/instagram-android-return-to') return androidReturnTo(context);
      return regularBrowser(context);
    },
  });
