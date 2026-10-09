import { setTimeout as sleep } from 'node:timers/promises';
import { ApiError, CreatorBannerView, CreatorLandingState, UploadFileResponse } from '@crelink/shared';
import { GIF_ANIMATED, PNG_ANIMATED, PNG_STILL } from './image-samples';
import { api, createTestApp, login, TestApp } from './test-app';

/** 시험 한도: 보이는 배너 n = 3, 보관 상한 5(`BANNER_SLOT_MAX`·`BANNER_SLOT_TOTAL_MAX`). */
const VISIBLE_MAX = 3;
const TOTAL_MAX = 5;

interface Creator {
  cookie: string;
  userId: string;
  stillFileId: string;
}

type BannerResponse = CreatorBannerView & Partial<ApiError>;

/** 크리에이터 배너 쓰기(0070, docs/specs/crelink-ad-banner.md `서버 규칙`). */
describe('크리에이터 배너 API (R21 ②④⑤⑥, R14)', () => {
  let t: TestApp;
  let n = 0;

  const upload = async (cookie: string, data: Buffer = PNG_STILL, type = 'image/png') => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type }), 'image');
    const response = await fetch(`${t.baseUrl}/api/me/files`, { method: 'POST', headers: { cookie }, body: form });
    return ((await response.json()) as UploadFileResponse).fileId;
  };
  const newCreator = async (granted = true): Promise<Creator> => {
    n += 1;
    const result = await login(t.baseUrl, `banner-${n}|banner${n}@example.com`);
    const cookie = result.cookie!;
    const userId = result.body.user!.id;
    if (granted) await t.pool.query('UPDATE users SET banner_slot_granted_at = now() WHERE id = $1', [userId]);
    return { cookie, userId, stillFileId: await upload(cookie) };
  };
  const create = (creator: Creator, body: Record<string, unknown> = {}) =>
    api<BannerResponse>(t.baseUrl, 'POST', '/api/me/banners', {
      cookie: creator.cookie,
      body: { imageFileId: creator.stillFileId, alt: '내 배너', ...body },
    });
  const patch = (creator: Creator, id: string, body: Record<string, unknown>) =>
    api<BannerResponse>(t.baseUrl, 'PATCH', `/api/me/banners/${id}`, { cookie: creator.cookie, body });
  const remove = (creator: Creator, id: string) =>
    api(t.baseUrl, 'DELETE', `/api/me/banners/${id}`, { cookie: creator.cookie });
  const order = (creator: Creator, ids: unknown) =>
    api<CreatorBannerView[] & Partial<ApiError>>(t.baseUrl, 'PUT', '/api/me/banners/order', {
      cookie: creator.cookie,
      body: { ids },
    });
  const landing = async (creator: Creator) =>
    (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: creator.cookie })).body;
  const bannerCount = async (creator: Creator) =>
    (
      await t.pool.query<{ count: number }>('SELECT count(*)::int AS count FROM creator_banners WHERE user_id = $1', [
        creator.userId,
      ])
    ).rows[0].count;

  beforeAll(async () => {
    t = await createTestApp({
      env: { BANNER_SLOT_MAX: String(VISIBLE_MAX), BANNER_SLOT_TOTAL_MAX: String(TOTAL_MAX) },
    });
  });

  afterAll(async () => {
    delete process.env.BANNER_SLOT_MAX;
    delete process.env.BANNER_SLOT_TOTAL_MAX;
    await t?.close();
  });

  it('추가: 201 CreatorBannerView, 맨 뒤 순서, 연결 없음 허용, 공개 ID 형식', async () => {
    const creator = await newCreator();
    const first = await create(creator, { url: ' https://Mine.example/path?x=1 ' });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      image: { fileId: creator.stillFileId, url: expect.stringContaining(creator.stillFileId) },
      stillImage: null,
      alt: '내 배너',
      url: 'https://mine.example/path?x=1',
      hidden: false,
      blocked: false,
      blockedReason: null,
      position: 0,
    });
    const second = await create(creator, { url: null, hidden: true });
    const third = await create(creator, { url: '' });
    expect([second.status, second.body.position, second.body.url, second.body.hidden]).toEqual([201, 1, null, true]);
    expect([third.status, third.body.position, third.body.url]).toEqual([201, 2, null]);

    const rows = await t.pool.query<{ public_id: string; host: string | null; landing_id: string }>(
      'SELECT public_id, host, landing_id FROM creator_banners WHERE user_id = $1 ORDER BY position',
      [creator.userId],
    );
    expect(rows.rows.map((row) => row.host)).toEqual(['mine.example', null, null]);
    for (const row of rows.rows) expect(row.public_id).toMatch(/^[a-z0-9]{10}$/);

    const state = await landing(creator);
    expect(state.banners.map((banner) => banner.id)).toEqual([first.body.id, second.body.id, third.body.id]);
    expect(state.bannerLimits).toEqual({ visibleMax: VISIBLE_MAX, visibleUsed: 2, totalMax: TOTAL_MAX, totalUsed: 3 });
  });

  it('입력 검사: 이미지·대체 문구 없음 400, 주소 형식 400, 남의·없는 파일 404, 차단 도메인 422', async () => {
    const creator = await newCreator();
    const other = await newCreator();
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ imageFileId: undefined }, 400, 'validation_failed'],
      [{ imageFileId: null }, 400, 'validation_failed'],
      [{ alt: '  ' }, 400, 'validation_failed'],
      [{ alt: 'a'.repeat(101) }, 400, 'validation_failed'],
      [{ hidden: 'yes' }, 400, 'validation_failed'],
      [{ url: 'ftp://files.example' }, 400, 'link_url_invalid'],
      [{ url: 'not a url' }, 400, 'link_url_invalid'],
      [{ imageFileId: other.stillFileId }, 404, 'file_not_found'],
      [{ imageFileId: 'nope' }, 404, 'file_not_found'],
      [{ stillImageFileId: other.stillFileId }, 404, 'file_not_found'],
    ];
    for (const [body, status, code] of cases) {
      const response = await create(creator, body);
      expect([body, response.status, response.body.code]).toEqual([body, status, code]);
    }
    await t.pool.query("INSERT INTO blocked_domains (domain) VALUES ('banned.example')");
    for (const url of ['https://banned.example/x', 'http://Sub.banned.example']) {
      const response = await create(creator, { url });
      expect([url, response.status, response.body.code]).toEqual([url, 422, 'link_domain_blocked']);
    }
    expect(await bannerCount(creator)).toBe(0);
    const ok = await create(creator, { alt: 'a'.repeat(100), url: 'https://notbanned.example' });
    expect(ok.status).toBe(201);
  });

  it('정지 이미지 규칙: 움직이면 정지 이미지 필수·정지 이미지는 움직이지 않음, 바꿀 때 짝 검사', async () => {
    const creator = await newCreator();
    const gif = await upload(creator.cookie, GIF_ANIMATED, 'image/gif');
    const apng = await upload(creator.cookie, PNG_ANIMATED, 'image/png');
    const still = creator.stillFileId;
    for (const body of [
      { imageFileId: gif },
      { imageFileId: gif, stillImageFileId: null },
      { imageFileId: gif, stillImageFileId: apng },
      { imageFileId: still, stillImageFileId: still },
    ]) {
      const response = await create(creator, body);
      expect([body, response.status, response.body.code]).toEqual([body, 400, 'validation_failed']);
    }
    const moving = await create(creator, { imageFileId: gif, stillImageFileId: still });
    expect([moving.status, moving.body.image.fileId, moving.body.stillImage?.fileId]).toEqual([201, gif, still]);

    // animated가 NULL(0003 전 파일)이면 저장 때 판정합니다. 거부되면 트랜잭션과 함께 되돌려지고, 저장되면 채운 값이 남습니다.
    await t.pool.query('UPDATE files SET animated = NULL WHERE id = $1', [apng]);
    expect((await create(creator, { imageFileId: apng })).body.code).toBe('validation_failed');
    expect((await create(creator, { imageFileId: apng, stillImageFileId: still })).status).toBe(201);
    expect((await t.pool.query('SELECT animated FROM files WHERE id = $1', [apng])).rows[0].animated).toBe(true);

    const id = moving.body.id;
    const otherStill = await upload(creator.cookie);
    const rejected: Array<Record<string, unknown>> = [
      { imageFileId: still }, // 이미지를 바꾸면 정지 이미지도 같은 요청에
      { stillImageFileId: null }, // 움직이는 이미지의 정지 이미지를 비움
      { stillImageFileId: apng }, // 움직이는 정지 이미지
      { imageFileId: apng, stillImageFileId: null },
    ];
    for (const body of rejected) {
      const response = await patch(creator, id, body);
      expect([body, response.status, response.body.code]).toEqual([body, 400, 'validation_failed']);
    }
    const swapped = await patch(creator, id, { stillImageFileId: otherStill });
    expect([swapped.status, swapped.body.stillImage?.fileId]).toEqual([200, otherStill]);
    const toStill = await patch(creator, id, { imageFileId: still, stillImageFileId: null });
    expect([toStill.status, toStill.body.image.fileId, toStill.body.stillImage]).toEqual([200, still, null]);
    // 움직이지 않는 이미지에는 정지 이미지만 바꾸는 요청을 받지 않습니다.
    expect((await patch(creator, id, { stillImageFileId: otherStill })).body.code).toBe('validation_failed');
    // 다른 필드만 고치면 짝을 다시 검사하지 않습니다.
    expect((await patch(creator, id, { alt: '새 문구' })).body.alt).toBe('새 문구');
  });

  it('한도 경계: 보이는 n-1 → n 추가, n에서 409, 숨긴 배너는 보관 상한까지, 상한에서 409', async () => {
    const creator = await newCreator();
    for (let index = 0; index < VISIBLE_MAX - 1; index += 1) expect((await create(creator)).status).toBe(201);
    // n-1장 → n장째는 받습니다.
    expect((await create(creator)).status).toBe(201);
    // n장이면 보이는 배너 추가는 409, 숨긴 배너는 받습니다.
    const over = await create(creator);
    expect([over.status, over.body.code]).toEqual([409, 'banner_limit_reached']);
    expect(over.body.message).toContain(`${VISIBLE_MAX}장`);
    for (let index = VISIBLE_MAX; index < TOTAL_MAX; index += 1) {
      expect((await create(creator, { hidden: true })).status).toBe(201);
    }
    // 보관 상한이면 숨김이어도 409이고, 보관 상한을 먼저 봅니다.
    for (const hidden of [true, false]) {
      const full = await create(creator, { hidden });
      expect([hidden, full.status, full.body.code]).toEqual([hidden, 409, 'banner_total_limit_reached']);
    }
    expect(await bannerCount(creator)).toBe(TOTAL_MAX);
    expect((await landing(creator)).bannerLimits).toEqual({
      visibleMax: VISIBLE_MAX,
      visibleUsed: VISIBLE_MAX,
      totalMax: TOTAL_MAX,
      totalUsed: TOTAL_MAX,
    });
  });

  it('숨김 해제: 보이는 배너가 n이면 409, 하나를 숨기면 받음, 차단 배너는 한도를 세지 않음', async () => {
    const creator = await newCreator();
    const visible: string[] = [];
    for (let index = 0; index < VISIBLE_MAX; index += 1) visible.push((await create(creator)).body.id);
    const hidden = (await create(creator, { hidden: true })).body.id;
    const unhide = await patch(creator, hidden, { hidden: false });
    expect([unhide.status, unhide.body.code]).toEqual([409, 'banner_limit_reached']);
    expect((await t.pool.query('SELECT hidden FROM creator_banners WHERE id = $1', [hidden])).rows[0].hidden).toBe(
      true,
    );
    // 이미 보이는 배너에 hidden: false를 다시 보내도 늘지 않으므로 받습니다.
    expect((await patch(creator, visible[0], { hidden: false })).status).toBe(200);

    expect((await patch(creator, visible[0], { hidden: true })).status).toBe(200);
    expect((await patch(creator, hidden, { hidden: false })).body.hidden).toBe(false);

    // 차단된 배너는 숨김을 풀어도 보이지 않으므로 한도에 닿아 있어도 받습니다.
    await t.pool.query("UPDATE creator_banners SET blocked_at = now(), blocked_reason = '정책' WHERE id = $1", [
      visible[0],
    ]);
    const blockedUnhide = await patch(creator, visible[0], { hidden: false });
    expect([blockedUnhide.status, blockedUnhide.body.hidden, blockedUnhide.body.blocked]).toEqual([200, false, true]);
  });

  it('설정값을 지금 장수보다 낮추면 있는 배너는 그대로, 추가·숨김 해제만 막음', async () => {
    const creator = await newCreator();
    for (let index = 0; index < VISIBLE_MAX; index += 1) await create(creator);
    const hidden = (await create(creator, { hidden: true })).body.id;
    process.env.BANNER_SLOT_MAX = '1';
    try {
      expect((await landing(creator)).bannerLimits).toMatchObject({ visibleMax: 1, visibleUsed: VISIBLE_MAX });
      expect((await create(creator)).body.code).toBe('banner_limit_reached');
      expect((await patch(creator, hidden, { hidden: false })).body.code).toBe('banner_limit_reached');
      expect((await patch(creator, hidden, { alt: '그대로' })).status).toBe(200);
    } finally {
      process.env.BANNER_SLOT_MAX = String(VISIBLE_MAX);
    }
  });

  it('차단 유지: 주소를 바꿔도 차단 그대로, 차단 도메인 주소로는 바꿀 수 없음, 숨김 전환·삭제는 됨', async () => {
    const creator = await newCreator();
    const banner = (await create(creator, { url: 'https://old.example' })).body;
    await t.pool.query("UPDATE creator_banners SET blocked_at = now(), blocked_reason = '운영 정책' WHERE id = $1", [
      banner.id,
    ]);
    const moved = await patch(creator, banner.id, { url: 'https://new.example/', alt: '새 문구' });
    expect([moved.status, moved.body.url, moved.body.blocked, moved.body.blockedReason]).toEqual([
      200,
      'https://new.example/',
      true,
      '운영 정책',
    ]);
    const unlinked = await patch(creator, banner.id, { url: null });
    expect([unlinked.body.url, unlinked.body.blocked]).toEqual([null, true]);
    expect((await t.pool.query('SELECT host FROM creator_banners WHERE id = $1', [banner.id])).rows[0].host).toBeNull();

    await t.pool.query("INSERT INTO blocked_domains (domain) VALUES ('evil.example')");
    const blockedDomain = await patch(creator, banner.id, { url: 'https://www.evil.example' });
    expect([blockedDomain.status, blockedDomain.body.code]).toEqual([422, 'link_domain_blocked']);
    expect((await patch(creator, banner.id, { url: 'ftp://x.example' })).body.code).toBe('link_url_invalid');
    expect((await patch(creator, banner.id, { hidden: true })).body).toMatchObject({ hidden: true, blocked: true });
    expect((await remove(creator, banner.id)).status).toBe(204);
    expect(await bannerCount(creator)).toBe(0);
  });

  it('수정·삭제: 남의 배너·없는 id·형식이 틀린 id는 404 banner_not_found, 삭제는 204 뒤 404', async () => {
    const creator = await newCreator();
    const other = await newCreator();
    const mine = (await create(creator)).body.id;
    const theirs = (await create(other)).body.id;
    for (const id of [theirs, '00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const patched = await patch(creator, id, { alt: 'x' });
      const deleted = await remove(creator, id);
      expect([id, patched.status, patched.body.code, deleted.status, deleted.body.code]).toEqual([
        id,
        404,
        'banner_not_found',
        404,
        'banner_not_found',
      ]);
    }
    expect((await remove(creator, mine)).status).toBe(204);
    expect((await remove(creator, mine)).status).toBe(404);
    expect(await bannerCount(other)).toBe(1);
  });

  it('순서: 숨김·차단 포함 전체 id로 다시 매김, 집합이 다르면 400 order_mismatch', async () => {
    const creator = await newCreator();
    const ids: string[] = [];
    for (const hidden of [false, true, false]) ids.push((await create(creator, { hidden })).body.id);
    await t.pool.query('UPDATE creator_banners SET blocked_at = now() WHERE id = $1', [ids[2]]);
    const other = await newCreator();
    const theirs = (await create(other)).body.id;

    for (const bad of [ids.slice(0, 2), [...ids, theirs], [ids[0], ids[0], ids[1]], 'x', [ids[0], ids[1], theirs]]) {
      const response = await order(creator, bad);
      expect([response.status, response.body.code]).toEqual([400, 'order_mismatch']);
    }
    const reordered = await order(creator, [ids[2], ids[0], ids[1]]);
    expect(reordered.status).toBe(200);
    expect(reordered.body.map((banner) => [banner.id, banner.position])).toEqual([
      [ids[2], 0],
      [ids[0], 1],
      [ids[1], 2],
    ]);
    expect((await landing(creator)).banners.map((banner) => banner.id)).toEqual([ids[2], ids[0], ids[1]]);
    // 새 배너는 맨 뒤입니다.
    expect((await create(creator, { hidden: true })).body.position).toBe(3);
  });

  it('미부여: 4경로 모두 403 banner_slot_not_granted(보관 배너도), 로그인 없으면 401', async () => {
    const creator = await newCreator();
    const kept = (await create(creator)).body.id;
    await t.pool.query('UPDATE users SET banner_slot_granted_at = NULL WHERE id = $1', [creator.userId]);
    const never = await newCreator(false);
    const responses = [
      await create(creator),
      await patch(creator, kept, { hidden: true }),
      await remove(creator, kept),
      await order(creator, [kept]),
      await create(never),
      // 부여 확인이 소유 확인보다 먼저라 없는 배너도 403입니다.
      await patch(never, kept, { alt: 'x' }),
      await remove(never, '00000000-0000-4000-8000-000000000000'),
      await order(never, []),
    ];
    for (const response of responses) {
      expect([response.status, response.body?.code]).toEqual([403, 'banner_slot_not_granted']);
    }
    // 보관 배너는 그대로 남습니다(R21 ⑤).
    expect((await t.pool.query('SELECT hidden FROM creator_banners WHERE id = $1', [kept])).rows[0].hidden).toBe(false);
    expect(await bannerCount(never)).toBe(0);

    for (const [method, path] of [
      ['POST', '/api/me/banners'],
      ['PATCH', `/api/me/banners/${kept}`],
      ['DELETE', `/api/me/banners/${kept}`],
      ['PUT', '/api/me/banners/order'],
    ] as const) {
      const response = await api(t.baseUrl, method, path, { body: {} });
      expect([method, response.status]).toEqual([method, 401]);
    }
  });

  it('동시: 회수 트랜잭션이 사용자 행을 잡고 있으면 쓰기는 기다렸다가 회수 뒤 403', async () => {
    const creator = await newCreator();
    const kept = (await create(creator)).body.id;
    const revoke = await t.pool.connect();
    try {
      await revoke.query('BEGIN');
      await revoke.query('UPDATE users SET banner_slot_granted_at = NULL WHERE id = $1', [creator.userId]);
      let settled = false;
      const pending = [create(creator), patch(creator, kept, { hidden: true }), remove(creator, kept)].map((request) =>
        request.finally(() => {
          settled = true;
        }),
      );
      await sleep(300);
      // 쓰기는 사용자 잠금에서 기다립니다(부여 확인이 회수보다 먼저 끝나지 않음).
      expect(settled).toBe(false);
      await revoke.query('COMMIT');
      for (const response of await Promise.all(pending)) {
        expect([response.status, response.body?.code]).toEqual([403, 'banner_slot_not_granted']);
      }
    } finally {
      revoke.release();
    }
    const rows = await t.pool.query<{ id: string; hidden: boolean }>(
      'SELECT id, hidden FROM creator_banners WHERE user_id = $1',
      [creator.userId],
    );
    expect(rows.rows).toEqual([{ id: kept, hidden: false }]);
  });

  it('동시: 쓰기 트랜잭션이 먼저 잠그면 회수는 쓰기 뒤에 끝나고, 같은 사용자의 추가는 한도를 넘지 않음', async () => {
    const creator = await newCreator();
    for (let index = 0; index < VISIBLE_MAX - 1; index += 1) await create(creator);
    // n-1장에서 보이는 배너 추가 3건을 동시에 보내면 1건만 받습니다.
    const results = await Promise.all([create(creator), create(creator), create(creator)]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409, 409]);
    expect(results.filter((response) => response.status === 409).map((response) => response.body.code)).toEqual([
      'banner_limit_reached',
      'banner_limit_reached',
    ]);
    expect((await landing(creator)).bannerLimits.visibleUsed).toBe(VISIBLE_MAX);

    // 숨긴 배너 추가와 회수를 동시에: 어느 쪽이 먼저든 회수 뒤에는 쓰기가 성공하지 않습니다.
    const writes = [create(creator, { hidden: true }), create(creator, { hidden: true })];
    await t.pool.query('UPDATE users SET banner_slot_granted_at = NULL WHERE id = $1', [creator.userId]);
    const after = await create(creator, { hidden: true });
    expect([after.status, after.body.code]).toEqual([403, 'banner_slot_not_granted']);
    const settled = await Promise.all(writes);
    for (const response of settled) expect([201, 403]).toContain(response.status);
    expect(await bannerCount(creator)).toBe(VISIBLE_MAX + settled.filter((response) => response.status === 201).length);
  });
});
