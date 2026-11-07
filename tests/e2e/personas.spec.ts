// localhost 가상 사용자 시나리오. 실제 수요/성장 증거가 아니라 동작·권한·지표 분리를 검증합니다.
// metrics 대조군이 다른 시나리오에 섞이지 않도록 personas 프로젝트는 기존 프로젝트 뒤에 실행합니다.
import type { AiOperatorMetrics, LandingEventRequest } from '@crelink/shared';
import type { Page } from '@playwright/test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { API_URL, expect, expectNoHorizontalOverflow, SHORT_URL, test, waitForCount, WEB_URL } from './fixtures';

async function growthMetrics(page: Page) {
  const response = await page.request.get(`${API_URL}/api/admin/metrics`);
  expect(response.status()).toBe(200);
  const metrics: AiOperatorMetrics = await response.json();
  // 전체 계정 수·광고는 현행 계약상 전체 집계이므로 성장 대상 집계와 혼동하지 않습니다.
  return {
    realUsers: metrics.realUsers,
    signups: metrics.signups,
    activation: metrics.activation,
    visits: metrics.visits,
    linkClicks: metrics.linkClicks,
  };
}

const backend = (path: string) => `${WEB_URL}/api/backend${path}`;

test('SIM-01 초보 크리에이터의 첫 링크·모바일 방문·클릭은 테스트 사용자 성장 지표에 섞이지 않는다', async ({
  data,
}, testInfo) => {
  const operator = await data.user({ role: 'operator', displayName: '[SIM] 운영 담당 민서' });
  const admin = await data.session(operator);
  const baseline = await growthMetrics(admin.page);
  const novice = await data.user({ displayName: '[SIM] 협업을 시작하는 지민' });
  const owner = await data.session(novice);
  const url = data.externalUrl('contact');

  await owner.page.goto(`/me/landings/${novice.publicId}`);
  await owner.page
    .getByRole('region', { name: '미리보기', exact: true })
    .getByRole('button', { name: '+ 링크 추가', exact: true })
    .click();
  const form = owner.page.getByRole('main').getByRole('form', { name: '새 링크', exact: true });
  await form.getByLabel('표시 이름 (필수)').fill('협업 문의');
  await form.getByLabel('주소 (필수)').fill(url);
  // 첫 저장 실패는 입력을 지우거나 DB에 반쪽 링크를 남기면 안 됩니다.
  const savePath = '**/api/backend/api/me/links';
  data.allowConsoleError(/503.*\/api\/backend\/api\/me\/links/);
  await owner.page.route(savePath, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: { code: 'service_unavailable', message: '합성 저장 실패' } })
      : route.continue(),
  );
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form.getByLabel('표시 이름 (필수)')).toHaveValue('협업 문의');
  await expect(form.getByLabel('주소 (필수)')).toHaveValue(url);
  await expect(owner.page.locator('.form-error')).toBeVisible();
  expect((await data.db.query('SELECT id FROM links WHERE user_id=$1', [novice.userId])).rows).toEqual([]);
  await owner.page.unroute(savePath);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toHaveCount(0);
  await owner.page.reload();
  await expect(owner.page.getByRole('region', { name: '미리보기', exact: true }).locator('.link-title')).toHaveText([
    '협업 문의',
  ]);

  const visitor = await data.session(undefined, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await visitor.page.goto(novice.shortUrl);
  const publicLink = visitor.page.getByRole('link', { name: '협업 문의', exact: true });
  const clickUrl = await publicLink.getAttribute('href');
  expect(clickUrl).toMatch(new RegExp(`^${SHORT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/c/`));
  const outbound = visitor.page.waitForRequest(url);
  const redirect = visitor.page.waitForResponse((response) => response.url() === clickUrl && response.status() === 302);
  await publicLink.click();
  await outbound;
  const click = await redirect;
  expect(click.status()).toBe(302);
  expect(click.headers().location).toBe(url);
  await waitForCount(data, 'visits', novice.shortLinkId, 1);
  await waitForCount(data, 'link_clicks', novice.shortLinkId, 1);
  await expectNoHorizontalOverflow(visitor.page, 'SIM-01 모바일 공개 프로필');
  expect(await growthMetrics(admin.page)).toEqual(baseline);
  await expect
    .poll(async () => {
      const response = await owner.page.request.get(`${API_URL}/api/me/analytics`);
      expect(response.status()).toBe(200);
      const report = await response.json();
      return { pageViews: report.summary.pageViews, clicks: report.summary.clicks };
    })
    .toEqual({ pageViews: 1, clicks: 1 });
  await owner.page.goto(`/me/landings/${novice.publicId}/metrics`);
  const summary = owner.page.locator('section', { has: owner.page.getByRole('heading', { name: '방문자 행동 요약' }) });
  await expect(
    summary.locator('div', { has: owner.page.getByText('수집된 페이지뷰', { exact: true }) }).locator('dd'),
  ).toHaveText('1');
  await expect(summary.locator('div', { has: owner.page.getByText('클릭', { exact: true }) }).locator('dd')).toHaveText(
    '1',
  );

  await admin.page.goto(`/admin/creators/${novice.userId}`);
  await expect(admin.page.getByRole('button', { name: '지표에 다시 넣기' })).toBeVisible();
  await testInfo.attach('SIM-01 테스트 계정 관리', { body: await admin.page.screenshot(), contentType: 'image/png' });
  await testInfo.attach('SIM-01 모바일 공개 프로필', {
    body: await visitor.page.screenshot(),
    contentType: 'image/png',
  });
});

