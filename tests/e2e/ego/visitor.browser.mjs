// tests/e2e/visitor.spec.ts를 ego-browser Page API로 옮긴 시나리오. ego-browser 런타임에서만 실행됩니다.
// 원본과 다른 점과 옮기지 못한 검사: docs/work/orchestrator/0230-ego-smoke-core.md
// - Playwright의 새 컨텍스트 대신 같은 프로필에서 cl_session만 바꿉니다. cl_vid는 지우지 않습니다.
// - 다른 브라우저: 단축 주소의 호스트만 바꿔(127.0.0.1 ↔ localhost) 다른 쿠키 저장소로 방문하고, 쿠키 없는 첫 방문은 Node 요청으로 확인합니다.
// - 외부 요청은 가짜 응답 대신 *.e2e.test 차단으로 막습니다. 원본도 /c/{id}의 도착지를 열지 못하고(DNS 실패) 요청만 확인합니다.
/* global document, fetch, NodeFilter, URL */
import pg from 'pg';
import {
  applyDevice,
  blockHosts,
  clearSessionCookie,
  ConsoleWatch,
  gotoWithReferer,
  NAVIGATION_TIMEOUT,
  poll,
  readCookie,
  setSessionCookie,
  setViewport,
} from './lib/browser.mjs';
import { TEST_HOST_SUFFIX } from './lib/data.mjs';
import { runSuite } from './lib/suite.mjs';

const UUID = /^[0-9a-f-]{36}$/;
const PREVIEW = 'section[aria-label="미리보기"]';
const OPEN_LINK_NAME = '공개 페이지 열기 (새 창)';
// 시나리오가 끝까지 돌았을 때의 검사 수. 예외가 기록되지 않거나 단계가 조용히 건너뛰어지면 이 수를 밑돕니다.
const MIN_CHECKS = { 'visitor/short-url': 38, 'visitor/direct-entry': 23 };

const headingCount = (page, name) =>
  page.evaluate(
    (target) =>
      [...document.querySelectorAll('h1')].filter(
        (node) => node.getClientRects().length > 0 && node.textContent.includes(target),
      ).length,
    name,
  );

/** getByText처럼 script·style을 뺀 글자 노드에서 찾습니다. textContent 전체를 보면 RSC 데이터까지 잡힙니다. */
const textOccurrences = (page, text) =>
  page.evaluate((target) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let count = 0;
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (
        !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName) &&
        walker.currentNode.textContent.includes(target)
      ) {
        count += 1;
      }
    }
    return count;
  }, text);

const linkHrefs = (page, title) =>
  page.evaluate(
    (target) =>
      [...document.querySelectorAll('a')]
        .filter((node) => node.textContent.includes(target))
        .map((node) => node.getAttribute('href')),
    title,
  );

async function expectHeading({ page, must }, name) {
  const found = await poll(
    () => headingCount(page, name),
    (count) => count === 1,
  );
  must(found.ok, `h1 '${name}' ${found.value}개 = 1`);
}

async function expectUrl({ page, must }, expected) {
  const url = await poll(
    () => page.url(),
    (value) => value === expected,
  );
  must(url.ok, `주소 ${url.value} = ${expected}`);
}

async function waitForCount({ db, must }, table, shortLinkId, count) {
  const result = await poll(
    async () =>
      Number((await db.query(`SELECT count(*) FROM ${table} WHERE short_link_id = $1`, [shortLinkId])).rows[0].count),
    (value) => value === count,
  );
  must(result.ok, `${table} ${result.value}건 = ${count}`);
}

async function visitsOf(db, shortLinkId) {
  const { rows } = await db.query(
    `SELECT slug, visitor_id, referrer_host, device_type, browser, os, host(ip) AS ip
     FROM visits WHERE short_link_id = $1 ORDER BY id`,
    [shortLinkId],
  );
  return rows;
}

async function settle({ watch, must }) {
  const quiet = await watch.waitForNetworkQuiet();
  must(quiet.ok, `네트워크 안정 ${JSON.stringify(quiet.inflight).slice(0, 400)}`);
}

