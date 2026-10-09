import {
  ApiError,
  CreatorLandingState,
  CreatorSlotEventState,
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  LinkView,
  OperatorCreatorDetail,
  OperatorSlotEventResponse,
  PublicSlotEventResponse,
} from '@crelink/shared';
import { api, createTestApp, login, TestApp } from './test-app';

/**
 * 링크 슬롯 +5 이벤트(R24 ①②③⑤, R13). 설계: docs/specs/crelink-slot-event.md.
 * 이벤트는 migration 0005가 시드한 전역 행 하나라, 기간을 바꾼 시험은 끝에 `openEvent()`로 되돌립니다.
 */
describe('링크 슬롯 이벤트 (R24)', () => {
  let t: TestApp;
  let operator: string;
  let n = 0;

  const newCreator = async () => {
    n += 1;
    const result = await login(t.baseUrl, `slot-${n}|slot${n}@example.com`);
    return { cookie: result.cookie!, userId: result.body.user!.id };
  };
  const state = async (cookie: string) =>
    (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
  const apply = (cookie: string) =>
    api<CreatorSlotEventState & Partial<ApiError>>(t.baseUrl, 'POST', CRELINK_API_PATHS.meSlotEventEntry, { cookie });
  const addLink = (cookie: string, body: Record<string, unknown>) =>
    api<LinkView & Partial<ApiError>>(t.baseUrl, 'POST', '/api/me/links', { cookie, body });
  const adminView = (query = '') =>
    api<OperatorSlotEventResponse & Partial<ApiError>>(
      t.baseUrl,
      'GET',
      `${CRELINK_API_PATHS.adminSlotEvent}${query}`,
      {
        cookie: operator,
      },
    );
  const setPeriod = (body: unknown) =>
    api<OperatorSlotEventResponse & Partial<ApiError>>(t.baseUrl, 'PUT', CRELINK_API_PATHS.adminSlotEvent, {
      cookie: operator,
      body,
    });
  const detail = async (userId: string) =>
    (await api<OperatorCreatorDetail>(t.baseUrl, 'GET', `/api/admin/creators/${userId}`, { cookie: operator })).body;
  const entryRows = async (userId: string) =>
    (await t.pool.query('SELECT bonus_links FROM slot_event_entries WHERE user_id = $1', [userId])).rows;
  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
  /** 시작 1시간 전·끝 없음(열림)으로 되돌립니다. */
  const openEvent = async () => {
    expect((await setPeriod({ startsAt: hoursFromNow(-1), endsAt: null })).status).toBe(200);
  };

  beforeAll(async () => {
    t = await createTestApp();
    operator = (await login(t.baseUrl, 'operator-sub|operator@example.com')).cookie!;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('공개 이벤트: 시드 행(보너스 5, 끝 없음)이 열림이고 no-store, 기간·보너스만 준다', async () => {
    const response = await api<PublicSlotEventResponse>(t.baseUrl, 'GET', CRELINK_API_PATHS.publicSlotEvent);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.body).toEqual({
      event: { bonusLinks: 5, startsAt: expect.any(String), endsAt: null, status: 'open' },
    });
    expect(Date.parse(response.body.event!.startsAt)).toBeLessThanOrEqual(Date.now());
  });

  it('신청은 로그인이 필요하다(401)', async () => {
    const response = await apply('');
    expect([response.status, response.body.code]).toEqual([401, 'unauthenticated']);
  });

  it('신청 전 한도 5·뒤 10, 다시 신청하면 200과 같은 모양, 행은 1개', async () => {
    const creator = await newCreator();
    const before = await state(creator.cookie);
    expect(before.limits.visibleMax).toBe(5);
    expect(before.slotEvent).toEqual({
      event: { bonusLinks: 5, startsAt: expect.any(String), endsAt: null, status: 'open' },
      entry: null,
    });

    const first = await apply(creator.cookie);
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      event: before.slotEvent.event,
      entry: { appliedAt: expect.any(String), bonusLinks: 5 },
    });
    const after = await state(creator.cookie);
    expect(after.limits).toEqual({ visibleMax: 10, visibleUsed: 0, totalMax: 50, totalUsed: 0 });
    expect(after.slotEvent).toEqual(first.body);

    const again = await apply(creator.cookie);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(await entryRows(creator.userId)).toEqual([{ bonus_links: 5 }]);
  });

  it('같은 계정 동시 신청 10건은 행 1개, 응답은 201 하나와 200 나머지', async () => {
    const creator = await newCreator();
    const responses = await Promise.all(Array.from({ length: 10 }, () => apply(creator.cookie)));
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 200, 200, 200, 200, 200, 200, 200, 200, 201,
    ]);
    const appliedAt = new Set(responses.map((response) => response.body.entry?.appliedAt));
    expect(appliedAt.size).toBe(1);
    expect(await entryRows(creator.userId)).toEqual([{ bonus_links: 5 }]);
    expect((await state(creator.cookie)).limits.visibleMax).toBe(10);
  });

  it('6번째 링크 추가와 숨김 해제가 보너스로 통과한다(R13 한도 검사 그대로)', async () => {
    const creator = await newCreator();
    for (let index = 0; index < 5; index += 1) {
      expect((await addLink(creator.cookie, { title: `링크 ${index}`, url: `https://s${index}.example` })).status).toBe(
        201,
      );
    }
    const sixth = await addLink(creator.cookie, { title: '여섯째', url: 'https://six.example' });
    expect([sixth.status, sixth.body.code]).toEqual([409, 'link_limit_reached']);
    const hidden = await addLink(creator.cookie, { title: '숨김', url: 'https://hidden.example', hidden: true });
    expect(hidden.status).toBe(201);

    expect((await apply(creator.cookie)).status).toBe(201);
    expect((await addLink(creator.cookie, { title: '여섯째', url: 'https://six.example' })).status).toBe(201);
    const unhide = await api<LinkView>(t.baseUrl, 'PATCH', `/api/me/links/${hidden.body.id}`, {
      cookie: creator.cookie,
      body: { hidden: false },
    });
    expect([unhide.status, unhide.body.hidden]).toEqual([200, false]);
    expect((await state(creator.cookie)).limits).toEqual({
      visibleMax: 10,
      visibleUsed: 7,
      totalMax: 50,
      totalUsed: 7,
    });
  });

  it('운영자 추가 슬롯과 따로 합산: 2 → 12, 0 → 10, 45 → 50(전체 상한), 상세에 신청 행', async () => {
    const creator = await newCreator();
    const plain = await newCreator();
    expect((await apply(creator.cookie)).status).toBe(201);
    const setSlots = (userId: string, extraSlots: number) =>
      api<OperatorCreatorDetail>(t.baseUrl, 'PUT', `/api/admin/creators/${userId}/extra-slots`, {
        cookie: operator,
        body: { extraSlots },
      });

    const two = await setSlots(creator.userId, 2);
    expect(two.body).toMatchObject({
      extraLinkSlots: 2,
      limits: { visibleMax: 12 },
      slotEvent: { appliedAt: expect.any(String), bonusLinks: 5 },
    });
    expect((await state(creator.cookie)).limits.visibleMax).toBe(12);
    expect((await setSlots(creator.userId, 0)).body.limits.visibleMax).toBe(10);
    expect((await state(creator.cookie)).limits.visibleMax).toBe(10);
    expect((await setSlots(creator.userId, 45)).body.limits.visibleMax).toBe(CRELINK_LIMITS.totalLinks);
    expect((await state(creator.cookie)).limits.visibleMax).toBe(50);
    expect(await entryRows(creator.userId)).toEqual([{ bonus_links: 5 }]);

    expect(await detail(plain.userId)).toMatchObject({ slotEvent: null, limits: { visibleMax: 5 } });
    expect((await setSlots(plain.userId, 45)).body.limits.visibleMax).toBe(50);
  });

  it('신청 행은 신청 때 보너스 사본이라 이벤트 보너스를 바꿔도 그대로이고, 새 신청은 새 값을 받는다', async () => {
    const early = await newCreator();
    const late = await newCreator();
    expect((await apply(early.cookie)).status).toBe(201);
    await t.pool.query("UPDATE slot_events SET bonus_links = 3 WHERE code = 'link-slots-plus-5'");
    try {
      expect((await apply(late.cookie)).body.entry?.bonusLinks).toBe(3);
      expect((await state(late.cookie)).limits.visibleMax).toBe(8);
      expect((await state(early.cookie)).limits.visibleMax).toBe(10);
      expect((await state(early.cookie)).slotEvent).toMatchObject({
        event: { bonusLinks: 3 },
        entry: { bonusLinks: 5 },
      });
    } finally {
      await t.pool.query("UPDATE slot_events SET bonus_links = 5 WHERE code = 'link-slots-plus-5'");
    }
  });

  it('시작 전·끝난 뒤 신청은 409 slot_event_closed, 신청한 계정은 끝난 뒤에도 200·한도 10', async () => {
    const applied = await newCreator();
    const waiting = await newCreator();
    expect((await apply(applied.cookie)).status).toBe(201);
    try {
      const scheduled = await setPeriod({ startsAt: hoursFromNow(24), endsAt: null });
      expect([scheduled.status, scheduled.body.event?.status]).toEqual([200, 'scheduled']);
      expect(
        (await api<PublicSlotEventResponse>(t.baseUrl, 'GET', CRELINK_API_PATHS.publicSlotEvent)).body.event,
      ).toMatchObject({
        status: 'scheduled',
      });
      const early = await apply(waiting.cookie);
      expect([early.status, early.body.code, early.body.message]).toEqual([
        409,
        'slot_event_closed',
        '아직 신청 기간이 아닙니다. 이벤트가 시작되면 신청해 주세요.',
      ]);

      const ended = await setPeriod({ startsAt: hoursFromNow(-2), endsAt: hoursFromNow(-1) });
      expect([ended.status, ended.body.event?.status]).toEqual([200, 'ended']);
      const late = await apply(waiting.cookie);
      expect([late.status, late.body.code, late.body.message]).toEqual([
        409,
        'slot_event_closed',
        '신청 기간이 끝난 이벤트입니다.',
      ]);
      expect(await entryRows(waiting.userId)).toEqual([]);
      expect((await state(waiting.cookie)).slotEvent).toMatchObject({ event: { status: 'ended' }, entry: null });
      expect((await state(waiting.cookie)).limits.visibleMax).toBe(5);

      const again = await apply(applied.cookie);
      expect([again.status, again.body.event?.status, again.body.entry?.bonusLinks]).toEqual([200, 'ended', 5]);
      expect((await state(applied.cookie)).limits.visibleMax).toBe(10);
    } finally {
      await openEvent();
    }
  });

  it('운영자 경로는 로그인하지 않으면 401, 크리에이터는 403 forbidden', async () => {
    const creator = await newCreator();
    for (const method of ['GET', 'PUT']) {
      const body = method === 'PUT' ? { startsAt: hoursFromNow(-1), endsAt: null } : undefined;
      const anonymous = await api(t.baseUrl, method, CRELINK_API_PATHS.adminSlotEvent, { body });
      expect([method, anonymous.status, anonymous.body.code]).toEqual([method, 401, 'unauthenticated']);
      const forbidden = await api(t.baseUrl, method, CRELINK_API_PATHS.adminSlotEvent, {
        cookie: creator.cookie,
        body,
      });
      expect([method, forbidden.status, forbidden.body.code]).toEqual([method, 403, 'forbidden']);
    }
  });

  it('운영자 목록: 신청 수·최신순 20개씩 쪽 나눔·신청자 이메일·이름·현재 주소, page 검사', async () => {
    const creators = [];
    for (let index = 0; index < CRELINK_LIMITS.operatorPageSize + 1; index += 1) {
      const creator = await newCreator();
      expect((await apply(creator.cookie)).status).toBe(201);
      creators.push(creator);
    }
    // 신청 시각을 1분씩 벌려 최신순을 고정합니다(마지막에 신청한 계정이 가장 최근).
    await t.pool.query(
      `UPDATE slot_event_entries en SET applied_at = now() + make_interval(mins => o.ordinality::int)
       FROM unnest($1::uuid[]) WITH ORDINALITY AS o(user_id, ordinality) WHERE en.user_id = o.user_id`,
      [creators.map((creator) => creator.userId)],
    );
    await api(t.baseUrl, 'PATCH', '/api/me/landing', {
      cookie: creators[20].cookie,
      body: { displayName: '최근 신청' },
    });
    const total = (await t.pool.query<{ count: number }>('SELECT count(*)::int AS count FROM slot_event_entries'))
      .rows[0].count;

    const first = await adminView();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      event: { bonusLinks: 5, endsAt: null, status: 'open' },
      entryCount: total,
      page: 1,
      pageSize: CRELINK_LIMITS.operatorPageSize,
    });
    expect(first.body.entries).toHaveLength(20);
    const latest = creators[20];
    const slug = (await state(latest.cookie)).shortLink.slug;
    expect(first.body.entries[0]).toEqual({
      userId: latest.userId,
      email: `slot${n}@example.com`,
      displayName: '최근 신청',
      slug,
      appliedAt: expect.any(String),
    });
    expect(first.body.entries.map((entry) => entry.userId)).toEqual(
      creators
        .slice(1)
        .reverse()
        .map((creator) => creator.userId),
    );
    const appliedAt = first.body.entries.map((entry) => Date.parse(entry.appliedAt));
    expect(appliedAt).toEqual([...appliedAt].sort((a, b) => b - a));

    const second = await adminView('?page=2');
    expect(second.body).toMatchObject({ entryCount: total, page: 2 });
    expect(second.body.entries[0].userId).toBe(creators[0].userId);
    expect(second.body.entries).toHaveLength(total - 20);
    expect((await adminView('?page=99')).body).toMatchObject({ entries: [], page: 99, entryCount: total });
    for (const page of ['0', '-1', '1.5', 'abc']) {
      const bad = await adminView(`?page=${page}`);
      expect([page, bad.status, bad.body.code]).toEqual([page, 400, 'validation_failed']);
    }
  });

  it('기간 저장: 응답은 1쪽, 시간대 없는 시각·형식 오류 400 validation_failed, 끝 ≤ 시작 400 slot_event_period_invalid', async () => {
    try {
      const startsAt = '2026-10-01T09:00:00+09:00';
      const saved = await setPeriod({ startsAt, endsAt: '2999-01-01T00:00:00Z' });
      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({
        event: {
          bonusLinks: 5,
          startsAt: '2026-10-01T00:00:00.000Z',
          endsAt: '2999-01-01T00:00:00.000Z',
          status: 'open',
        },
        page: 1,
        pageSize: CRELINK_LIMITS.operatorPageSize,
      });
      expect(
        (await api<PublicSlotEventResponse>(t.baseUrl, 'GET', CRELINK_API_PATHS.publicSlotEvent)).body.event,
      ).toEqual(saved.body.event);

      for (const body of [
        null,
        [],
        {},
        { startsAt: '2026-10-01T09:00:00', endsAt: null },
        { startsAt: '2026-10-01', endsAt: null },
        { startsAt: 1_790_000_000_000, endsAt: null },
        { startsAt, endsAt: '내일' },
      ]) {
        const bad = await setPeriod(body);
        expect([JSON.stringify(body), bad.status, bad.body.code]).toEqual([
          JSON.stringify(body),
          400,
          'validation_failed',
        ]);
      }
      for (const endsAt of [startsAt, '2026-10-01T08:59:59+09:00']) {
        const bad = await setPeriod({ startsAt, endsAt });
        expect([endsAt, bad.status, bad.body.code]).toEqual([endsAt, 400, 'slot_event_period_invalid']);
      }
      const unchanged = await t.pool.query<{ ends_at: Date }>(
        "SELECT ends_at FROM slot_events WHERE code = 'link-slots-plus-5'",
      );
      expect(unchanged.rows[0].ends_at.toISOString()).toBe('2999-01-01T00:00:00.000Z');

      // 끝 생략은 끝 없음(null)입니다.
      expect((await setPeriod({ startsAt })).body.event).toMatchObject({ endsAt: null, status: 'open' });
    } finally {
      await openEvent();
    }
  });

  // 이벤트 행을 지우므로 이 파일의 마지막 시험입니다.
  it('이벤트 행이 없으면 공개 event null, 편집 상태 null·null, 신청·운영자 조회·저장 404 slot_event_not_found', async () => {
    const creator = await newCreator();
    await t.pool.query('DELETE FROM slot_event_entries');
    await t.pool.query('DELETE FROM slot_events');

    expect((await api<PublicSlotEventResponse>(t.baseUrl, 'GET', CRELINK_API_PATHS.publicSlotEvent)).body).toEqual({
      event: null,
    });
    expect((await state(creator.cookie)).slotEvent).toEqual({ event: null, entry: null });
    const applied = await apply(creator.cookie);
    expect([applied.status, applied.body.code]).toEqual([404, 'slot_event_not_found']);
    const view = await adminView();
    expect([view.status, view.body.code]).toEqual([404, 'slot_event_not_found']);
    const saved = await setPeriod({ startsAt: hoursFromNow(-1), endsAt: null });
    expect([saved.status, saved.body.code]).toEqual([404, 'slot_event_not_found']);
    // 형식 검사가 먼저입니다.
    expect((await setPeriod({ startsAt: 'x' })).body.code).toBe('validation_failed');
  });
});
