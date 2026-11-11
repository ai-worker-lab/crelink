import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config.service';
import type { Database } from '../database';
import { InstagramConnectionService, signOAuthState } from './connection.service';
import {
  commenterHash,
  decodeSecretKey,
  decryptToken,
  encryptToken,
  parseTokenKeyring,
  signOptOutToken,
  verifyOptOutToken,
} from './crypto';
import {
  businessUseCaseWaitSeconds,
  FetchInstagramGraph,
  GRAPH_API_VERSION,
  InstagramGraphError,
  isGraphTokenInvalid,
} from './graph';

const b64 = (fill: number) => Buffer.alloc(32, fill).toString('base64');
const ROW_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER_ROW_ID = '11111111-2222-4333-8444-555555555555';
const META_TOKEN = `EAA${'Bw0ZCabc123'.repeat(4)}`;

describe('토큰 암호화', () => {
  const keyring = parseTokenKeyring(`1:${b64(1)},2:${b64(2)}`, '2');

  it('암호문은 iv(12) || tag(16) || ct이고 현재 키 버전으로 복호화된다', () => {
    const { ciphertext, keyVersion } = encryptToken(keyring, ROW_ID, META_TOKEN);
    expect(keyVersion).toBe(2);
    expect(ciphertext.length).toBe(12 + 16 + Buffer.byteLength(META_TOKEN));
    expect(ciphertext.toString('utf8')).not.toContain(META_TOKEN);
    expect(decryptToken(keyring, ROW_ID, ciphertext, keyVersion)).toBe(META_TOKEN);
  });

  it('같은 입력도 iv가 달라 암호문이 매번 다르다', () => {
    expect(encryptToken(keyring, ROW_ID, 'x').ciphertext.equals(encryptToken(keyring, ROW_ID, 'x').ciphertext)).toBe(
      false,
    );
  });

  it('다른 행 ID(AAD 위조)로는 복호화되지 않고 오류에 값이 없다', () => {
    const { ciphertext, keyVersion } = encryptToken(keyring, ROW_ID, META_TOKEN);
    let message = '';
    try {
      decryptToken(keyring, OTHER_ROW_ID, ciphertext, keyVersion);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('Instagram 토큰을 복호화하지 못했습니다.');
    expect(message).not.toContain(META_TOKEN);
  });

  it('암호문·태그 변조와 짧은 입력을 거부한다', () => {
    const { ciphertext, keyVersion } = encryptToken(keyring, ROW_ID, META_TOKEN);
    for (const index of [0, 12, ciphertext.length - 1]) {
      const tampered = Buffer.from(ciphertext);
      tampered[index] ^= 1;
      expect(() => decryptToken(keyring, ROW_ID, tampered, keyVersion)).toThrow('복호화하지 못했습니다');
    }
    expect(() => decryptToken(keyring, ROW_ID, Buffer.alloc(27), keyVersion)).toThrow('형식이 틀렸습니다');
  });

  it('키 회전: 옛 버전으로 암호화한 값은 옛 키가 남아 있으면 복호화되고, 새 값은 새 버전으로 암호화된다', () => {
    const oldRing = parseTokenKeyring(`1:${b64(1)}`, '1');
    const old = encryptToken(oldRing, ROW_ID, META_TOKEN);
    expect(old.keyVersion).toBe(1);

    const rotated = parseTokenKeyring(`1:${b64(1)},2:${b64(2)}`, '2');
    expect(decryptToken(rotated, ROW_ID, old.ciphertext, old.keyVersion)).toBe(META_TOKEN);
    const again = encryptToken(rotated, ROW_ID, META_TOKEN);
    expect(again.keyVersion).toBe(2);
    expect(decryptToken(rotated, ROW_ID, again.ciphertext, again.keyVersion)).toBe(META_TOKEN);

    const retired = parseTokenKeyring(`2:${b64(2)}`, '2');
    expect(() => decryptToken(retired, ROW_ID, old.ciphertext, old.keyVersion)).toThrow('키 버전이');
    // 버전 번호만 바꿔도 다른 키라 복호화되지 않습니다.
    expect(() => decryptToken(rotated, ROW_ID, old.ciphertext, 2)).toThrow('복호화하지 못했습니다');
  });

  it('키 묶음 파서: 공백을 허용하고 형식이 틀리면 값 없이 거부한다', () => {
    const ring = parseTokenKeyring(` 1:${b64(1)} , 2:${b64(2)}`, ' 1 ');
    expect(ring.current).toBe(1);
    expect(ring.keys.get(2)).toEqual(Buffer.alloc(32, 2));
    const short = Buffer.alloc(16, 9).toString('base64');
    for (const [keys, current, expected] of [
      ['', '1', 'INSTAGRAM_TOKEN_KEYS'],
      [b64(1), '1', 'INSTAGRAM_TOKEN_KEYS'],
      [`0:${b64(1)}`, '0', 'INSTAGRAM_TOKEN_KEYS'],
      [`32768:${b64(1)}`, '32768', 'INSTAGRAM_TOKEN_KEYS'],
      [`1:${short}`, '1', 'INSTAGRAM_TOKEN_KEYS'],
      [`1:${b64(1)},1:${b64(2)}`, '1', '같은 버전'],
      [`1:${b64(1)}`, '2', 'INSTAGRAM_TOKEN_KEY_CURRENT'],
      [`1:${b64(1)}`, 'one', 'INSTAGRAM_TOKEN_KEY_CURRENT'],
    ] as const) {
      let message = '';
      try {
        parseTokenKeyring(keys, current);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(expected);
      expect(message).not.toContain(b64(1));
      expect(message).not.toContain(short);
    }
  });

  it('비밀 키는 정규형 base64 32바이트만 받는다', () => {
    expect(decodeSecretKey(b64(7), 'K')).toEqual(Buffer.alloc(32, 7));
    for (const value of ['', 'short', b64(7).replace(/=$/, ''), `${b64(7)}x`]) {
      expect(() => decodeSecretKey(value, 'INSTAGRAM_OPT_OUT_KEY')).toThrow('INSTAGRAM_OPT_OUT_KEY');
    }
  });
});

describe('작성자 해시', () => {
  const key = Buffer.alloc(32, 3);

  it('HMAC-SHA256(키, ig_user_id || from.id) 32바이트다', () => {
    const expected = createHmac('sha256', key).update('17841400000000000').update('999').digest();
    expect(commenterHash(key, '17841400000000000', '999')).toEqual(expected);
    expect(expected).toHaveLength(32);
  });

  it('IG 계정·작성자·키가 다르면 값이 다르다', () => {
    const base = commenterHash(key, 'ig-1', 'u-1');
    expect(commenterHash(key, 'ig-2', 'u-1')).not.toEqual(base);
    expect(commenterHash(key, 'ig-1', 'u-2')).not.toEqual(base);
    expect(commenterHash(Buffer.alloc(32, 4), 'ig-1', 'u-1')).not.toEqual(base);
  });
});

describe('수신 거부 토큰', () => {
  const key = Buffer.alloc(32, 5);
  const hash = Buffer.alloc(32, 6);
  const igUserId = '17841400000000000';

  it('왕복하고 base64url이며 약 90자다', () => {
    const token = signOptOutToken(key, igUserId, hash);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).toHaveLength(88);
    expect(verifyOptOutToken(key, token)).toEqual({ igUserId, commenterHash: hash });
  });

  it('형식은 len || ig_user_id || commenter_hash || HMAC 앞 16바이트다', () => {
    const raw = Buffer.from(signOptOutToken(key, igUserId, hash), 'base64url');
    const payload = raw.subarray(0, raw.length - 16);
    expect(payload).toEqual(Buffer.concat([Buffer.from([igUserId.length]), Buffer.from(igUserId), hash]));
    expect(raw.subarray(raw.length - 16)).toEqual(createHmac('sha256', key).update(payload).digest().subarray(0, 16));
  });

  it('다른 키로 서명했거나 내용·MAC을 바꾸면 null이다', () => {
    const token = signOptOutToken(key, igUserId, hash);
    expect(verifyOptOutToken(Buffer.alloc(32, 7), token)).toBeNull();
    const raw = Buffer.from(token, 'base64url');
    for (let index = 0; index < raw.length; index += 1) {
      const tampered = Buffer.from(raw);
      tampered[index] ^= 1;
      expect(verifyOptOutToken(key, tampered.toString('base64url'))).toBeNull();
    }
  });

  it('형식이 아니거나 비정규 표기면 null이다', () => {
    const token = signOptOutToken(key, igUserId, hash);
    for (const bad of ['', '!!!', `${token}A`, token.slice(0, -1), `${token}=`, 'AA', 'AAAA']) {
      expect(verifyOptOutToken(key, bad)).toBeNull();
    }
  });

  it('입력 길이를 검사한다', () => {
    expect(() => signOptOutToken(key, '', hash)).toThrow('ig_user_id');
    expect(() => signOptOutToken(key, 'x'.repeat(256), hash)).toThrow('ig_user_id');
    expect(() => signOptOutToken(key, igUserId, Buffer.alloc(31))).toThrow('commenter_hash');
  });
});

// 수용 기준의 시험 명령(`... test -- "health|migrations|instagram-crypto|sentry"`)에 포함되도록 Graph 경계 시험을 이 파일에 둡니다.
// fetch를 교체하므로 실제 Meta 호출은 없습니다.
describe('Graph 경계', () => {
  const graph = new FetchInstagramGraph();
  const config = { appId: 'app', appSecret: 'app-secret', loginConfigId: 'cfg', redirectUri: 'https://w.test/cb' };
  let fetchMock: jest.SpyInstance;
  let warn: jest.SpyInstance;

  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    fetchMock.mockResolvedValueOnce(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
    );
  const failure = async (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('성공하면 안 됩니다');
      },
      (error: InstagramGraphError) => error,
    );
  const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit & { headers: Record<string, string> }];

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('v27.0 주소를 쓰고 토큰은 URL이 아니라 Authorization 헤더로 보낸다', async () => {
    respond(200, { message_id: 'mid-1' });
    await expect(graph.sendPrivateReply(META_TOKEN, 'ig-1', 'c-1', '본문')).resolves.toEqual({ messageId: 'mid-1' });
    const [url, init] = lastCall();
    expect(GRAPH_API_VERSION).toBe('v27.0');
    expect(url).toBe('https://graph.facebook.com/v27.0/ig-1/messages');
    expect(url).not.toContain(META_TOKEN);
    expect(init.headers.authorization).toBe(`Bearer ${META_TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ recipient: { comment_id: 'c-1' }, message: { text: '본문' } });
  });

  it('오류는 허용된 코드·서브코드만 남기고 응답 원문을 버린다(예외·로그 모두)', async () => {
    respond(400, {
      error: {
        message: `Invalid token ${META_TOKEN} for user creator@example.com`,
        type: 'OAuthException',
        code: 190,
        error_subcode: 2534040,
        error_user_msg: '비공개 문구',
        fbtrace_id: 'trace-abc',
      },
    });
    const error = await failure(graph.subscribeApp(META_TOKEN, 'ig-1'));
    expect(error).toBeInstanceOf(InstagramGraphError);
    expect(error).toMatchObject({ kind: 'rejected', status: 400, code: 190, subcode: 2534040 });
    expect(error.cause).toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe('Graph subscribeApp 실패: kind=rejected status=400 code=190 subcode=2534040');
    const surfaces = [error.message, String(error.stack), JSON.stringify(error), String(warn.mock.calls[0][0])].join();
    for (const raw of [META_TOKEN, 'creator@example.com', 'OAuthException', '비공개 문구', 'trace-abc']) {
      expect(surfaces).not.toContain(raw);
    }
  });

  it('허용 목록 밖의 코드·서브코드와 숫자가 아닌 값은 null로 버린다', async () => {
    respond(400, { error: { code: 999_999, error_subcode: 1 } });
    await expect(failure(graph.listMedia('t', 'ig', null))).resolves.toMatchObject({ code: null, subcode: null });
    respond(400, { error: { code: `190 ${META_TOKEN}`, error_subcode: '2534040' } });
    const error = await failure(graph.listMedia('t', 'ig', null));
    expect(error).toMatchObject({ code: null, subcode: null });
    expect(JSON.stringify(error) + error.message).not.toContain(META_TOKEN);
  });

  it('JSON이 아닌 오류 본문은 코드 없이 처리하고 본문을 남기지 않는다', async () => {
    respond(502, `<html>${META_TOKEN}</html>`);
    const error = await failure(graph.listMedia('t', 'ig', null));
    expect(error).toMatchObject({ kind: 'indeterminate', status: 502, code: null });
    expect(error.message).not.toContain(META_TOKEN);
  });

  it('레이트 제한은 대기 시간을 초로 넘긴다', async () => {
    respond(
      400,
      { error: { code: 80002 } },
      { 'x-business-use-case-usage': JSON.stringify({ id: [{ estimated_time_to_regain_access: 7 }] }) },
    );
    await expect(failure(graph.sendPrivateReply('t', 'ig', 'c', 'm'))).resolves.toMatchObject({
      kind: 'rejected',
      code: 80002,
      retryAfterSeconds: 420,
    });
    expect(businessUseCaseWaitSeconds('not json')).toBeNull();
    expect(businessUseCaseWaitSeconds(null)).toBeNull();
    expect(businessUseCaseWaitSeconds('{"a":[{"estimated_time_to_regain_access":0}]}')).toBeNull();
  });

  it('연결 전 실패는 connect_failed, 타임아웃·끊김·5xx는 indeterminate이고 원인 문구를 남기지 않는다', async () => {
    const cases: Array<[unknown, string]> = [
      [Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), 'connect_failed'],
      [Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }), 'indeterminate'],
      [new DOMException(`timed out ${META_TOKEN}`, 'TimeoutError'), 'indeterminate'],
    ];
    for (const [thrown, kind] of cases) {
      fetchMock.mockRejectedValueOnce(thrown);
      const error = await failure(graph.sendPrivateReply('t', 'ig', 'c', 'm'));
      expect(error).toMatchObject({ kind, status: null, code: null });
      expect(error.message).not.toContain(META_TOKEN);
      expect(error.cause).toBeUndefined();
    }
    respond(503, { error: { code: 190 } });
    await expect(failure(graph.sendPrivateReply('t', 'ig', 'c', 'm'))).resolves.toMatchObject({
      kind: 'indeterminate',
      status: 503,
    });
  });

  it('발송은 200이면 본문을 못 읽어도 성공이다', async () => {
    respond(200, 'not json');
    await expect(graph.sendPrivateReply('t', 'ig', 'c', 'm')).resolves.toEqual({ messageId: null });
  });

  it('토큰 점검은 190이면 invalid, 정상이면 valid이고 그 밖의 실패는 예외다', async () => {
    respond(200, { id: 'ig' });
    await expect(graph.checkToken('t', 'ig')).resolves.toBe('valid');
    respond(400, { error: { code: 190 } });
    await expect(graph.checkToken('t', 'ig')).resolves.toBe('invalid');
    respond(500, {});
    await expect(failure(graph.checkToken('t', 'ig'))).resolves.toMatchObject({ kind: 'indeterminate' });
    expect(isGraphTokenInvalid(new Error('x'))).toBe(false);
  });

  it('code 교환은 시크릿을 URL이 아니라 폼 본문으로 보내고 만료를 계산한다', async () => {
    respond(200, { access_token: META_TOKEN, expires_in: 3600 });
    const before = Date.now();
    const token = await graph.exchangeCode(config, 'auth-code');
    expect(token.accessToken).toBe(META_TOKEN);
    expect(token.expiresAt!.getTime()).toBeGreaterThanOrEqual(before + 3600_000);
    const [url, init] = lastCall();
    expect(url).toBe('https://graph.facebook.com/v27.0/oauth/access_token');
    expect(init.body).toContain('client_secret=app-secret');
    expect(url).not.toContain('app-secret');

    respond(200, { access_token: META_TOKEN });
    await expect(graph.exchangeCode(config, 'c')).resolves.toMatchObject({ expiresAt: null });
    respond(200, {});
    await expect(failure(graph.exchangeCode(config, 'c'))).resolves.toMatchObject({ kind: 'indeterminate' });
  });

  it('게시물 목록을 경계 형식으로 바꾼다', async () => {
    respond(200, {
      data: [
        {
          id: 'm-1',
          permalink: 'https://i/p',
          timestamp: '2026-11-11T00:00:00+0000',
          media_url: 'https://cdn/x.jpg',
          media_type: 'CAROUSEL_ALBUM',
          children: { data: [{ id: 'c-1' }] },
        },
        { id: 'no-permalink' },
      ],
      paging: { cursors: { after: 'next-1' }, next: 'https://graph/next' },
    });
    await expect(graph.listMedia('t', 'ig/../x', 'a b')).resolves.toEqual({
      items: [
        {
          id: 'm-1',
          caption: '',
          permalink: 'https://i/p',
          thumbnailUrl: 'https://cdn/x.jpg',
          timestamp: '2026-11-11T00:00:00+0000',
          mediaType: 'CAROUSEL_ALBUM',
          childIds: ['c-1'],
        },
      ],
      nextCursor: 'next-1',
    });
    const [url] = lastCall();
    expect(url).toContain('/ig%2F..%2Fx/media?');
    expect(url).toContain('limit=25');
    expect(url).toContain('after=a+b');

    respond(200, { data: [], paging: { cursors: { after: 'x' } } });
    await expect(graph.listMedia('t', 'ig', null)).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('공개 답글은 댓글 replies에 POST하고 토큰을 헤더로 보낸다', async () => {
    respond(200, { id: 'reply-1' });
    await expect(graph.replyToComment(META_TOKEN, 'c/a', '보냈어요')).resolves.toEqual({ commentId: 'reply-1' });
    const [url, init] = lastCall();
    expect(url).toBe('https://graph.facebook.com/v27.0/c%2Fa/replies');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe(`Bearer ${META_TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ message: '보냈어요' });
    respond(400, { error: { code: 190 } });
    await expect(failure(graph.replyToComment('t', 'c', 'm'))).resolves.toMatchObject({ kind: 'rejected', code: 190 });
  });

  it('공개 답글 ID가 없는 성공 응답은 불확정 실패로 처리한다', async () => {
    respond(200, {});
    await expect(failure(graph.replyToComment('t', 'c', 'm'))).resolves.toMatchObject({ kind: 'indeterminate' });
  });

  it.each([{}, { client_business_id: null }, { client_business_id: 123 }, { client_business_id: 'business' }])(
    'client_business_id는 필수가 아니며 BISU와 assigned 계정만 사용한다: %p',
    async (optionalFields) => {
      respond(200, {
        id: 'bisu',
        ...optionalFields,
        accounts: { data: [{ instagram_business_account: { id: 'page-ig', username: 'unused' } }] },
      });
      respond(200, { data: [{ id: 'ig', username: 'me' }] });
      await expect(graph.fetchAccounts(META_TOKEN)).resolves.toEqual({
        metaUserId: 'bisu',
        accounts: [{ igUserId: 'ig', username: 'me', isProfessional: true }],
      });
      expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method, init.headers.authorization])).toEqual([
        ['https://graph.facebook.com/v27.0/me?fields=id%2Cclient_business_id', 'GET', `Bearer ${META_TOKEN}`],
        [
          'https://graph.facebook.com/v27.0/me/assigned_instagram_accounts?fields=id%2Cusername',
          'GET',
          `Bearer ${META_TOKEN}`,
        ],
      ]);
    },
  );

  it.each([{}, { id: '' }, { client_business_id: 'business' }, { id: 123, client_business_id: 'business' }])(
    'BISU 필수 식별자가 없으면 assigned 조회 전에 실패한다: %p',
    async (body) => {
      respond(200, body);
      await expect(graph.fetchAccounts('t')).rejects.toBeInstanceOf(InstagramGraphError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { data: [] },
    {
      data: [
        { id: 'one', username: 'one' },
        { id: 'two', username: 'two' },
      ],
    },
  ])('client_business_id 없이도 0개·복수개를 전달하고 서비스는 409로 거부한다: %p', async ({ data }) => {
    respond(200, { id: 'bisu' });
    respond(200, { data });
    const result = await graph.fetchAccounts('t');
    expect(result.accounts).toHaveLength(data.length);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const query = jest.fn().mockResolvedValue({
      rows: [{ audience: 'everyone', token_revision: null, ig_user_id: null }],
    });
    const service = new InstagramConnectionService(
      { query } as unknown as Database,
      { instagram: config } as unknown as AppConfig,
      graph,
    );
    const user = { id: ROW_ID, email: 'creator@example.test', role: 'creator' as const };
    const state = signOAuthState(config.appSecret, {
      uid: user.id,
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: 'nonce',
      rev: 0,
    });
    respond(200, { access_token: META_TOKEN });
    respond(200, { id: 'bisu' });
    respond(200, { data });
    await expect(service.complete(user, 'code', state, state)).rejects.toMatchObject({
      status: 409,
      response: { code: 'instagram_account_selection_required' },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it.each([
    {},
    { data: null },
    { data: [{}] },
    { data: [{ id: 'ig' }] },
    { data: [{ username: 'me' }] },
    {
      data: [
        { id: 'ig', username: 'me' },
        { id: 'ig', username: 'me' },
      ],
    },
  ])('assigned 목록이 불완전하면 일부 계정만 반환하지 않는다: %p', async (body) => {
    respond(200, { id: 'bisu' });
    respond(200, body);
    await expect(graph.fetchAccounts('t')).rejects.toBeInstanceOf(InstagramGraphError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([100, 190, 500])('assigned 오류 %s는 대체 경로 없이 실패한다', async (code) => {
    respond(200, { id: 'bisu' });
    respond(code === 500 ? 500 : 400, { error: { code } });
    await expect(graph.fetchAccounts('t')).rejects.toBeInstanceOf(InstagramGraphError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('BISU 조회 오류도 대체 경로 없이 실패한다', async () => {
    respond(400, { error: { code: 190 } });
    await expect(failure(graph.fetchAccounts('t'))).resolves.toMatchObject({ code: 190 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('assigned 다음 페이지도 확인하고 next URL 대신 cursor만 사용한다', async () => {
    respond(200, { id: 'bisu' });
    respond(200, {
      data: [{ id: 'one', username: 'one' }],
      paging: { next: 'https://untrusted.test/next', cursors: { after: 'a b&c' } },
    });
    respond(200, { data: [{ id: 'two', username: 'two' }], paging: { cursors: { after: 'last' } } });
    const result = await graph.fetchAccounts('t');
    expect(result.accounts.map((account) => account.igUserId)).toEqual(['one', 'two']);
    expect(lastCall()[0]).toBe(
      'https://graph.facebook.com/v27.0/me/assigned_instagram_accounts?fields=id%2Cusername&after=a+b%26c',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('다음 페이지 실패는 첫 페이지의 한 계정을 반환하지 않는다', async () => {
    respond(200, { id: 'bisu' });
    respond(200, { data: [{ id: 'one', username: 'one' }], paging: { next: 'next', cursors: { after: 'a' } } });
    respond(500, {});
    await expect(graph.fetchAccounts('t')).rejects.toBeInstanceOf(InstagramGraphError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([{ next: 'next' }, { next: 'next', cursors: { after: '' } }, { next: 123, cursors: { after: 'a' } }])(
    '다음 페이지 정보가 불완전하면 실패한다: %p',
    async (paging) => {
      respond(200, { id: 'bisu' });
      respond(200, { data: [{ id: 'one', username: 'one' }], paging });
      await expect(graph.fetchAccounts('t')).rejects.toBeInstanceOf(InstagramGraphError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('페이지 cursor 반복은 실패한다', async () => {
    respond(200, { id: 'bisu' });
    for (let i = 0; i < 2; i++) respond(200, { data: [], paging: { next: 'next', cursors: { after: 'a' } } });
    await expect(graph.fetchAccounts('t')).rejects.toBeInstanceOf(InstagramGraphError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('10쪽 뒤에도 다음 페이지가 있으면 불완전한 목록을 반환하지 않는다', async () => {
    respond(200, { id: 'bisu' });
    for (let i = 0; i < 10; i++) respond(200, { data: [], paging: { next: 'next', cursors: { after: String(i) } } });
    await expect(graph.fetchAccounts('t')).rejects.toBeInstanceOf(InstagramGraphError);
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it('assigned 계정 10개 초과는 페이지를 넘어도 실패한다', async () => {
    respond(200, { id: 'bisu' });
    respond(200, {
      data: Array.from({ length: 10 }, (_, i) => ({ id: String(i), username: 'me' })),
      paging: { next: 'next', cursors: { after: 'a' } },
    });
    respond(200, { data: [{ id: 'eleven', username: 'me' }] });
    await expect(graph.fetchAccounts('t')).rejects.toBeInstanceOf(InstagramGraphError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('구독·해제와 동의 URL', async () => {
    respond(200, { success: true });
    await graph.subscribeApp('t', 'ig');
    expect(lastCall()[0]).toBe('https://graph.facebook.com/v27.0/ig/subscribed_apps?subscribed_fields=comments');
    expect(lastCall()[1].method).toBe('POST');
    respond(200, { success: true });
    await graph.unsubscribeApp('t', 'ig');
    expect(lastCall()[1].method).toBe('DELETE');

    const url = new URL(graph.authorizationUrl(config, 'signed.state+한글&nonce=1'));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/dialog/oauth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'app',
      redirect_uri: 'https://w.test/cb',
      config_id: 'cfg',
      override_default_response_type: 'true',
      response_type: 'code',
      display: 'popup',
      prompt: 'login',
      state: 'signed.state+한글&nonce=1',
    });
  });
});
