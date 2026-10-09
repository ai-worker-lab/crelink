import {
  ApiError,
  BlockedDomainView,
  CreatorBannerView,
  CreatorLandingState,
  LinkView,
  OperatorCreatorDetail,
  PublicLandingResponse,
  UploadFileResponse,
} from '@crelink/shared';
import { PNG_STILL } from './image-samples';
import { api, createTestApp, login, TestApp } from './test-app';

interface Creator {
  cookie: string;
  userId: string;
  publicId: string;
  landingId: string;
}

/** 운영자 배너 슬롯 부여·회수, 크리에이터 배너 차단, 상세 추가 필드, 차단 도메인 추가 시 배너 처리(0072, docs/specs/crelink-ad-banner.md). */
describe('운영자 배너 슬롯·배너 차단 (R21 ①④⑤, R14)', () => {
  let t: TestApp;
  let operator: string;
  let imageFileId: string;
  let n = 0;
  let bannerCount = 0;

  const newCreator = async (): Promise<Creator> => {
    n += 1;
    const result = await login(t.baseUrl, `grant-${n}|grant${n}@example.com`);
    const cookie = result.cookie!;
    const state = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    const landingId = (
      await t.pool.query<{ id: string }>('SELECT id FROM landings WHERE public_id = $1', [state.landing.publicId])
    ).rows[0].id;
    return { cookie, userId: result.body.user!.id, publicId: state.landing.publicId, landingId };
  };
  const detail = async (creator: Creator) =>
    (await api<OperatorCreatorDetail>(t.baseUrl, 'GET', `/api/admin/creators/${creator.userId}`, { cookie: operator }))
      .body;
  const setSlot = <T = OperatorCreatorDetail>(userId: string, body: unknown) =>
    api<T>(t.baseUrl, 'PUT', `/api/admin/creators/${userId}/banner-slot`, { cookie: operator, body });
  const setBlock = <T = CreatorBannerView>(bannerId: string, body: unknown) =>
    api<T>(t.baseUrl, 'PUT', `/api/admin/banners/${bannerId}/block`, { cookie: operator, body });
  const publicSlot = async (creator: Creator) =>
    (await api<PublicLandingResponse>(t.baseUrl, 'GET', `/api/public/landings/${creator.publicId}`)).body.blocks[0]
      .slot;
  /** 크리에이터 배너 행(SQL). 쓰기 API는 0070이 만듭니다. */
  const insertCreatorBanner = async (
    creator: Creator,
    options: { position: number; url?: string | null; hidden?: boolean; blockedReason?: string },
  ) => {
    bannerCount += 1;
    const url = options.url === undefined ? `https://mine${bannerCount}.example/` : options.url;
    const inserted = await t.pool.query<{ id: string; public_id: string }>(
      `INSERT INTO creator_banners (public_id, user_id, landing_id, image_file_id, alt, url, host, position, hidden, blocked_at, blocked_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, public_id`,
      [
        `grbanner${String(bannerCount).padStart(2, '0')}`,
        creator.userId,
        creator.landingId,
        imageFileId,
        `배너 ${bannerCount}`,
        url,
        url ? new URL(url).hostname : null,
        options.position,
        options.hidden ?? false,
        options.blockedReason ? new Date() : null,
        options.blockedReason ?? null,
      ],
    );
    return { id: inserted.rows[0].id, publicId: inserted.rows[0].public_id };
  };
  /** 크리링 배너 행(SQL). 운영 API는 0071이 만듭니다. */
  const insertAdBanner = async (url: string, startsAt: string, endsAt: string | null) => {
    bannerCount += 1;
    const inserted = await t.pool.query<{ id: string }>(
      `INSERT INTO ad_banners (public_id, image_file_id, alt, url, host, starts_at, ends_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        `gradban${String(bannerCount).padStart(3, '0')}`,
        imageFileId,
        `광고 ${bannerCount}`,
        url,
        new URL(url).hostname,
        startsAt,
        endsAt,
        bannerCount,
      ],
    );
    return inserted.rows[0].id;
  };
  const adBannerRow = async (id: string) =>
    (
      await t.pool.query<{ starts_at: Date; ends_at: Date | null; status: string }>(
        `SELECT starts_at, ends_at,
                CASE WHEN starts_at > now() THEN 'scheduled'
                     WHEN ends_at IS NOT NULL AND ends_at <= now() THEN 'ended' ELSE 'live' END AS status
         FROM ad_banners WHERE id = $1`,
        [id],
      )
    ).rows[0];

  beforeAll(async () => {
    t = await createTestApp();
    operator = (await login(t.baseUrl, 'operator-sub|operator@example.com')).cookie!;
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG_STILL)], { type: 'image/png' }), 'banner.png');
    const response = await fetch(`${t.baseUrl}/api/me/files`, {
      method: 'POST',
      headers: { cookie: operator },
      body: form,
    });
    imageFileId = ((await response.json()) as UploadFileResponse).fileId;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('로그인하지 않으면 401, 크리에이터는 403 forbidden', async () => {
    const creator = await newCreator();
    const banner = await insertCreatorBanner(creator, { position: 0 });
    for (const path of [`/api/admin/creators/${creator.userId}/banner-slot`, `/api/admin/banners/${banner.id}/block`]) {
      const anonymous = await api(t.baseUrl, 'PUT', path, { body: { granted: true, blocked: true } });
      expect([path, anonymous.status, anonymous.body.code]).toEqual([path, 401, 'unauthenticated']);
      const asCreator = await api(t.baseUrl, 'PUT', path, {
        cookie: creator.cookie,
        body: { granted: true, blocked: true },
      });
      expect([path, asCreator.status, asCreator.body.code]).toEqual([path, 403, 'forbidden']);
    }
    const row = await t.pool.query(
      'SELECT u.banner_slot_granted_at, b.blocked_at FROM users u JOIN creator_banners b ON b.user_id = u.id WHERE u.id = $1',
      [creator.userId],
    );
    expect(row.rows[0]).toEqual({ banner_slot_granted_at: null, blocked_at: null });
  });

  it('상세는 부여 시각·이 랜딩 배너 전체(숨김·차단 포함, 순서대로)·한도를 실제 데이터로 준다', async () => {
    const creator = await newCreator();
    expect(await detail(creator)).toMatchObject({
      bannerSlot: { grantedAt: null },
      banners: [],
      bannerLimits: { visibleMax: 5, visibleUsed: 0, totalMax: 20, totalUsed: 0 },
    });
    const blocked = await insertCreatorBanner(creator, { position: 2, blockedReason: '정책' });
    const visible = await insertCreatorBanner(creator, { position: 0 });
    const hidden = await insertCreatorBanner(creator, { position: 1, url: null, hidden: true });
    // 다른 크리에이터의 배너는 섞이지 않습니다.
    await insertCreatorBanner(await newCreator(), { position: 0 });
    const body = await detail(creator);
    expect(body.banners.map((banner) => banner.id)).toEqual([visible.id, hidden.id, blocked.id]);
    expect(body.banners[0]).toEqual({
      id: visible.id,
      image: { fileId: imageFileId, url: expect.stringContaining(`/api/files/${imageFileId}`) },
      stillImage: null,
      alt: expect.any(String),
      url: expect.stringMatching(/^https:\/\/mine\d+\.example\/$/),
      hidden: false,
      blocked: false,
      blockedReason: null,
      position: 0,
    });
    expect(body.banners[1]).toMatchObject({ url: null, hidden: true, blocked: false });
    expect(body.banners[2]).toMatchObject({ hidden: false, blocked: true, blockedReason: '정책' });
    expect(body.bannerLimits).toEqual({ visibleMax: 5, visibleUsed: 1, totalMax: 20, totalUsed: 3 });
  });

  it('부여·회수: 부여 시각 유지, 공개 랜딩 종류 전환, 회수해도 배너 보관, 400·404', async () => {
    const creator = await newCreator();
    await api<LinkView>(t.baseUrl, 'POST', '/api/me/links', {
      cookie: creator.cookie,
      body: { title: '링크', url: 'https://link.example' },
    });
    const banner = await insertCreatorBanner(creator, { position: 0 });
    const adId = await insertAdBanner('https://ads.example/', '2026-01-01T00:00:00+09:00', null);

    expect((await publicSlot(creator))?.kind).toBe('ad');
    const granted = await setSlot(creator.userId, { granted: true });
    expect(granted.status).toBe(200);
    expect(granted.body).toMatchObject({ userId: creator.userId, banners: [{ id: banner.id }] });
    const grantedAt = granted.body.bannerSlot.grantedAt!;
    expect(Date.parse(grantedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(await publicSlot(creator)).toMatchObject({ kind: 'creator', banners: [{ id: banner.publicId }] });
    const state = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: creator.cookie }))
      .body;
    expect(state.slot).toMatchObject({ kind: 'creator', grantedAt });

    // 다시 부여해도 처음 부여 시각을 유지합니다(멱등).
    const again = await setSlot(creator.userId, { granted: true });
    expect(again.body.bannerSlot.grantedAt).toBe(grantedAt);

    const revoked = await setSlot(creator.userId, { granted: false });
    expect(revoked.body.bannerSlot).toEqual({ grantedAt: null });
    expect(revoked.body.banners.map((row) => row.id)).toEqual([banner.id]);
    expect(revoked.body.bannerLimits).toMatchObject({ visibleUsed: 1, totalUsed: 1 });
    expect(await publicSlot(creator)).toMatchObject({ kind: 'ad', banners: [{ alt: expect.any(String) }] });
    expect((await t.pool.query('SELECT 1 FROM creator_banners WHERE id = $1', [banner.id])).rowCount).toBe(1);
    expect((await setSlot(creator.userId, { granted: false })).body.bannerSlot.grantedAt).toBeNull();

    // 다시 부여하면 보관한 배너가 그대로 나옵니다(새 부여 시각).
    const regranted = await setSlot(creator.userId, { granted: true });
    expect(regranted.body.bannerSlot.grantedAt).not.toBeNull();
    expect(await publicSlot(creator)).toMatchObject({ kind: 'creator', banners: [{ id: banner.publicId }] });
    await t.pool.query('DELETE FROM ad_banners WHERE id = $1', [adId]);

    for (const body of [{}, { granted: 'true' }, { granted: 1 }, { granted: null }, []]) {
      const bad = await setSlot<ApiError>(creator.userId, body);
      expect([JSON.stringify(body), bad.status, bad.body.code]).toEqual([
        JSON.stringify(body),
        400,
        'validation_failed',
      ]);
    }
    for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
      const missing = await setSlot<ApiError>(id, { granted: true });
      expect([missing.status, missing.body.code]).toEqual([404, 'creator_not_found']);
    }
  });

  it('배너 차단·풀기: 공개 랜딩에서 빠지고 한도에서 빠지며 차단 시각은 다시 막아도 유지, 400·404', async () => {
    const creator = await newCreator();
    await setSlot(creator.userId, { granted: true });
    const first = await insertCreatorBanner(creator, { position: 0 });
    const second = await insertCreatorBanner(creator, { position: 1, hidden: true });

    const blocked = await setBlock(first.id, { blocked: true, reason: '신고 접수' });
    expect(blocked.status).toBe(200);
    expect(blocked.body).toMatchObject({ id: first.id, blocked: true, blockedReason: '신고 접수', hidden: false });
    // 보이는 배너가 없으니 배너 슬롯이 숨습니다.
    expect(await publicSlot(creator)).toBeNull();
    const body = await detail(creator);
    expect(body.banners.map((row) => [row.id, row.blocked])).toEqual([
      [first.id, true],
      [second.id, false],
    ]);
    expect(body.bannerLimits).toMatchObject({ visibleUsed: 0, totalUsed: 2 });
    const state = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie: creator.cookie }))
      .body;
    expect(state.banners[0]).toMatchObject({ blocked: true, blockedReason: '신고 접수' });

    const blockedAt = (await t.pool.query('SELECT blocked_at FROM creator_banners WHERE id = $1', [first.id])).rows[0]
      .blocked_at;
    const reblocked = await setBlock(first.id, { blocked: true, reason: '  ' });
    expect(reblocked.body).toMatchObject({ blocked: true, blockedReason: null });
    expect(
      (await t.pool.query('SELECT blocked_at FROM creator_banners WHERE id = $1', [first.id])).rows[0].blocked_at,
    ).toEqual(blockedAt);

    const unblocked = await setBlock(first.id, { blocked: false, reason: '무시됨' });
    expect(unblocked.body).toMatchObject({ blocked: false, blockedReason: null });
    expect(await publicSlot(creator)).toMatchObject({ kind: 'creator', banners: [{ id: first.publicId }] });

    const invalid = [{}, { blocked: 'yes' }, { blocked: true, reason: 'x'.repeat(201) }, { blocked: true, reason: 3 }];
    for (const [index, input] of invalid.entries()) {
      const bad = await setBlock<ApiError>(first.id, input);
      expect([index, bad.status, bad.body.code]).toEqual([index, 400, 'validation_failed']);
    }
    for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
      const missing = await setBlock<ApiError>(id, { blocked: true });
      expect([missing.status, missing.body.code]).toEqual([404, 'banner_not_found']);
    }
  });

  it('차단 도메인 추가: 걸리는 크리에이터 배너는 차단, 게시 중·예약 크리링 배너는 내림, 나머지는 그대로', async () => {
    const creator = await newCreator();
    await setSlot(creator.userId, { granted: true });
    const exact = await insertCreatorBanner(creator, { position: 0, url: 'https://bannerspam.example/a' });
    const sub = await insertCreatorBanner(creator, { position: 1, url: 'https://www.bannerspam.example/b' });
    const lookalike = await insertCreatorBanner(creator, { position: 2, url: 'https://notbannerspam.example/' });
    const noUrl = await insertCreatorBanner(creator, { position: 3, url: null });
    const already = await insertCreatorBanner(creator, {
      position: 4,
      url: 'https://bannerspam.example/c',
      blockedReason: '먼저 막음',
    });
    const live = await insertAdBanner('https://bannerspam.example/ad', '2026-01-01T00:00:00+09:00', null);
    const liveWithEnd = await insertAdBanner(
      'https://cdn.bannerspam.example/ad',
      '2026-01-01T00:00:00+09:00',
      '2099-01-01T00:00:00+09:00',
    );
    const scheduled = await insertAdBanner('https://bannerspam.example/soon', '2099-01-01T00:00:00+09:00', null);
    const ended = await insertAdBanner(
      'https://bannerspam.example/old',
      '2026-01-01T00:00:00+09:00',
      '2026-02-01T00:00:00+09:00',
    );
    const otherAd = await insertAdBanner('https://notbannerspam.example/ad', '2026-01-01T00:00:00+09:00', null);
    const endedBefore = await adBannerRow(ended);
    const liveStartsBefore = (await adBannerRow(live)).starts_at;

    const before = Date.now();
    const added = await api<BlockedDomainView[]>(t.baseUrl, 'POST', '/api/admin/blocked-domains', {
      cookie: operator,
      body: { domain: 'BannerSpam.example', reason: '스팸 배너' },
    });
    expect(added.status).toBe(201);

    const banners = new Map((await detail(creator)).banners.map((row) => [row.id, row]));
    expect(banners.get(exact.id)).toMatchObject({ blocked: true, blockedReason: '스팸 배너' });
    expect(banners.get(sub.id)).toMatchObject({ blocked: true, blockedReason: '스팸 배너' });
    expect(banners.get(lookalike.id)).toMatchObject({ blocked: false });
    expect(banners.get(noUrl.id)).toMatchObject({ blocked: false });
    expect(banners.get(already.id)).toMatchObject({ blocked: true, blockedReason: '먼저 막음' });
    expect((await publicSlot(creator))?.banners.map((row) => row.id)).toEqual([lookalike.publicId, noUrl.publicId]);

    for (const id of [live, liveWithEnd]) {
      const row = await adBannerRow(id);
      expect(row.status).toBe('ended');
      expect(row.ends_at!.getTime()).toBeGreaterThanOrEqual(before - 5_000);
      expect(row.starts_at).toEqual(liveStartsBefore);
    }
    // 예약 배너는 시작·끝이 모두 지금이 됩니다(ends_at >= starts_at CHECK).
    const scheduledRow = await adBannerRow(scheduled);
    expect(scheduledRow.status).toBe('ended');
    expect(scheduledRow.starts_at).toEqual(scheduledRow.ends_at);
    expect(scheduledRow.ends_at!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await adBannerRow(ended)).toEqual(endedBefore);
    expect((await adBannerRow(otherAd)).status).toBe('live');

    // 사유 없이 막으면 기본 사유이고, 목록에서 빼도 차단·내림은 그대로입니다.
    const plain = await insertCreatorBanner(creator, { position: 5, url: 'https://plainspam.example/' });
    await api(t.baseUrl, 'POST', '/api/admin/blocked-domains', {
      cookie: operator,
      body: { domain: 'plainspam.example' },
    });
    expect((await detail(creator)).banners.find((row) => row.id === plain.id)).toMatchObject({
      blocked: true,
      blockedReason: '차단 도메인: plainspam.example',
    });
    expect(
      (await api(t.baseUrl, 'DELETE', '/api/admin/blocked-domains/bannerspam.example', { cookie: operator })).status,
    ).toBe(204);
    expect((await detail(creator)).banners.find((row) => row.id === exact.id)?.blocked).toBe(true);
    expect((await adBannerRow(live)).status).toBe('ended');

    // 중복 도메인(409)이면 트랜잭션 전체가 되돌아가 배너도 바뀌지 않습니다.
    const fresh = await insertCreatorBanner(creator, { position: 6, url: 'https://plainspam.example/new' });
    const duplicate = await api(t.baseUrl, 'POST', '/api/admin/blocked-domains', {
      cookie: operator,
      body: { domain: 'plainspam.example' },
    });
    expect([duplicate.status, duplicate.body.code]).toEqual([409, 'domain_exists']);
    expect((await detail(creator)).banners.find((row) => row.id === fresh.id)?.blocked).toBe(false);
  });
});