async function checkNoProblems({ watch, report, name, minBlocked = 0 }) {
  const observed = await watch.drain();
  const leaked = observed.external.filter((url) => !new URL(url).hostname.endsWith(`.${TEST_HOST_SUFFIX}`));
  report.record(name, observed.eventCount > 0, `CDP 이벤트 수집 ${observed.eventCount}건`);
  report.record(
    name,
    observed.problems.length === 0,
    `앱 콘솔 오류 ${observed.problems.length}건 ${observed.problems.join(' | ').slice(0, 800)}`,
  );
  report.record(
    name,
    leaked.length === 0,
    `합성 도메인 밖 요청 ${leaked.length}건 ${leaked.join(' | ').slice(0, 800)}`,
  );
  if (minBlocked > 0)
    report.record(name, observed.blocked >= minBlocked, `합성 도메인 차단 ${observed.blocked}건 >= ${minBlocked}`);
}

async function shortUrlScenario(context) {
  const { page, config, desktop, watch, must, report, name, db, scenario } = context;
  const { creator } = scenario;
  const [first, second, hidden] = creator.links;
  const displayName = 'E2E 방문 테스트';

  await clearSessionCookie(page, config);
  await applyDevice(page, desktop, 1280, 800);

  // 새 주소: Referer를 붙여 엽니다. 단축 주소가 붙인 통과 표시(?pass=)는 화면이 주소창에서 지웁니다.
  await gotoWithReferer(page, creator.shortUrl, 'https://www.instagram.com/', { timeout: NAVIGATION_TIMEOUT });
  await expectUrl(context, creator.landingUrl);
  await expectHeading(context, displayName);
  const titles = await poll(
    () => page.evaluate(() => [...document.querySelectorAll('.link-title')].map((node) => node.textContent.trim())),
    (value) => JSON.stringify(value) === JSON.stringify([first.title, second.title]),
  );
  must(titles.ok, `보이는 링크 ${JSON.stringify(titles.value)}`);
  must((await textOccurrences(page, first.title)) >= 1, '양성 대조: 글자 찾기가 첫 링크를 찾음');
  must((await textOccurrences(page, hidden.title)) === 0, '숨긴 링크 글자 없음');
  const hrefs = await linkHrefs(page, first.title);
  must(hrefs.length === 1 && hrefs[0] === first.clickUrl, `첫 링크 href ${JSON.stringify(hrefs)} = ${first.clickUrl}`);

  // 옛 주소(바꾼 지 90일 안)도 같은 랜딩
  await page.goto(`${config.shortUrl}/${creator.oldSlug}`, { timeout: NAVIGATION_TIMEOUT });
  await expectUrl(context, creator.landingUrl);
  await expectHeading(context, displayName);

  // 외부 링크 클릭: {SHORT}/c/{id}가 저장된 URL로 302 → 브라우저가 그 URL을 요청합니다.
  await watch.clearDocumentChains();
  if (config.fault === 'missing-link') {
    await page.evaluate((target) => document.querySelector(`a[href="${target}"]`).remove(), first.clickUrl);
  }
  await page.click(`a[href="${first.clickUrl}"]`, { label: '첫 번째 외부 링크 클릭' });
  const clicked = await poll(
    async () => (await watch.documentChains()).find((chain) => chain.hops[0]?.url === first.clickUrl) ?? null,
    (chain) => chain !== null && chain.hops.length >= 2,
  );
  must(clicked.ok, `클릭 문서 요청 사슬 ${JSON.stringify(clicked.value)}`);
  const [redirect, arrival] = clicked.value.hops;
  must(redirect.status === 302, `/c/{id} 응답 ${redirect.status} = 302`);
  must(redirect.location === first.url, `Location ${redirect.location} = ${first.url}`);
  must(arrival.url === first.url, `도착지 요청 ${arrival.url}`);

  // 숨긴 링크의 클릭 주소는 안내로 보냄
  const blocked = await fetch(hidden.clickUrl, { redirect: 'manual' });
  must(blocked.status === 302, `숨긴 링크 응답 ${blocked.status} = 302`);
  const blockedLocation = blocked.headers.get('location');
  must(/\/notice\?reason=link_unavailable$/.test(blockedLocation ?? ''), `숨긴 링크 Location ${blockedLocation}`);

  // 방문·클릭 기록
  await waitForCount(context, 'visits', creator.shortLinkId, 2);
  await waitForCount(context, 'link_clicks', creator.shortLinkId, 1);
  const visits = await visitsOf(db, creator.shortLinkId);
  must(
    JSON.stringify(visits.map((visit) => visit.slug)) === JSON.stringify([creator.slug, creator.oldSlug]),
    `방문 주소 ${JSON.stringify(visits.map((visit) => visit.slug))}`,
  );
  must(visits[0].referrer_host === 'www.instagram.com', `유입 호스트 ${visits[0].referrer_host}`);
  for (const visit of visits) {
    must(
      visit.device_type === 'desktop' && visit.browser === 'Chrome',
      `기기 ${visit.device_type} 브라우저 ${visit.browser}`,
    );
    must(!!visit.os && !!visit.ip, `OS ${visit.os} IP ${visit.ip}`);
  }
  const visitorId = visits[0].visitor_id;
  must(UUID.test(visitorId), `visitor_id 형식 ${visitorId}`);
  must(visits[1].visitor_id === visitorId, '같은 브라우저 재방문은 같은 visitor_id');
  const cookie = await readCookie(page, config.shortUrl, 'cl_vid');
  must(cookie === visitorId, `cl_vid 쿠키 = visitor_id (${cookie === visitorId})`);

  const { rows: clicks } = await db.query(
    `SELECT link_id, link_public_id, visitor_id, device_type, browser FROM link_clicks WHERE short_link_id = $1`,
    [creator.shortLinkId],
  );
  const expectedClicks = [
    {
      link_id: first.id,
      link_public_id: first.publicId,
      visitor_id: visitorId,
      device_type: 'desktop',
      browser: 'Chrome',
    },
  ];
  must(JSON.stringify(clicks) === JSON.stringify(expectedClicks), `클릭 기록 ${JSON.stringify(clicks)}`);

  // 다른 브라우저는 다른 visitor_id. 호스트별 쿠키 저장소를 쓰는 다른 호스트로 실제 브라우저가 방문합니다.
  const aliasOf = `${config.aliasShortUrl}/${creator.slug}`;
  await page.goto(aliasOf, { timeout: NAVIGATION_TIMEOUT });
  await expectHeading(context, displayName);
  await waitForCount(context, 'visits', creator.shortLinkId, 3);
  const { rows: unique } = await db.query('SELECT count(DISTINCT visitor_id) FROM visits WHERE short_link_id = $1', [
    creator.shortLinkId,
  ]);
  must(Number(unique[0].count) === 2, `서로 다른 visitor_id ${unique[0].count} = 2`);

  // 처음 오는 방문자: 쿠키 없는 요청이 새 cl_vid를 받습니다. 프로필의 cl_vid는 지우지 않아 브라우저로는 재현하지 않습니다(0230).
  const fresh = await fetch(creator.shortUrl, { redirect: 'manual', headers: { 'user-agent': desktop.userAgent } });
  must(fresh.status === 302, `쿠키 없는 방문 응답 ${fresh.status} = 302`);
  const minted = /(?:^|;\s*|,\s*)cl_vid=([0-9a-f-]{36})/.exec(fresh.headers.getSetCookie().join(', '))?.[1];
  must(UUID.test(minted ?? '') && minted !== visitorId, `쿠키 없는 방문의 새 cl_vid ${minted}`);
  await waitForCount(context, 'visits', creator.shortLinkId, 4);

  await page.goto(creator.landingUrl, { timeout: NAVIGATION_TIMEOUT });
  await setViewport(page, desktop, 390, 844);
  await page.reload({ timeout: NAVIGATION_TIMEOUT });
  await settle(context);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  report.record(`${name}/390x844`, overflow <= 0, `/p/{publicId} 390px 가로 넘침 ${overflow}`);
  await setViewport(page, desktop, 1280, 800);
  // 파비콘(랜딩마다 1건 이상)과 클릭 도착지가 차단되어야 합니다. 0이면 차단이 동작하지 않은 것입니다.
  await checkNoProblems({ watch, report, name, minBlocked: 2 });
}

