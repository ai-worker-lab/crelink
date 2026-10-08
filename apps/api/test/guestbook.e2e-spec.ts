import {
  ApiError,
  CreatorLandingState,
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  GuestbookEntryView,
  GuestbookPage,
  PublicLandingResponse,
  UploadFileResponse,
} from '@crelink/shared';
import { api, createTestApp, login, TestApp, WEB_URL } from './test-app';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const MISSING_ID = '00000000-0000-0000-0000-000000000000';

describe('랜딩 방명록 API (R19)', () => {
  let t: TestApp;
  let n = 0;

  /** 새 회원(로그인하면 크리에이터로 가입되어 랜딩이 생깁니다). */
  const newMember = async () => {
    n += 1;
    const result = await login(t.baseUrl, `guest-${n}|guest${n}@example.com`);
    const cookie = result.cookie!;
    const landing = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    return { cookie, userId: result.body.user!.id, publicId: landing.landing.publicId };
  };
  const list = (publicId: string, cookie?: string | null, cursor?: string) =>
    api<GuestbookPage & Partial<ApiError>>(t.baseUrl, 'GET', CRELINK_API_PATHS.landingGuestbook(publicId, cursor), {
      cookie,
    });
  const write = (publicId: string, cookie: string | null, body: unknown) =>
    api<GuestbookEntryView & Partial<ApiError>>(t.baseUrl, 'POST', CRELINK_API_PATHS.landingGuestbook(publicId), {
      cookie,
      body,
    });
  const setHidden = (entryId: string, cookie: string | null, body: unknown) =>
    api<GuestbookEntryView & Partial<ApiError>>(t.baseUrl, 'PUT', CRELINK_API_PATHS.guestbookEntryHidden(entryId), {
      cookie,
      body,
    });
  const remove = (entryId: string, cookie: string | null) =>
    api(t.baseUrl, 'DELETE', CRELINK_API_PATHS.guestbookEntry(entryId), { cookie });
  const patchLanding = (cookie: string, body: unknown) =>
    api<CreatorLandingState & Partial<ApiError>>(t.baseUrl, 'PATCH', '/api/me/landing', { cookie, body });

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('비회원은 빈 목록과 viewer를 받고, 무효 세션도 401이 아니라 비회원으로 본다. 응답은 no-store', async () => {
    const owner = await newMember();
    const anonymous = await list(owner.publicId);
    expect(anonymous.status).toBe(200);
    expect(anonymous.headers.get('cache-control')).toBe('no-store');
    expect(anonymous.body).toEqual({ entries: [], nextCursor: null, viewer: { signedIn: false, isOwner: false } });

    const invalid = await list(owner.publicId, 'cl_session=not-a-real-session');
    expect(invalid.status).toBe(200);
    expect(invalid.body.viewer).toEqual({ signedIn: false, isOwner: false });

    const own = await list(owner.publicId, owner.cookie);
    expect(own.body.viewer).toEqual({ signedIn: true, isOwner: true });
    const other = await newMember();
    expect((await list(owner.publicId, other.cookie)).body.viewer).toEqual({ signedIn: true, isOwner: false });
  });

  it('없는 랜딩은 404 landing_not_found, 정지 크리에이터 랜딩은 410 creator_suspended', async () => {
    const member = await newMember();
    for (const publicId of ['zzzzzzzzzz', 'BAD', 'abc']) {
      const missingList = await list(publicId);
      expect([missingList.status, missingList.body.code]).toEqual([404, 'landing_not_found']);
      const missingWrite = await write(publicId, member.cookie, { body: '안녕' });
      expect([missingWrite.status, missingWrite.body.code]).toEqual([404, 'landing_not_found']);
    }

    const owner = await newMember();
    await t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [owner.userId]);
    const gone = await list(owner.publicId, member.cookie);
    expect([gone.status, gone.body.code]).toEqual([410, 'creator_suspended']);
    const goneWrite = await write(owner.publicId, member.cookie, { body: '안녕' });
    expect([goneWrite.status, goneWrite.body.code]).toEqual([410, 'creator_suspended']);
  });

  it('쓰기·삭제·숨김은 로그인하지 않거나 세션이 무효면 401 unauthenticated', async () => {
    const owner = await newMember();
    for (const cookie of [null, 'cl_session=not-a-real-session']) {
      for (const response of [
        await write(owner.publicId, cookie, { body: '안녕' }),
        await remove(MISSING_ID, cookie),
        await setHidden(MISSING_ID, cookie, { hidden: true }),
      ]) {
        expect([response.status, response.body.code]).toEqual([401, 'unauthenticated']);
      }
    }
  });

  it('작성: 앞뒤 공백을 자른 1~500자, secret 생략은 false, 201 GuestbookEntryView, 잘못된 입력은 400', async () => {
    const owner = await newMember();
    const author = await newMember();

    const created = await write(owner.publicId, author.cookie, { body: '  첫 줄\n둘째 줄  ' });
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    expect(created.body).toEqual({
      id: expect.any(String),
      body: '첫 줄\n둘째 줄',
      secret: false,
      hidden: false,
      mine: true,
      author: { displayName: null, avatarUrl: null },
      createdAt: expect.any(String),
    });
    expect(new Date(created.body.createdAt).toISOString()).toBe(created.body.createdAt);

    const max = 'a'.repeat(CRELINK_LIMITS.guestbookBodyMax);
    const longest = await write(owner.publicId, author.cookie, { body: ` ${max} `, secret: true });
    expect([longest.status, longest.body.body, longest.body.secret]).toEqual([201, max, true]);

    for (const body of [
      { body: '   ' },
      { body: '' },
      {},
      { body: null },
      { body: 1 },
      { body: 'a'.repeat(CRELINK_LIMITS.guestbookBodyMax + 1) },
      { body: '안녕', secret: 'yes' },
      { body: '안녕', secret: null },
      ['안녕'],
    ]) {
      const response = await write(owner.publicId, author.cookie, body);
      expect([JSON.stringify(body), response.status, response.body.code]).toEqual([
        JSON.stringify(body),
        400,
        'validation_failed',
      ]);
    }
    expect(
      (await t.pool.query('SELECT 1 FROM guestbook_entries WHERE author_user_id = $1', [author.userId])).rowCount,
    ).toBe(2);
  });

  it('가시성: 비회원·다른 회원은 공개글만, 작성자는 모두(숨김은 hidden=false), 크리에이터는 모두(숨김은 hidden=true)', async () => {
    const owner = await newMember();
    const author = await newMember();
    const other = await newMember();
    await patchLanding(author.cookie, { displayName: '작성자 이름' });

    const publicEntry = (await write(owner.publicId, author.cookie, { body: '공개 글 본문' })).body;
    const secretEntry = (await write(owner.publicId, author.cookie, { body: '비밀 글 본문 SECRET-1', secret: true }))
      .body;
    const hiddenEntry = (await write(owner.publicId, author.cookie, { body: '숨긴 글 본문 HIDDEN-1' })).body;
    const hiddenSecret = (await write(owner.publicId, author.cookie, { body: '숨긴 비밀 글 HIDDEN-2', secret: true }))
      .body;
    const ownerSecret = (
      await write(owner.publicId, owner.cookie, { body: '크리에이터 비밀 글 SECRET-2', secret: true })
    ).body;
    const otherEntry = (await write(owner.publicId, other.cookie, { body: '다른 회원 공개 글' })).body;
    for (const entry of [hiddenEntry, hiddenSecret]) {
      const hidden = await setHidden(entry.id, owner.cookie, { hidden: true });
      expect([hidden.status, hidden.body.hidden]).toEqual([200, true]);
    }

    const authorView = { displayName: '작성자 이름', avatarUrl: null };
    const unnamedView = { displayName: null, avatarUrl: null };
    const entry = (
      source: GuestbookEntryView,
      flags: { hidden: boolean; mine: boolean },
      author: GuestbookEntryView['author'],
    ) => ({ ...source, ...flags, author });

    // 비회원·다른 회원: 공개·숨기지 않은 글만. 비밀글·숨긴 글은 응답 JSON 어디에도 없습니다.
    for (const [cookie, viewer] of [
      [null, { signedIn: false, isOwner: false }],
      [other.cookie, { signedIn: true, isOwner: false }],
    ] as const) {
      const page = await list(owner.publicId, cookie);
      expect(page.body).toEqual({
        entries: [
          entry(otherEntry, { hidden: false, mine: cookie === other.cookie }, unnamedView),
          entry(publicEntry, { hidden: false, mine: false }, authorView),
        ],
        nextCursor: null,
        viewer,
      });
      const json = JSON.stringify(page.body);
      for (const forbidden of [secretEntry, hiddenEntry, hiddenSecret, ownerSecret]) {
        expect(json).not.toContain(forbidden.id);
        expect(json).not.toContain(forbidden.body);
      }
      expect(json).not.toMatch(/SECRET|HIDDEN/);
    }

    // 작성자: 자기 글은 모두 보이고 숨김 사실은 알리지 않습니다. 크리에이터 비밀글은 안 보입니다.
    const authorPage = await list(owner.publicId, author.cookie);
    expect(authorPage.body).toEqual({
      entries: [
        entry(otherEntry, { hidden: false, mine: false }, unnamedView),
        entry(hiddenSecret, { hidden: false, mine: true }, authorView),
        entry(hiddenEntry, { hidden: false, mine: true }, authorView),
        entry(secretEntry, { hidden: false, mine: true }, authorView),
        entry(publicEntry, { hidden: false, mine: true }, authorView),
      ],
      nextCursor: null,
      viewer: { signedIn: true, isOwner: false },
    });
    expect(JSON.stringify(authorPage.body)).not.toContain(ownerSecret.body);

    // 크리에이터: 모든 글, 숨김은 hidden=true. 자기 글은 작성자이자 소유자로 봅니다.
    const ownerPage = await list(owner.publicId, owner.cookie);
    expect(ownerPage.body).toEqual({
      entries: [
        entry(otherEntry, { hidden: false, mine: false }, unnamedView),
        entry(ownerSecret, { hidden: false, mine: true }, unnamedView),
        entry(hiddenSecret, { hidden: true, mine: false }, authorView),
        entry(hiddenEntry, { hidden: true, mine: false }, authorView),
        entry(secretEntry, { hidden: false, mine: false }, authorView),
        entry(publicEntry, { hidden: false, mine: false }, authorView),
      ],
      nextCursor: null,
      viewer: { signedIn: true, isOwner: true },
    });

    // 숨김을 풀면 다시 모두에게 보입니다.
    const shown = await setHidden(hiddenEntry.id, owner.cookie, { hidden: false });
    expect(shown.body).toEqual(entry(hiddenEntry, { hidden: false, mine: false }, authorView));
    expect((await list(owner.publicId)).body.entries.map((item) => item.id)).toEqual([
      otherEntry.id,
      hiddenEntry.id,
      publicEntry.id,
    ]);
  });

  it('작성자 이름·사진은 작성자 랜딩의 현재 값이라 바꾸면 이전 글에도 반영된다', async () => {
    const owner = await newMember();
    const author = await newMember();
    const created = (await write(owner.publicId, author.cookie, { body: '안녕' })).body;
    expect(created.author).toEqual({ displayName: null, avatarUrl: null });

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'image.png');
    const uploaded = await fetch(`${t.baseUrl}/api/me/files`, {
      method: 'POST',
      headers: { cookie: author.cookie },
      body: form,
    });
    const file = (await uploaded.json()) as UploadFileResponse;
    await patchLanding(author.cookie, { displayName: '새 이름', avatarFileId: file.fileId });

    const page = await list(owner.publicId);
    expect(page.body.entries[0].author).toEqual({
      displayName: '새 이름',
      avatarUrl: `${WEB_URL}/api/backend/api/files/${file.fileId}`,
    });
  });

  it('삭제: 작성자만 204, 다른 회원·크리에이터·없는 글은 404 guestbook_entry_not_found', async () => {
    const owner = await newMember();
    const author = await newMember();
    const other = await newMember();
    const created = (await write(owner.publicId, author.cookie, { body: '지울 글', secret: true })).body;

    for (const [id, cookie] of [
      [created.id, other.cookie],
      [created.id, owner.cookie],
      [MISSING_ID, author.cookie],
      ['not-a-uuid', author.cookie],
    ]) {
      const response = await remove(id, cookie);
      expect([response.status, response.body.code]).toEqual([404, 'guestbook_entry_not_found']);
    }
    expect((await list(owner.publicId, owner.cookie)).body.entries.map((item) => item.id)).toEqual([created.id]);

    const deleted = await remove(created.id, author.cookie);
    expect([deleted.status, deleted.body]).toEqual([204, null]);
    expect((await list(owner.publicId, owner.cookie)).body.entries).toEqual([]);
    expect((await list(owner.publicId, author.cookie)).body.entries).toEqual([]);
    const again = await remove(created.id, author.cookie);
    expect([again.status, again.body.code]).toEqual([404, 'guestbook_entry_not_found']);
  });

  it('숨김: 랜딩 크리에이터만, 작성자·다른 회원·없는 글은 404, hidden이 boolean이 아니면 400', async () => {
    const owner = await newMember();
    const author = await newMember();
    const other = await newMember();
    const otherLandingEntry = (await write(other.publicId, author.cookie, { body: '다른 랜딩 글' })).body;
    const created = (await write(owner.publicId, author.cookie, { body: '숨길 글' })).body;

    for (const [id, cookie] of [
      [created.id, author.cookie],
      [created.id, other.cookie],
      [otherLandingEntry.id, owner.cookie],
      [MISSING_ID, owner.cookie],
      ['not-a-uuid', owner.cookie],
    ]) {
      const response = await setHidden(id, cookie, { hidden: true });
      expect([response.status, response.body.code]).toEqual([404, 'guestbook_entry_not_found']);
    }
    for (const body of [{}, { hidden: 'true' }, { hidden: null }, []]) {
      const response = await setHidden(created.id, owner.cookie, body);
      expect([response.status, response.body.code]).toEqual([400, 'validation_failed']);
    }
    const hiddenAt = async () =>
      (
        await t.pool.query<{ hidden_at: Date | null }>('SELECT hidden_at FROM guestbook_entries WHERE id = $1', [
          created.id,
        ])
      ).rows[0].hidden_at;
    expect(await hiddenAt()).toBeNull();

    const hidden = await setHidden(created.id, owner.cookie, { hidden: true });
    expect(hidden.status).toBe(200);
    expect(hidden.headers.get('cache-control')).toBe('no-store');
    expect(hidden.body).toEqual({ ...created, hidden: true, mine: false });
    expect(await hiddenAt()).toBeInstanceOf(Date);

    const shown = await setHidden(created.id, owner.cookie, { hidden: false });
    expect(shown.body).toEqual({ ...created, hidden: false, mine: false });
    expect(await hiddenAt()).toBeNull();
  });

  it('방명록 끄기: 편집 상태·공개 랜딩에 반영, 조회·작성은 404 guestbook_disabled, 다시 켜면 글이 그대로 있다', async () => {
    const owner = await newMember();
    const author = await newMember();
    const initial = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: owner.cookie }))
      .body;
    expect(initial.landing.guestbookEnabled).toBe(true);
    const created = (await write(owner.publicId, author.cookie, { body: '남을 글' })).body;

    for (const value of ['false', null, 0]) {
      const invalid = await patchLanding(owner.cookie, { guestbookEnabled: value });
      expect([invalid.status, invalid.body.code]).toEqual([400, 'validation_failed']);
    }

    const off = await patchLanding(owner.cookie, { guestbookEnabled: false });
    expect([off.status, off.body.landing.guestbookEnabled]).toEqual([200, false]);
    const landing = await api<PublicLandingResponse>(t.baseUrl, 'GET', `/api/public/landings/${owner.publicId}`);
    expect(landing.body.guestbookEnabled).toBe(false);
    for (const cookie of [null, author.cookie, owner.cookie]) {
      const closed = await list(owner.publicId, cookie);
      expect([closed.status, closed.body.code]).toEqual([404, 'guestbook_disabled']);
    }
    const closedWrite = await write(owner.publicId, author.cookie, { body: '안녕' });
    expect([closedWrite.status, closedWrite.body.code]).toEqual([404, 'guestbook_disabled']);

    // 다른 프로필 수정은 방명록 설정을 바꾸지 않습니다.
    expect((await patchLanding(owner.cookie, { bio: '소개' })).body.landing.guestbookEnabled).toBe(false);

    const on = await patchLanding(owner.cookie, { guestbookEnabled: true });
    expect(on.body.landing.guestbookEnabled).toBe(true);
    expect(
      (await api<PublicLandingResponse>(t.baseUrl, 'GET', `/api/public/landings/${owner.publicId}`)).body
        .guestbookEnabled,
    ).toBe(true);
    expect((await list(owner.publicId)).body.entries.map((item) => item.id)).toEqual([created.id]);
  });

  it('작성자가 정지되면 그 글은 크리에이터를 포함한 모두에게서 빠지고, 정지를 풀면 돌아온다', async () => {
    const owner = await newMember();
    const author = await newMember();
    const other = await newMember();
    const suspendedEntry = (await write(owner.publicId, author.cookie, { body: '정지될 작성자 글' })).body;
    const keptEntry = (await write(owner.publicId, other.cookie, { body: '남는 글' })).body;

    await t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [author.userId]);
    for (const cookie of [null, other.cookie, owner.cookie]) {
      const page = await list(owner.publicId, cookie);
      expect(page.body.entries.map((item) => item.id)).toEqual([keptEntry.id]);
    }
    // 정지된 작성자의 세션은 무효라 비회원으로 봅니다.
    expect((await list(owner.publicId, author.cookie)).body).toMatchObject({
      entries: [{ id: keptEntry.id }],
      viewer: { signedIn: false, isOwner: false },
    });

    await t.pool.query('UPDATE users SET suspended_at = NULL WHERE id = $1', [author.userId]);
    expect((await list(owner.publicId)).body.entries.map((item) => item.id)).toEqual([keptEntry.id, suspendedEntry.id]);
  });

  it('커서 페이지: 최신순 20개씩, 같은 시각은 id로 이어지고 안 보이는 글은 쪽 수에도 나타나지 않는다. 잘못된 커서는 400', async () => {
    const owner = await newMember();
    const author = await newMember();
    const landingId = (await t.pool.query<{ id: string }>('SELECT id FROM landings WHERE user_id = $1', [owner.userId]))
      .rows[0].id;
    // 45개: 3개씩 같은 마이크로초 시각, 5번째마다 비밀글(9개).
    await t.pool.query(
      `INSERT INTO guestbook_entries (landing_id, author_user_id, body, is_secret, created_at)
       SELECT $1, $2, '글 ' || i, i % 5 = 0,
              timestamptz '2026-10-08 12:00:00.123456+00' - (i / 3) * interval '1.000001 second'
       FROM generate_series(1, 45) AS i`,
      [landingId, author.userId],
    );
    const ordered = (
      await t.pool.query<{ id: string; is_secret: boolean }>(
        'SELECT id, is_secret FROM guestbook_entries WHERE landing_id = $1 ORDER BY created_at DESC, id DESC',
        [landingId],
      )
    ).rows;
    const readAll = async (cookie: string | null) => {
      const ids: string[] = [];
      const sizes: number[] = [];
      let cursor: string | undefined;
      do {
        const page = await list(owner.publicId, cookie, cursor);
        expect(page.status).toBe(200);
        ids.push(...page.body.entries.map((item) => item.id));
        sizes.push(page.body.entries.length);
        cursor = page.body.nextCursor ?? undefined;
      } while (cursor);
      return { ids, sizes };
    };

    const authorPages = await readAll(author.cookie);
    expect(authorPages.sizes).toEqual([20, 20, 5]);
    expect(authorPages.ids).toEqual(ordered.map((row) => row.id));
    const anonymousPages = await readAll(null);
    expect(anonymousPages.sizes).toEqual([20, 16]);
    expect(anonymousPages.ids).toEqual(ordered.filter((row) => !row.is_secret).map((row) => row.id));

    const exactlyOnePage = await newMember();
    for (let i = 0; i < CRELINK_LIMITS.guestbookPageSize; i += 1) {
      await write(exactlyOnePage.publicId, author.cookie, { body: `글 ${i}` });
    }
    expect((await list(exactlyOnePage.publicId)).body).toMatchObject({ nextCursor: null });

    for (const cursor of [
      'not!valid',
      Buffer.from('abc').toString('base64url'),
      Buffer.from(`123.${MISSING_ID}x`).toString('base64url'),
      Buffer.from(`-1.${MISSING_ID}`).toString('base64url'),
      'a'.repeat(101),
    ]) {
      const response = await list(owner.publicId, null, cursor);
      expect([cursor, response.status, response.body.code]).toEqual([cursor, 400, 'validation_failed']);
    }
    const repeated = await api(t.baseUrl, 'GET', `/api/landings/${owner.publicId}/guestbook?cursor=a&cursor=b`);
    expect([repeated.status, repeated.body.code]).toEqual([400, 'validation_failed']);
  });
});
