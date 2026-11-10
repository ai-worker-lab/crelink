import { randomUUID } from 'node:crypto';
import { CRELINK_API_PATHS, InstagramDmRuleView } from '@crelink/shared';
import { AppConfig } from '../src/config.service';
import { encryptToken } from '../src/instagram/crypto';
import { GraphMedia, InstagramGraph } from '../src/instagram/graph';
import { parseWebhookPayload } from '../src/instagram/webhook-payload';
import { api, createTestApp, login, TestApp } from './test-app';

const RULE_KEYS = [
  'publicId',
  'mediaId',
  'mediaPermalink',
  'mediaCaptionPreview',
  'keyword',
  'message',
  'channelLinkCode',
  'enabled',
  'createdAt',
  'updatedAt',
];
const PRIVATE_RESPONSE_KEYS = ['token', 'commenter_hash', 'comment_id', 'failure_code', 'message_body'];

describe('Instagram 공개 계약 경계 (0268)', () => {
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

  beforeAll(async () => {
    t = await createTestApp({ env });
    graph = jest.spyOn(t.app.get(InstagramGraph), 'listMedia');
    graph.mockImplementation(async () => ({
      items: Array.from({ length: 25 }, (_, i) => media(`post-${i}`)),
      nextCursor: null,
    }));
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await t?.close();
  });

  const media = (id: string): GraphMedia => ({
    id,
    caption: `게시물 ${id}`,
    permalink: `https://www.instagram.com/p/${id}/`,
    thumbnailUrl: null,
    timestamp: '2026-11-11T00:00:00Z',
    mediaType: 'IMAGE',
    childIds: [],
  });
  const creator = async () => {
    sequence += 1;
    const logged = await login(t.baseUrl, `ig-contract-${sequence}|ig-contract-${sequence}@example.com`);
    const connectionId = randomUUID();
    const token = encryptToken(t.app.get(AppConfig).instagram!.tokenKeyring, connectionId, 'test-ig-token');
    await t.pool.query(
      `INSERT INTO instagram_connections (id, user_id, ig_user_id, ig_username, status, token_ciphertext, token_key_version)
       VALUES ($1, $2, $3, 'contract-test', 'active', $4, $5)`,
      [connectionId, logged.body.user!.id, `ig-contract-${sequence}`, token.ciphertext, token.keyVersion],
    );
    return { cookie: logged.cookie!, userId: logged.body.user!.id, connectionId };
  };
  type Creator = Awaited<ReturnType<typeof creator>>;
  const request = <T = Record<string, unknown>>(who: Creator, method: string, path: string, body?: unknown) =>
    api<T>(t.baseUrl, method, path, { cookie: who.cookie, body });

  it('공유 Instagram 경로로 실제 API 라우트에 도달한다', async () => {
    const owner = await creator();
    expect((await request(owner, 'GET', CRELINK_API_PATHS.meInstagram)).status).toBe(200);
    expect((await request(owner, 'GET', CRELINK_API_PATHS.meInstagramRules)).body).toEqual({ rules: [] });
    expect((await request(owner, 'GET', CRELINK_API_PATHS.meInstagramDeliveries)).status).toBe(200);
    const verify = await fetch(
      `${t.baseUrl}${CRELINK_API_PATHS.instagramWebhook}?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=contract-check`,
    );
    expect(verify.status).toBe(200);
    expect(await verify.text()).toBe('contract-check');
  });

  it('키워드·메시지 길이와 활성 규칙 10개 경계를 지키고 공개 응답 키만 반환한다', async () => {
    const owner = await creator();
    const create = (mediaId: string, keyword: string, message: string) =>
      request<InstagramDmRuleView & { code?: string }>(owner, 'POST', CRELINK_API_PATHS.meInstagramRules, {
        mediaId,
        keyword,
        message,
      });

    const first = await create('post-0', '가', '😀');
    expect(first.status).toBe(201);
    expect(Object.keys(first.body).sort()).toEqual([...RULE_KEYS].sort());
    expect(JSON.stringify(first.body)).not.toMatch(new RegExp(PRIVATE_RESPONSE_KEYS.join('|')));

    const updated = await request<InstagramDmRuleView & { code?: string }>(
      owner,
      'PATCH',
      CRELINK_API_PATHS.meInstagramRule(first.body.publicId),
      { keyword: '가'.repeat(30), message: '😀'.repeat(250) },
    );
    expect(updated.status).toBe(200);
    expect(updated.body.keyword).toHaveLength(30);
    expect(Array.from(updated.body.message)).toHaveLength(250);
    for (const invalid of [
      { keyword: '', message: '유효' },
      { keyword: '가'.repeat(31), message: '유효' },
      { keyword: '유효', message: '' },
      { keyword: '유효', message: '😀'.repeat(251) },
    ]) {
      const result = await create('post-1', invalid.keyword, invalid.message);
      expect([result.status, result.body.code]).toEqual([400, 'validation_failed']);
    }

    await t.pool.query(
      `INSERT INTO instagram_dm_rules (public_id, connection_id, ig_media_id, media_permalink, keyword, message, channel_link_code)
       SELECT lpad(i::text, 10, '0'), $1, 'seed-' || i, 'https://instagram.com/p/seed', 'seed', 'message', $2
       FROM generate_series(1, 9) i`,
      [owner.connectionId, first.body.channelLinkCode],
    );
    const atLimit = await request(owner, 'GET', CRELINK_API_PATHS.meInstagramRules);
    expect(atLimit.body.rules).toHaveLength(10);
    const overLimit = await create('post-2', '다음', '안내');
    expect([overLimit.status, overLimit.body.code]).toEqual([409, 'instagram_rule_limit_reached']);
    const list = await request<{ rules: Record<string, unknown>[] }>(owner, 'GET', CRELINK_API_PATHS.meInstagramRules);
    expect(list.body.rules).toHaveLength(10);
    expect(JSON.stringify(list.body)).not.toMatch(new RegExp(PRIVATE_RESPONSE_KEYS.join('|')));
  });

  it.each([
    ['value.id', (id: string) => ({ id })],
    ['value.comment_id', (comment_id: string) => ({ comment_id })],
  ])('%s는 1자·128자 ID를 받고 빈 값·129자를 건너뛴다', (_name, idField) => {
    const valueFor = (id: string) => ({
      field: 'comments',
      value: { ...idField(id), text: '댓글', from: { id: 'f' }, media: { id: 'm' } },
    });
    const payload = (values: unknown[]) => ({ entry: [{ id: 'ig', changes: values }] });
    const parsed = parseWebhookPayload(
      payload([valueFor('x'), valueFor('x'.repeat(128)), valueFor(''), valueFor('x'.repeat(129))]),
      new Date('2026-11-11T00:00:00.000Z'),
    );
    expect(parsed.comments.map((comment) => comment.commentId)).toEqual(['x', 'x'.repeat(128)]);
    expect(parsed.skipped.malformed).toBe(2);
  });
});
