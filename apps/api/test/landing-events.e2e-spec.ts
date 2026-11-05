import { createHash, randomUUID } from 'node:crypto';
import type {
  CreatorLandingState,
  LandingEventRequest,
  PublicLandingResponse,
  UploadFileResponse,
} from '@crelink/shared';
import { LandingPassService } from '../src/short-link/landing-pass.service';
import { RetentionService } from '../src/retention/retention.service';
import { PNG_STILL } from './image-samples';
import { api, createTestApp, login, type TestApp, waitForRows, WEB_URL } from './test-app';

interface Creator {
  cookie: string;
  userId: string;
  slug: string;
  publicId: string;
  landingId: string;
  shortId: string;
  blockId: string;
  linkId: string;
}
describe('공개 랜딩 브라우저 계측', () => {
  let t: TestApp;
  let owner: Creator;
  let other: Creator;
  let socialId: string;
  let portfolioId: string;
  let portfolioNoLink: string;
  const adId = 'eventad001';
  const bannerId = 'eventbn001';
  const bannerNoLink = 'eventbn002';
  const newCreator = async (): Promise<Creator> => {
    const id = randomUUID();
    const result = await login(t.baseUrl, `${id}|${id}@example.com`);
    const cookie = result.cookie!;
    const state = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    const landing = (
      await t.pool.query<{ id: string; short_id: string; block_id: string }>(
        'SELECT l.id,sl.id AS short_id,b.id AS block_id FROM landings l JOIN short_links sl ON sl.landing_id=l.id JOIN landing_blocks b ON b.landing_id=l.id WHERE l.public_id=$1',
        [state.landing.publicId],
      )
    ).rows[0];
    const link = (
      await api<{ id: string }>(t.baseUrl, 'POST', '/api/me/links', {
        cookie,
        body: { title: '링크', url: 'https://example.test/' },
      })
    ).body;
    const publicLink = (await t.pool.query<{ public_id: string }>('SELECT public_id FROM links WHERE id=$1', [link.id]))
      .rows[0].public_id;
    return {
      cookie,
      userId: result.body.user!.id,
      slug: state.shortLink.slug,
      publicId: state.landing.publicId,
      landingId: landing.id,
      shortId: landing.short_id,
      blockId: landing.block_id,
      linkId: publicLink,
    };
  };
  const binding = (creator = owner, visitorId = randomUUID()) => {
    const passes = t.app.get(LandingPassService);
    const pass = passes.issue(creator.publicId, Date.now(), visitorId);
    return {
      visitorId,
      pass,
      body: {
        token: passes.telemetryToken(creator.publicId, pass)!,
        eventId: randomUUID(),
        sessionId: randomUUID(),
        pageViewId: randomUUID(),
        type: 'page_view',
      } as LandingEventRequest,
    };
  };
  const send = (body: unknown, creator = owner, headers: Record<string, string> = {}) =>
    api(t.baseUrl, 'POST', `/api/landings/${creator.publicId}/events`, {
      body,
      headers: { origin: WEB_URL, ...headers },
    });
  const seed = async (body: LandingEventRequest, creator = owner) => {
    expect((await send(body, creator)).status).toBe(204);
  };
  const event = (body: LandingEventRequest, patch: Partial<LandingEventRequest>) => ({
    ...body,
    eventId: randomUUID(),
    ...patch,
  });

  beforeAll(async () => {
    t = await createTestApp();
    owner = await newCreator();
    other = await newCreator();
    await api(t.baseUrl, 'PUT', '/api/me/socials', {
      cookie: owner.cookie,
      body: { items: [{ platform: 'instagram', url: 'https://instagram.example/profile' }] },
    });
    socialId = (
      await t.pool.query<{ id: string }>('SELECT id FROM social_links WHERE landing_id=$1', [owner.landingId])
    ).rows[0].id;
    portfolioId = (
      await api<{ id: string }>(t.baseUrl, 'POST', '/api/me/portfolio', {
        cookie: owner.cookie,
        body: { title: '작업', url: 'https://portfolio.example/' },
      })
    ).body.id;
    portfolioNoLink = (
      await api<{ id: string }>(t.baseUrl, 'POST', '/api/me/portfolio', {
        cookie: owner.cookie,
        body: { title: '이미지만 있는 작업' },
      })
    ).body.id;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG_STILL)], { type: 'image/png' }), 'banner.png');
    const uploaded = await fetch(`${t.baseUrl}/api/me/files`, {
      method: 'POST',
      headers: { cookie: owner.cookie },
      body: form,
    });
    const fileId = ((await uploaded.json()) as UploadFileResponse).fileId;
    await t.pool.query(
      "INSERT INTO ad_banners(public_id,image_file_id,alt,url,host,starts_at,sort_order) VALUES($1,$2,'광고','https://ad.example','ad.example',now()-interval '1 day',0)",
      [adId, fileId],
    );
    for (const [id, url] of [
      [bannerId, 'https://creator.example'],
      [bannerNoLink, null],
    ]) {
      await t.pool.query(
        'INSERT INTO creator_banners(public_id,user_id,landing_id,image_file_id,alt,url,host,position) VALUES($1,$2,$3,$4,$1,$5,$6,0)',
        [id, owner.userId, owner.landingId, fileId, url, url ? 'creator.example' : null],
      );
    }
  }, 30_000);
  beforeEach(async () => {
    await t.pool.query('DELETE FROM landing_events');
    await t.pool.query('DELETE FROM landing_event_limits');
    await t.pool.query('DELETE FROM landing_event_daily_rollups');
    await t.pool.query('DELETE FROM visits');
    await t.pool.query('UPDATE users SET suspended_at=NULL,banner_slot_granted_at=NULL,ad_block_enabled=true');
    await t.pool.query('UPDATE platform_settings SET ad_block_enabled=true');
    await t.pool.query('UPDATE links SET hidden=false,blocked_at=NULL');
  });
  afterAll(async () => {
    await t?.close();
  });

  it('단축 UTM·익명 방문자 바인딩을 보존하며 공개 응답에 token·안정 키·대상 ID를 준다', async () => {
    const visitor = randomUUID();
    const response = await fetch(
      `${t.baseUrl}/${owner.slug}?utm_source=instagram&utm_campaign=sale&utm_id=launch&email=private`,
      {
        redirect: 'manual',
        headers: { cookie: `cl_vid=${visitor}`, referer: 'https://instagram.example/', 'user-agent': 'test-browser' },
      },
    );
    const target = new URL(response.headers.get('location')!);
    expect(target.searchParams.get('utm_source')).toBe('instagram');
    expect(target.searchParams.has('email')).toBe(false);
    const pass = target.searchParams.get('pass')!;
    const publicPage = (
      await api<PublicLandingResponse>(t.baseUrl, 'GET', `/api/public/landings/${owner.publicId}?pass=${pass}`)
    ).body;
    expect(publicPage.telemetryToken).toBeTruthy();
    expect(publicPage.telemetrySessionKey).toBe(visitor);
    expect(publicPage.blocks[0].id).toBe(owner.blockId);
    expect(publicPage.socials[0].id).toBe(socialId);
    const [visit] = await waitForRows(
      async () => (await t.pool.query('SELECT utm FROM visits WHERE visitor_id=$1', [visitor])).rows,
    );
    expect(visit.utm).toEqual({ source: 'instagram', campaign: 'sale', id: 'launch' });
    const body = binding(owner, visitor).body;
    body.token = publicPage.telemetryToken!;
    await seed(body);
    const raw = (await t.pool.query('SELECT ip,country,city,user_agent,utm FROM landing_events')).rows[0];
    expect(raw).toMatchObject({
      ip: '127.0.0.1',
      country: 'KR',
      city: 'Seoul',
      user_agent: 'test-browser',
      utm: visit.utm,
    });
    const preview = (await api<PublicLandingResponse>(t.baseUrl, 'GET', `/api/public/landings/${owner.publicId}`)).body;
    expect(preview.telemetryToken).toBeNull();
    expect(preview.telemetrySessionKey).toBeNull();
  });

  it('연결할 원 방문이 없으면 BFF 소켓·UA를 추정 저장하지 않는다', async () => {
    const { body } = binding();
    await seed({
      ...body,
      language: 'ko-KR',
      timeZone: 'Asia/Seoul',
      viewportWidth: 390,
      viewportHeight: 844,
      screenWidth: 390,
      screenHeight: 844,
      pixelRatio: 3,
    });
    expect(
      (await t.pool.query('SELECT ip,user_agent,country,city,language,time_zone,viewport_width FROM landing_events'))
        .rows[0],
    ).toEqual({
      ip: null,
      user_agent: null,
      country: null,
      city: null,
      language: 'ko-KR',
      time_zone: 'Asia/Seoul',
      viewport_width: 390,
    });
  });

  it('page_view·eventId·노출 재전송을 멱등 처리하고 체류·스크롤은 최댓값만 남긴다', async () => {
    const { body } = binding();
    await seed(body);
    await seed(body);
    await seed(event(body, { type: 'page_view' }));
    const impression = event(body, { type: 'impression', targetKind: 'block', targetId: owner.blockId });
    await seed(impression);
    await seed(impression);
    await seed(event(impression, {}));
    for (const activeMs of [15000, 10000, 30000])
      await seed(event(body, { type: 'engagement', activeMs, scrollPercent: activeMs === 10000 ? 25 : 75 }));
    const rows = (
      await t.pool.query(
        "SELECT kind,active_ms,scroll_percent FROM landing_events WHERE kind IN ('page_view','impression') ORDER BY kind",
      )
    ).rows;
    expect(rows).toEqual([
      { kind: 'impression', active_ms: 0, scroll_percent: 0 },
      { kind: 'page_view', active_ms: 30000, scroll_percent: 75 },
    ]);
  });

  it('실제 SNS·포트폴리오·링크·광고 클릭을 허용하고 기존 302 클릭과 따로 기록한다', async () => {
    const { body } = binding();
    await seed(body);
    for (const [targetKind, targetId] of [
      ['social', socialId],
      ['portfolio', portfolioId],
      ['link', owner.linkId],
      ['ad_banner', adId],
    ] as const) {
      await seed(event(body, { type: 'click', targetKind, targetId }));
    }
    expect((await t.pool.query("SELECT 1 FROM landing_events WHERE kind='click'")).rowCount).toBe(4);
    expect((await t.pool.query('SELECT 1 FROM link_clicks')).rowCount).toBe(0);
  });

  it('URL 없는 포트폴리오·크리에이터 배너는 노출만 허용한다', async () => {
    await t.pool.query('UPDATE users SET banner_slot_granted_at=now() WHERE id=$1', [owner.userId]);
    const { body } = binding();
    await seed(body);
    for (const [targetKind, targetId] of [
      ['portfolio', portfolioNoLink],
      ['creator_banner', bannerNoLink],
    ] as const) {
      await seed(event(body, { type: 'impression', targetKind, targetId }));
      expect((await send(event(body, { type: 'click', targetKind, targetId }))).status).toBe(403);
    }
    await seed(event(body, { type: 'click', targetKind: 'creator_banner', targetId: bannerId }));
  });

  it('없는·타 랜딩·숨김 대상과 정지 계정 이벤트를 거부한다', async () => {
    const { body } = binding();
    await seed(body);
    expect((await send(event(body, { type: 'click', targetKind: 'link', targetId: other.linkId }))).status).toBe(403);
    expect((await send(event(body, { type: 'impression', targetKind: 'block', targetId: other.blockId }))).status).toBe(
      403,
    );
    await t.pool.query('UPDATE links SET hidden=true WHERE public_id=$1', [owner.linkId]);
    expect((await send(event(body, { type: 'click', targetKind: 'link', targetId: owner.linkId }))).status).toBe(403);
    await t.pool.query('UPDATE users SET suspended_at=now() WHERE id=$1', [owner.userId]);
    expect((await send(event(body, { type: 'engagement', activeMs: 100 }))).status).toBe(403);
  });

  it('구형·만료·다른 페이지·변조 토큰과 외부 Origin을 거부한다', async () => {
    const { body, pass } = binding();
    expect((await send({ ...body, token: pass })).status).toBe(403);
    expect((await send({ ...body, token: `${body.token}x` })).status).toBe(403);
    expect((await send(body, other)).status).toBe(403);
    const passes = t.app.get(LandingPassService);
    const old = Date.now() - 2 * 86400000;
    const expired = passes.telemetryToken(owner.publicId, passes.issue(owner.publicId, old, randomUUID()), old)!;
    expect((await send({ ...body, token: expired })).status).toBe(403);
    expect((await send(body, owner, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await send(body, owner, { origin: '' })).status).toBe(403);
    expect((await send(body, owner, { 'content-type': 'text/plain' })).status).toBe(403);
  });

  it('입력 한도·종류·추가 필드·이벤트 순서를 검증한다', async () => {
    const { body } = binding();
    for (const patch of [
      { type: 'unknown' },
      { eventId: 'bad' },
      { extra: 'ignored' },
      { utm: { email: 'private' } },
      { utm: { source: 'x'.repeat(201) } },
      { timeZone: 'not/a/timezone' },
      { viewportWidth: 0 },
      { pixelRatio: 100 },
      { activeMs: 100 },
    ]) {
      expect((await send({ ...body, ...patch })).status).toBe(400);
    }
    expect((await send(event(body, { type: 'engagement', activeMs: 1 }))).status).toBe(400);
    expect((await send({ ...body, language: 'x'.repeat(17000) })).status).toBe(413);
    expect((await t.pool.query('SELECT 1 FROM landing_events')).rowCount).toBe(0);
  });

  it('세션·pageView·eventId를 다른 방문자가 재사용해도 바인딩을 바꿀 수 없다', async () => {
    const first = binding();
    const second = binding();
    await seed(first.body);
    expect((await send({ ...second.body, sessionId: first.body.sessionId })).status).toBe(403);
    expect((await send({ ...second.body, pageViewId: first.body.pageViewId })).status).toBe(403);
    expect((await send({ ...second.body, eventId: first.body.eventId })).status).toBe(403);
    const concurrentA = binding();
    const concurrentB = binding();
    const responses = await Promise.all([
      send(concurrentA.body),
      send({ ...concurrentB.body, pageViewId: concurrentA.body.pageViewId }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([204, 403]);
  });

  it('같은 BFF 소켓의 서로 다른 방문자들이 합계240회를 넘겨도 전역 차단되지 않는다', async () => {
    for (let visitor = 0; visitor < 3; visitor++) {
      const { body, visitorId } = binding();
      if (visitor < 2)
        await t.pool.query('INSERT INTO visits(short_link_id,slug,visitor_id,ip) VALUES($1,$2,$3,$4)', [
          owner.shortId,
          owner.slug,
          visitorId,
          `198.51.100.${visitor + 1}`,
        ]);
      await seed(body);
      for (let i = 0; i < 90; i++)
        await seed(event(body, { type: 'click', targetKind: 'link', targetId: owner.linkId }));
    }
    expect((await t.pool.query("SELECT 1 FROM landing_events WHERE kind='click'")).rowCount).toBe(270);
    expect((await t.pool.query("SELECT 1 FROM landing_event_limits WHERE bucket LIKE 'source:%'")).rowCount).toBe(2);
  }, 30_000);

  it('방문자 제한 초과 요청은 계속 행을 만들지 않고 재시도도 누적 체류를 늘리지 않는다', async () => {
    const { body } = binding();
    await seed(body);
    await t.pool.query("UPDATE landing_event_limits SET used=120 WHERE bucket LIKE 'visitor:%'");
    expect((await send(event(body, { type: 'click', targetKind: 'link', targetId: owner.linkId }))).status).toBe(429);
    expect((await t.pool.query('SELECT 1 FROM landing_events')).rowCount).toBe(1);
  });

  it('이미 제한된 방문자의 반복 요청은 같은 원 IP의 다른 방문자 한도를 소비하지 않는다', async () => {
    const a = binding();
    const b = binding();
    for (const tracker of [a, b])
      await t.pool.query("INSERT INTO visits(short_link_id,slug,visitor_id,ip) VALUES($1,$2,$3,'198.51.100.99')", [
        owner.shortId,
        owner.slug,
        tracker.visitorId,
      ]);
    await seed(a.body);
    await seed(b.body);
    const bucket = `visitor:${createHash('sha256').update(a.visitorId).digest('hex')}`;
    await t.pool.query('UPDATE landing_event_limits SET used=120 WHERE bucket=$1', [bucket]);
    for (let i = 0; i < 3; i++)
      expect((await send(event(a.body, { type: 'click', targetKind: 'link', targetId: owner.linkId }))).status).toBe(
        429,
      );
    expect((await t.pool.query("SELECT used FROM landing_event_limits WHERE bucket LIKE 'source:%'")).rows).toEqual([
      { used: 2 },
    ]);
    await seed(event(b.body, { type: 'click', targetKind: 'link', targetId: owner.linkId }));
  });

  it('365일 뒤 비식별 집계로 옮기고 실패하면 집계와 원본 삭제를 함께 되돌린다', async () => {
    const { body } = binding();
    await seed(body);
    await seed(event(body, { type: 'engagement', activeMs: 20000, scrollPercent: 75 }));
    await t.pool.query("UPDATE landing_events SET occurred_at=now()-interval '366 days'");
    await t.pool.query(
      "CREATE FUNCTION fail_telemetry_rollup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollup failure'; END $$",
    );
    await t.pool.query(
      'CREATE TRIGGER reject_rollup BEFORE DELETE ON landing_events FOR EACH ROW EXECUTE FUNCTION fail_telemetry_rollup()',
    );
    await expect(t.app.get(RetentionService).runOnce()).rejects.toThrow('fixture rollup failure');
    expect((await t.pool.query('SELECT 1 FROM landing_events')).rowCount).toBe(2);
    expect((await t.pool.query('SELECT 1 FROM landing_event_daily_rollups')).rowCount).toBe(0);
    expect((await t.pool.query('SELECT 1 FROM landing_event_dimension_rollups')).rowCount).toBe(0);
    await t.pool.query('DROP TRIGGER reject_rollup ON landing_events');
    await t.pool.query('DROP FUNCTION fail_telemetry_rollup()');
    await t.app.get(RetentionService).runOnce();
    await t.app.get(RetentionService).runOnce();
    expect((await t.pool.query('SELECT 1 FROM landing_events')).rowCount).toBe(0);
    expect(
      (
        await t.pool.query(
          "SELECT events,active_ms::text,max_scroll_percent FROM landing_event_daily_rollups WHERE kind='page_view'",
        )
      ).rows,
    ).toEqual([{ events: 1, active_ms: '20000', max_scroll_percent: 75 }]);
    const columns = (
      await t.pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='landing_event_daily_rollups'",
      )
    ).rows.map((row) => row.column_name);
    for (const field of ['visitor_id', 'session_id', 'ip', 'user_agent', 'language', 'utm'])
      expect(columns).not.toContain(field);
  });
});
