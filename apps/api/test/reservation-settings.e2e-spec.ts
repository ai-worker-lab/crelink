import { randomUUID } from 'node:crypto';
import type {
  ApiError,
  CreatorLandingState,
  LinkReservationSetting,
  LinkView,
  PublicLandingResponse,
} from '@crelink/shared';
import { RetentionService } from '../src/retention/retention.service';
import {
  addLink,
  createReservationCreator,
  ReservationCreator,
  setReservation,
  visitToken,
} from './reservation-fixtures';
import { api, createAiOperator, createTestApp, type TestApp, WEB_URL } from './test-app';

describe('사전 신청 설정과 플래그', () => {
  let t: TestApp;
  let owner: ReservationCreator;
  let other: ReservationCreator;

  const publicLinks = async (creator = owner) =>
    (await api<PublicLandingResponse>(t.baseUrl, 'GET', `/api/public/landings/${creator.publicId}`)).body.blocks[0]
      .links;
  const put = (linkId: string, body: unknown, cookie: string | null = owner.cookie) =>
    api<LinkReservationSetting & ApiError>(t.baseUrl, 'PUT', `/api/me/links/${linkId}/reservation`, { cookie, body });
  const landingState = async () =>
    (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: owner.cookie })).body;

  beforeAll(async () => {
    t = await createTestApp({ env: { RESERVATIONS_ENABLED: 'true' } });
    owner = await createReservationCreator(t);
    other = await createReservationCreator(t);
  }, 30_000);
  afterAll(async () => {
    await t?.close();
  });
  beforeEach(async () => {
    process.env.RESERVATIONS_ENABLED = 'true';
    await t.pool.query(
      "UPDATE links SET reservation_state='off',reservation_methods='{}',hidden=false,blocked_at=NULL",
    );
    await t.pool.query('DELETE FROM link_reservations');
    await t.pool.query('UPDATE users SET suspended_at=NULL');
  });

  describe('플래그', () => {
    const routes = () => {
      const token = visitToken(t, owner.publicId);
      return [
        [
          'POST',
          `/api/landings/${owner.publicId}/links/${owner.linkPublicId}/reservations`,
          { token, method: 'email', contact: 'a@example.com', consent: true },
          { origin: WEB_URL },
        ],
        ['PUT', `/api/me/links/${owner.linkId}/reservation`, { state: 'open', methods: ['email'] }],
        ['GET', '/api/me/reservations'],
        ['GET', '/api/me/reservations/export'],
        ['DELETE', `/api/me/reservations/${randomUUID()}`],
        ['DELETE', `/api/me/links/${owner.linkId}/reservations`],
      ] as const;
    };

    it.each([
      ['미설정', undefined],
      ['대문자', 'TRUE'],
      ['1', '1'],
      ['앞 공백', ' true'],
      ['false', 'false'],
      ['빈 값', ''],
    ])('%s이면 DB가 open이어도 모든 경로 404이고 응답에 필드가 없다', async (_label, value) => {
      await t.pool.query("UPDATE links SET reservation_state='open',reservation_methods='{email}'");
      await t.pool.query(
        "INSERT INTO link_reservations(link_id,method,contact,consent_version) VALUES($1,'email','seed@example.com','test')",
        [owner.linkId],
      );
      if (value === undefined) delete process.env.RESERVATIONS_ENABLED;
      else process.env.RESERVATIONS_ENABLED = value;

      for (const [method, path, body, headers] of routes()) {
        for (const cookie of [null, owner.cookie]) {
          const response = await api(t.baseUrl, method, path, { cookie, body, headers });
          expect([path, cookie !== null, response.status, response.body.code]).toEqual([
            path,
            cookie !== null,
            404,
            'not_found',
          ]);
        }
      }
      // 꺼진 동안 쓰기가 일어나지 않았습니다.
      expect((await t.pool.query('SELECT 1 FROM link_reservations')).rowCount).toBe(1);

      const [publicLink] = await publicLinks();
      expect(publicLink).not.toHaveProperty('reservation');
      const state = await landingState();
      expect(state).not.toHaveProperty('reservationsAvailable');
      for (const link of state.links) expect(link).not.toHaveProperty('reservation');
    });

    it('꺼져 있어도 보존 작업은 91일 지난 신청을 지운다', async () => {
      delete process.env.RESERVATIONS_ENABLED;
      for (const [contact, days] of [
        ['old@example.com', 91],
        ['new@example.com', 89],
      ] as const) {
        await t.pool.query(
          "INSERT INTO link_reservations(link_id,method,contact,consent_version,created_at) VALUES($1,'email',$2,'test',now()-make_interval(days=>$3))",
          [owner.linkId, contact, days],
        );
      }
      const moved = await t.app.get(RetentionService).runOnce();
      expect(moved.reservations).toBe(1);
      expect((await t.pool.query('SELECT contact FROM link_reservations')).rows).toEqual([
        { contact: 'new@example.com' },
      ]);
    });

    it('켜지면 편집 상태에 reservationsAvailable과 링크 설정이 온다', async () => {
      await setReservation(t, owner.cookie, owner.linkId, { state: 'open', methods: ['phone', 'email'] });
      const state = await landingState();
      expect(state.reservationsAvailable).toBe(true);
      const link = state.links.find((item: LinkView) => item.id === owner.linkId)!;
      expect(link.reservation).toEqual({ state: 'open', methods: ['email', 'phone'] });
    });
  });

  describe('PUT /api/me/links/{id}/reservation', () => {
    it('받기·마감·끄기를 저장하고 공개 응답은 off에 필드를 주지 않는다', async () => {
      const opened = await put(owner.linkId, { state: 'open', methods: ['email'] });
      expect(opened.status).toBe(200);
      expect(opened.body).toEqual({ state: 'open', methods: ['email'] });
      expect((await publicLinks())[0].reservation).toEqual({ state: 'open', methods: ['email'] });

      await put(owner.linkId, { state: 'closed', methods: ['email', 'phone'] });
      expect((await publicLinks())[0].reservation).toEqual({ state: 'closed', methods: ['email', 'phone'] });

      expect((await put(owner.linkId, { state: 'off', methods: [] })).status).toBe(200);
      expect((await publicLinks())[0]).not.toHaveProperty('reservation');
    });

    it('숨김·차단 링크는 공개 응답에서 빠진다', async () => {
      await setReservation(t, owner.cookie, owner.linkId, { state: 'open', methods: ['email'] });
      const second = await addLink(t, owner.cookie, '두 번째');
      await setReservation(t, owner.cookie, second.linkId, { state: 'open', methods: ['email'] });
      await t.pool.query('UPDATE links SET hidden=true WHERE id=$1', [owner.linkId]);
      await t.pool.query('UPDATE links SET blocked_at=now() WHERE id=$1', [second.linkId]);
      expect(await publicLinks()).toEqual([]);
      await t.pool.query('DELETE FROM links WHERE id=$1', [second.linkId]);
    });

    it.each([
      ['상태 없음', { methods: ['email'] }],
      ['잘못된 상태', { state: 'paused', methods: ['email'] }],
      ['방식이 배열 아님', { state: 'open', methods: 'email' }],
      ['방식 0개로 받기', { state: 'open', methods: [] }],
      ['방식 0개로 마감', { state: 'closed', methods: [] }],
      ['없는 방식', { state: 'open', methods: ['fax'] }],
      ['중복 방식', { state: 'open', methods: ['email', 'email'] }],
      ['알 수 없는 키', { state: 'open', methods: ['email'], extra: 1 }],
    ])('입력 오류(%s)는 400이고 저장하지 않는다', async (_label, body) => {
      const response = await put(owner.linkId, body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('validation_failed');
      expect((await t.pool.query('SELECT reservation_state FROM links WHERE id=$1', [owner.linkId])).rows).toEqual([
        { reservation_state: 'off' },
      ]);
    });

    it('남의 링크·없는 링크·형식이 틀린 id는 404 link_not_found이고 바뀌지 않는다', async () => {
      for (const id of [other.linkId, randomUUID(), 'not-a-uuid']) {
        const response = await put(id, { state: 'open', methods: ['email'] });
        expect([response.status, response.body.code]).toEqual([404, 'link_not_found']);
      }
      expect((await t.pool.query('SELECT reservation_state FROM links WHERE id=$1', [other.linkId])).rows).toEqual([
        { reservation_state: 'off' },
      ]);
    });

    it('비로그인은 401, AI Bearer는 403이다', async () => {
      expect((await put(owner.linkId, { state: 'open', methods: ['email'] }, null)).status).toBe(401);
      const ai = await createAiOperator(t.pool);
      const response = await api(t.baseUrl, 'PUT', `/api/me/links/${owner.linkId}/reservation`, {
        token: ai.token,
        body: { state: 'open', methods: ['email'] },
      });
      expect(response.status).toBe(403);
    });
  });
});
