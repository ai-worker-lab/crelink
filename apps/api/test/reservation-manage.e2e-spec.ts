import { randomUUID } from 'node:crypto';
import type { ApiError, ReservationPage, ReservationView } from '@crelink/shared';
import { csvCell } from '../src/reservations/reservations.service';
import {
  addLink,
  createReservationCreator,
  ReservationCreator,
  seedReservation,
  setReservation,
} from './reservation-fixtures';
import { api, createAiOperator, createTestApp, login, type TestApp } from './test-app';

/** RFC 4180 CSV 파서(시험용). 따옴표 안 줄바꿈·이스케이프를 처리합니다. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  return rows;
}

describe('사전 신청 관리', () => {
  let t: TestApp;
  let owner: ReservationCreator;
  let other: ReservationCreator;

  const get = (path: string, cookie: string | null = owner.cookie) =>
    api<ReservationPage & ApiError>(t.baseUrl, 'GET', path, { cookie });
  const csv = async (path: string, cookie = owner.cookie) => {
    const response = await fetch(`${t.baseUrl}${path}`, { headers: { cookie } });
    // fetch의 text()는 BOM을 지우므로 바이트에서 직접 읽습니다.
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, text };
  };

  beforeAll(async () => {
    t = await createTestApp({ env: { RESERVATIONS_ENABLED: 'true' } });
    owner = await createReservationCreator(t);
    other = await createReservationCreator(t);
  }, 30_000);
  afterAll(async () => {
    await t?.close();
  });
  beforeEach(async () => {
    await t.pool.query('DELETE FROM link_reservations');
    await t.pool.query('UPDATE users SET suspended_at=NULL');
    await t.pool.query('UPDATE links SET hidden=false,blocked_at=NULL');
    await setReservation(t, owner.cookie, owner.linkId, { state: 'open', methods: ['email', 'phone'] });
  });

  it('최신순 50개씩 커서로 넘기고 필터·요약을 준다', async () => {
    const second = await addLink(t, owner.cookie, '두 번째 링크');
    await setReservation(t, owner.cookie, second.linkId, { state: 'closed', methods: ['email'] });
    await t.pool.query(
      `INSERT INTO link_reservations(link_id,method,contact,consent_version,created_at)
       SELECT $1,'email','u'||g||'@example.com','test',now()-make_interval(mins=>g) FROM generate_series(1,51) g`,
      [owner.linkId],
    );
    await seedReservation(t, second.linkId, 'phone', '01012345678');

    const first = (await get('/api/me/reservations')).body;
    expect(first.items.length).toBe(50);
    expect(first.items[0]).toMatchObject({
      method: 'phone',
      contact: '010-1234-5678',
      linkId: second.linkId,
      linkTitle: '두 번째 링크',
    });
    expect(first.nextCursor).toBeTruthy();
    const summary = Object.fromEntries(first.links.map((link) => [link.id, [link.state, link.count]]));
    expect(summary).toEqual({ [owner.linkId]: ['open', 51], [second.linkId]: ['closed', 1] });

    const next = (await get(`/api/me/reservations?cursor=${first.nextCursor}`)).body;
    expect(next.items.length).toBe(2);
    expect(next.nextCursor).toBeNull();
    const ids = new Set([...first.items, ...next.items].map((item: ReservationView) => item.id));
    expect(ids.size).toBe(52);

    const filtered = (await get(`/api/me/reservations?linkId=${second.linkId}`)).body;
    expect(filtered.items.map((item) => item.linkId)).toEqual([second.linkId]);

    expect((await get('/api/me/reservations?cursor=!!!')).status).toBe(400);
    await t.pool.query('DELETE FROM links WHERE id=$1', [second.linkId]);
  });

  describe('권한', () => {
    let foreignLinkReservation: string;
    beforeEach(async () => {
      await setReservation(t, other.cookie, other.linkId, { state: 'open', methods: ['email'] });
      foreignLinkReservation = await seedReservation(t, other.linkId, 'email', 'other@example.com');
    });

    it('남의 linkId 목록·내보내기, 설정, 신청 삭제, 링크 신청 삭제는 전부 404이고 행이 유지된다', async () => {
      const list = await get(`/api/me/reservations?linkId=${other.linkId}`);
      expect([list.status, list.body.code]).toEqual([404, 'link_not_found']);
      expect((await csv(`/api/me/reservations/export?linkId=${other.linkId}`)).status).toBe(404);
      const removed = await api<ApiError>(t.baseUrl, 'DELETE', `/api/me/reservations/${foreignLinkReservation}`, {
        cookie: owner.cookie,
      });
      expect([removed.status, removed.body.code]).toEqual([404, 'reservation_not_found']);
      const cleared = await api<ApiError>(t.baseUrl, 'DELETE', `/api/me/links/${other.linkId}/reservations`, {
        cookie: owner.cookie,
      });
      expect([cleared.status, cleared.body.code]).toEqual([404, 'link_not_found']);
      for (const id of ['not-a-uuid', randomUUID()]) {
        expect((await api(t.baseUrl, 'DELETE', `/api/me/reservations/${id}`, { cookie: owner.cookie })).status).toBe(
          404,
        );
        expect(
          (await api(t.baseUrl, 'DELETE', `/api/me/links/${id}/reservations`, { cookie: owner.cookie })).status,
        ).toBe(404);
        expect((await get(`/api/me/reservations?linkId=${id}`)).status).toBe(404);
      }
      expect(
        (await t.pool.query('SELECT 1 FROM link_reservations WHERE id=$1', [foreignLinkReservation])).rowCount,
      ).toBe(1);
    });

    it('내 목록·내보내기에는 남의 신청이 없다', async () => {
      await seedReservation(t, owner.linkId, 'email', 'mine@example.com');
      const page = (await get('/api/me/reservations')).body;
      expect(page.items.map((item) => item.contact)).toEqual(['mine@example.com']);
      expect(page.links.map((link) => link.id)).toEqual([owner.linkId]);
      expect((await csv('/api/me/reservations/export')).text).not.toContain('other@example.com');
    });

    it('비로그인은 401, AI Bearer는 403이다', async () => {
      const routes = [
        ['GET', '/api/me/reservations'],
        ['GET', '/api/me/reservations/export'],
        ['DELETE', `/api/me/reservations/${foreignLinkReservation}`],
        ['DELETE', `/api/me/links/${other.linkId}/reservations`],
      ] as const;
      const ai = await createAiOperator(t.pool, `ai-${randomUUID()}@crelink.invalid`);
      for (const [method, path] of routes) {
        expect((await api(t.baseUrl, method, path)).status).toBe(401);
        expect((await api(t.baseUrl, method, path, { token: ai.token })).status).toBe(403);
      }
      expect((await t.pool.query('SELECT 1 FROM link_reservations')).rowCount).toBe(1);
    });

    it('운영자 응답에는 연락처 값이 없다', async () => {
      const operator = (await login(t.baseUrl, 'operator-sub|operator@example.com')).cookie!;
      const detail = await api<{ links: unknown[] }>(t.baseUrl, 'GET', `/api/admin/creators/${other.userId}`, {
        cookie: operator,
      });
      expect(detail.status).toBe(200);
      expect(detail.body.links.length).toBeGreaterThan(0);
      expect(JSON.stringify(detail.body)).not.toContain('other@example.com');
    });
  });

  it('건별·링크별로 지우고 링크 삭제는 CASCADE로 지운다', async () => {
    const id = await seedReservation(t, owner.linkId, 'email', 'a@example.com');
    await seedReservation(t, owner.linkId, 'email', 'b@example.com');
    expect((await api(t.baseUrl, 'DELETE', `/api/me/reservations/${id}`, { cookie: owner.cookie })).status).toBe(204);
    expect((await t.pool.query('SELECT contact FROM link_reservations')).rows).toEqual([{ contact: 'b@example.com' }]);
    expect(
      (await api(t.baseUrl, 'DELETE', `/api/me/links/${owner.linkId}/reservations`, { cookie: owner.cookie })).status,
    ).toBe(204);
    expect((await t.pool.query('SELECT 1 FROM link_reservations')).rowCount).toBe(0);

    const temporary = await addLink(t, owner.cookie, '지울 링크');
    await seedReservation(t, temporary.linkId, 'email', 'c@example.com');
    expect((await api(t.baseUrl, 'DELETE', `/api/me/links/${temporary.linkId}`, { cookie: owner.cookie })).status).toBe(
      204,
    );
    expect((await t.pool.query('SELECT 1 FROM link_reservations')).rowCount).toBe(0);
  });

  it('숨김·정지 뒤에도 크리에이터 목록에 남는다', async () => {
    await seedReservation(t, owner.linkId, 'email', 'kept@example.com');
    await t.pool.query('UPDATE links SET hidden=true WHERE id=$1', [owner.linkId]);
    expect((await get('/api/me/reservations')).body.items.length).toBe(1);
  });

  describe('CSV', () => {
    it('BOM·첨부 헤더와 수식 주입 방지, 큰따옴표·줄바꿈을 지킨다', async () => {
      const trickyTitle = '=HYPERLINK("https://e.test","a\nb")';
      const tricky = await addLink(t, owner.cookie, trickyTitle);
      const contacts = [
        '=1+1@x.com',
        '+1@x.com',
        '-1@x.com',
        '@1@x.com',
        '＝1@x.com',
        '＋1@x.com',
        '－1@x.com',
        '＠1@x.com',
        '\t1@x.com',
        '\r1@x.com',
        'quote"me@x.com',
      ];
      for (const contact of contacts) await seedReservation(t, tricky.linkId, 'email', contact);
      await seedReservation(t, owner.linkId, 'phone', '01012345678');

      const response = await csv('/api/me/reservations/export');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(response.headers.get('content-disposition')).toBe('attachment; filename="crelink-reservations.csv"');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.text.charCodeAt(0)).toBe(0xfeff);
      for (const line of response.text.slice(1).split('\r\n').filter(Boolean)) expect(line.startsWith('"')).toBe(true);

      const [header, ...rows] = parseCsv(response.text.slice(1));
      expect(header).toEqual(['링크', '방식', '연락처', '신청 시각(KST)']);
      expect(rows.length).toBe(contacts.length + 1);
      const trickyRows = rows.filter((row) => row[0].includes('HYPERLINK'));
      expect(trickyRows.every((row) => row[0] === `'${trickyTitle}`)).toBe(true);
      const parsedContacts = new Set(trickyRows.map((row) => row[2]));
      for (const contact of contacts.slice(0, 10)) expect(parsedContacts).toContain(`'${contact}`);
      expect(parsedContacts).toContain('quote"me@x.com');
      const phoneRow = rows.find((row) => row[1] === '휴대폰')!;
      expect(phoneRow[2]).toBe('010-1234-5678');
      expect(phoneRow[3]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

      const filtered = await csv(`/api/me/reservations/export?linkId=${owner.linkId}`);
      expect(parseCsv(filtered.text.slice(1)).length).toBe(2);
      await t.pool.query('DELETE FROM links WHERE id=$1', [tricky.linkId]);
    });

    it('수식 시작 문자가 아니면 그대로 감싼다', () => {
      expect(csvCell('hello')).toBe('"hello"');
      expect(csvCell("'already")).toBe('"\'already"');
      expect(csvCell('=x')).toBe('"\'=x"');
    });
  });
});
