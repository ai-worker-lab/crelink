import { AdBannerListResponse, AdBannerView, ApiError, UploadFileResponse } from '@crelink/shared';
import { AdBannersService } from '../src/admin/ad-banners.service';
import { CreatorService } from '../src/creator/creator.service';
import { GIF_ANIMATED, GIF_STILL, PNG_STILL } from './image-samples';
import { api, createTestApp, login, TestApp, WEB_URL } from './test-app';

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/** 크리링 배너 운영 API(0071, docs/specs/crelink-ad-banner.md `서버 규칙`·`운영자 표 누적 집계`). */
describe('운영자 크리링 배너 (R20 ④⑨, R14)', () => {
  let t: TestApp;
  let operator: string;
  let operatorId: string;
  let operator2: string;
  let creator: string;
  let png: string;
  let gif: string;
  let gifStill: string;
  let creatorPng: string;

  const upload = async (cookie: string, data: Buffer, type: string) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type }), 'image');
    const response = await fetch(`${t.baseUrl}/api/me/files`, { method: 'POST', headers: { cookie }, body: form });
    const body: UploadFileResponse = await response.json();
    return body.fileId;
  };
  const create = (body: Record<string, unknown>, cookie = operator) =>
    api<AdBannerView & Partial<ApiError>>(t.baseUrl, 'POST', '/api/admin/ad-banners', { cookie, body });
  const valid = (overrides: Record<string, unknown> = {}) => ({
    imageFileId: png,
    alt: '크리링 가을 이벤트',
    url: 'https://event.example/autumn?x=1',
    startsAt: iso(-DAY),
    ...overrides,
  });
  const createOk = async (overrides: Record<string, unknown> = {}, cookie = operator) => {
    const response = await create(valid(overrides), cookie);
    expect(response.status).toBe(201);
    return response.body;
  };
  const patch = (id: string, body: Record<string, unknown>, cookie = operator) =>
    api<AdBannerView & Partial<ApiError>>(t.baseUrl, 'PATCH', `/api/admin/ad-banners/${id}`, { cookie, body });
  const end = (id: string, cookie = operator) =>
    api<AdBannerView & Partial<ApiError>>(t.baseUrl, 'PUT', `/api/admin/ad-banners/${id}/end`, { cookie });
  const list = async () =>
    (await api<AdBannerListResponse>(t.baseUrl, 'GET', '/api/admin/ad-banners', { cookie: operator })).body;
  const reorder = (ids: unknown) =>
    api<AdBannerView[] & Partial<ApiError>>(t.baseUrl, 'PUT', '/api/admin/ad-banners/order', {
      cookie: operator,
      body: { ids },
    });
  const row = async (id: string) =>
    (
      await t.pool.query<{ sort_order: number; created_by: string | null; updated_at: Date; host: string }>(
        'SELECT sort_order, created_by, updated_at, host FROM ad_banners WHERE id = $1',
        [id],
      )
    ).rows[0];
  const fileUrl = (fileId: string) => `${WEB_URL}/api/backend/api/files/${fileId}`;

  beforeAll(async () => {
    t = await createTestApp({ env: { OPERATOR_EMAILS: 'operator@example.com,operator2@example.com' } });
    const first = await login(t.baseUrl, 'ad-op-1|operator@example.com');
    operator = first.cookie!;
    operatorId = first.body.user!.id;
    operator2 = (await login(t.baseUrl, 'ad-op-2|operator2@example.com')).cookie!;
    creator = (await login(t.baseUrl, 'ad-creator|adcreator@example.com')).cookie!;
    png = await upload(operator, PNG_STILL, 'image/png');
    gif = await upload(operator, GIF_ANIMATED, 'image/gif');
    gifStill = await upload(operator, GIF_STILL, 'image/gif');
    creatorPng = await upload(creator, PNG_STILL, 'image/png');
  });

  afterEach(async () => {
    // 크리링 배너는 전역 목록이므로 시험마다 지웁니다(노출 카운터는 연쇄 삭제).
    await t.pool.query('DELETE FROM ad_banners');
    await t.pool.query('DELETE FROM blocked_domains');
  });

  afterAll(async () => {
    await t?.close();
  });

  it('로그인하지 않으면 401, 크리에이터는 403 forbidden', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const paths: Array<[string, string]> = [
      ['GET', '/api/admin/ad-banners'],
      ['POST', '/api/admin/ad-banners'],
      ['PATCH', `/api/admin/ad-banners/${id}`],
      ['PUT', `/api/admin/ad-banners/${id}/end`],
      ['PUT', '/api/admin/ad-banners/order'],
    ];
    for (const [method, path] of paths) {
      const body = method === 'GET' ? undefined : {};
      const anonymous = await api(t.baseUrl, method, path, { body });
      expect([path, anonymous.status, anonymous.body.code]).toEqual([path, 401, 'unauthenticated']);
      const forbidden = await api(t.baseUrl, method, path, { cookie: creator, body });
      expect([path, forbidden.status, forbidden.body.code]).toEqual([path, 403, 'forbidden']);
    }
  });

  it('등록: 응답 모양, 맨 뒤 순서, 등록한 운영자, 시각은 UTC ISO로', async () => {
    const startsAt = '2026-01-01T09:00:00+09:00';
    const first = await createOk({ startsAt, endsAt: '2099-01-01T00:00:00+09:00' });
    expect(first).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      image: { fileId: png, url: fileUrl(png) },
      stillImage: null,
      alt: '크리링 가을 이벤트',
      url: 'https://event.example/autumn?x=1',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2098-12-31T15:00:00.000Z',
      status: 'live',
      impressions: 0,
      clicks: 0,
      createdAt: expect.any(String),
    });
    const second = await createOk({ endsAt: null }, operator2);
    expect(second.endsAt).toBeNull();
    expect(await row(first.id)).toMatchObject({ sort_order: 0, created_by: operatorId, host: 'event.example' });
    expect((await row(second.id)).sort_order).toBe(1);
    expect((await list()).items.map((item) => item.id)).toEqual([first.id, second.id]);
  });

  it('등록 검증: 주소 형식, 시간대 없는 시각, 끝 ≤ 시작, 차단 도메인(하위 포함), 이미지 소유·필수, 대체 문구', async () => {
    await t.pool.query("INSERT INTO blocked_domains (domain) VALUES ('blocked.example')");
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ url: 'ftp://event.example/' }, 400, 'link_url_invalid'],
      [{ url: undefined }, 400, 'link_url_invalid'],
      [{ startsAt: '2026-10-09T09:00' }, 400, 'validation_failed'],
      [{ startsAt: '2026-10-09T09:00:00' }, 400, 'validation_failed'],
      [{ startsAt: 'yesterday' }, 400, 'validation_failed'],
      [{ startsAt: undefined }, 400, 'validation_failed'],
      [{ endsAt: '2026-10-09' }, 400, 'validation_failed'],
      [{ startsAt: '2026-10-09T09:00:00+09:00', endsAt: '2026-10-09T00:00:00Z' }, 400, 'banner_period_invalid'],
      [{ startsAt: '2026-10-09T09:00:00+09:00', endsAt: '2026-10-09T08:00:00+09:00' }, 400, 'banner_period_invalid'],
      [{ url: 'https://blocked.example/a' }, 422, 'link_domain_blocked'],
      [{ url: 'https://ads.blocked.example/a' }, 422, 'link_domain_blocked'],
      [{ imageFileId: creatorPng }, 404, 'file_not_found'],
      [{ imageFileId: '00000000-0000-4000-8000-000000000000' }, 404, 'file_not_found'],
      [{ imageFileId: 'not-a-uuid' }, 404, 'file_not_found'],
      [{ imageFileId: undefined }, 400, 'validation_failed'],
      [{ alt: '   ' }, 400, 'validation_failed'],
      [{ alt: 'a'.repeat(101) }, 400, 'validation_failed'],
    ];
    for (const [overrides, status, code] of cases) {
      const response = await create(valid(overrides));
      expect([overrides, response.status, response.body]).toEqual([
        overrides,
        status,
        expect.objectContaining({ code }),
      ]);
    }
    expect((await list()).counts.all).toBe(0);
    // 차단과 무관한 비슷한 이름은 받습니다.
    await createOk({ url: 'https://notblocked.example/' });
  });

  it('정지 이미지 규칙: 움직이는 이미지는 움직이지 않는 정지 이미지가 필요하고, 정지 이미지는 운영자 파일이어야 한다', async () => {
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ imageFileId: gif }, 400, 'validation_failed'],
      [{ imageFileId: gif, stillImageFileId: null }, 400, 'validation_failed'],
      [{ imageFileId: gif, stillImageFileId: gif }, 400, 'validation_failed'],
      [{ imageFileId: png, stillImageFileId: gifStill }, 400, 'validation_failed'],
      [{ imageFileId: gif, stillImageFileId: creatorPng }, 404, 'file_not_found'],
    ];
    for (const [overrides, status, code] of cases) {
      const response = await create(valid(overrides));
      expect([overrides, response.status, response.body.code]).toEqual([overrides, status, code]);
    }
    const animated = await createOk({ imageFileId: gif, stillImageFileId: gifStill });
    expect(animated.stillImage).toEqual({ fileId: gifStill, url: fileUrl(gifStill) });
    // NULL(0003 전 파일)은 저장 때 판정해 채웁니다.
    const legacy = await upload(operator, GIF_ANIMATED, 'image/gif');
    await t.pool.query('UPDATE files SET animated = NULL WHERE id = $1', [legacy]);
    expect((await create(valid({ imageFileId: legacy }))).body.code).toBe('validation_failed');
    // 실패한 요청은 트랜잭션과 함께 되돌아가고, 저장에 성공하면 판정 값이 남습니다.
    await createOk({ imageFileId: legacy, stillImageFileId: gifStill });
    expect((await t.pool.query('SELECT animated FROM files WHERE id = $1', [legacy])).rows[0].animated).toBe(true);
  });

  it('상태 경계: starts_at = now는 게시 중, ends_at = now는 끝남, 목록과 공개 랜딩 기준이 같다', async () => {
    const adBanners = t.app.get(AdBannersService);
    const creatorService = t.app.get(CreatorService);
    const client = await t.pool.connect();
    try {
      // 한 트랜잭션 안에서 now()는 같은 값이라 경계를 정확히 맞출 수 있습니다.
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string; public_id: string; kind: string }>(
        `INSERT INTO ad_banners (public_id, image_file_id, alt, url, host, starts_at, ends_at, sort_order)
         VALUES ('bound00001', $1, 'starts now', 'https://a.example/', 'a.example', now(), NULL, 0),
                ('bound00002', $1, 'ends now', 'https://a.example/', 'a.example', now() - interval '1 day', now(), 1),
                ('bound00003', $1, 'starts later', 'https://a.example/', 'a.example', now() + interval '1 microsecond', NULL, 2),
                ('bound00004', $1, 'ends later', 'https://a.example/', 'a.example', now(), now() + interval '1 microsecond', 3),
                ('bound00005', $1, 'scheduled ended', 'https://a.example/', 'a.example', now(), now(), 4)
         RETURNING id, public_id, alt AS kind`,
        [png],
      );
      const result = await adBanners.list(client);
      expect(result.items.map((item) => [item.alt, item.status])).toEqual([
        ['starts now', 'live'],
        ['ends now', 'ended'],
        ['starts later', 'scheduled'],
        ['ends later', 'live'],
        ['scheduled ended', 'ended'],
      ]);
      expect(result.counts).toEqual({ all: 5, live: 2, scheduled: 1, ended: 2 });
      expect(result.items.map((item) => item.id)).toEqual(inserted.rows.map((r) => r.id));
      const live = await creatorService.liveAdBanners(client);
      expect(live.map((banner) => banner.public_id)).toEqual(['bound00001', 'bound00004']);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('목록: 상태별 counts와 HTTP 응답의 상태', async () => {
    await createOk({ alt: 'live open' });
    await createOk({ alt: 'live until', endsAt: iso(DAY) });
    await createOk({ alt: 'scheduled', startsAt: iso(DAY), endsAt: iso(2 * DAY) });
    await createOk({ alt: 'ended', startsAt: iso(-2 * DAY), endsAt: iso(-DAY) });
    const result = await list();
    expect(result.items.map((item) => [item.alt, item.status])).toEqual([
      ['live open', 'live'],
      ['live until', 'live'],
      ['scheduled', 'scheduled'],
      ['ended', 'ended'],
    ]);
    expect(result.counts).toEqual({ all: 4, live: 2, scheduled: 1, ended: 1 });
  });

  it('누적 합계: 날짜·랜딩별 카운터의 합을 JSON number로, 기록 없는 배너는 0', async () => {
    const counted = await createOk({ alt: 'counted' });
    const empty = await createOk({ alt: 'empty' });
    await t.pool.query(
      `INSERT INTO ad_banner_daily_stats (day, ad_banner_id, landing_public_id, impressions, clicks)
       VALUES ('2026-10-01', $1, 'landing001', 1000000000, 7),
              ('2026-10-01', $1, 'landing002', 1000000000, 3),
              ('2026-10-02', $1, 'landing001', 5, 0)`,
      [counted.id],
    );
    const result = await list();
    const byAlt = Object.fromEntries(result.items.map((item) => [item.alt, item]));
    expect([byAlt.counted.impressions, byAlt.counted.clicks]).toEqual([2000000005, 10]);
    expect([byAlt.empty.impressions, byAlt.empty.clicks]).toEqual([0, 0]);
    expect(typeof byAlt.counted.impressions).toBe('number');
    // 내리기·수정 응답도 같은 합계입니다.
    expect((await end(counted.id)).body).toMatchObject({ impressions: 2000000005, clicks: 10 });
    expect((await patch(counted.id, { alt: 'renamed' })).body).toMatchObject({ impressions: 2000000005, clicks: 10 });
    expect((await patch(empty.id, { alt: 'still empty' })).body).toMatchObject({ impressions: 0, clicks: 0 });
  });

  it('다른 운영자의 수정: 바뀐 필드만, 다른 운영자가 올린 이미지 유지·교체, 크리에이터 파일은 404', async () => {
    const banner = await createOk({ imageFileId: gif, stillImageFileId: gifStill });
    const otherPng = await upload(operator2, PNG_STILL, 'image/png');

    const renamed = await patch(banner.id, { alt: '바뀐 문구', url: 'https://other.example/b' }, operator2);
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({
      alt: '바뀐 문구',
      url: 'https://other.example/b',
      image: { fileId: gif },
      stillImage: { fileId: gifStill },
      startsAt: banner.startsAt,
      endsAt: null,
      status: 'live',
    });
    expect(await row(banner.id)).toMatchObject({ created_by: operatorId, host: 'other.example' });

    // 저장된 값과 같은 파일 id(운영자 1이 올림)는 그대로 받습니다.
    expect((await patch(banner.id, { imageFileId: gif, stillImageFileId: gifStill }, operator2)).status).toBe(200);
    // 이미지를 바꾸면 정지 이미지도 같은 요청에.
    expect((await patch(banner.id, { imageFileId: otherPng }, operator2)).body.code).toBe('validation_failed');
    expect((await patch(banner.id, { imageFileId: creatorPng, stillImageFileId: null }, operator2)).body.code).toBe(
      'file_not_found',
    );
    // 움직이는 이미지의 정지 이미지를 지울 수 없습니다.
    expect((await patch(banner.id, { stillImageFileId: null }, operator2)).body.code).toBe('validation_failed');
    const swapped = await patch(banner.id, { imageFileId: otherPng, stillImageFileId: null }, operator2);
    expect(swapped.status).toBe(200);
    expect(swapped.body).toMatchObject({ image: { fileId: otherPng }, stillImage: null });
    // 정지 이미지만 바꾸는 것은 지금 이미지가 움직일 때만.
    expect((await patch(banner.id, { stillImageFileId: gifStill }, operator2)).body.code).toBe('validation_failed');
    // 운영자 1이 올린 새 파일도 운영자 2가 쓸 수 있습니다(운영자 공용).
    const back = await patch(banner.id, { imageFileId: gif, stillImageFileId: gifStill }, operator2);
    expect(back.body).toMatchObject({ image: { fileId: gif }, stillImage: { fileId: gifStill } });

    // 기간·검증
    expect((await patch(banner.id, { endsAt: banner.startsAt })).body.code).toBe('banner_period_invalid');
    expect((await patch(banner.id, { startsAt: '2026-10-09 09:00' })).body.code).toBe('validation_failed');
    expect((await patch(banner.id, { url: 'javascript:alert(1)' })).body.code).toBe('link_url_invalid');
    expect((await patch(banner.id, { alt: '' })).body.code).toBe('validation_failed');
    const scheduled = await patch(banner.id, { startsAt: iso(DAY), endsAt: iso(2 * DAY) });
    expect(scheduled.body.status).toBe('scheduled');
    expect((await patch(banner.id, {})).body).toEqual(scheduled.body);

    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const missing = await patch(id, { alt: 'x' });
      expect([missing.status, missing.body.code]).toEqual([404, 'ad_banner_not_found']);
    }
  });

  it('PATCH 차단 재검사: 결과가 게시 중·예약이면 저장된 호스트도 검사, 끝난 배너는 기간을 다시 열 때만 막힘', async () => {
    const banner = await createOk({ url: 'https://later.example/' });
    // 등록 뒤 도메인을 막았다고 둡니다(차단 도메인 추가가 배너를 내리는 0072 처리와 무관하게 SQL로).
    await t.pool.query("INSERT INTO blocked_domains (domain) VALUES ('later.example')");
    expect((await patch(banner.id, { alt: '문구만' })).body.code).toBe('link_domain_blocked');
    expect((await patch(banner.id, { url: 'https://www.later.example/' })).body.code).toBe('link_domain_blocked');
    expect((await end(banner.id)).body.status).toBe('ended');
    // 끝난 채로 두는 수정은 받습니다.
    expect((await patch(banner.id, { alt: '끝난 배너 문구' })).status).toBe(200);
    // 기간만 고쳐 다시 열면 422.
    for (const body of [{ endsAt: null }, { endsAt: iso(DAY) }, { startsAt: iso(DAY), endsAt: iso(2 * DAY) }]) {
      const reopened = await patch(banner.id, body);
      expect([body, reopened.status, reopened.body.code]).toEqual([body, 422, 'link_domain_blocked']);
    }
    // 주소를 바꾸면 다시 엽니다.
    const fixed = await patch(banner.id, { url: 'https://fine.example/', endsAt: null });
    expect([fixed.status, fixed.body.status, fixed.body.url]).toEqual([200, 'live', 'https://fine.example/']);
  });

  it('/end 두 번: 게시 중은 끝 = 지금, 두 번째는 바꾸지 않고 200, 예약은 시작도 당기고, 이미 끝난 배너는 그대로', async () => {
    const live = await createOk({ endsAt: iso(DAY) });
    const before = Date.now();
    const first = await end(live.id);
    expect([first.status, first.body.status]).toEqual([200, 'ended']);
    const endedAt = Date.parse(first.body.endsAt!);
    expect(endedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(endedAt).toBeLessThanOrEqual(Date.now());
    expect(first.body.startsAt).toBe(live.startsAt);
    const updatedAt = (await row(live.id)).updated_at;
    const second = await end(live.id);
    expect([second.status, second.body]).toEqual([200, first.body]);
    expect((await row(live.id)).updated_at).toEqual(updatedAt);

    const scheduled = await createOk({ startsAt: iso(DAY) });
    const ended = (await end(scheduled.id)).body;
    expect(ended.status).toBe('ended');
    expect(ended.startsAt).toBe(ended.endsAt);
    expect(Date.parse(ended.startsAt)).toBeLessThan(Date.parse(scheduled.startsAt));

    const past = await createOk({ startsAt: iso(-2 * DAY), endsAt: iso(-DAY) });
    expect((await end(past.id)).body).toEqual(past);

    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const missing = await end(id);
      expect([missing.status, missing.body.code]).toEqual([404, 'ad_banner_not_found']);
    }
    expect((await list()).counts).toEqual({ all: 3, live: 0, scheduled: 0, ended: 3 });
  });

  it('정렬: 전체 id로 0..n-1, order_mismatch, 동시 정렬·등록은 advisory lock으로 줄 선다', async () => {
    const banners = [];
    for (let index = 0; index < 4; index += 1) banners.push(await createOk({ alt: `배너 ${index}` }));
    const [a, b, c, d] = banners.map((banner) => banner.id);

    const reordered = await reorder([d, b, a, c]);
    expect(reordered.status).toBe(200);
    expect(reordered.body.map((item) => item.id)).toEqual([d, b, a, c]);
    expect((await list()).items.map((item) => item.id)).toEqual([d, b, a, c]);

    for (const ids of [
      [d, b, a],
      [d, b, a, c, c],
      [d, b, a, a],
      [d, b, a, '00000000-0000-4000-8000-000000000000'],
      'x',
    ]) {
      const mismatch = await reorder(ids);
      expect([ids, mismatch.status, mismatch.body]).toEqual([
        ids,
        400,
        expect.objectContaining({ code: 'order_mismatch' }),
      ]);
    }

    const orders = [
      [a, b, c, d],
      [d, c, b, a],
      [b, d, a, c],
      [c, a, d, b],
    ];
    const results = await Promise.all(orders.map((ids) => reorder(ids)));
    expect(results.map((result) => result.status)).toEqual([200, 200, 200, 200]);
    const final = (await list()).items.map((item) => item.id);
    expect(orders).toContainEqual(final);
    const sortOrders = await t.pool.query<{ sort_order: number }>(
      'SELECT sort_order FROM ad_banners ORDER BY sort_order',
    );
    expect(sortOrders.rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3]);

    // 동시 등록은 서로 다른 맨 뒤 순서를 받습니다.
    const created = await Promise.all([1, 2, 3].map((index) => create(valid({ alt: `동시 ${index}` }))));
    expect(created.map((result) => result.status)).toEqual([201, 201, 201]);
    const after = await t.pool.query<{ sort_order: number }>('SELECT sort_order FROM ad_banners ORDER BY sort_order');
    expect(after.rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
