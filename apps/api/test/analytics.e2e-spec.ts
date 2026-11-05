import { randomUUID } from 'node:crypto';
import type { AnalyticsReport, CreatorLandingState, OperatorCreatorStats } from '@crelink/shared';
import type { PoolClient } from 'pg';
import { Database } from '../src/database';
import { RetentionService } from '../src/retention/retention.service';
import { api, createTestApp, login, type TestApp } from './test-app';

interface Creator {
  cookie: string;
  userId: string;
  shortId: string;
  publicId: string;
  blockId: string;
}
describe('본인·관리자 방문 분석', () => {
  let t: TestApp;
  let operator: string;
  const creator = async (): Promise<Creator> => {
    const id = randomUUID();
    const account = await login(t.baseUrl, `${id}|${id}@example.com`);
    const cookie = account.cookie!;
    const state = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    const row = (
      await t.pool.query<{ id: string; block_id: string }>(
        'SELECT sl.id,b.id AS block_id FROM short_links sl JOIN landing_blocks b ON b.landing_id=sl.landing_id WHERE sl.user_id=$1',
        [account.body.user!.id],
      )
    ).rows[0];
    return {
      cookie,
      userId: account.body.user!.id,
      shortId: row.id,
      publicId: state.landing.publicId,
      blockId: row.block_id,
    };
  };
  const event = async (
    owner: Creator,
    kind: string,
    at: string,
    options: {
      pageViewId?: string;
      visitorId?: string;
      sessionId?: string;
      active?: number;
      scroll?: number;
      targetKind?: string;
      targetId?: string;
      context?: boolean;
    } = {},
  ) => {
    const pageViewId = options.pageViewId ?? randomUUID();
    const visitorId = options.visitorId ?? randomUUID();
    const sessionId = options.sessionId ?? randomUUID();
    await t.pool.query(
      `INSERT INTO landing_events(event_id,page_view_id,session_id,short_link_id,visitor_id,kind,target_kind,target_id,
        occurred_at,active_ms,scroll_percent,ip,user_agent,country,city,referrer_host,device_type,browser,os,language,time_zone,
        viewport_width,viewport_height,screen_width,screen_height,pixel_ratio,utm)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'192.0.2.77','private-raw-user-agent',
         $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [
        randomUUID(),
        pageViewId,
        sessionId,
        owner.shortId,
        visitorId,
        kind,
        options.targetKind ?? '',
        options.targetId ?? '',
        at,
        options.active ?? 0,
        options.scroll ?? 0,
        ...(options.context
          ? [
              'KR',
              'Seoul',
              'instagram.com',
              'mobile',
              'Safari',
              'iOS',
              'ko-KR',
              'Asia/Seoul',
              390,
              844,
              390,
              844,
              3,
              {
                source: 'instagram',
                medium: 'social',
                campaign: 'launch',
                term: 'term',
                content: 'bio',
                id: 'campaign-id',
              },
            ]
          : [null, null, null, null, null, null, null, null, null, null, null, null, null, {}]),
      ],
    );
    return { pageViewId, visitorId, sessionId };
  };
  const report = (path: string, cookie = operator) => api<AnalyticsReport>(t.baseUrl, 'GET', path, { cookie });
  const mine = (owner: Creator, from = '2026-10-10', to = from) =>
    report(`/api/me/analytics?from=${from}&to=${to}`, owner.cookie);
  beforeAll(async () => {
    t = await createTestApp();
    operator = (await login(t.baseUrl, 'analytics-operator|operator@example.com')).cookie!;
  });
  afterAll(async () => {
    await t?.close();
  });

  it('익명401·일반크리에이터의관리자403, 본인조회필터주입거부와private캐시를확인한다', async () => {
    const owner = await creator();
    expect((await api(t.baseUrl, 'GET', '/api/me/analytics')).status).toBe(401);
    expect((await api(t.baseUrl, 'GET', '/api/admin/analytics')).status).toBe(401);
    expect((await report('/api/admin/analytics', owner.cookie)).status).toBe(403);
    for (const query of [
      `creatorId=${randomUUID()}`,
      `landingPublicId=${owner.publicId}`,
      'includeExcluded=1',
      'visitorId=anything',
    ])
      expect((await report(`/api/me/analytics?${query}`, owner.cookie)).status).toBe(400);
    const response = await mine(owner);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.body.scope).toEqual({
      kind: 'creator',
      creatorId: owner.userId,
      landingPublicId: owner.publicId,
      includeExcluded: false,
    });
  });

  it('운영자도본인랜딩의집계를조회하고서비스전체의크리에이터범위는유지한다', async () => {
    const owner = await creator();
    const other = await creator();
    await t.pool.query("UPDATE users SET role='operator',metrics_excluded_at=now() WHERE id=$1", [owner.userId]);
    const view = await event(owner, 'page_view', '2026-11-02 12:00+09', { active: 12000 });
    await event(owner, 'click', '2026-11-02 12:00:01+09', {
      ...view,
      targetKind: 'block',
      targetId: owner.blockId,
    });
    await event(other, 'page_view', '2026-11-02 12:00+09', { active: 90000 });
    await t.pool.query(
      "INSERT INTO visits(short_link_id,slug,visitor_id,occurred_at) VALUES($1,'s',$2,'2026-11-02 12:00+09')",
      [owner.shortId, randomUUID()],
    );

    const response = await mine(owner, '2026-11-02');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.body.scope).toEqual({
      kind: 'creator',
      creatorId: owner.userId,
      landingPublicId: owner.publicId,
      includeExcluded: false,
    });
    expect(response.body.summary).toMatchObject({ pageViews: 1, clicks: 1, activeMs: 12000 });
    expect(response.body.legacy.visits).toBe(1);
    expect(response.body.targets[0]).toMatchObject({ targetId: owner.blockId, clicks: 1 });
    for (const includeExcluded of ['', '&includeExcluded=1']) {
      const all = await report(`/api/admin/analytics?from=2026-11-02&to=2026-11-02${includeExcluded}`, owner.cookie);
      expect(all.status).toBe(200);
      expect(all.body.summary).toMatchObject({ pageViews: 1, clicks: 0, activeMs: 90000 });
    }
    expect((await report(`/api/me/analytics?creatorId=${other.userId}`, owner.cookie)).status).toBe(400);
    expect((await report(`/api/admin/analytics?creatorId=${owner.userId}`)).status).toBe(404);
  });

  it('본인자료만반환하고누적active중복·후속클릭중복을제거하며원식별자를내보내지않는다', async () => {
    const owner = await creator();
    const other = await creator();
    const view = await event(owner, 'page_view', '2026-10-10 12:00+09', { active: 30000, scroll: 100, context: true });
    await event(owner, 'page_view', '2026-10-10 13:00+09', { visitorId: view.visitorId, sessionId: view.sessionId });
    await event(owner, 'engagement', '2026-10-10 12:00:15+09', { ...view, active: 10000, scroll: 50 });
    await event(owner, 'impression', '2026-10-10 12:00:01+09', {
      ...view,
      targetKind: 'block',
      targetId: owner.blockId,
    });
    await event(owner, 'click', '2026-10-10 12:00:02+09', { ...view, targetKind: 'block', targetId: owner.blockId });
    await event(owner, 'click', '2026-10-10 12:00:03+09', { ...view, targetKind: 'block', targetId: owner.blockId });
    await event(other, 'page_view', '2026-10-10 12:00+09', { active: 90000, context: true });
    const response = await mine(owner);
    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      pageViews: 2,
      clicks: 2,
      impressions: 1,
      activeMs: 30000,
      averageActiveMs: 15000,
      uniqueVisitors: 1,
      sessions: 1,
      dailyPageUniqueVisitors: 1,
      dailyPageSessions: 1,
      clickedPageViews: 1,
      clickThroughRate: 0.5,
      scroll25: 1,
      scroll50: 1,
      scroll75: 1,
      scroll100: 1,
    });
    expect(response.body.targets).toEqual([
      {
        targetKind: 'block',
        targetId: owner.blockId,
        label: '링크 목록',
        clicks: 2,
        impressions: 1,
        clickThroughRate: 1,
      },
    ]);
    expect(response.body.breakdowns.utm.source).toEqual([
      { value: 'instagram', count: 1 },
      { value: 'unknown', count: 1 },
    ]);
    expect(response.body.breakdowns.viewports).toEqual([
      { value: '390x844', count: 1 },
      { value: 'unknown', count: 1 },
    ]);
    for (const secret of [
      '192.0.2.77',
      'private-raw-user-agent',
      view.visitorId,
      view.sessionId,
      view.pageViewId,
      other.userId,
    ])
      expect(JSON.stringify(response.body)).not.toContain(secret);
  });

  it('서비스전체는페이지별unique를합하지않고시험계정필터·명시계정·랜딩교차검증을적용한다', async () => {
    const first = await creator();
    const second = await creator();
    const excluded = await creator();
    const ids = { visitorId: randomUUID(), sessionId: randomUUID() };
    for (const owner of [first, second, excluded]) await event(owner, 'page_view', '2026-10-12 12:00+09', ids);
    await t.pool.query('UPDATE users SET metrics_excluded_at=now() WHERE id=$1', [excluded.userId]);
    const all = (await report('/api/admin/analytics?from=2026-10-12&to=2026-10-12')).body;
    expect(all.summary.pageViews).toBe(2);
    expect(all.summary.uniqueVisitors).toBe(1);
    expect(all.summary.sessions).toBe(1);
    expect(all.summary.dailyPageUniqueVisitors).toBe(2);
    expect(all.daily[0].dailyPageUniqueVisitors).toBe(2);
    expect(all.summary.dailyPageSessions).toBe(2);
    expect(all.daily[0].dailyPageSessions).toBe(2);
    const included = (await report('/api/admin/analytics?from=2026-10-12&to=2026-10-12&includeExcluded=1')).body;
    expect(included.summary.pageViews).toBe(3);
    expect(included.scope.includeExcluded).toBe(true);
    const selected = await report(`/api/admin/analytics?from=2026-10-12&to=2026-10-12&creatorId=${excluded.userId}`);
    expect(selected.status).toBe(200);
    expect(selected.body.summary.pageViews).toBe(1);
    expect(
      (await report(`/api/admin/analytics?creatorId=${first.userId}&landingPublicId=${second.publicId}`)).status,
    ).toBe(404);
    const byLanding = await report(
      `/api/admin/analytics?landingPublicId=${first.publicId}&from=2026-10-12&to=2026-10-12`,
    );
    expect(byLanding.status).toBe(200);
    expect(byLanding.body.scope.creatorId).toBe(first.userId);
  });

  it('서울자정넘긴후속클릭은표시·노출cohort비율에귀속하고이벤트횟수는발생일에둔다', async () => {
    const owner = await creator();
    const view = await event(owner, 'page_view', '2026-10-14 23:59:58+09');
    await event(owner, 'impression', '2026-10-14 23:59:59+09', {
      ...view,
      targetKind: 'block',
      targetId: owner.blockId,
    });
    await event(owner, 'click', '2026-10-15 00:00:01+09', { ...view, targetKind: 'block', targetId: owner.blockId });
    const before = (await mine(owner, '2026-10-14')).body;
    expect([before.summary.pageViews, before.summary.clicks, before.summary.clickThroughRate]).toEqual([1, 0, 1]);
    expect(before.targets[0].clickThroughRate).toBe(1);
    const after = (await mine(owner, '2026-10-15')).body;
    expect([after.summary.pageViews, after.summary.clicks, after.summary.clickThroughRate]).toEqual([0, 1, null]);
    expect(after.targets[0].clickThroughRate).toBeNull();
  });

  it('수집전legacy302기록은별도합산하고빈날짜·분모0·coverage를정직하게표시한다', async () => {
    const owner = await creator();
    await t.pool.query(
      "INSERT INTO visits(short_link_id,slug,visitor_id,occurred_at) VALUES($1,'s',$2,'2026-10-16 12:00+09')",
      [owner.shortId, randomUUID()],
    );
    await t.pool.query(
      "INSERT INTO link_clicks(short_link_id,link_public_id,visitor_id,occurred_at) VALUES($1,'deleted001',$2,'2026-10-16 12:00+09')",
      [owner.shortId, randomUUID()],
    );
    const result = (await mine(owner, '2026-10-16', '2026-10-17')).body;
    expect(result.legacy).toEqual({ visits: 1, linkClicks: 1, creatorBannerClicks: 0 });
    expect(result.summary.pageViews).toBe(0);
    expect(result.summary.clickThroughRate).toBeNull();
    expect(result.summary.averageActiveMs).toBeNull();
    expect(result.daily).toHaveLength(2);
    expect(result.daily[1].legacyVisits).toBe(0);
    expect(result.coverage.firstRecordedDay).toBeNull();
    expect(result.coverage.includesRollups).toBe(false);
    expect((await report('/api/me/analytics', owner.cookie)).body.daily).toHaveLength(30);
  });

  it('날짜형식·역전·366일초과·중복query·필터형식·알수없는조건을400으로거부한다', async () => {
    const owner = await creator();
    for (const query of [
      'from=x',
      'from=0000-01-01&to=0000-01-01',
      'from=2026-02-30',
      'from=2026-10-02&to=2026-10-01',
      'from=2020-01-01&to=2026-01-01',
      'from=2026-10-10&from=2026-10-11',
    ])
      expect((await report(`/api/me/analytics?${query}`, owner.cookie)).status).toBe(400);
    for (const query of [
      'creatorId=x',
      'landingPublicId=x',
      'includeExcluded=0',
      'includeExcluded=1&includeExcluded=1',
      'unknown=yes',
    ])
      expect((await report(`/api/admin/analytics?${query}`)).status).toBe(400);
  });

  it('분포 상위 20개를 넘으면 나머지를 합치고 실제 other 값과 중복 키를 만들지 않는다', async () => {
    const owner = await creator();
    await t.pool.query(
      `INSERT INTO landing_events(event_id,page_view_id,session_id,short_link_id,visitor_id,kind,occurred_at,utm)
       SELECT gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),$1,gen_random_uuid(),'page_view',
         '2026-10-18 12:00+09'::timestamptz,jsonb_build_object('source',CASE WHEN n<=3 THEN 'other' ELSE 'source-'||n END)
       FROM generate_series(1,25) n`,
      [owner.shortId],
    );
    const result = (await mine(owner, '2026-10-18')).body;
    expect(result.breakdowns.utm.source).toHaveLength(20);
    expect(result.breakdowns.utm.source.filter((row) => row.value === 'other')).toHaveLength(1);
    expect(result.breakdowns.utm.source.reduce((sum, row) => sum + row.count, 0)).toBe(25);
  });

  it('365일 지난 원본 이동 뒤에도 수량·분포·cohort 비율·체류를 유지하고 정확 unique만 null로 구분한다', async () => {
    const owner = await creator();
    const old = (
      await t.pool.query<{ day: string }>("SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date-367)::text AS day")
    ).rows[0].day;
    const view = await event(owner, 'page_view', `${old} 12:00+09`, { active: 25000, scroll: 75, context: true });
    await event(owner, 'impression', `${old} 12:00:01+09`, { ...view, targetKind: 'block', targetId: owner.blockId });
    await event(owner, 'click', `${old} 12:00:02+09`, { ...view, targetKind: 'block', targetId: owner.blockId });
    const before = (await mine(owner, old)).body;
    await t.app.get(RetentionService).runOnce();
    const after = (await mine(owner, old)).body;
    expect(after.summary).toEqual({ ...before.summary, uniqueVisitors: null, sessions: null });
    expect(after.breakdowns).toEqual(before.breakdowns);
    expect(after.targets).toEqual(before.targets);
    expect(after.coverage).toMatchObject({ includesRollups: true, firstRecordedDay: old, hasMissingDimensions: false });
    expect((await t.pool.query('SELECT 1 FROM landing_events WHERE short_link_id=$1', [owner.shortId])).rowCount).toBe(
      0,
    );
    await t.app.get(RetentionService).runOnce();
    expect((await mine(owner, old)).body.summary).toEqual(after.summary);
  });

  it('이전보존집계의복원불가카운터는null·분포는unknown으로유지한다', async () => {
    const owner = await creator();
    await t.pool.query(
      `INSERT INTO landing_event_daily_rollups(day,short_link_id,kind,target_kind,target_id,events,unique_visitors,unique_sessions,active_ms,max_scroll_percent)
      VALUES('2026-01-01',$1,'page_view','','',3,2,2,6000,50),('2026-01-01',$1,'impression','block',$2,2,2,2,0,0)`,
      [owner.shortId, owner.blockId],
    );
    const result = (await mine(owner, '2026-01-01')).body;
    expect(result.summary).toMatchObject({
      pageViews: 3,
      activeMs: 6000,
      averageActiveMs: 2000,
      uniqueVisitors: null,
      sessions: null,
      dailyPageUniqueVisitors: 2,
      dailyPageSessions: 2,
      clickedPageViews: null,
      clickThroughRate: null,
      scroll25: null,
    });
    expect(result.targets[0].clickThroughRate).toBeNull();
    expect(result.coverage.hasMissingDimensions).toBe(true);
    expect(result.breakdowns.countries).toEqual([{ value: 'unknown', count: 3 }]);
  });

  it('원본조회와집계조회사이보존커밋이있어도새analytics와기존stats는같은snapshot으로중복을막는다', async () => {
    const db = t.app.get(Database);
    const runSnapshot = db.snapshot.bind(db);
    for (const mode of ['analytics', 'legacy'] as const) {
      const owner = await creator();
      const day = (
        await t.pool.query<{ day: string }>("SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date-368)::text AS day")
      ).rows[0].day;
      await event(owner, 'page_view', `${day} 12:00+09`);
      await t.pool.query(`INSERT INTO visits(short_link_id,slug,visitor_id,occurred_at) VALUES($1,'s',$2,$3)`, [
        owner.shortId,
        randomUUID(),
        `${day} 12:00+09`,
      ]);
      let release!: () => void;
      const moved = new Promise<void>((resolve) => {
        release = resolve;
      });
      let triggered = false;
      const spy = jest.spyOn(db, 'snapshot').mockImplementation((run) =>
        runSnapshot((client) => {
          const query = client.query.bind(client);
          const proxy = new Proxy(client, {
            get(target, key) {
              if (key !== 'query') return Reflect.get(target, key);
              return async (sql: string, values: unknown[]) => {
                const first =
                  mode === 'analytics'
                    ? sql.includes('AS clicked_page_views') && sql.includes('FROM landing_events e WHERE')
                    : sql.includes('FROM visits WHERE') && sql.includes('GROUP BY 1');
                const rolled =
                  mode === 'analytics'
                    ? sql.includes('FROM landing_event_daily_rollups')
                    : sql.includes('FROM visit_daily_rollups');
                if (rolled) await moved;
                const result = await query(sql, values);
                if (first && !triggered) {
                  triggered = true;
                  try {
                    await t.app.get(RetentionService).runOnce();
                  } finally {
                    release();
                  }
                }
                return result;
              };
            },
          }) as PoolClient;
          return run(proxy);
        }),
      );
      try {
        if (mode === 'analytics') {
          const response = await mine(owner, day);
          expect(response.status).toBe(200);
          expect(response.body.summary.pageViews).toBe(1);
          expect(response.body.coverage.includesRollups).toBe(false);
        } else {
          const response = await api<OperatorCreatorStats>(
            t.baseUrl,
            'GET',
            `/api/admin/creators/${owner.userId}/stats?from=${day}&to=${day}`,
            { cookie: operator },
          );
          expect(response.status).toBe(200);
          expect(response.body.totals.visits).toBe(1);
        }
        expect(triggered).toBe(true);
      } finally {
        release();
        spy.mockRestore();
      }
    }
  });
});