test('SIM-02 localhost 실사용자 대조군의 숨김→활성화→제외→재포함을 구분한다', async ({ data }) => {
  const operator = await data.user({ role: 'operator', displayName: '[SIM] 지표 담당 민서' });
  const admin = await data.session(operator);
  const baseline = await growthMetrics(admin.page);
  // 실제 고객이 아니라 localhost에서만 지표 포함 경로를 검사하는 가상 대조군입니다.
  const control = await data.user({
    displayName: '[SIM 대조군] 작업을 공개하는 서윤',
    metricsExcluded: false,
    links: [{ title: '대표 작업', url: data.externalUrl('work'), hidden: true }],
  });
  const owner = await data.session(control);
  const hidden = await growthMetrics(admin.page);
  expect(hidden.realUsers).toBe(baseline.realUsers);
  expect(hidden.activation).toEqual(baseline.activation);
  expect(hidden.signups).toEqual({
    last24Hours: baseline.signups.last24Hours + 1,
    last7Days: baseline.signups.last7Days + 1,
    last30Days: baseline.signups.last30Days + 1,
  });

  const visible = await owner.page.request.patch(backend(`/api/me/links/${control.links[0].id}`), {
    headers: { Origin: WEB_URL },
    data: { hidden: false },
  });
  expect(visible.status()).toBe(200);
  const active = await growthMetrics(admin.page);
  expect(active.realUsers).toBe(baseline.realUsers + 1);
  expect(active.activation).toEqual({
    firstVisibleLinkCreatorsLast7Days: baseline.activation.firstVisibleLinkCreatorsLast7Days + 1,
    firstVisibleLinkCreatorsLast30Days: baseline.activation.firstVisibleLinkCreatorsLast30Days + 1,
  });

  const exclude = await admin.page.request.put(backend(`/api/admin/creators/${control.userId}/metrics-exclusion`), {
    headers: { Origin: WEB_URL },
    data: { excluded: true },
  });
  expect(exclude.status()).toBe(200);
  expect(await growthMetrics(admin.page)).toEqual(baseline);
  await admin.page.goto(`/admin/creators/${control.userId}`);
  admin.page.once('dialog', (dialog) => dialog.accept());
  await admin.page.getByRole('button', { name: '지표에 다시 넣기' }).click();
  await expect(admin.page.getByRole('button', { name: '지표에서 빼기' })).toBeVisible();
  expect(await growthMetrics(admin.page)).toEqual(active);
  // 대조군이 포함된 상태를 개발 DB에 남기지 않습니다. fixture도 종료 시 이 실행 소유 행만 정리합니다.
  const restore = await admin.page.request.put(backend(`/api/admin/creators/${control.userId}/metrics-exclusion`), {
    headers: { Origin: WEB_URL },
    data: { excluded: true },
  });
  expect(restore.status()).toBe(200);
  expect(await growthMetrics(admin.page)).toEqual(baseline);
});

