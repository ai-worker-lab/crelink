import {
  ApiError,
  CRELINK_LIMITS,
  CreatorLandingState,
  LinkView,
  PortfolioItemView,
  SlugAvailabilityResponse,
  SocialLinkView,
  UploadFileResponse,
} from '@crelink/shared';
import { api, createTestApp, login, SHORT_URL, TestApp, WEB_URL } from './test-app';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

describe('크리에이터 편집 API', () => {
  let t: TestApp;
  let n = 0;

  /** 새 크리에이터로 로그인한 세션 쿠키와 사용자 id. */
  const newCreator = async () => {
    n += 1;
    const result = await login(t.baseUrl, `creator-${n}|creator${n}@example.com`);
    return { cookie: result.cookie!, userId: result.body.user!.id };
  };
  const state = async (cookie: string) =>
    (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
  /** 성공이면 LinkView, 실패면 ApiError 본문. */
  const addLink = (cookie: string, body: Record<string, unknown>) =>
    api<LinkView & Partial<ApiError>>(t.baseUrl, 'POST', '/api/me/links', { cookie, body });
  const upload = async (cookie: string, data: Buffer, type = 'image/png') => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type }), 'image.png');
    const response = await fetch(`${t.baseUrl}/api/me/files`, { method: 'POST', headers: { cookie }, body: form });
    return { status: response.status, body: (await response.json()) as UploadFileResponse & Partial<ApiError> };
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('/api/me/*는 로그인하지 않으면 401 unauthenticated', async () => {
    for (const [method, path] of [
      ['GET', '/api/me/landing'],
      ['PATCH', '/api/me/landing'],
      ['POST', '/api/me/links'],
      ['PUT', '/api/me/socials'],
      ['POST', '/api/me/portfolio'],
      ['POST', '/api/me/files'],
      ['GET', '/api/me/short-link/availability?slug=abc'],
    ]) {
      const response = await api(t.baseUrl, method, path, { body: method === 'GET' ? undefined : {} });
      expect([path, response.status, response.body.code]).toEqual([path, 401, 'unauthenticated']);
    }
  });

  it('편집 상태는 랜딩·단축 URL·빈 목록·한도를 준다', async () => {
    const { cookie } = await newCreator();
    const body = await state(cookie);
    expect(body.landing.url).toBe(`${WEB_URL}/p/${body.landing.publicId}`);
    expect(body.shortLink.url).toBe(`${SHORT_URL}/${body.shortLink.slug}`);
    expect(body).toMatchObject({
      links: [],
      socials: [],
      portfolio: [],
      limits: { visibleMax: 5, visibleUsed: 0, totalMax: 50, totalUsed: 0 },
    });
  });

  it('프로필 수정: 길이 검증, 빈 문자열은 비움, 남의 파일은 404 file_not_found', async () => {
    const { cookie } = await newCreator();
    const other = await newCreator();
    const updated = await api<CreatorLandingState>(t.baseUrl, 'PATCH', '/api/me/landing', {
      cookie,
      body: { displayName: '  크리에이터  ', bio: '소개' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.landing).toMatchObject({ displayName: '크리에이터', bio: '소개', avatar: null });
    const cleared = await api<CreatorLandingState>(t.baseUrl, 'PATCH', '/api/me/landing', {
      cookie,
      body: { bio: '' },
    });
    expect(cleared.body.landing).toMatchObject({ displayName: '크리에이터', bio: null });
    const tooLong = await api(t.baseUrl, 'PATCH', '/api/me/landing', { cookie, body: { displayName: 'a'.repeat(41) } });
    expect([tooLong.status, tooLong.body.code]).toEqual([400, 'validation_failed']);
    const otherFile = await upload(other.cookie, PNG);
    const foreign = await api(t.baseUrl, 'PATCH', '/api/me/landing', {
      cookie,
      body: { avatarFileId: otherFile.body.fileId },
    });
    expect([foreign.status, foreign.body.code]).toEqual([404, 'file_not_found']);
    const mine = await upload(cookie, PNG);
    const avatar = await api<CreatorLandingState>(t.baseUrl, 'PATCH', '/api/me/landing', {
      cookie,
      body: { avatarFileId: mine.body.fileId },
    });
    expect(avatar.body.landing.avatar).toEqual({
      fileId: mine.body.fileId,
      url: `${WEB_URL}/api/backend/api/files/${mine.body.fileId}`,
    });
  });

  describe('단축 주소 규칙 (R8)', () => {
    const availability = (cookie: string, slug: string) =>
      api<SlugAvailabilityResponse>(
        t.baseUrl,
        'GET',
        `/api/me/short-link/availability?slug=${encodeURIComponent(slug)}`,
        {
          cookie,
        },
      );
    const change = (cookie: string, slug: string) =>
      api<CreatorLandingState>(t.baseUrl, 'PUT', '/api/me/short-link/slug', { cookie, body: { slug } });

    it('형식·길이·예약어를 검사한다', async () => {
      const { cookie } = await newCreator();
      for (const slug of ['ab', 'a'.repeat(31), '-abc', 'abc-', 'ab_c', '한글주소']) {
        expect((await availability(cookie, slug)).body).toMatchObject({ available: false, reason: 'slug_invalid' });
        const response = await change(cookie, slug);
        expect([slug, response.status, response.body]).toEqual([
          slug,
          400,
          expect.objectContaining({ code: 'slug_invalid' }),
        ]);
      }
      for (const slug of ['admin', 'api', 'crelink']) {
        expect((await availability(cookie, slug)).body).toMatchObject({ available: false, reason: 'slug_reserved' });
        const response = await change(cookie, slug);
        expect([response.status, response.body]).toEqual([400, expect.objectContaining({ code: 'slug_reserved' })]);
      }
      expect((await availability(cookie, 'My-Name')).body).toEqual({ slug: 'my-name', available: true, reason: null });
      const current = (await state(cookie)).shortLink.slug;
      expect((await availability(cookie, current)).body).toMatchObject({ available: false, reason: 'same_as_current' });
    });

    it('자동 주소에서 첫 변경은 즉시, 그 뒤 30일 안에는 429 slug_change_too_soon', async () => {
      const { cookie, userId } = await newCreator();
      const auto = (await state(cookie)).shortLink.slug;
      const first = await change(cookie, 'first-name');
      expect(first.status).toBe(200);
      expect(first.body.shortLink).toMatchObject({
        slug: 'first-name',
        isAutoSlug: false,
        url: `${SHORT_URL}/first-name`,
      });
      const next = Date.parse(first.body.shortLink.nextChangeAvailableAt!);
      expect(next - Date.now()).toBeGreaterThan(29.9 * 86_400_000);
      const second = await change(cookie, 'second-name');
      expect([second.status, second.body]).toEqual([429, expect.objectContaining({ code: 'slug_change_too_soon' })]);
      // 같은 주소로 바꾸는 요청은 아무것도 바꾸지 않습니다.
      expect((await change(cookie, 'first-name')).status).toBe(200);

      // 30일이 지나면 다시 바꿀 수 있고, 자기 옛 주소(자동 주소 포함)로 되돌릴 수 있다.
      await t.pool.query("UPDATE short_links SET slug_changed_at = now() - interval '31 days' WHERE user_id = $1", [
        userId,
      ]);
      const back = await change(cookie, auto);
      expect(back.status).toBe(200);
      expect(back.body.shortLink).toMatchObject({ slug: auto, isAutoSlug: true });
      const slugs = await t.pool.query(
        `SELECT s.slug, s.retired_at IS NOT NULL AS retired FROM short_slugs s
         JOIN short_links sl ON sl.id = s.short_link_id WHERE sl.user_id = $1 ORDER BY s.slug`,
        [userId],
      );
      expect(slugs.rows).toEqual(
        [
          { slug: auto, retired: false },
          { slug: 'first-name', retired: true },
        ].sort((a, b) => a.slug.localeCompare(b.slug)),
      );
    });

    it('남이 쓰는 주소와 90일 안의 옛 주소는 409 slug_taken, 90일이 지나면 쓸 수 있다', async () => {
      const owner = await newCreator();
      const other = await newCreator();
      expect((await change(owner.cookie, 'taken-name')).status).toBe(200);
      expect((await availability(other.cookie, 'taken-name')).body).toMatchObject({
        available: false,
        reason: 'slug_taken',
      });
      const taken = await change(other.cookie, 'taken-name');
      expect([taken.status, taken.body]).toEqual([409, expect.objectContaining({ code: 'slug_taken' })]);

      await t.pool.query("UPDATE short_links SET slug_changed_at = now() - interval '31 days' WHERE user_id = $1", [
        owner.userId,
      ]);
      expect((await change(owner.cookie, 'owner-new')).status).toBe(200);
      // 옛 주소는 예약 중이라 다른 사람이 못 쓴다.
      expect((await change(other.cookie, 'taken-name')).status).toBe(409);
      await t.pool.query("UPDATE short_slugs SET retired_at = now() - interval '91 days' WHERE slug = 'taken-name'");
      expect((await availability(other.cookie, 'taken-name')).body.available).toBe(true);
      const claimed = await change(other.cookie, 'taken-name');
      expect(claimed.status).toBe(200);
      expect(claimed.body.shortLink.slug).toBe('taken-name');
    });
  });

  describe('외부 링크 (R4, R5, R13, R14)', () => {
    it('추가하면 호스트·사이트 아이콘·순서를 채우고, http·https가 아니면 400 link_url_invalid', async () => {
      const { cookie } = await newCreator();
      const created = await addLink(cookie, {
        title: ' 유튜브 ',
        url: 'https://www.YouTube.com/@me',
        description: '채널',
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        title: '유튜브',
        url: 'https://www.youtube.com/@me',
        description: '채널',
        thumbnail: null,
        faviconUrl: 'https://www.youtube.com/favicon.ico',
        hidden: false,
        blocked: false,
        blockedReason: null,
        position: 0,
      });
      for (const url of [
        'javascript:alert(1)',
        'ftp://example.com',
        'example.com',
        `https://a.com/${'x'.repeat(2048)}`,
      ]) {
        const response = await addLink(cookie, { title: 't', url });
        expect([url.slice(0, 20), response.status, response.body.code]).toEqual([
          url.slice(0, 20),
          400,
          'link_url_invalid',
        ]);
      }
      const noTitle = await addLink(cookie, { title: ' ', url: 'https://a.com' });
      expect([noTitle.status, noTitle.body.code]).toEqual([400, 'validation_failed']);
      const longTitle = await addLink(cookie, { title: 'a'.repeat(61), url: 'https://a.com' });
      expect(longTitle.status).toBe(400);
    });

    it('보이는 링크는 5 + 추가 슬롯까지, 숨긴 링크는 세지 않고, 숨김을 풀 때도 한도를 확인한다', async () => {
      const { cookie, userId } = await newCreator();
      for (let index = 0; index < 5; index += 1) {
        expect((await addLink(cookie, { title: `링크 ${index}`, url: `https://site${index}.com` })).status).toBe(201);
      }
      const sixth = await addLink(cookie, { title: '여섯째', url: 'https://six.com' });
      expect([sixth.status, sixth.body.code]).toEqual([409, 'link_limit_reached']);
      const hidden = await addLink(cookie, { title: '숨김', url: 'https://six.com', hidden: true });
      expect(hidden.status).toBe(201);
      const unhide = await api(t.baseUrl, 'PATCH', `/api/me/links/${hidden.body.id}`, {
        cookie,
        body: { hidden: false },
      });
      expect([unhide.status, unhide.body.code]).toEqual([409, 'link_limit_reached']);
      expect((await state(cookie)).limits).toEqual({ visibleMax: 5, visibleUsed: 5, totalMax: 50, totalUsed: 6 });

      await t.pool.query('UPDATE users SET extra_link_slots = 1 WHERE id = $1', [userId]);
      const shown = await api<LinkView>(t.baseUrl, 'PATCH', `/api/me/links/${hidden.body.id}`, {
        cookie,
        body: { hidden: false, title: '이제 보임' },
      });
      expect(shown.status).toBe(200);
      expect(shown.body).toMatchObject({ hidden: false, title: '이제 보임' });
      expect((await state(cookie)).limits).toMatchObject({ visibleMax: 6, visibleUsed: 6 });
    });

    it('숨긴 링크 포함 전체 50개를 넘으면 409 link_total_limit_reached', async () => {
      const { cookie, userId } = await newCreator();
      await t.pool.query(
        `INSERT INTO links (public_id, user_id, block_id, title, url, host, position, hidden)
         SELECT 'bulk' || lpad(g::text, 6, '0'), $1, b.id, 't', 'https://a.com/', 'a.com', g, true
         FROM generate_series(1, 50) g, landings l JOIN landing_blocks b ON b.landing_id = l.id WHERE l.user_id = $1`,
        [userId],
      );
      const response = await addLink(cookie, { title: '하나 더', url: 'https://b.com', hidden: true });
      expect([response.status, response.body.code]).toEqual([409, 'link_total_limit_reached']);
    });

    it('차단 도메인과 그 하위 도메인은 추가·수정 모두 422 link_domain_blocked', async () => {
      const { cookie } = await newCreator();
      await t.pool.query("INSERT INTO blocked_domains (domain) VALUES ('blocked.example')");
      for (const url of ['https://blocked.example/x', 'http://sub.Blocked.example', 'https://a.b.blocked.example']) {
        const response = await addLink(cookie, { title: 't', url });
        expect([url, response.status, response.body.code]).toEqual([url, 422, 'link_domain_blocked']);
      }
      expect((await addLink(cookie, { title: 't', url: 'https://notblocked.example' })).status).toBe(201);
      const ok = await addLink(cookie, { title: 't', url: 'https://fine.example' });
      const patched = await api(t.baseUrl, 'PATCH', `/api/me/links/${ok.body.id}`, {
        cookie,
        body: { url: 'https://www.blocked.example' },
      });
      expect([patched.status, patched.body.code]).toEqual([422, 'link_domain_blocked']);
    });

    it('순서 변경은 내 링크 id 전체가 맞아야 하고, 남의 링크는 404 link_not_found', async () => {
      const { cookie } = await newCreator();
      const other = await newCreator();
      const a = (await addLink(cookie, { title: 'a', url: 'https://a.com' })).body;
      const b = (await addLink(cookie, { title: 'b', url: 'https://b.com' })).body;
      const c = (await addLink(cookie, { title: 'c', url: 'https://c.com' })).body;
      const reordered = await api<LinkView[]>(t.baseUrl, 'PUT', '/api/me/links/order', {
        cookie,
        body: { ids: [c.id, a.id, b.id] },
      });
      expect(reordered.status).toBe(200);
      expect(reordered.body.map((link) => [link.title, link.position])).toEqual([
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ]);
      for (const ids of [[a.id, b.id], [a.id, b.id, b.id], [a.id, b.id, c.id, 'x'], 'nope']) {
        const response = await api(t.baseUrl, 'PUT', '/api/me/links/order', { cookie, body: { ids } });
        expect([response.status, response.body.code]).toEqual([400, 'order_mismatch']);
      }

      const otherLink = (await addLink(other.cookie, { title: 'o', url: 'https://o.com' })).body;
      const patch = await api(t.baseUrl, 'PATCH', `/api/me/links/${otherLink.id}`, { cookie, body: { title: 'x' } });
      expect([patch.status, patch.body.code]).toEqual([404, 'link_not_found']);
      const remove = await api(t.baseUrl, 'DELETE', `/api/me/links/${otherLink.id}`, { cookie });
      expect([remove.status, remove.body.code]).toEqual([404, 'link_not_found']);
      expect((await api(t.baseUrl, 'DELETE', '/api/me/links/not-a-uuid', { cookie })).status).toBe(404);
      const mismatch = await api(t.baseUrl, 'PUT', '/api/me/links/order', {
        cookie,
        body: { ids: [c.id, a.id, otherLink.id] },
      });
      expect(mismatch.body.code).toBe('order_mismatch');

      expect((await api(t.baseUrl, 'DELETE', `/api/me/links/${a.id}`, { cookie })).status).toBe(204);
      expect((await state(cookie)).links.map((link) => link.title)).toEqual(['c', 'b']);
    });
  });

  it('SNS는 전체 교체하며 종류·주소·개수를 검사한다', async () => {
    const { cookie } = await newCreator();
    const items = [
      { platform: 'instagram', url: 'https://instagram.com/me' },
      { platform: 'youtube', url: 'https://youtube.com/@me' },
    ];
    const replaced = await api<SocialLinkView[]>(t.baseUrl, 'PUT', '/api/me/socials', { cookie, body: { items } });
    expect([replaced.status, replaced.body]).toEqual([200, items]);
    const again = await api<SocialLinkView[]>(t.baseUrl, 'PUT', '/api/me/socials', {
      cookie,
      body: { items: [items[1]] },
    });
    expect(again.body).toEqual([items[1]]);
    for (const body of [
      { items: [{ platform: 'myspace', url: 'https://a.com' }] },
      { items: [{ platform: 'x', url: 'ftp://a.com' }] },
      { items: Array.from({ length: 11 }, () => items[0]) },
      { nope: true },
    ]) {
      const response = await api(t.baseUrl, 'PUT', '/api/me/socials', { cookie, body });
      expect([response.status, response.body.code]).toEqual([400, 'validation_failed']);
    }
  });

  it('포트폴리오 추가·수정·삭제·순서와 20개 한도, 남의 항목은 404', async () => {
    const { cookie, userId } = await newCreator();
    const other = await newCreator();
    const image = await upload(cookie, PNG);
    const created = await api<PortfolioItemView>(t.baseUrl, 'POST', '/api/me/portfolio', {
      cookie,
      body: { title: '작업 1', url: 'https://work.example/1', imageFileId: image.body.fileId, description: '설명' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      title: '작업 1',
      url: 'https://work.example/1',
      image: { fileId: image.body.fileId },
      description: '설명',
      position: 0,
    });
    const second = await api<PortfolioItemView>(t.baseUrl, 'POST', '/api/me/portfolio', {
      cookie,
      body: { title: '작업 2' },
    });
    const updated = await api<PortfolioItemView>(t.baseUrl, 'PATCH', `/api/me/portfolio/${created.body.id}`, {
      cookie,
      body: { url: null, imageFileId: null },
    });
    expect(updated.body).toMatchObject({ title: '작업 1', url: null, image: null });
    const order = await api<PortfolioItemView[]>(t.baseUrl, 'PUT', '/api/me/portfolio/order', {
      cookie,
      body: { ids: [second.body.id, created.body.id] },
    });
    expect(order.body.map((item) => item.title)).toEqual(['작업 2', '작업 1']);
    const badOrder = await api(t.baseUrl, 'PUT', '/api/me/portfolio/order', {
      cookie,
      body: { ids: [second.body.id] },
    });
    expect([badOrder.status, badOrder.body.code]).toEqual([400, 'order_mismatch']);
    const foreign = await api(t.baseUrl, 'PATCH', `/api/me/portfolio/${created.body.id}`, {
      cookie: other.cookie,
      body: { title: 'x' },
    });
    expect([foreign.status, foreign.body.code]).toEqual([404, 'portfolio_item_not_found']);
    expect(
      (await api(t.baseUrl, 'DELETE', `/api/me/portfolio/${created.body.id}`, { cookie: other.cookie })).status,
    ).toBe(404);
    expect((await api(t.baseUrl, 'DELETE', `/api/me/portfolio/${created.body.id}`, { cookie })).status).toBe(204);

    await t.pool.query(
      `INSERT INTO portfolio_items (landing_id, title, position)
       SELECT l.id, 'bulk', g FROM generate_series(1, 19) g, landings l WHERE l.user_id = $1`,
      [userId],
    );
    const over = await api(t.baseUrl, 'POST', '/api/me/portfolio', { cookie, body: { title: '21번째' } });
    expect([over.status, over.body.code]).toEqual([409, 'portfolio_limit_reached']);
  });

  it('이미지 업로드: 내용으로 형식을 판단하고 한도(CRELINK_LIMITS.imageMaxBytes)를 넘으면 400, 올린 이미지는 공개 주소로 받는다', async () => {
    const { cookie } = await newCreator();
    const uploaded = await upload(cookie, PNG, 'application/octet-stream');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.url).toBe(`${WEB_URL}/api/backend/api/files/${uploaded.body.fileId}`);
    const file = await fetch(`${t.baseUrl}/api/files/${uploaded.body.fileId}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(file.headers.get('cache-control')).toContain('max-age=31536000');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG);

    const text = await upload(cookie, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png');
    expect([text.status, text.body.code]).toEqual([400, 'file_type_unsupported']);
    const big = await upload(cookie, Buffer.concat([PNG, Buffer.alloc(CRELINK_LIMITS.imageMaxBytes)]));
    expect([big.status, big.body.code]).toEqual([400, 'file_too_large']);
    const missing = await fetch(`${t.baseUrl}/api/files/00000000-0000-0000-0000-000000000000`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code: string }).code).toBe('file_not_found');
  });
});
