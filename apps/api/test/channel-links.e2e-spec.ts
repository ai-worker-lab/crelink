import { randomUUID } from 'node:crypto';
import {
  CHANNEL_LINK_LIMITS,
  ChannelLinkView,
  CreatorLandingState,
  LandingEventRequest,
  PublicLandingResponse,
} from '@crelink/shared';
import { LandingPassService } from '../src/short-link/landing-pass.service';
import { api, createTestApp, login, SHORT_URL, TestApp, waitForRows, WEB_URL } from './test-app';

const PRESET_UTM = (code: string) => ({
  source: 'instagram',
  medium: 'social',
  campaign: 'profile',
  content: 'bio',
  id: code,
});

describe('채널별 짧은 주소 (docs/specs/channel-links.md)', () => {
  let t: TestApp;
  let n = 0;

  const newCreator = async () => {
    n += 1;
    const result = await login(t.baseUrl, `channel-${n}|channel${n}@example.com`);
    const cookie = result.cookie!;
    const landing = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    return { cookie, userId: result.body.user!.id, slug: landing.shortLink.slug, publicId: landing.landing.publicId };
  };
  type Creator = Awaited<ReturnType<typeof newCreator>>;
  const create = (creator: Creator, body: Record<string, unknown>) =>
    api<ChannelLinkView>(t.baseUrl, 'POST', '/api/me/channel-links', { cookie: creator.cookie, body });
  const list = (creator: Creator) =>
    api<ChannelLinkView[]>(t.baseUrl, 'GET', '/api/me/channel-links', { cookie: creator.cookie });
  const archive = (creator: Creator, code: string) =>
    api(t.baseUrl, 'POST', `/api/me/channel-links/${code}/archive`, { cookie: creator.cookie });
  const bio = (creator: Creator) => create(creator, { channel: 'instagram', placement: 'bio' });
  const visit = (code: string, headers: Record<string, string> = {}, query = '') =>
    fetch(`${t.baseUrl}/s/${code}${query}`, { redirect: 'manual', headers });
  const landing = (publicId: string, query: string) =>
    api<PublicLandingResponse>(t.baseUrl, 'GET', `/api/public/landings/${publicId}${query}`);
  const locationOf = (response: Response) => new URL(response.headers.get('location')!);

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  describe('1~2. 방문: 저장 프리셋만 UTM으로 기록하고 주소창에는 via만 남긴다', () => {
    it('302 Location에 utm_이 없고, visits.utm은 프리셋이며 요청 쿼리의 utm_*는 무시한다', async () => {
      const creator = await newCreator();
      const created = await bio(creator);
      expect(created.status).toBe(201);
      const { code, url } = created.body;
      expect(code).toMatch(/^[a-z0-9]{7}$/);
      expect(url).toBe(`${SHORT_URL}/s/${code}`);

      const response = await visit(code, {}, '?utm_source=evil&utm_medium=evil&utm_campaign=evil&utm_id=evil');
      expect(response.status).toBe(302);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const location = response.headers.get('location')!;
      expect(location).toMatch(
        new RegExp(
          `^${WEB_URL.replace(/\./g, '\\.')}/p/${creator.publicId}\\?pass=\\d+\\.(?:[a-f0-9-]{36}\\.)?[A-Za-z0-9_-]{22}&via=${code}$`,
        ),
      );
      expect(location).not.toContain('utm_');
      expect(response.headers.getSetCookie()[0]).toMatch(/^cl_vid=/);

      const [row] = await waitForRows(
        async () => (await t.pool.query('SELECT slug, utm FROM visits WHERE utm @> $1::jsonb', [{ id: code }])).rows,
      );
      expect(row).toEqual({ slug: creator.slug, utm: PRESET_UTM(code) });
    });

    it('page_view의 utm도 같은 프리셋이다(공개 랜딩 API가 via로 utm을 내려 주고 웹이 그대로 보고한다)', async () => {
      const creator = await newCreator();
      const { code } = (await bio(creator)).body;
      const passed = locationOf(await visit(code)).searchParams;
      const view = await landing(creator.publicId, `?pass=${encodeURIComponent(passed.get('pass')!)}&via=${code}`);
      expect(view.body).toMatchObject({
        passAccepted: true,
        shortUrl: `${SHORT_URL}/s/${code}`,
        utm: PRESET_UTM(code),
      });

      const body: LandingEventRequest = {
        token: view.body.telemetryToken!,
        eventId: randomUUID(),
        sessionId: randomUUID(),
        pageViewId: randomUUID(),
        type: 'page_view',
        utm: view.body.utm,
      };
      const sent = await api(t.baseUrl, 'POST', `/api/landings/${creator.publicId}/events`, {
        body,
        headers: { origin: WEB_URL },
      });
      expect(sent.status).toBe(204);
      const [event] = await waitForRows(
        async () => (await t.pool.query('SELECT utm FROM landing_events WHERE utm @> $1::jsonb', [{ id: code }])).rows,
      );
      expect(event.utm).toEqual(PRESET_UTM(code));
    });

    it('광고 위치는 paid_social, 캠페인 입력은 정규화하고 비면 기본값이다', async () => {
      const creator = await newCreator();
      const ad = await create(creator, { channel: 'youtube', placement: 'ad', campaign: ' Summer_Sale 2026!! ' });
      expect([ad.status, ad.body.campaign]).toEqual([201, 'summer-sale-2026']);
      const reels = await create(creator, { channel: 'instagram', placement: 'reels' });
      expect(reels.body.campaign).toBe('general');
      await visit(ad.body.code);
      const [row] = await waitForRows(
        async () => (await t.pool.query('SELECT utm FROM visits WHERE utm @> $1::jsonb', [{ id: ad.body.code }])).rows,
      );
      expect(row.utm).toEqual({
        source: 'youtube',
        medium: 'paid_social',
        campaign: 'summer-sale-2026',
        content: 'ad',
        id: ad.body.code,
      });
    });
  });

  describe('3. 안내 화면', () => {
    it('없는 code·형식이 틀린 code는 link_not_found, 정지 계정은 creator_suspended', async () => {
      const creator = await newCreator();
      const { code } = (await bio(creator)).body;
      for (const missing of ['zzzzzzz', 'ZZZZZZZ', 'abc', 'abcdefghijk']) {
        const response = await visit(missing);
        expect([response.status, response.headers.get('location')]).toEqual([
          302,
          `${WEB_URL}/notice?reason=link_not_found`,
        ]);
      }
      await t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [creator.userId]);
      const suspended = await visit(code);
      expect([suspended.status, suspended.headers.get('location')]).toEqual([
        302,
        `${WEB_URL}/notice?reason=creator_suspended`,
      ]);
      expect((await t.pool.query('SELECT 1 FROM visits WHERE utm @> $1::jsonb', [{ id: code }])).rowCount).toBe(0);
    });
  });

  describe('4. 보관', () => {
    it('보관한 code는 계속 302로 동작하고 목록에서만 빠지며, 두 번 보관해도 204다', async () => {
      const creator = await newCreator();
      const { code } = (await bio(creator)).body;
      expect((await list(creator)).body.map((item) => item.code)).toEqual([code]);
      expect((await archive(creator, code)).status).toBe(204);
      expect((await archive(creator, code)).status).toBe(204);
      expect((await list(creator)).body).toEqual([]);
      const response = await visit(code);
      expect(response.status).toBe(302);
      expect(locationOf(response).pathname).toBe(`/p/${creator.publicId}`);
      // 보관한 조합은 다시 만들 수 있고 새 code가 나온다.
      const again = await bio(creator);
      expect([again.status, again.body.code === code]).toEqual([201, false]);
    });
  });

  describe('5. 삭제', () => {
    it('페이지를 지우면 channel_links 행은 사라지고 channel_link_codes 행은 남으며 같은 code는 발급되지 않는다', async () => {
      const creator = await newCreator();
      const { code } = (await bio(creator)).body;
      await t.pool.query('DELETE FROM landings WHERE public_id = $1', [creator.publicId]);
      expect((await t.pool.query('SELECT 1 FROM channel_links WHERE code = $1', [code])).rowCount).toBe(0);
      expect((await t.pool.query('SELECT 1 FROM channel_link_codes WHERE code = $1', [code])).rowCount).toBe(1);
      const response = await visit(code);
      expect(response.headers.get('location')).toBe(`${WEB_URL}/notice?reason=link_not_found`);
      // 지워진 code가 다시 나오지 않는다: 영구 기록 표의 기본키가 막는다.
      await expect(t.pool.query('INSERT INTO channel_link_codes (code) VALUES ($1)', [code])).rejects.toMatchObject({
        code: '23505',
      });
    });
  });

  describe('6. 소유권', () => {
    it('로그인이 없으면 401, 남의 code 보관은 404이고 그 주소는 그대로 살아 있다', async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const { code } = (await bio(owner)).body;
      expect((await api(t.baseUrl, 'GET', '/api/me/channel-links')).status).toBe(401);
      expect((await api(t.baseUrl, 'POST', '/api/me/channel-links', { body: {} })).status).toBe(401);
      expect((await api(t.baseUrl, 'POST', `/api/me/channel-links/${code}/archive`)).status).toBe(401);

      const attempt = await archive(other, code);
      expect([attempt.status, attempt.body]).toEqual([
        404,
        { code: 'channel_link_not_found', message: '채널 주소를 찾을 수 없습니다.' },
      ]);
      expect((await archive(other, 'zzzzzzz')).status).toBe(404);
      expect((await list(owner)).body.map((item) => item.code)).toEqual([code]);
      expect((await list(other)).body).toEqual([]);
      // 본문에 남의 페이지를 가리키는 값을 넣어도 세션 사용자의 페이지에 만들어진다.
      const forged = await create(other, { channel: 'instagram', placement: 'bio', landingId: owner.publicId });
      expect(forged.status).toBe(201);
      expect((await list(owner)).body).toHaveLength(1);
      expect((await list(other)).body).toHaveLength(1);
    });
  });

  describe('7. 동시성과 한도', () => {
    it('같은 조합을 동시에 보내도 활성 행은 1개이고 모두 같은 주소를 받는다', async () => {
      const creator = await newCreator();
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => create(creator, { channel: 'tiktok', placement: 'video', campaign: 'Spring' })),
      );
      expect(new Set(responses.map((response) => response.body.code)).size).toBe(1);
      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      expect(responses.filter((response) => response.status === 200)).toHaveLength(7);
      const rows = await t.pool.query(
        `SELECT 1 FROM channel_links cl JOIN landings l ON l.id = cl.landing_id WHERE l.public_id = $1 AND cl.archived_at IS NULL`,
        [creator.publicId],
      );
      expect(rows.rowCount).toBe(1);
    });

    it('프리셋 밖 조합·잘못된 캠페인은 400', async () => {
      const creator = await newCreator();
      for (const body of [
        {},
        { channel: 'instagram' },
        { channel: 'instagram', placement: 'video' },
        { channel: 'myspace', placement: 'bio' },
        { channel: 'instagram', placement: 'bio', campaign: '!!!' },
        { channel: 'instagram', placement: 'bio', campaign: 5 },
      ]) {
        const response = await create(creator, body);
        expect([response.status, response.body.code]).toEqual([400, 'validation_failed']);
      }
      expect((await list(creator)).body).toEqual([]);
    });

    it('보관 제외 50개, 보관 포함 200개를 넘으면 거부한다', async () => {
      const creator = await newCreator();
      const landingId = (
        await t.pool.query<{ id: string }>('SELECT id FROM landings WHERE public_id = $1', [creator.publicId])
      ).rows[0].id;
      const seed = async (count: number, archived: boolean, offset: number) => {
        for (let index = 0; index < count; index += 1) {
          const code = `s${String(offset + index).padStart(6, '0')}`;
          await t.pool.query('INSERT INTO channel_link_codes (code) VALUES ($1)', [code]);
          await t.pool.query(
            `INSERT INTO channel_links (code, landing_id, channel, placement, campaign, archived_at)
             VALUES ($1, $2, 'instagram', 'bio', $3, ${archived ? 'now()' : 'NULL'})`,
            [code, landingId, `seed-${offset + index}`],
          );
        }
      };
      await seed(CHANNEL_LINK_LIMITS.perLanding, false, 0);
      const full = await create(creator, { channel: 'x', placement: 'bio' });
      expect([full.status, full.body.code]).toEqual([409, 'channel_link_limit_reached']);
      // 같은 조합이 이미 있으면 한도와 관계없이 그 주소를 돌려준다.
      const existing = await create(creator, { channel: 'instagram', placement: 'bio', campaign: 'seed-0' });
      expect([existing.status, existing.body.code]).toEqual([200, 's000000']);
      expect((await list(creator)).body).toHaveLength(CHANNEL_LINK_LIMITS.perLanding);

      await t.pool.query('UPDATE channel_links SET archived_at = now() WHERE landing_id = $1', [landingId]);
      await seed(CHANNEL_LINK_LIMITS.totalPerLanding - CHANNEL_LINK_LIMITS.perLanding, true, 1000);
      const total = await create(creator, { channel: 'x', placement: 'bio' });
      expect([total.status, total.body.code]).toEqual([409, 'channel_link_total_limit_reached']);
    });
  });

  describe('9. via와 리디렉트 루프', () => {
    it('pass가 없거나 만료된 via 주소는 /s/{code}를 한 번 거쳐 통과 표시를 받고, 다시 보내지 않는다', async () => {
      const creator = await newCreator();
      const { code } = (await bio(creator)).body;
      const passes = t.app.get(LandingPassService);
      const expired = passes.issue(creator.publicId, Date.now() - 3 * 24 * 60 * 60 * 1000, randomUUID());
      for (const query of [`?via=${code}`, `?pass=${encodeURIComponent(expired)}&via=${code}`]) {
        const first = await landing(creator.publicId, query);
        // 웹은 passAccepted가 false이면 shortUrl로 보냅니다. via 주소는 채널 주소로 돌아가야 UTM이 남습니다.
        expect(first.body).toMatchObject({
          passAccepted: false,
          shortUrl: `${SHORT_URL}/s/${code}`,
          utm: PRESET_UTM(code),
        });
        const redirected = await visit(code);
        const params = locationOf(redirected).searchParams;
        expect(params.get('via')).toBe(code);
        const second = await landing(
          creator.publicId,
          `?pass=${encodeURIComponent(params.get('pass')!)}&via=${params.get('via')}`,
        );
        expect(second.body.passAccepted).toBe(true);
      }
    });

    it('보관한 code의 via도 채널 주소와 UTM을 준다', async () => {
      const creator = await newCreator();
      const { code } = (await bio(creator)).body;
      await archive(creator, code);
      const view = await landing(creator.publicId, `?via=${code}`);
      expect(view.body).toMatchObject({ shortUrl: `${SHORT_URL}/s/${code}`, utm: PRESET_UTM(code) });
    });

    it('다른 페이지의 code·형식이 틀린 via는 조용히 무시한다', async () => {
      const owner = await newCreator();
      const other = await newCreator();
      const { code } = (await bio(owner)).body;
      for (const via of [code, 'nope', 'ZZZZZZZ', `${code}${code}`]) {
        const view = await landing(other.publicId, `?via=${via}`);
        expect(view.status).toBe(200);
        expect(view.body.shortUrl).toBe(`${SHORT_URL}/${other.slug}`);
        expect(view.body).not.toHaveProperty('utm');
      }
      expect((await landing(other.publicId, '')).body).not.toHaveProperty('utm');
    });
  });

  describe('공유관리(0243): 소유자 전용', () => {
    const asPage = (who: Creator, method: string, path: string, page: string, body?: unknown) =>
      api<ChannelLinkView[] & ChannelLinkView & { code: string }>(t.baseUrl, method, path, {
        cookie: who.cookie,
        headers: { 'X-Crelink-Page': page },
        body,
      });

    it('멤버(소유자 아님)는 소유자 페이지의 목록·생성·보관이 모두 403이고 아무것도 바뀌지 않는다', async () => {
      const owner = await newCreator();
      const editor = await newCreator();
      await t.pool.query('INSERT INTO page_members (page_user_id, member_user_id) VALUES ($1, $2)', [
        owner.userId,
        editor.userId,
      ]);
      const { code } = (await bio(owner)).body;
      for (const [method, path, body] of [
        ['GET', '/api/me/channel-links', undefined],
        ['POST', '/api/me/channel-links', { channel: 'tiktok', placement: 'bio' }],
        ['POST', `/api/me/channel-links/${code}/archive`, undefined],
      ] as const) {
        const response = await asPage(editor, method, path, owner.publicId, body);
        expect([method, path, response.status, response.body.code]).toEqual([method, path, 403, 'page_owner_only']);
      }
      expect((await list(owner)).body.map((item) => item.code)).toEqual([code]);
      expect(
        (await t.pool.query('SELECT 1 FROM channel_links WHERE code = $1 AND archived_at IS NOT NULL', [code]))
          .rowCount,
      ).toBe(0);
    });

    it('소유자는 자기 페이지 헤더로 만들고, 헤더로 고른 페이지의 주소는 그 소유자 것이다', async () => {
      const owner = await newCreator();
      const stranger = await newCreator();
      const made = await asPage(owner, 'POST', '/api/me/channel-links', owner.publicId, {
        channel: 'instagram',
        placement: 'bio',
      });
      expect(made.status).toBe(201);
      expect((await asPage(owner, 'GET', '/api/me/channel-links', owner.publicId)).body).toHaveLength(1);
      // 멤버가 아닌 사람이 남의 페이지를 헤더로 골라도 존재를 알 수 없다(404).
      const denied = await asPage(stranger, 'GET', '/api/me/channel-links', owner.publicId);
      expect([denied.status, denied.body.code]).toEqual([404, 'page_not_found']);
    });

    it('/s/{code}와 공개 랜딩 via는 공개 경로라 로그인 없이 동작한다', async () => {
      const owner = await newCreator();
      const { code } = (await bio(owner)).body;
      expect((await visit(code)).status).toBe(302);
      expect((await landing(owner.publicId, `?via=${code}`)).status).toBe(200);
    });
  });
});