test('SIM-03 다른 사용자·익명 사용자의 쓰기와 위험 URL을 거부하고 소유자 데이터를 보존한다', async ({ data }) => {
  const creator = await data.user({
    displayName: '[SIM] 원작자 하린',
    links: [{ title: '원본 작업', url: data.externalUrl('original') }],
  });
  const other = await data.user({ displayName: '[SIM] 다른 사용자 도윤' });
  const stranger = await data.session(other);
  const anonymous = await data.session();
  const owner = await data.session(creator);
  const link = creator.links[0];

  const tamper = await stranger.page.request.patch(backend(`/api/me/links/${link.id}`), {
    headers: { Origin: WEB_URL },
    data: { title: '다른 사용자의 덮어쓰기' },
  });
  expect(tamper.status()).toBe(404);
  expect((await tamper.json()).code).toBe('link_not_found');
  const unauthenticated = await anonymous.page.request.post(backend('/api/me/links'), {
    headers: { Origin: WEB_URL },
    data: { title: '익명 추가', url: data.externalUrl('anonymous') },
  });
  expect(unauthenticated.status()).toBe(401);
  const metrics = await stranger.page.request.get(`${API_URL}/api/admin/metrics`);
  expect(metrics.status()).toBe(403);
  expect((await stranger.page.request.get(`${API_URL}/api/admin/analytics?creatorId=${creator.userId}`)).status()).toBe(
    403,
  );
  expect((await stranger.page.request.get(`${API_URL}/api/me/analytics?creatorId=${creator.userId}`)).status()).toBe(
    400,
  );
  const isolated = await stranger.page.request.get(`${API_URL}/api/me/analytics`);
  expect(isolated.status()).toBe(200);
  expect((await isolated.json()).summary.pageViews).toBe(0);
  const unsafe = await owner.page.request.post(backend('/api/me/links'), {
    headers: { Origin: WEB_URL },
    data: { title: '위험 주소', url: 'javascript:alert(1)' },
  });
  expect(unsafe.status()).toBe(400);
  expect((await unsafe.json()).code).toBe('link_url_invalid');
  const { rows } = await data.db.query('SELECT title, url FROM links WHERE user_id = $1', [creator.userId]);
  expect(rows).toEqual([{ title: link.title, url: link.url }]);
});

test('SIM-04 만료 세션의 재시도는 마지막 저장값을 덮어쓰지 않는다', async ({ data }) => {
  const creator = await data.user({
    displayName: '[SIM] 다시 접속하는 유진',
    links: [{ title: '초기 값', url: data.externalUrl('saved') }],
  });
  const owner = await data.session(creator);
  const path = backend(`/api/me/links/${creator.links[0].id}`);
  const saved = await owner.page.request.patch(path, {
    headers: { Origin: WEB_URL },
    data: { title: '마지막 저장값' },
  });
  expect(saved.status()).toBe(200);
  await data.db.query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", [
    creator.userId,
  ]);
  const expired = await owner.page.request.patch(path, {
    headers: { Origin: WEB_URL },
    data: { title: '만료 뒤 덮어쓰기' },
  });
  expect(expired.status()).toBe(401);
  const { rows } = await data.db.query('SELECT title FROM links WHERE id = $1', [creator.links[0].id]);
  expect(rows).toEqual([{ title: '마지막 저장값' }]);
});

