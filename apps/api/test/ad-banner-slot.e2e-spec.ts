import { setTimeout as sleep } from 'node:timers/promises';
import { CreatorLandingState, LinkView, PublicLandingResponse, UploadFileResponse } from '@crelink/shared';
import { LandingPassService } from '../src/short-link/landing-pass.service';
import { api, createTestApp, login, SHORT_URL, TestApp, waitForRows, WEB_URL } from './test-app';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

interface Creator {
  cookie: string;
  userId: string;
  publicId: string;
  landingId: string;
}

/** 광고 블록·배너 슬롯 위치, 공개 응답 slot·clickUrl, 노출 기록, 편집 상태(0068, docs/specs/crelink-ad-banner.md). */
describe('광고 블록·배너 슬롯 위치와 공개 랜딩 (R20, R21 ③, R7 ⑥)', () => {
  let t: TestApp;
  let n = 0;
  let imageFileId: string;
  let stillFileId: string;

  const newCreator = async (): Promise<Creator> => {
    n += 1;
    const result = await login(t.baseUrl, `slot-${n}|slot${n}@example.com`);
    const cookie = result.cookie!;
    const state = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    const landingId = (
      await t.pool.query<{ id: string }>('SELECT id FROM landings WHERE public_id = $1', [state.landing.publicId])
    ).rows[0].id;
    return { cookie, userId: result.body.user!.id, publicId: state.landing.publicId, landingId };
  };
  const upload = async (cookie: string) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'image.png');
    const response = await fetch(`${t.baseUrl}/api/me/files`, { method: 'POST', headers: { cookie }, body: form });
    const uploaded: UploadFileResponse = await response.json();
    return uploaded.fileId;
  };
  const state = async (cookie: string) =>
    (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
  const addLink = async (cookie: string, title: string, hidden = false) =>
    (
      await api<LinkView>(t.baseUrl, 'POST', '/api/me/links', {
        cookie,
        body: { title, url: `https://${title}.example`, hidden },
      })
    ).body;
  const order = (cookie: string, body: Record<string, unknown>) =>
    api<LinkView[]>(t.baseUrl, 'PUT', '/api/me/links/order', { cookie, body });
  const publicLanding = async (publicId: string, pass?: string) =>
    (
      await api<PublicLandingResponse>(
        t.baseUrl,
        'GET',
        `/api/public/landings/${publicId}${pass === undefined ? '' : `?pass=${encodeURIComponent(pass)}`}`,
      )
    ).body;
  const slotOf = async (publicId: string, pass?: string) => (await publicLanding(publicId, pass)).blocks[0].slot;
  const slotPosition = async (creator: Creator) =>
    (
      await t.pool.query<{ slot_position: number | null }>(
        "SELECT slot_position FROM landing_blocks WHERE landing_id = $1 AND type = 'list'",
        [creator.landingId],
      )
    ).rows[0].slot_position;

  let bannerCount = 0;
  /** 크리링 배너 행(SQL). 운영 API는 0071이 만듭니다. 기본은 지금 게시 중. */
  const insertAdBanner = async (
    options: { sortOrder?: number; startsAt?: string; endsAt?: string | null; still?: boolean; url?: string } = {},
  ) => {
    bannerCount += 1;
    const publicId = `adbanner${String(bannerCount).padStart(2, '0')}`;
    const url = options.url ?? `https://ad${bannerCount}.example/landing?x=1`;
    const inserted = await t.pool.query<{ id: string }>(
      `INSERT INTO ad_banners (public_id, image_file_id, still_file_id, alt, url, host, starts_at, ends_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        publicId,
        imageFileId,
        options.still ? stillFileId : null,
        `광고 ${bannerCount}`,
        url,
        new URL(url).hostname,
        options.startsAt ?? '2026-01-01T00:00:00+09:00',
        options.endsAt ?? null,
        options.sortOrder ?? bannerCount,
      ],
    );
    return { id: inserted.rows[0].id, publicId, url, alt: `광고 ${bannerCount}` };
  };
  /** 크리에이터 배너 행(SQL). 쓰기 API는 0070이 만듭니다. */
  const insertCreatorBanner = async (
    creator: Creator,
    options: { position: number; url?: string | null; hidden?: boolean; blocked?: boolean; still?: boolean },
  ) => {
    bannerCount += 1;
    const publicId = `crbanner${String(bannerCount).padStart(2, '0')}`;
    const url = options.url === undefined ? `https://mine${bannerCount}.example/` : options.url;
    const inserted = await t.pool.query<{ id: string }>(
      `INSERT INTO creator_banners (public_id, user_id, landing_id, image_file_id, still_file_id, alt, url, host, position, hidden, blocked_at, blocked_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        publicId,
        creator.userId,
        creator.landingId,
        imageFileId,
        options.still ? stillFileId : null,
        `내 배너 ${bannerCount}`,
        url,
        url ? new URL(url).hostname : null,
        options.position,
        options.hidden ?? false,
        options.blocked ? new Date() : null,
        options.blocked ? '정책' : null,
      ],
    );
    return { id: inserted.rows[0].id, publicId, url, alt: `내 배너 ${bannerCount}` };
  };
  const grant = (creator: Creator) =>
    t.pool.query('UPDATE users SET banner_slot_granted_at = now() WHERE id = $1', [creator.userId]);
  const fileUrl = (fileId: string) => `${WEB_URL}/api/backend/api/files/${fileId}`;
  const impressions = async () =>
    (
      await t.pool.query<{ ad_banner_id: string; landing_public_id: string; impressions: number; clicks: number }>(
        'SELECT ad_banner_id, landing_public_id, impressions, clicks FROM ad_banner_daily_stats ORDER BY ad_banner_id',
      )
    ).rows;

  beforeAll(async () => {
    t = await createTestApp();
    const owner = await newCreator();
    imageFileId = await upload(owner.cookie);
    stillFileId = await upload(owner.cookie);
  });

  afterEach(async () => {
    // 크리링 배너는 모든 랜딩이 함께 쓰므로 시험마다 지웁니다(노출 카운터는 연쇄 삭제).
    await t.pool.query('DELETE FROM ad_banners');
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('위치(PUT /api/me/links/order slotIndex)', () => {
    it('맨 앞·사이·맨 뒤 3가지를 저장하고 편집 상태 slotIndex와 공개 afterLinkCount가 같다', async () => {
      const creator = await newCreator();
      await insertAdBanner();
      const [a, b, c] = [
        await addLink(creator.cookie, 'a'),
        await addLink(creator.cookie, 'b'),
        await addLink(creator.cookie, 'c'),
      ];
      // 처음에는 맨 뒤(NULL, 백필 없음).
      expect((await state(creator.cookie)).slot).toEqual({ kind: 'ad', slotIndex: null, grantedAt: null });
      expect((await slotOf(creator.publicId))?.afterLinkCount).toBe(3);

      for (const [slotIndex, saved, stateIndex, after] of [
        [0, 0, 0, 0],
        [2, 2, 2, 2],
        [3, null, null, 3],
        [99, null, null, 3],
      ] as const) {
        const response = await order(creator.cookie, { ids: [c.id, a.id, b.id], slotIndex });
        expect(response.status).toBe(200);
        expect(response.body.map((link) => [link.id, link.position])).toEqual([
          [c.id, 0],
          [a.id, 1],
          [b.id, 2],
        ]);
        expect(await slotPosition(creator)).toBe(saved);
        expect((await state(creator.cookie)).slot.slotIndex).toBe(stateIndex);
        expect((await slotOf(creator.publicId))?.afterLinkCount).toBe(after);
      }
    });

    it('slotIndex가 0 이상 정수가 아니면 400 validation_failed, id가 맞지 않으면 order_mismatch, 둘 다 위치를 바꾸지 않는다', async () => {
      const creator = await newCreator();
      const [a, b] = [await addLink(creator.cookie, 'a'), await addLink(creator.cookie, 'b')];
      await order(creator.cookie, { ids: [a.id, b.id], slotIndex: 1 });
      for (const slotIndex of [-1, 1.5, '1', null, true]) {
        const response = await order(creator.cookie, { ids: [b.id, a.id], slotIndex });
        expect([slotIndex, response.status, response.body]).toEqual([
          slotIndex,
          400,
          expect.objectContaining({ code: 'validation_failed' }),
        ]);
      }
      const mismatch = await api(t.baseUrl, 'PUT', '/api/me/links/order', {
        cookie: creator.cookie,
        body: { ids: [a.id], slotIndex: 0 },
      });
      expect([mismatch.status, mismatch.body.code]).toEqual([400, 'order_mismatch']);
      expect(await slotPosition(creator)).toBe(1);
      expect((await state(creator.cookie)).links.map((link) => link.id)).toEqual([a.id, b.id]);
    });

    it('slotIndex를 생략하면(옛 웹) 링크 삭제로 생긴 빈 번호와 관계없이 슬롯 앞 링크 수를 유지하고, NULL은 NULL로 둔다', async () => {
      const creator = await newCreator();
      await insertAdBanner();
      const [a, b, c, d] = [
        await addLink(creator.cookie, 'a'),
        await addLink(creator.cookie, 'b'),
        await addLink(creator.cookie, 'c'),
        await addLink(creator.cookie, 'd'),
      ];
      // 생략: 맨 뒤(NULL)는 그대로.
      expect((await order(creator.cookie, { ids: [b.id, a.id, c.id, d.id] })).status).toBe(200);
      expect(await slotPosition(creator)).toBeNull();

      // b, a 다음(k = 2). b를 지우면 position 0이 비어 앞 링크는 a 하나뿐입니다.
      await order(creator.cookie, { ids: [b.id, a.id, c.id, d.id], slotIndex: 2 });
      await api(t.baseUrl, 'DELETE', `/api/me/links/${b.id}`, { cookie: creator.cookie });
      expect((await state(creator.cookie)).slot.slotIndex).toBe(1);
      expect((await slotOf(creator.publicId))?.afterLinkCount).toBe(1);

      // 생략한 정렬은 다시 매기기 전의 앞 링크 수 1을 새 위치로 둡니다: 슬롯은 첫 링크(d) 다음.
      await order(creator.cookie, { ids: [d.id, c.id, a.id] });
      expect(await slotPosition(creator)).toBe(1);
      expect((await state(creator.cookie)).slot.slotIndex).toBe(1);
      const after = await publicLanding(creator.publicId);
      expect(after.blocks[0].links.map((link) => link.title)).toEqual(['d', 'c', 'a']);
      expect(after.blocks[0].slot?.afterLinkCount).toBe(1);

      // 슬롯이 사이에 있으면 새 링크는 max(position) + 1이라 슬롯 뒤에 붙습니다.
      await addLink(creator.cookie, 'e');
      expect((await state(creator.cookie)).slot.slotIndex).toBe(1);
    });
  });

  describe('공개 응답 slot과 숨김(resolveBannerSlot)', () => {
    it('광고 블록은 게시 중 크리링 배너만 순서대로, 앞 링크가 숨겨지면 보이는 링크 기준 자리에 둔다', async () => {
      const creator = await newCreator();
      const second = await insertAdBanner({ sortOrder: 1 });
      const first = await insertAdBanner({ sortOrder: 0, still: true });
      await insertAdBanner({ sortOrder: 2, startsAt: '2999-01-01T00:00:00+09:00' }); // 예약
      await insertAdBanner({
        sortOrder: 3,
        startsAt: '2026-01-01T00:00:00+09:00',
        endsAt: '2026-02-01T00:00:00+09:00',
      }); // 끝남
      const [a, b, c] = [
        await addLink(creator.cookie, 'a', true),
        await addLink(creator.cookie, 'b'),
        await addLink(creator.cookie, 'c'),
      ];
      await t.pool.query('UPDATE links SET blocked_at = now() WHERE id = $1', [b.id]);
      await order(creator.cookie, { ids: [a.id, b.id, c.id], slotIndex: 2 });

      const body = await publicLanding(creator.publicId);
      expect(body.blocks[0].links.map((link) => link.title)).toEqual(['c']);
      expect(body.blocks[0].slot).toEqual({
        kind: 'ad',
        // 앞 링크 a(숨김)·b(차단)가 보이지 않아 맨 앞입니다.
        afterLinkCount: 0,
        banners: [
          {
            id: first.publicId,
            imageUrl: fileUrl(imageFileId),
            stillImageUrl: fileUrl(stillFileId),
            alt: first.alt,
            clickUrl: first.url,
          },
          {
            id: second.publicId,
            imageUrl: fileUrl(imageFileId),
            stillImageUrl: null,
            alt: second.alt,
            clickUrl: second.url,
          },
        ],
      });
    });

    it('광고: 게시 0장이거나 보이는 링크·포트폴리오가 0개면 null, 포트폴리오만 있으면 보인다', async () => {
      const creator = await newCreator();
      const link = await addLink(creator.cookie, 'only');
      expect(await slotOf(creator.publicId)).toBeNull(); // no_banners

      await insertAdBanner();
      expect((await slotOf(creator.publicId))?.kind).toBe('ad');
      await api(t.baseUrl, 'PATCH', `/api/me/links/${link.id}`, { cookie: creator.cookie, body: { hidden: true } });
      expect(await slotOf(creator.publicId)).toBeNull(); // no_content

      await api(t.baseUrl, 'POST', '/api/me/portfolio', { cookie: creator.cookie, body: { title: '작업' } });
      expect(await slotOf(creator.publicId)).toMatchObject({ kind: 'ad', afterLinkCount: 0 });
    });

    it('배너 슬롯: 부여되면 광고 대신 보이는 크리에이터 배너만, 0장이면 null, 빈 랜딩에서도 보인다', async () => {
      const creator = await newCreator();
      await insertAdBanner();
      await grant(creator);
      await insertCreatorBanner(creator, { position: 0, hidden: true });
      await insertCreatorBanner(creator, { position: 1, blocked: true });
      expect(await slotOf(creator.publicId)).toBeNull(); // 보이는 배너 0장(no_banners), 광고도 나오지 않음

      const linked = await insertCreatorBanner(creator, { position: 3, still: true });
      const plain = await insertCreatorBanner(creator, { position: 2, url: null });
      // 링크·포트폴리오가 없어도 배너 슬롯은 보입니다(결정 7).
      expect(await slotOf(creator.publicId)).toEqual({
        kind: 'creator',
        afterLinkCount: 0,
        banners: [
          { id: plain.publicId, imageUrl: fileUrl(imageFileId), stillImageUrl: null, alt: plain.alt, clickUrl: null },
          {
            id: linked.publicId,
            imageUrl: fileUrl(imageFileId),
            stillImageUrl: fileUrl(stillFileId),
            alt: linked.alt,
            clickUrl: `${SHORT_URL}/b/${linked.publicId}`,
          },
        ],
      });

      // 회수하면 같은 자리에 광고 블록(배너 행은 보관).
      await t.pool.query('UPDATE users SET banner_slot_granted_at = NULL WHERE id = $1', [creator.userId]);
      expect(await slotOf(creator.publicId)).toBeNull(); // 광고는 빈 랜딩이면 no_content
      await addLink(creator.cookie, 'x');
      expect((await slotOf(creator.publicId))?.kind).toBe('ad');
    });
  });

  describe('노출 기록과 clickUrl(passAccepted)', () => {
    it('passAccepted일 때만 첫 장 노출 +1과 광고 기록 주소, 아니면 저장된 URL이고 세지 않는다', async () => {
      const creator = await newCreator();
      await addLink(creator.cookie, 'a');
      const first = await insertAdBanner({ sortOrder: 0 });
      const second = await insertAdBanner({ sortOrder: 1 });
      const pass = t.app.get(LandingPassService).issue(creator.publicId);

      // 통과 표시 없음(서비스 화면에서 연 랜딩)·관리 미리보기: 저장된 URL, 기록 없음.
      expect((await slotOf(creator.publicId))?.banners.map((banner) => banner.clickUrl)).toEqual([
        first.url,
        second.url,
      ]);
      expect((await slotOf(creator.publicId, 'not-a-pass'))?.banners[0].clickUrl).toBe(first.url);
      const preview = await state(creator.cookie);
      expect(preview.adBanners.map((banner) => [banner.id, banner.clickUrl])).toEqual([
        [first.publicId, first.url],
        [second.publicId, second.url],
      ]);
      await sleep(200);
      expect(await impressions()).toEqual([]);

      // 단축 주소를 거친 방문: /a/{배너}/{랜딩}, 첫 장만 1.
      const accepted = await slotOf(creator.publicId, pass);
      expect(accepted?.banners.map((banner) => banner.clickUrl)).toEqual([
        `${SHORT_URL}/a/${first.publicId}/${creator.publicId}`,
        `${SHORT_URL}/a/${second.publicId}/${creator.publicId}`,
      ]);
      expect(await waitForRows(impressions)).toEqual([
        { ad_banner_id: first.id, landing_public_id: creator.publicId, impressions: 1, clicks: 0 },
      ]);
      await slotOf(creator.publicId, pass);
      await waitForRows(async () => (await impressions()).filter((row) => row.impressions === 2));
      const day = await t.pool.query(
        "SELECT day = (now() AT TIME ZONE 'Asia/Seoul')::date AS seoul_today FROM ad_banner_daily_stats",
      );
      expect(day.rows).toEqual([{ seoul_today: true }]);
      expect(await impressions()).toEqual([
        { ad_banner_id: first.id, landing_public_id: creator.publicId, impressions: 2, clicks: 0 },
      ]);
    });

    it('숨김 슬롯·배너 슬롯은 passAccepted여도 광고 노출을 세지 않는다', async () => {
      await insertAdBanner();
      const empty = await newCreator(); // 보이는 링크·포트폴리오 0개(no_content)
      const passes = t.app.get(LandingPassService);
      expect(await slotOf(empty.publicId, passes.issue(empty.publicId))).toBeNull();

      const granted = await newCreator();
      await grant(granted);
      const banner = await insertCreatorBanner(granted, { position: 0 });
      const slot = await slotOf(granted.publicId, passes.issue(granted.publicId));
      expect(slot?.banners.map((item) => item.clickUrl)).toEqual([`${SHORT_URL}/b/${banner.publicId}`]);
      await sleep(200);
      expect(await impressions()).toEqual([]);
    });
  });

  it('편집 상태: 부여·게시 중 크리링 배너(저장된 URL)·이 랜딩 배너 전체·한도', async () => {
    const creator = await newCreator();
    const other = await newCreator();
    const initial = await state(creator.cookie);
    expect(initial).toMatchObject({
      slot: { kind: 'ad', slotIndex: null, grantedAt: null },
      adBanners: [],
      banners: [],
      bannerLimits: { visibleMax: 5, visibleUsed: 0, totalMax: 20, totalUsed: 0 },
    });

    const ad = await insertAdBanner({ still: true });
    await insertAdBanner({ startsAt: '2999-01-01T00:00:00+09:00' });
    // 회수 뒤 보관분도 banners에 들어 있습니다.
    const kept = await insertCreatorBanner(creator, { position: 1, hidden: true });
    const blocked = await insertCreatorBanner(creator, { position: 2, blocked: true, url: null });
    const shown = await insertCreatorBanner(creator, { position: 0, still: true });
    await insertCreatorBanner(other, { position: 0 });
    const notGranted = await state(creator.cookie);
    expect(notGranted.slot.kind).toBe('ad');
    expect(notGranted.adBanners).toEqual([
      {
        id: ad.publicId,
        imageUrl: fileUrl(imageFileId),
        stillImageUrl: fileUrl(stillFileId),
        alt: ad.alt,
        clickUrl: ad.url,
      },
    ]);
    expect(notGranted.banners).toEqual([
      {
        id: shown.id,
        image: { fileId: imageFileId, url: fileUrl(imageFileId) },
        stillImage: { fileId: stillFileId, url: fileUrl(stillFileId) },
        alt: shown.alt,
        url: shown.url,
        hidden: false,
        blocked: false,
        blockedReason: null,
        position: 0,
      },
      expect.objectContaining({ id: kept.id, hidden: true, blocked: false, stillImage: null, position: 1 }),
      expect.objectContaining({
        id: blocked.id,
        url: null,
        hidden: false,
        blocked: true,
        blockedReason: '정책',
        position: 2,
      }),
    ]);
    expect(notGranted.bannerLimits).toEqual({ visibleMax: 5, visibleUsed: 1, totalMax: 20, totalUsed: 3 });

    await grant(creator);
    const grantedAt = (
      await t.pool.query<{ banner_slot_granted_at: Date }>('SELECT banner_slot_granted_at FROM users WHERE id = $1', [
        creator.userId,
      ])
    ).rows[0].banner_slot_granted_at;
    expect((await state(creator.cookie)).slot).toEqual({
      kind: 'creator',
      slotIndex: null,
      grantedAt: grantedAt.toISOString(),
    });
  });
});
