import { randomUUID } from 'node:crypto';
import { ApiError, CreatorLandingState, InstagramDmRuleView, normalizeChannelCampaign } from '@crelink/shared';
import { AppConfig } from '../src/config.service';
import { encryptToken } from '../src/instagram/crypto';
import { GraphMedia, InstagramGraph, InstagramGraphError } from '../src/instagram/graph';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

const ROOT = '/api/me/instagram';
const waitFor = async (ready: () => boolean) => {
  for (let i = 0; i < 200 && !ready(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
};
const media = (id: string): GraphMedia => ({
  id,
  caption: `게시물 ${id}`,
  permalink: `https://www.instagram.com/p/${id}/`,
  thumbnailUrl: null,
  timestamp: '2026-11-11T00:00:00Z',
  mediaType: 'CAROUSEL_ALBUM',
  childIds: [`${id}-child`],
});

describe('Instagram 규칙 API (0260)', () => {
  let t: TestApp;
  let graph: jest.SpyInstance;
  let sequence = 0;
  const env = {
    META_APP_ID: 'test-app',
    META_APP_SECRET: 'test-secret',
    META_LOGIN_CONFIG_ID: 'test-login',
    META_WEBHOOK_VERIFY_TOKEN: 'test-verify',
    INSTAGRAM_TOKEN_KEYS: `1:${Buffer.alloc(32, 1).toString('base64')}`,
    INSTAGRAM_TOKEN_KEY_CURRENT: '1',
    INSTAGRAM_COMMENTER_HASH_KEY: Buffer.alloc(32, 2).toString('base64'),
    INSTAGRAM_OPT_OUT_KEY: Buffer.alloc(32, 3).toString('base64'),
  };
  const previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));

  beforeAll(async () => {
    t = await createTestApp({ env });
    // 실제 Meta 호출은 하지 않습니다. 앱에 주입된 provider의 경계만 대체합니다.
    graph = jest.spyOn(t.app.get(InstagramGraph), 'listMedia');
  });
  beforeEach(() => {
    graph.mockReset();
    graph.mockImplementation(async (_token: string, _igId: string, after: string | null) => ({
      items: [media(after === 'next' ? 'later' : 'post')],
      nextCursor: after ? null : 'next',
    }));
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await t?.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const creator = async (connected = true) => {
    sequence += 1;
    const logged = await login(t.baseUrl, `ig-rules-${sequence}|ig-rules-${sequence}@example.com`);
    const cookie = logged.cookie!;
    const userId = logged.body.user!.id;
    const landing = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    const connectionId = randomUUID();
    if (connected) {
      const token = encryptToken(t.app.get(AppConfig).instagram!.tokenKeyring, connectionId, 'test-ig-token');
      await t.pool.query(
        `INSERT INTO instagram_connections (id, user_id, ig_user_id, ig_username, status, token_ciphertext, token_key_version)
         VALUES ($1, $2, $3, 'test-creator', 'active', $4, $5)`,
        [connectionId, userId, `ig-${sequence}`, token.ciphertext, token.keyVersion],
      );
    }
    return { cookie, userId, connectionId, pageId: landing.landing.publicId };
  };
  type Creator = Awaited<ReturnType<typeof creator>>;
  const request = <T = ApiError>(who: Creator, method: string, path: string, body?: unknown) =>
    api<T>(t.baseUrl, method, `${ROOT}${path}`, { cookie: who.cookie, body });
  const create = (
    who: Creator,
    body: unknown = { mediaId: 'post', keyword: '자료', message: '팔로우하고 댓글로 요청하세요' },
  ) => request<InstagramDmRuleView & ApiError>(who, 'POST', '/rules', body);
  const stored = async (publicId: string) =>
    (await t.pool.query('SELECT * FROM instagram_dm_rules WHERE public_id = $1', [publicId])).rows[0];
  const pending = async (who: Creator, ruleId: string) => {
    const id = randomUUID();
    await t.pool.query(
      `INSERT INTO instagram_dm_deliveries (connection_id, rule_id, rule_version, comment_id, commenter_hash, commented_at, message_body, status)
       VALUES ($1, $2, 1, $3, $4, now(), '저장된 본문', 'pending')`,
      [who.connectionId, ruleId, id, Buffer.alloc(32, 1)],
    );
  };

  it('규칙 생성·목록, 정규화된 DM 채널 코드와 /s/ 주소, 캐러셀 자식 미저장을 확인한다', async () => {
    const owner = await creator();
    const result = await create(owner, {
      mediaId: 'post',
      keyword: '자료 A_!',
      message: '팔로우해야 받는 독점 콘텐츠',
    });
    expect(result.status).toBe(201);
    const rule = result.body;
    expect(rule).toMatchObject({ mediaId: 'post', mediaPermalink: media('post').permalink, enabled: true });
    expect(rule.publicId).toMatch(/^[a-z0-9]{10}$/);
    expect((await stored(rule.publicId)).ig_media_child_ids).toEqual([]);
    const link = (await t.pool.query('SELECT * FROM channel_links WHERE code = $1', [rule.channelLinkCode])).rows[0];
    expect(link).toMatchObject({
      channel: 'instagram',
      placement: 'dm',
      campaign: normalizeChannelCampaign(`dm-자료 A_!-${rule.publicId.slice(0, 6)}`),
    });
    const visit = await fetch(`${t.baseUrl}/s/${rule.channelLinkCode}`, { redirect: 'manual' });
    expect(visit.status).toBe(302);
    expect(visit.headers.get('location')).toContain(`/p/${owner.pageId}?`);
    expect((await request(owner, 'GET', '/rules')).body).toEqual({ rules: [rule] });
    expect(graph).toHaveBeenCalledWith('test-ig-token', expect.any(String), null);
  });

  it('게시물은 커서·25건 상한·공유 필드만 반환하며 뒤 페이지에서도 생성할 수 있다', async () => {
    const owner = await creator();
    const page = await request(owner, 'GET', '/media?after=next');
    expect(page.status).toBe(200);
    expect(page.body).toEqual({
      items: [
        {
          id: 'later',
          caption: '게시물 later',
          permalink: media('later').permalink,
          thumbnailUrl: '',
          timestamp: media('later').timestamp,
        },
      ],
      nextCursor: null,
    });
    expect((await create(owner, { mediaId: 'later', keyword: '다음', message: '안내' })).status).toBe(201);
    graph.mockResolvedValueOnce({
      items: Array.from({ length: 30 }, (_, index) => media(String(index))),
      nextCursor: 'cursor',
    });
    const capped = await request<{ items: unknown[]; nextCursor: string }>(owner, 'GET', '/media');
    expect(capped.body.items).toHaveLength(25);
    expect(capped.body.nextCursor).toBe('cursor');
    expect((await request(owner, 'GET', '/media?after=a&after=b')).status).toBe(400);
  });

  it('미연결·재인증은 409이며 Graph를 호출하지 않는다. 미연결 규칙 목록은 빈 배열이다', async () => {
    const absent = await creator(false);
    expect((await request(absent, 'GET', '/rules')).body).toEqual({ rules: [] });
    const owner = await creator();
    await t.pool.query(
      "UPDATE instagram_connections SET status = 'reauth_required', token_ciphertext = NULL WHERE id = $1",
      [owner.connectionId],
    );
    for (const who of [absent, owner]) {
      const result = await request(who, 'GET', '/media');
      expect([result.status, result.body.code]).toEqual([409, 'instagram_reauth_required']);
    }
    expect(graph).not.toHaveBeenCalled();
  });

  it('미설정은 503, 제공자 실패는 원문 노출 없이 502, 계정에 없는 게시물은 400이다', async () => {
    const owner = await creator();
    graph.mockRejectedValueOnce(new InstagramGraphError('listMedia', 'rejected', 400, 190, null, null));
    const failed = await request(owner, 'GET', '/media');
    expect([failed.status, failed.body.code]).toEqual([502, 'instagram_upstream_failed']);
    expect((await create(owner, { mediaId: 'foreign', keyword: '자료', message: '안내' })).status).toBe(400);
    const settings = jest.spyOn(t.app.get(AppConfig), 'instagram', 'get').mockReturnValue(null);
    try {
      const result = await request(owner, 'GET', '/rules');
      expect([result.status, result.body.code]).toEqual([503, 'instagram_not_configured']);
    } finally {
      settings.mockRestore();
    }
  });

  it('키워드 30자·메시지 250자를 코드 포인트로 검사하고 임의 문구는 허용한다', async () => {
    const owner = await creator();
    for (const body of [
      null,
      {},
      { mediaId: 'post', keyword: '', message: '안내' },
      { mediaId: 'post', keyword: '가'.repeat(31), message: '안내' },
      { mediaId: 'post', keyword: '자료', message: '😀'.repeat(251) },
      { mediaId: 'post', keyword: '자료', message: '   ' },
      { mediaId: 'post', keyword: '자\u0000료', message: '안내' },
      { mediaId: 'post', keyword: '자료', message: '안내\u0000' },
    ]) {
      const result = await create(owner, body);
      expect([result.status, result.body.code]).toEqual([400, 'validation_failed']);
    }
    const result = await create(owner, { mediaId: 'post', keyword: '가'.repeat(30), message: '😀'.repeat(250) });
    expect(result.status).toBe(201);
    for (const body of [
      { message: '가'.repeat(251) },
      { keyword: null },
      { enabled: 'false' },
      { message: '안내\u0000' },
      { keyword: '\u0000' },
    ]) {
      expect((await request(owner, 'PATCH', `/rules/${result.body.publicId}`, body)).status).toBe(400);
    }
  });

  it.each([{ keyword: '새 키워드' }, { message: '새 메시지' }, { enabled: false }])(
    '수정 %j는 version 증가와 pending 취소를 함께 수행한다',
    async (body) => {
      const owner = await creator();
      const rule = (await create(owner)).body;
      const row = await stored(rule.publicId);
      await pending(owner, row.id);
      // pending 이외의 행은 바꾸지 않습니다.
      await t.pool.query(
        `INSERT INTO instagram_dm_deliveries (connection_id, rule_id, rule_version, comment_id, commenter_hash, commented_at, message_body, status)
       VALUES ($1, $2, 1, $3, $4, now(), '발송 중', 'sending')`,
        [owner.connectionId, row.id, randomUUID(), Buffer.alloc(32, 2)],
      );
      const result = await request<InstagramDmRuleView>(owner, 'PATCH', `/rules/${rule.publicId}`, body);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject(body);
      expect((await stored(rule.publicId)).version).toBe(2);
      const statuses = (
        await t.pool.query('SELECT status FROM instagram_dm_deliveries WHERE rule_id = $1 ORDER BY status', [row.id])
      ).rows;
      expect(statuses).toEqual([{ status: 'cancelled' }, { status: 'sending' }]);
      // `sending`은 그대로지만 규칙 version과 어긋나 worker가 다시 보내지 못합니다.
      expect(
        (
          await t.pool.query(
            "SELECT rule_version FROM instagram_dm_deliveries WHERE rule_id = $1 AND status='sending'",
            [row.id],
          )
        ).rows,
      ).toEqual([{ rule_version: 1 }]);
      expect(result.body.channelLinkCode).toBe(rule.channelLinkCode);
      expect((await request(owner, 'PATCH', `/rules/${rule.publicId}`, body)).status).toBe(200);
      expect((await stored(rule.publicId)).version).toBe(2);
    },
  );

  describe('규칙 생성의 외부 호출과 잠금 (R12, C4)', () => {
    const channelLinkCount = async (who: Creator) =>
      (
        await t.pool.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM channel_links l JOIN landings a ON a.id = l.landing_id WHERE a.user_id = $1',
          [who.userId],
        )
      ).rows[0].count;

    it('NUL이 있으면 Graph를 부르지 않고 400이며 채널 주소를 쓰지 않는다', async () => {
      const owner = await creator();
      const before = await channelLinkCount(owner);
      const result = await create(owner, { mediaId: 'post', keyword: '키', message: '안내\u0000' });
      expect([result.status, result.body.code]).toEqual([400, 'validation_failed']);
      expect(graph).not.toHaveBeenCalled();
      expect(await channelLinkCount(owner)).toBe(before);
    });

    it('Graph 호출 중에는 연결 행을 잠그지 않는다', async () => {
      const owner = await creator();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const entered = jest.fn();
      graph.mockImplementationOnce(async () => {
        entered();
        await gate;
        return { items: [media('post')], nextCursor: null };
      });
      const creating = create(owner);
      await waitFor(() => entered.mock.calls.length > 0);
      const unlocked = await t.pool.query('SELECT id FROM instagram_connections WHERE id = $1 FOR UPDATE NOWAIT', [
        owner.connectionId,
      ]);
      expect(unlocked.rowCount).toBe(1);
      release();
      expect((await creating).status).toBe(201);
    });

    it('Graph 호출 뒤 잠금을 잡고 중복을 다시 검사하며 채널 주소는 되돌린다', async () => {
      const owner = await creator();
      const before = await channelLinkCount(owner);
      graph.mockImplementationOnce(async () => {
        await t.pool.query(`INSERT INTO channel_link_codes (code) VALUES ('rcdup001') ON CONFLICT DO NOTHING`);
        await t.pool.query(
          `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, media_permalink, keyword, message, channel_link_code)
           VALUES ($1, $2, 'post', 'https://example.com/p', '다른', '문구', 'rcdup001')`,
          [`rc${randomUUID().replaceAll('-', '').slice(0, 8)}`, owner.connectionId],
        );
        return { items: [media('post')], nextCursor: null };
      });
      const result = await create(owner);
      expect([result.status, result.body.code]).toEqual([409, 'instagram_rule_media_taken']);
      expect(await channelLinkCount(owner)).toBe(before);
    });

    it('게시물 소유 확인의 페이지 순회에 상한이 있다', async () => {
      const owner = await creator();
      let page = 0;
      graph.mockImplementation(async () => {
        page += 1;
        return { items: [media(`other-${page}`)], nextCursor: `c${page}` };
      });
      const result = await create(owner);
      expect([result.status, result.body.code]).toEqual([400, 'validation_failed']);
      expect(graph.mock.calls.length).toBe(10);
    });
  });

  it('보관은 version 증가·pending 취소·목록 제외 후 같은 게시물의 새 규칙을 허용한다', async () => {
    const owner = await creator();
    const rule = (await create(owner)).body;
    await pending(owner, (await stored(rule.publicId)).id);
    expect((await request(owner, 'DELETE', `/rules/${rule.publicId}`)).status).toBe(204);
    expect(await stored(rule.publicId)).toMatchObject({ version: 2, archived_at: expect.any(Date) });
    expect(
      (await t.pool.query('SELECT status FROM instagram_dm_deliveries WHERE connection_id = $1', [owner.connectionId]))
        .rows,
    ).toEqual([{ status: 'cancelled' }]);
    expect((await request(owner, 'GET', '/rules')).body).toEqual({ rules: [] });
    expect((await request(owner, 'PATCH', `/rules/${rule.publicId}`, { message: '수정' })).status).toBe(404);
    expect((await create(owner)).status).toBe(201);
  });

  it('동시 생성은 게시물당 미보관 규칙 하나만 허용하고 다른 소유자는 별도로 만들 수 있다', async () => {
    const owner = await creator();
    const results = await Promise.all([create(owner), create(owner)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe('instagram_rule_media_taken');
    const rule = results.find((r) => r.status === 201)!.body;
    await request(owner, 'PATCH', `/rules/${rule.publicId}`, { enabled: false });
    // 0016의 인덱스는 비활성도 미보관이면 중복으로 봅니다. 설계 충돌은 티켓에 기록합니다.
    expect((await create(owner)).body.code).toBe('instagram_rule_media_taken');
    expect((await create(await creator())).status).toBe(201);
  });

  it('활성 10·보관 포함 100 한도를 생성·재활성화에 적용하고 한도 실패 시 pending을 보존한다', async () => {
    const owner = await creator();
    const base = (await create(owner)).body;
    const row = await stored(base.publicId);
    const seed = async (count: number, enabled: boolean, archived: boolean) => {
      await t.pool.query(
        `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, media_permalink, keyword, message, channel_link_code, enabled, archived_at)
         SELECT lpad(i::text, 10, '0'), $1, 'seed-' || i, 'https://instagram.com/p/seed', '자료', '안내', $2, $3, CASE WHEN $4 THEN now() END
         FROM generate_series(1, $5::int) i`,
        [owner.connectionId, base.channelLinkCode, enabled, archived, count],
      );
    };
    await request(owner, 'PATCH', `/rules/${base.publicId}`, { enabled: false });
    await seed(10, true, false);
    await pending(owner, row.id);
    const enable = await request(owner, 'PATCH', `/rules/${base.publicId}`, { enabled: true });
    expect([enable.status, enable.body.code]).toEqual([409, 'instagram_rule_limit_reached']);
    expect((await stored(base.publicId)).version).toBe(2);
    expect(
      (await t.pool.query('SELECT status FROM instagram_dm_deliveries WHERE rule_id = $1', [row.id])).rows[0].status,
    ).toBe('pending');
    expect((await create(owner, { mediaId: 'later', keyword: '자료', message: '안내' })).body.code).toBe(
      'instagram_rule_limit_reached',
    );
    await t.pool.query('DELETE FROM instagram_dm_rules WHERE connection_id = $1 AND id <> $2', [
      owner.connectionId,
      row.id,
    ]);
    await seed(99, false, true);
    expect((await create(owner, { mediaId: 'later', keyword: '자료', message: '안내' })).body.code).toBe(
      'instagram_rule_limit_reached',
    );
    // 총 한도는 새 생성에만 적용하며 기존 규칙은 다시 켤 수 있습니다.
    expect((await request(owner, 'PATCH', `/rules/${base.publicId}`, { enabled: true })).status).toBe(200);
  });

  it('채널 주소 한도의 기존 409를 그대로 반환하고 규칙을 만들지 않는다', async () => {
    const owner = await creator();
    const base = (await create(owner)).body;
    await t.pool.query(
      `WITH codes AS (
         INSERT INTO channel_link_codes (code)
         SELECT 'z' || lpad(i::text, 6, '0') FROM generate_series(1,49) i RETURNING code
       )
       INSERT INTO channel_links (code, landing_id, channel, placement, campaign)
       SELECT codes.code, l.id, 'instagram', 'dm', codes.code FROM codes CROSS JOIN landings l
       WHERE l.user_id = $1`,
      [owner.userId],
    );
    const result = await create(owner, { mediaId: 'later', keyword: '다음', message: '안내' });
    expect([result.status, result.body.code]).toEqual([409, 'channel_link_limit_reached']);
    expect((await request(owner, 'GET', '/rules')).body).toEqual({ rules: [base] });
  });

  it('다른 소유자·미연결 소유자의 변경은 404이며 목록·발송에 영향을 주지 않는다', async () => {
    const owner = await creator();
    const rule = (await create(owner)).body;
    await pending(owner, (await stored(rule.publicId)).id);
    for (const other of [await creator(), await creator(false)]) {
      expect((await request(other, 'GET', '/rules')).body).toEqual({ rules: [] });
      for (const id of [rule.publicId, 'INVALID']) {
        for (const method of ['PATCH', 'DELETE']) {
          const result = await request(
            other,
            method,
            `/rules/${id}`,
            method === 'PATCH' ? { enabled: false } : undefined,
          );
          expect([result.status, result.body.code]).toEqual([404, 'instagram_rule_not_found']);
        }
      }
    }
    expect((await stored(rule.publicId)).version).toBe(1);
    expect(
      (await t.pool.query('SELECT status FROM instagram_dm_deliveries WHERE connection_id = $1', [owner.connectionId]))
        .rows[0].status,
    ).toBe('pending');
  });

  it('모든 경로는 로그인·페이지 소유자·사람 전용이다', async () => {
    const owner = await creator();
    const editor = await creator();
    const ai = await createAiOperator(t.pool, 'ig-rules-ai@example.com');
    await t.pool.query('INSERT INTO page_members (page_user_id, member_user_id) VALUES ($1, $2)', [
      owner.userId,
      editor.userId,
    ]);
    const rule = (await create(owner)).body;
    for (const [method, path, body] of [
      ['GET', '/rules', undefined],
      ['POST', '/rules', { mediaId: 'post', keyword: '자료', message: '안내' }],
      ['PATCH', `/rules/${rule.publicId}`, { enabled: false }],
      ['DELETE', `/rules/${rule.publicId}`, undefined],
      ['GET', '/media', undefined],
    ] as const) {
      expect((await api(t.baseUrl, method, `${ROOT}${path}`, { body })).status).toBe(401);
      const denied = await api(t.baseUrl, method, `${ROOT}${path}`, {
        cookie: editor.cookie,
        headers: { 'X-Crelink-Page': owner.pageId },
        body,
      });
      expect([denied.status, denied.body.code]).toEqual([403, 'page_owner_only']);
      const machine = await api(t.baseUrl, method, `${ROOT}${path}`, { token: ai.token, body });
      expect([machine.status, machine.body.code]).toEqual([403, 'forbidden']);
    }
    expect((await stored(rule.publicId)).version).toBe(1);
  });
});