test('SIM-05 등록 요청·응답 대기 중 외부 문서로 떠나도 행동 클릭을 보존한다', async ({ data }, testInfo) => {
  const destination = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>외부 문서</title><h1>이동 완료</h1>');
  });
  const listening = once(destination, 'listening');
  destination.listen(0, '127.0.0.1');
  await listening;
  const address = destination.address();
  if (!address || typeof address === 'string') throw new Error('외부 문서 서버 포트를 찾지 못했습니다.');
  const url = `http://127.0.0.1:${address.port}/destination`;
  try {
    for (const phase of ['response', 'request'] as const) {
      const creator = await data.user({ links: [{ title: '바로 이동', url }] });
      const visitor = await data.session();
      // 외부 루프백 목적지까지 실제 HTTP로 이동합니다. 공용 fixture의 외부 응답 대체만 이 컨텍스트에서 해제합니다.
      await visitor.context.unrouteAll();
      await visitor.context.addInitScript(
        ({ phase }) => {
          const original = window.fetch;
          window.fetch = async (input, init) => {
            const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
            if (body?.type !== 'page_view') return original(input, init);
            Object.assign(window, { heldPageView: body });
            if (phase === 'response') {
              const response = await original(input, init);
              if (response.status !== 204) throw new Error('실제 페이지뷰 등록이 실패했습니다.');
            }
            // 원본 요청을 보내기 전 또는 실제204 응답 뒤에서만 보류합니다. 클릭/Beacon은 가로채지 않습니다.
            document.documentElement.dataset.registrationHeld = phase;
            return new Promise<Response>(() => {});
          };
        },
        { phase },
      );
      await visitor.page.goto(creator.shortUrl);
      await expect(visitor.page.locator('html')).toHaveAttribute('data-registration-held', phase);
      const pageView = await visitor.page.evaluate(
        () => (window as typeof window & { heldPageView: LandingEventRequest }).heldPageView,
      );
      const before = await data.db.query(
        "SELECT kind FROM landing_events WHERE short_link_id=$1 AND kind IN ('page_view','click')",
        [creator.shortLinkId],
      );
      expect(before.rows).toEqual(phase === 'request' ? [] : [{ kind: 'page_view' }]);
      await visitor.page.getByRole('link', { name: '바로 이동', exact: true }).click();
      await expect(visitor.page).toHaveURL(url);
      await expect(visitor.page.getByRole('heading', { name: '이동 완료' })).toBeVisible();
      await expect
        .poll(
          async () =>
            (
              await data.db.query(
                `SELECT kind, count(*)::int AS count FROM landing_events
         WHERE short_link_id=$1 AND kind IN ('page_view','click') GROUP BY kind ORDER BY kind`,
                [creator.shortLinkId],
              )
            ).rows,
        )
        .toEqual([
          { kind: 'click', count: 1 },
          { kind: 'page_view', count: 1 },
        ]);
      const clicked = await data.db.query(
        "SELECT event_id, target_kind, target_id FROM landing_events WHERE short_link_id=$1 AND kind='click'",
        [creator.shortLinkId],
      );
      expect(clicked.rows[0]).toMatchObject({ target_kind: 'link', target_id: creator.links[0].publicId });
      const binding = await data.db.query(
        `SELECT count(DISTINCT page_view_id)::int AS views, count(DISTINCT session_id)::int AS sessions,
         count(DISTINCT visitor_id)::int AS visitors, count(DISTINCT source_visit_id)::int AS sources
         FROM landing_events WHERE short_link_id=$1`,
        [creator.shortLinkId],
      );
      const clickDelivery = {
        pageView,
        event: {
          token: pageView.token,
          sessionId: pageView.sessionId,
          pageViewId: pageView.pageViewId,
          eventId: clicked.rows[0].event_id,
          type: 'click',
          targetKind: 'link',
          targetId: creator.links[0].publicId,
        },
      };
      // 같은 eventId를 실제 BFF/API에 다시 전달해도 pageview·click은 한 행씩입니다.
      const endpoint = backend(`/api/landings/${creator.publicId}/events`);
      for (let repeat = 0; repeat < 2; repeat++) {
        const response = await visitor.page.request.post(endpoint, {
          headers: { Origin: WEB_URL },
          data: clickDelivery,
        });
        expect(response.status()).toBe(204);
      }
      const duplicate = await data.db.query(
        "SELECT kind, count(*)::int AS count FROM landing_events WHERE short_link_id=$1 AND kind IN ('page_view','click') GROUP BY kind ORDER BY kind",
        [creator.shortLinkId],
      );
      expect(duplicate.rows).toEqual([
        { kind: 'click', count: 1 },
        { kind: 'page_view', count: 1 },
      ]);
      // 첫 등록 서명을 거부하면 뒤의 click을 성공으로 꾸미거나 행을 남기면 안 됩니다.
      const rejectedView = randomUUID();
      const rejected = await visitor.page.request.post(endpoint, {
        headers: { Origin: WEB_URL },
        data: {
          pageView: { ...clickDelivery.pageView, pageViewId: rejectedView, eventId: randomUUID(), token: 'invalid' },
          event: { ...clickDelivery.event, pageViewId: rejectedView, eventId: randomUUID(), token: 'invalid' },
        },
      });
      expect(rejected.status()).toBe(403);
      expect(
        (await data.db.query('SELECT kind FROM landing_events WHERE page_view_id=$1', [rejectedView])).rows,
      ).toEqual([]);
      await testInfo.attach(`pending-${phase}-db`, {
        body: JSON.stringify({
          phase,
          before: before.rows,
          after: duplicate.rows,
          binding: binding.rows,
          firstFailure: rejected.status(),
        }),
        contentType: 'application/json',
      });
      expect(binding.rows).toEqual([{ views: 1, sessions: 1, visitors: 1, sources: 1 }]);
      await waitForCount(data, 'link_clicks', creator.shortLinkId, 1);
      await testInfo.attach(`pending-${phase}-external-document`, {
        body: await visitor.page.screenshot(),
        contentType: 'image/png',
      });
    }
  } finally {
    const closed = once(destination, 'close');
    destination.close();
    await closed;
  }
});
