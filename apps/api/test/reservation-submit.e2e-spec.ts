import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiError, CreateReservationResponse, LandingEventRequest } from '@crelink/shared';
import { LandingPassService } from '../src/short-link/landing-pass.service';
import { createReservationCreator, ReservationCreator, setReservation, visitToken } from './reservation-fixtures';
import { api, createTestApp, type TestApp, WEB_URL } from './test-app';

describe('사전 신청 공개 제출', () => {
  let t: TestApp;
  let owner: ReservationCreator;
  let other: ReservationCreator;

  const submit = (
    body: Record<string, unknown>,
    options: { creator?: ReservationCreator; link?: string; headers?: Record<string, string> } = {},
  ) => {
    const creator = options.creator ?? owner;
    return api<CreateReservationResponse & ApiError>(
      t.baseUrl,
      'POST',
      `/api/landings/${creator.publicId}/links/${options.link ?? creator.linkPublicId}/reservations`,
      { body, headers: { origin: WEB_URL, ...options.headers } },
    );
  };
  const valid = (patch: Record<string, unknown> = {}) => ({
    token: visitToken(t, owner.publicId),
    method: 'email',
    contact: `fan-${randomUUID()}@example.com`,
    consent: true,
    ...patch,
  });
  const rows = async () =>
    (
      await t.pool.query<{ method: string; contact: string; consent_version: string }>(
        'SELECT method,contact,consent_version FROM link_reservations ORDER BY created_at',
      )
    ).rows;

  beforeAll(async () => {
    // 동시 20건 시험이 다른 시험 파일과 max_connections를 다투지 않게 연결을 줄입니다. 요청마다 연결을 하나씩만 쓰므로 교착이 없습니다.
    t = await createTestApp({ env: { RESERVATIONS_ENABLED: 'true', DATABASE_POOL_MAX: '4' } });
    owner = await createReservationCreator(t);
    other = await createReservationCreator(t);
  }, 30_000);
  afterAll(async () => {
    await t?.close();
  });
  beforeEach(async () => {
    await t.pool.query('DELETE FROM link_reservations');
    await t.pool.query('DELETE FROM landing_event_limits');
    await t.pool.query('DELETE FROM visits');
    await t.pool.query('UPDATE users SET suspended_at=NULL');
    await t.pool.query('UPDATE links SET hidden=false,blocked_at=NULL');
    await setReservation(t, owner.cookie, owner.linkId, { state: 'open', methods: ['email', 'phone'] });
    await setReservation(t, other.cookie, other.linkId, { state: 'open', methods: ['email'] });
  });

  it('정규화해 저장하고 201 received로 답한다', async () => {
    const response = await submit(valid({ contact: ' Fan.One@Example.COM ' }));
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ status: 'received' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    await submit(valid({ method: 'phone', contact: '+82 10-1234-5678' }));
    expect(await rows()).toEqual([
      { method: 'email', contact: 'fan.one@example.com', consent_version: '2026-11-10' },
      { method: 'phone', contact: '01012345678', consent_version: '2026-11-10' },
    ]);
  });

  it('같은 링크·같은 연락처는 표기가 달라도 1건이고 중복을 알리지 않는다', async () => {
    for (const contact of ['Dup@Example.com', 'dup@example.com']) {
      const response = await submit(valid({ contact }));
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ status: 'received' });
    }
    expect((await rows()).length).toBe(1);
  });

  it('같은 연락처 동시 20건은 전부 201이고 1행이다', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => submit(valid({ contact: 'same@example.com' }))),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(201));
    expect((await rows()).length).toBe(1);
  });

  it.each([
    ['이메일 형식', { method: 'email', contact: 'not-an-email' }, 'reservation_contact_invalid'],
    ['수식 시작 이메일', { method: 'email', contact: '=1+1@x.com' }, 'reservation_contact_invalid'],
    ['유선 번호', { method: 'phone', contact: '02-1234-5678' }, 'reservation_contact_invalid'],
    ['연락처 비문자열', { method: 'email', contact: 123 }, 'reservation_contact_invalid'],
    ['동의 안 함', { consent: false }, 'validation_failed'],
    ['동의 없음', { consent: undefined }, 'validation_failed'],
    ['없는 방식', { method: 'fax' }, 'validation_failed'],
    ['알 수 없는 키', { extra: 'x' }, 'validation_failed'],
    ['website 비문자열', { website: 1 }, 'validation_failed'],
  ])('입력 오류(%s)는 400이고 값은 응답에 없다', async (_label, patch, code) => {
    const response = await submit(valid(patch));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe(code);
    expect(JSON.stringify(response.body)).not.toMatch(/not-an-email|=1\+1|02-1234/);
    expect(await rows()).toEqual([]);
  });

  it('이 링크가 받지 않는 방식은 400이다', async () => {
    await setReservation(t, owner.cookie, owner.linkId, { state: 'open', methods: ['email'] });
    const response = await submit(valid({ method: 'phone', contact: '010-1234-5678' }));
    expect([response.status, response.body.code]).toEqual([400, 'reservation_contact_invalid']);
  });

  it('16KB를 넘으면 413이다', async () => {
    expect((await submit(valid({ contact: 'x'.repeat(17000) }))).status).toBe(413);
    expect(await rows()).toEqual([]);
  });

  it('외부 Origin·JSON이 아닌 본문은 403 forbidden이다', async () => {
    const attempts: Array<Record<string, string>> = [
      { origin: 'https://evil.example' },
      { origin: '' },
      { 'content-type': 'text/plain' },
    ];
    for (const headers of attempts) {
      const response = await submit(valid(), { headers });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('forbidden');
    }
    expect(await rows()).toEqual([]);
  });

  it('위조·만료·다른 랜딩의 토큰과 재기동 전 키로 만든 토큰은 403 reservation_session_expired다', async () => {
    const passes = t.app.get(LandingPassService);
    const old = Date.now() - 2 * 86400000;
    const expired = passes.telemetryToken(owner.publicId, passes.issue(owner.publicId, old, randomUUID()), old)!;
    const otherKey = new LandingPassService();
    const nowMs = Date.now() - 10_000;
    const staleKey = otherKey.telemetryToken(
      owner.publicId,
      otherKey.issue(owner.publicId, nowMs, randomUUID()),
      nowMs,
    )!;
    for (const token of [
      'garbage',
      `${visitToken(t, owner.publicId)}x`,
      expired,
      visitToken(t, other.publicId),
      staleKey,
    ]) {
      const response = await submit(valid({ token }));
      expect([response.status, response.body.code]).toEqual([403, 'reservation_session_expired']);
    }
    expect(await rows()).toEqual([]);
  });

  it('다른 랜딩의 링크·없는 링크·형식이 틀린 링크는 404 reservation_unavailable이다', async () => {
    for (const link of [other.linkPublicId, 'zzzzzzzzzz', 'bad-id']) {
      const response = await submit(valid(), { link });
      expect([response.status, response.body.code]).toEqual([404, 'reservation_unavailable']);
    }
    expect((await t.pool.query('SELECT 1 FROM link_reservations WHERE link_id=$1', [other.linkId])).rowCount).toBe(0);
  });

  it('off·숨김·차단은 404, 마감은 409, 정지는 410이고 기존 신청은 남는다', async () => {
    await submit(valid({ contact: 'kept@example.com' }));
    const cases: Array<[string, () => Promise<unknown>, number, string]> = [
      [
        'off',
        () => setReservation(t, owner.cookie, owner.linkId, { state: 'off', methods: [] }),
        404,
        'reservation_unavailable',
      ],
      [
        'closed',
        () => setReservation(t, owner.cookie, owner.linkId, { state: 'closed', methods: ['email'] }),
        409,
        'reservation_closed',
      ],
      [
        'hidden',
        () => t.pool.query('UPDATE links SET hidden=true WHERE id=$1', [owner.linkId]),
        404,
        'reservation_unavailable',
      ],
    ];
    for (const [, apply, status, code] of cases) {
      await apply();
      const response = await submit(valid());
      expect([response.status, response.body.code]).toEqual([status, code]);
    }
    await t.pool.query('UPDATE links SET hidden=false,blocked_at=now() WHERE id=$1', [owner.linkId]);
    await setReservation(t, owner.cookie, owner.linkId, { state: 'open', methods: ['email'] });
    expect((await submit(valid())).status).toBe(404);
    await t.pool.query('UPDATE links SET blocked_at=NULL WHERE id=$1', [owner.linkId]);
    await t.pool.query('UPDATE users SET suspended_at=now() WHERE id=$1', [owner.userId]);
    const suspended = await submit(valid());
    expect([suspended.status, suspended.body.code]).toEqual([410, 'creator_suspended']);
    expect((await rows()).map((row) => row.contact)).toEqual(['kept@example.com']);
  });

  it('5,000건에 도달하면 409이고 늘지 않는다', async () => {
    await t.pool.query(
      `INSERT INTO link_reservations(link_id,method,contact,consent_version)
       SELECT $1,'email','seed'||g||'@example.com','test' FROM generate_series(1,5000) g`,
      [owner.linkId],
    );
    const response = await submit(valid());
    expect([response.status, response.body.code]).toEqual([409, 'reservation_closed']);
    expect((await t.pool.query('SELECT count(*)::int AS c FROM link_reservations')).rows[0].c).toBe(5000);
  });

  describe('봇과 레이트 리밋', () => {
    it('숨김 필드가 채워지면 201이고 저장하지 않는다', async () => {
      const response = await submit(valid({ website: 'https://bot.example' }));
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ status: 'received' });
      expect(await rows()).toEqual([]);
    });

    it('방문 3초 안의 제출은 201이고 저장하지 않으며, 빈 숨김 필드는 사람으로 본다', async () => {
      const quick = await submit(valid({ token: visitToken(t, owner.publicId, randomUUID(), 0) }));
      expect(quick.status).toBe(201);
      expect(await rows()).toEqual([]);
      expect((await submit(valid({ website: '' }))).status).toBe(201);
      expect((await rows()).length).toBe(1);
    });

    it('같은 토큰의 6번째는 429이고 저장되지 않는다', async () => {
      const token = visitToken(t, owner.publicId);
      for (let i = 0; i < 5; i += 1) expect((await submit(valid({ token }))).status).toBe(201);
      const limited = await submit(valid({ token }));
      expect([limited.status, limited.body.code]).toEqual([429, 'reservation_rate_limited']);
      expect((await rows()).length).toBe(5);
    });

    it('같은 IP의 서로 다른 방문자 31번째는 429이다', async () => {
      const visitors = Array.from({ length: 31 }, () => randomUUID());
      for (const visitor of visitors) {
        await t.pool.query("INSERT INTO visits(short_link_id,slug,visitor_id,ip) VALUES($1,$2,$3,'198.51.100.7')", [
          owner.shortId,
          owner.slug,
          visitor,
        ]);
      }
      for (const visitor of visitors.slice(0, 30)) {
        expect((await submit(valid({ token: visitToken(t, owner.publicId, visitor) }))).status).toBe(201);
      }
      const limited = await submit(valid({ token: visitToken(t, owner.publicId, visitors[30]) }));
      expect([limited.status, limited.body.code]).toEqual([429, 'reservation_rate_limited']);
    }, 30_000);

    it('링크 버킷이 600을 넘으면 429이다', async () => {
      await t.pool.query('INSERT INTO landing_event_limits(bucket,used) VALUES($1,600)', [
        `reservation:link:${owner.linkPublicId}`,
      ]);
      const limited = await submit(valid());
      expect([limited.status, limited.body.code]).toEqual([429, 'reservation_rate_limited']);
    });

    it('신청 제한은 reservation: 접두사만 쓰고 방문 이벤트 한도를 소비하지 않는다', async () => {
      const visitor = randomUUID();
      const token = visitToken(t, owner.publicId, visitor);
      for (let i = 0; i < 6; i += 1) await submit(valid({ token }));
      const buckets = (await t.pool.query<{ bucket: string }>('SELECT bucket FROM landing_event_limits')).rows;
      expect(buckets.length).toBeGreaterThan(0);
      for (const { bucket } of buckets) expect(bucket).toMatch(/^reservation:/);
      const event: LandingEventRequest = {
        token,
        eventId: randomUUID(),
        sessionId: randomUUID(),
        pageViewId: randomUUID(),
        type: 'page_view',
      };
      const recorded = await api(t.baseUrl, 'POST', `/api/landings/${owner.publicId}/events`, {
        body: event,
        headers: { origin: WEB_URL },
      });
      expect(recorded.status).toBe(204);
      const used = await t.pool.query<{ used: number }>(
        "SELECT used FROM landing_event_limits WHERE bucket LIKE 'visitor:%'",
      );
      expect(used.rows).toEqual([{ used: 1 }]);
    });
  });

  it('값이 로그·오류 응답에 남지 않는다(DB 오류 경로 포함)', async () => {
    const contact = `leak-${randomUUID()}@example.com`;
    const phone = '010-9876-5432';
    const spies = [
      jest.spyOn(Logger.prototype, 'log'),
      jest.spyOn(Logger.prototype, 'warn'),
      jest.spyOn(Logger.prototype, 'error'),
      jest.spyOn(console, 'log'),
      jest.spyOn(console, 'error'),
    ];
    try {
      expect((await submit(valid({ contact }))).status).toBe(201);
      await t.pool.query('ALTER TABLE link_reservations RENAME TO link_reservations_gone');
      const failed = await submit(valid({ method: 'phone', contact: phone }));
      await t.pool.query('ALTER TABLE link_reservations_gone RENAME TO link_reservations');
      expect(failed.status).toBe(500);
      const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
      expect(JSON.stringify(failed.body)).not.toContain(phone);
      for (const value of [contact, phone, '01098765432']) expect(logged).not.toContain(value);
    } finally {
      for (const spy of spies) spy.mockRestore();
      await t.pool.query('ALTER TABLE IF EXISTS link_reservations_gone RENAME TO link_reservations');
    }
  });
});
