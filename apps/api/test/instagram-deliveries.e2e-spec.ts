import { randomUUID } from 'node:crypto';
import { ApiError, CreatorLandingState, InstagramDmDeliveryView } from '@crelink/shared';
import { AppConfig } from '../src/config.service';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

const ROOT = '/api/me/instagram/deliveries';
type DeliveryPage = { items: InstagramDmDeliveryView[]; nextCursor: string | null };

/** 실제 HTTP·일회용 DB로 권한, keyset 경계와 비공개 필드 누출을 검사합니다. Meta는 호출하지 않습니다. */
describe('Instagram 발송 내역 API (0261)', () => {
  let t: TestApp;
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
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await t?.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const creator = async (operator = false) => {
    sequence += 1;
    const logged = await login(
      t.baseUrl,
      `ig-deliveries-${sequence}|${operator ? 'operator@example.com' : `ig-deliveries-${sequence}@example.com`}`,
    );
    const cookie = logged.cookie!;
    const userId = logged.body.user!.id;
    const landing = (await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { cookie })).body;
    return { cookie, userId, pageId: landing.landing.publicId };
  };
  type Creator = Awaited<ReturnType<typeof creator>>;
  const request = <T = DeliveryPage>(who: Creator, query = '') =>
    api<T>(t.baseUrl, 'GET', `${ROOT}${query}`, { cookie: who.cookie });
  const landing = (who: Creator, pageId?: string) =>
    api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', {
      cookie: who.cookie,
      headers: pageId ? { 'X-Crelink-Page': pageId } : undefined,
    });

  const rule = async (who: Creator, count = 0) => {
    const connectionId = randomUUID();
    const ruleId = randomUUID();
    const publicId = ruleId.replaceAll('-', '').slice(0, 10);
    const code = randomUUID().replaceAll('-', '').slice(0, 10);
    // 재인증 연결에서도 과거 내역을 볼 수 있으며, worker는 이 시험 행을 선점하지 않습니다.
    await t.pool.query(
      `INSERT INTO instagram_connections (id, user_id, ig_user_id, ig_username, status)
       VALUES ($1, $2, $3, 'test-creator', 'reauth_required') ON CONFLICT (user_id) DO NOTHING`,
      [connectionId, who.userId, connectionId],
    );
    const connection = (await t.pool.query('SELECT id FROM instagram_connections WHERE user_id = $1', [who.userId]))
      .rows[0].id;
    await t.pool.query('INSERT INTO channel_link_codes (code) VALUES ($1)', [code]);
    await t.pool.query(
      `INSERT INTO instagram_dm_rules (id, public_id, connection_id, ig_media_id, media_permalink,
        media_caption_preview, keyword, message, channel_link_code)
       VALUES ($1, $2, $3, $2, 'https://instagram.com/p/test', '게시물 미리보기', '자료', '규칙 본문', $4)`,
      [ruleId, publicId, connection, code],
    );
    const seeded = await t.pool.query<{ id: string }>(
      `INSERT INTO instagram_dm_deliveries (connection_id, rule_id, rule_version, comment_id, commenter_hash,
         commented_at, message_body, status, failure_code, created_at)
       SELECT $1, $2, 1, i::text, decode(lpad(to_hex(i), 64, '0'), 'hex'), now(), '비공개 발송 본문',
         'failed', '비공개 실패 코드', timestamptz '2026-11-01 00:00:00+00' + ((i-1)/2) * interval '1 microsecond'
       FROM generate_series(1, $3::int) i RETURNING id`,
      [connection, ruleId, count],
    );
    return { id: ruleId, publicId, deliveryIds: seeded.rows.map((row) => row.id) };
  };

  it('미연결·내역 없는 소유자는 빈 페이지를 받는다', async () => {
    const owner = await creator();
    expect((await request(owner)).body).toEqual({ items: [], nextCursor: null });
    const empty = await rule(owner);
    expect((await request(owner, `?rule=${empty.publicId}`)).body).toEqual({ items: [], nextCursor: null });
  });

  it('20건 keyset은 마이크로초·동일 시각 id 경계와 중간 삽입에도 누락·중복이 없다', async () => {
    const owner = await creator();
    const seeded = await rule(owner, 25);
    const expected = (
      await t.pool.query<{ id: string }>(
        'SELECT id FROM instagram_dm_deliveries WHERE rule_id = $1 ORDER BY created_at DESC, id DESC',
        [seeded.id],
      )
    ).rows.map((row) => row.id);
    const first = await request(owner);
    expect(first.status).toBe(200);
    expect(first.body.items.map((item) => item.id)).toEqual(expected.slice(0, 20));
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const decoded = Buffer.from(first.body.nextCursor!, 'base64url').toString();
    expect(decoded.split('.')[0].endsWith('000')).toBe(false);
    // 첫 페이지보다 최신인 행이 들어와도 다음 페이지에는 섞이지 않습니다.
    await t.pool.query(
      `INSERT INTO instagram_dm_deliveries (connection_id, rule_id, rule_version, comment_id, commenter_hash,
         commented_at, message_body, status)
       SELECT connection_id, id, version, 'new-comment', decode(repeat('ff', 32), 'hex'), now(), '본문', 'failed'
       FROM instagram_dm_rules WHERE id = $1`,
      [seeded.id],
    );
    const second = await request(owner, `?cursor=${first.body.nextCursor}`);
    expect(second.status).toBe(200);
    expect(second.body.items.map((item) => item.id)).toEqual(expected.slice(20));
    expect(second.body.nextCursor).toBeNull();
    expect(new Set([...first.body.items, ...second.body.items].map((item) => item.id)).size).toBe(25);
  });

  it('응답은 공유 계약의 키만 가지며 모든 상태와 sentAt을 반환한다', async () => {
    const owner = await creator();
    const seeded = await rule(owner, 7);
    const statuses = ['pending', 'sending', 'sent', 'failed', 'unknown', 'expired', 'cancelled'];
    for (const [index, status] of statuses.entries()) {
      await t.pool.query(
        `UPDATE instagram_dm_deliveries SET status = $2,
         sent_at = CASE WHEN $2 = 'sent' THEN timestamptz '2026-11-01 01:00:00+00' END WHERE id = $1`,
        [seeded.deliveryIds[index], status],
      );
    }
    const result = await request(owner);
    expect(result.status).toBe(200);
    expect(result.body.items.map((item) => item.status).sort()).toEqual(statuses.sort());
    for (const item of result.body.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['id', 'ruleId', 'keyword', 'matchAllComments', 'mediaPreview', 'status', 'createdAt', 'sentAt'].sort(),
      );
      expect(item).toMatchObject({
        ruleId: seeded.publicId,
        keyword: '자료',
        matchAllComments: false,
        mediaPreview: '게시물 미리보기',
      });
      expect(item.sentAt).toBe(item.status === 'sent' ? '2026-11-01T01:00:00.000Z' : null);
    }
    for (const key of ['commenter_hash', 'comment_id', 'failure_code', 'message_body']) {
      expect(JSON.stringify(result.body)).not.toContain(key);
    }
  });

  it('0280 모든 댓글 규칙의 내역은 빈 키워드와 matchAllComments를 반환한다', async () => {
    const owner = await creator();
    const seeded = await rule(owner, 1);
    await t.pool.query("UPDATE instagram_dm_rules SET match_all_comments=true, keyword='' WHERE id=$1", [seeded.id]);
    expect((await request(owner)).body.items[0]).toMatchObject({ keyword: '', matchAllComments: true });
  });

  it('보관 규칙도 필터링하며 타 소유자·없는 규칙은 404로 보호한다', async () => {
    const owner = await creator();
    const other = await creator();
    const own = await rule(owner, 1);
    const foreign = await rule(other, 1);
    const another = await rule(owner);
    await t.pool.query('UPDATE instagram_dm_rules SET archived_at = now() WHERE id = $1', [own.id]);
    expect((await request(owner, `?rule=${own.publicId}`)).body.items.map((item) => item.id)).toEqual(own.deliveryIds);
    expect((await request(owner, `?rule=${another.publicId}`)).body).toEqual({ items: [], nextCursor: null });
    expect((await request(owner)).body.items.map((item) => item.id)).toEqual(own.deliveryIds);
    for (const who of [owner, await creator()]) {
      for (const publicId of [foreign.publicId, 'zzzzzzzzzz']) {
        const result = await request<ApiError>(who, `?rule=${publicId}`);
        expect([result.status, result.body.code]).toEqual([404, 'instagram_rule_not_found']);
      }
    }
  });

  it.each(['?cursor=', '?cursor=bad', '?cursor=a&cursor=b', '?rule=', '?rule=INVALID', '?rule=a&rule=b'])(
    '잘못된 입력 %s는 400이다',
    async (query) => {
      const result = await request<ApiError>(await creator(), query);
      expect([result.status, result.body.code]).toEqual([400, 'validation_failed']);
    },
  );

  it('로그인·사람·페이지 소유자만 조회할 수 있다', async () => {
    const owner = await creator();
    const editor = await creator();
    await t.pool.query('INSERT INTO page_members (page_user_id, member_user_id) VALUES ($1, $2)', [
      owner.userId,
      editor.userId,
    ]);
    expect((await api(t.baseUrl, 'GET', ROOT)).status).toBe(401);
    const denied = await api(t.baseUrl, 'GET', ROOT, {
      cookie: editor.cookie,
      headers: { 'X-Crelink-Page': owner.pageId },
    });
    expect([denied.status, denied.body.code]).toEqual([403, 'page_owner_only']);
    expect(
      (await api(t.baseUrl, 'GET', ROOT, { cookie: owner.cookie, headers: { 'X-Crelink-Page': owner.pageId } })).status,
    ).toBe(200);
    const ai = await createAiOperator(t.pool, 'ig-deliveries-ai@example.com');
    const machine = await api(t.baseUrl, 'GET', ROOT, { token: ai.token });
    expect([machine.status, machine.body.code]).toEqual([403, 'forbidden']);
  });

  it('가용 여부는 audience와 요청 사용자 역할로 계산하며 편집자에게도 값을 준다', async () => {
    const owner = await creator();
    const operator = await creator(true);
    await t.pool.query('INSERT INTO page_members (page_user_id, member_user_id) VALUES ($1, $2), ($2, $1)', [
      owner.userId,
      operator.userId,
    ]);
    for (const [audience, regularAvailable, operatorAvailable] of [
      ['off', false, false],
      ['operators', false, true],
      ['everyone', true, true],
    ] as const) {
      await t.pool.query('UPDATE platform_settings SET instagram_dm_audience = $1', [audience]);
      expect((await landing(owner)).body.instagramDmAvailable).toBe(regularAvailable);
      expect((await landing(operator)).body.instagramDmAvailable).toBe(operatorAvailable);
      const operatorEditor = await landing(operator, owner.pageId);
      expect(operatorEditor.body.pageAccess?.role).toBe('editor');
      expect(operatorEditor.body.instagramDmAvailable).toBe(operatorAvailable);
      expect((await landing(owner, operator.pageId)).body.instagramDmAvailable).toBe(regularAvailable);
      expect(Object.keys(operatorEditor.body.adBlock).sort()).toEqual(['enabled', 'platformEnabled']);
    }
    // 같은 랜딩 상태를 반환하는 쓰기 경로에서도 요청 사용자 역할을 유지합니다.
    await t.pool.query("UPDATE platform_settings SET instagram_dm_audience = 'operators'");
    const updated = await api<CreatorLandingState>(t.baseUrl, 'PATCH', '/api/me/landing', {
      cookie: operator.cookie,
      body: { bio: '운영자 소개' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.instagramDmAvailable).toBe(true);
  });

  it('설정이 없으면 가용 여부는 false, 내역 API는 503이다', async () => {
    const owner = await creator();
    await t.pool.query("UPDATE platform_settings SET instagram_dm_audience = 'everyone'");
    const settings = jest.spyOn(t.app.get(AppConfig), 'instagram', 'get').mockReturnValue(null);
    try {
      expect((await landing(owner)).body.instagramDmAvailable).toBe(false);
      const result = await request<ApiError>(owner);
      expect([result.status, result.body.code]).toEqual([503, 'instagram_not_configured']);
    } finally {
      settings.mockRestore();
    }
  });
});