async function directEntryScenario(context) {
  const { page, config, desktop, watch, must, report, name, db, scenario } = context;
  const { creator, displayName } = scenario;

  // 크리에이터가 관리 화면 무대 주소 막대의 `공개 페이지 열기`(같은 출처, 새 창)로 열면 단축 주소를 거치지 않습니다.
  await clearSessionCookie(page, config);
  await setSessionCookie(page, config, creator.sessionToken);
  await applyDevice(page, desktop, 1280, 800);
  await page.goto(`${config.webUrl}/me`, { timeout: NAVIGATION_TIMEOUT });
  await page.waitForSelector(PREVIEW, { state: 'visible', timeout: 30_000 });
  const openLink = await page.evaluate(
    ({ scope, label }) =>
      [...document.querySelectorAll(`${scope} a`)]
        .filter((node) => node.textContent.trim() === label)
        .map((node) => ({ target: node.getAttribute('target'), href: node.getAttribute('href') })),
    { scope: PREVIEW, label: OPEN_LINK_NAME },
  );
  must(openLink.length === 1, `공개 페이지 열기 링크 ${openLink.length}개 = 1`);
  must(openLink[0].target === '_blank', `target=${openLink[0].target}`);
  if (config.fault === 'missing-open-link') {
    await page.evaluate((scope) => document.querySelector(`${scope} a[target="_blank"]`).remove(), PREVIEW);
  }
  const popupPromise = page.waitForEvent('popup', { timeout: 30_000 });
  // 클릭이 실패하면 이 대기는 버려집니다. 처리되지 않은 거부로 뒤 시나리오까지 죽지 않게 합니다.
  popupPromise.catch(() => {});
  await page.click(`${PREVIEW} a[target="_blank"]`, { label: '공개 페이지 열기' });
  const popup = await popupPromise;
  await popup.waitForLoadState('load', { timeout: NAVIGATION_TIMEOUT });
  await expectHeading({ page: popup, must }, displayName);
  await expectUrl({ page: popup, must }, creator.landingUrl);
  const popupWatch = new ConsoleWatch(popup, config);
  await popupWatch.start({ keepEarlier: true });
  await settle({ watch: popupWatch, must });
  await checkNoProblems({ watch: popupWatch, report, name });
  await popup.close();

  // 메신저에 공유된 랜딩 주소를 연 방문자: /p/{id} → 단축 주소(방문 기록) → /p/{id}?pass=… → 주소창은 /p/{id}
  await clearSessionCookie(page, config);
  await watch.clearDocumentChains();
  await gotoWithReferer(page, creator.landingUrl, 'https://open.kakao.com/', { timeout: NAVIGATION_TIMEOUT });
  const chain = (await watch.documentChains()).at(-1);
  must(!!chain, '직접 방문 문서 요청 기록 있음');
  const hops = chain.hops.map((hop) => hop.url);
  must(hops.length === 3, `리디렉트 사슬 ${hops.length}개 = 3: ${JSON.stringify(hops)}`);
  must(hops[0] === creator.landingUrl, `1번째 ${hops[0]}`);
  must(hops[1] === creator.shortUrl, `2번째 ${hops[1]}`);
  must(hops[2].startsWith(`${creator.landingUrl}?pass=`), `3번째 ${hops[2]}`);
  await expectHeading(context, displayName);
  await expectUrl(context, creator.landingUrl);
  await waitForCount(context, 'visits', creator.shortLinkId, 1);
  const rows = (await visitsOf(db, creator.shortLinkId)).map(({ slug, referrer_host }) => ({ slug, referrer_host }));
  must(
    JSON.stringify(rows) === JSON.stringify([{ slug: creator.slug, referrer_host: 'open.kakao.com' }]),
    `관리 화면에서 연 페이지는 안 세고 직접 접속은 1건 ${JSON.stringify(rows)}`,
  );

  // 통과 표시가 지워진 주소를 새로 열면(다시 공유된 경우) 또 단축 주소를 거칩니다.
  await watch.clearDocumentChains();
  await page.goto(creator.landingUrl, { timeout: NAVIGATION_TIMEOUT });
  const again = (await watch.documentChains()).at(-1);
  must(again?.hops[1]?.url === creator.shortUrl, `다시 열면 단축 주소 경유 ${again?.hops[1]?.url}`);
  await waitForCount(context, 'visits', creator.shortLinkId, 2);
  await settle(context);
  await checkNoProblems({ watch, report, name });
}

async function setup(context) {
  const { page, config } = context;
  context.db = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
  await blockHosts(page, [`https://*.${TEST_HOST_SUFFIX}/*`]);
  return () => context.db.end();
}

export const run = ({ taskSpace, config }) =>
  runSuite({
    taskSpace,
    config,
    scenarios: config.scenarios,
    minChecks: MIN_CHECKS,
    setup,
    run: (context) => (context.name === 'visitor/short-url' ? shortUrlScenario(context) : directEntryScenario(context)),
  });
