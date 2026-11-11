import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config.service';
import type { Database } from '../database';
import { unifiedLoginFixture } from '../../test/fixtures/instagram-graph.fixtures';
import { InstagramConnectionService, signOAuthState } from './connection.service';
import { FetchInstagramGraph, InstagramGraphError } from './graph';

describe('실측 shape의 synthetic Unified Login — FetchInstagramGraph 경계', () => {
  const graph = new FetchInstagramGraph();
  let fetchMock: jest.SpyInstance;
  const respond = (body: unknown) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
  beforeEach(() => {
    // 기본 구현도 throw: 등록되지 않은 요청이 실 Meta로 새지 않습니다.
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('미등록 fetch');
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('token 200/null 만료 → 검증한 principal → assigned를 반환하고 빈 /me를 조회하지 않는다', async () => {
    const fixture = unifiedLoginFixture();
    respond(fixture.token);
    respond(fixture.principal);
    respond(fixture.assigned);
    const token = await graph.exchangeCode(fixture.config, 'synthetic-code');
    expect(token).toEqual({ accessToken: fixture.token.access_token, expiresAt: null });
    await expect(graph.fetchAccounts(token.accessToken, fixture.config)).resolves.toEqual({
      metaUserId: fixture.principal.data.user_id,
      accounts: [
        { igUserId: fixture.assigned.data[0].id, username: fixture.assigned.data[0].username, isProfessional: true },
      ],
    });
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/v27.0/oauth/access_token',
      '/v27.0/debug_token',
      '/v27.0/me/assigned_instagram_accounts',
    ]);
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe(
      `Bearer ${fixture.config.appId}|${fixture.config.appSecret}`,
    );
  });

  it.each([
    [Object.assign(new TypeError('연결 실패'), { cause: { code: 'ECONNREFUSED' } }), 'connect_failed'],
    [new DOMException('시간 초과', 'TimeoutError'), 'indeterminate'],
  ])('외부 네트워크 오류를 기존 계약으로 분류한다: %s', async (error, kind) => {
    fetchMock.mockRejectedValueOnce(error);
    const fixture = unifiedLoginFixture();
    await expect(graph.fetchAccounts(fixture.token.access_token, fixture.config)).rejects.toMatchObject({
      kind,
      status: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([{ app_id: 'other-app' }, { type: 'USER' }, { is_valid: false }, { user_id: 123 }])(
    'principal 계약 불일치면 assigned 전에 indeterminate: %p',
    async (change) => {
      const fixture = unifiedLoginFixture();
      respond({ data: { ...fixture.principal.data, ...change } });
      await expect(graph.fetchAccounts(fixture.token.access_token, fixture.config)).rejects.toMatchObject({
        kind: 'indeterminate',
        operation: 'fetchAccounts',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('assigned 배열 불일치도 기존 malformed 계약을 보존한다', async () => {
    const fixture = unifiedLoginFixture();
    respond(fixture.principal);
    respond({ data: {} });
    await expect(graph.fetchAccounts(fixture.token.access_token, fixture.config)).rejects.toBeInstanceOf(
      InstagramGraphError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('synthetic 두 계정은 Graph 목록으로 반환하고 기존 서비스가 409로 거부한다', async () => {
    const fixture = unifiedLoginFixture();
    fixture.assigned.data.push({ id: 'synthetic-ig-two', username: 'synthetic_two' });
    respond(fixture.principal);
    respond(fixture.assigned);
    await expect(graph.fetchAccounts(fixture.token.access_token, fixture.config)).resolves.toMatchObject({
      accounts: [{ igUserId: 'synthetic-ig-one' }, { igUserId: 'synthetic-ig-two' }],
    });
    const query = jest
      .fn()
      .mockResolvedValue({ rows: [{ audience: 'everyone', token_revision: null, ig_user_id: null }] });
    const service = new InstagramConnectionService(
      { query } as unknown as Database,
      { instagram: fixture.config } as unknown as AppConfig,
      graph,
    );
    const user = {
      id: '11111111-2222-4333-8444-555555555555',
      email: 'synthetic@example.test',
      role: 'creator' as const,
    };
    const state = signOAuthState(fixture.config.appSecret, {
      uid: user.id,
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: 'synthetic-nonce',
      rev: 0,
    });
    respond(fixture.token);
    respond(fixture.principal);
    respond(fixture.assigned);
    await expect(service.complete(user, 'synthetic-code', state, state)).rejects.toMatchObject({
      status: 409,
      response: { code: 'instagram_account_selection_required' },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
