// AI 운영자 토큰 경로 `/api/agent/[...path]` 판정과 공용 전달 도구(설계 docs/specs/crelink-ai-operator.md `웹 토큰 경로`).
// 실행: pnpm --filter @crelink/web test
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import {
  AGENT_TARGET_PATTERN,
  agentForwardHeaders,
  agentProxyPath,
  agentRequestRejection,
  agentTargetUrl,
} from './agent-proxy.ts';
import { forwardToApi, pickResponseHeaders, proxyErrorResponse } from './proxy.ts';

const API = 'http://api.test:3000';

describe('허용 경로(조각 경계 고정)', () => {
  it('api/health·api/me는 정확히, api/me/…·api/files/…·api/admin/…는 아래 경로를 받는다', () => {
    assert.equal(agentProxyPath(['api', 'health']), 'api/health');
    assert.equal(agentProxyPath(['api', 'me']), 'api/me');
    assert.equal(agentProxyPath(['api', 'me', 'landing']), 'api/me/landing');
    assert.equal(agentProxyPath(['api', 'files', 'f1']), 'api/files/f1');
    assert.equal(agentProxyPath(['api', 'admin', 'ai-operator']), 'api/admin/ai-operator');
    assert.equal(agentProxyPath(['api', 'admin', 'agent-runs', 'r1']), 'api/admin/agent-runs/r1');
  });

  it('조각 경계를 넘거나 목록 밖 경로는 거절한다', () => {
    for (const segments of [
      ['api', 'healthz'],
      ['api', 'health', 'x'],
      ['api', 'mex'],
      ['api', 'files'],
      ['api', 'admin'],
      ['api', 'administrator', 'x'],
      ['api', 'auth', 'logout'],
      ['api', 'public', 'landings', 'abc'],
      ['api', 'landings', 'abc', 'guestbook'],
      ['health'],
      [],
    ]) {
      assert.equal(agentProxyPath(segments), null, segments.join('/'));
    }
  });

  it('빈 조각·`.`·`..`(디코드 뒤)은 거절한다', () => {
    assert.equal(agentProxyPath(['api', 'admin', '', 'x']), null);
    assert.equal(agentProxyPath(['api', 'admin', '.', 'x']), null);
    assert.equal(agentProxyPath(['api', 'admin', '..', 'auth']), null);
    assert.equal(agentProxyPath(['api', 'me', '..']), null);
  });

  it('조각 안의 `/`·`?`는 인코딩해 한 조각으로 넘긴다', () => {
    assert.equal(agentProxyPath(['api', 'admin', 'a/b?c']), 'api/admin/a%2Fb%3Fc');
  });
});

describe('대상 URL pathname 재검사', () => {
  it('허용 경로는 쿼리를 그대로 붙인다', () => {
    const target = agentTargetUrl(API, 'api/admin/actions', new URLSearchParams('actor=ai&cursor=abc'));
    assert.equal(target?.toString(), `${API}/api/admin/actions?actor=ai&cursor=abc`);
  });

  it('URL 정규화로 허용 경로를 벗어나면(퍼센트 인코딩 점 조각) 거절한다', () => {
    assert.equal(agentTargetUrl(API, 'api/admin/%2e%2e/%2e%2e/internal', new URLSearchParams()), null);
    assert.equal(agentTargetUrl(API, 'api/me/%2E%2E', new URLSearchParams()), null);
    assert.equal(AGENT_TARGET_PATTERN.test('/api/me/'), true);
    assert.equal(AGENT_TARGET_PATTERN.test('/api/me'), true);
    assert.equal(AGENT_TARGET_PATTERN.test('/api/mex'), false);
  });
});

describe('Bearer 스킴과 Origin', () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it('Authorization이 `Bearer <값>`이 아니면 401 unauthenticated', () => {
    assert.equal(agentRequestRejection(headers({})), 'unauthenticated');
    assert.equal(agentRequestRejection(headers({ authorization: 'Basic dTpw' })), 'unauthenticated');
    assert.equal(agentRequestRejection(headers({ authorization: 'bearer crl_ai_x' })), 'unauthenticated');
    assert.equal(agentRequestRejection(headers({ authorization: 'Bearer' })), 'unauthenticated');
    assert.equal(agentRequestRejection(headers({ authorization: 'Bearer ' })), 'unauthenticated');
    assert.equal(agentRequestRejection(headers({ cookie: 'cl_session=s' })), 'unauthenticated');
  });

  it('Origin 헤더가 있으면(브라우저) 403 forbidden', () => {
    assert.equal(
      agentRequestRejection(headers({ authorization: 'Bearer crl_ai_x', origin: 'https://links.shaul.kr' })),
      'forbidden',
    );
    assert.equal(agentRequestRejection(headers({ authorization: 'Bearer crl_ai_x', origin: 'null' })), 'forbidden');
  });

  it('Bearer 토큰이 있고 Origin이 없으면 통과', () => {
    assert.equal(agentRequestRejection(headers({ authorization: 'Bearer crl_ai_x' })), null);
  });
});

describe('API로 넘길 요청 헤더', () => {
  it('Authorization·X-Crelink-Agent-Run만 새 헤더에 복사하고 쿠키·그 밖은 버린다', () => {
    const incoming = new Headers({
      authorization: 'Bearer crl_ai_x',
      'x-crelink-agent-run': '7d0c1a52-6b7e-4a3f-9d6f-0a1b2c3d4e5f',
      cookie: 'cl_session=s',
      'x-crelink-internal': 'forged',
      'x-forwarded-for': '1.2.3.4',
      origin: 'https://evil.example',
    });
    const forwarded = agentForwardHeaders(incoming, new Headers({ Accept: 'application/json' }));
    assert.deepEqual([...forwarded.entries()].sort(), [
      ['accept', 'application/json'],
      ['authorization', 'Bearer crl_ai_x'],
      ['x-crelink-agent-run', '7d0c1a52-6b7e-4a3f-9d6f-0a1b2c3d4e5f'],
    ]);
  });
});

describe('공용 전달 도구(proxy.ts)', () => {
  it('오류 응답은 API와 같은 `{ code, message }` 형식', async () => {
    const response = proxyErrorResponse('route_not_allowed');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: 'route_not_allowed', message: '허용되지 않은 API 요청이에요.' });
    assert.equal(proxyErrorResponse('unauthenticated').status, 401);
    assert.equal(proxyErrorResponse('forbidden').status, 403);
  });

  it('응답 헤더는 content-type·cache-control·etag·last-modified만, Set-Cookie는 setCookie일 때만', () => {
    const upstream = new Headers({
      'content-type': 'application/json',
      'cache-control': 'no-store',
      etag: '"1"',
      'last-modified': 'Sat, 10 Oct 2026 00:00:00 GMT',
      'x-powered-by': 'Express',
      'access-control-allow-origin': '*',
    });
    upstream.append('set-cookie', 'cl_session=a; HttpOnly');
    upstream.append('set-cookie', 'cl_vid=b');
    const agent = pickResponseHeaders(upstream, { setCookie: false });
    assert.deepEqual([...agent.keys()].sort(), ['cache-control', 'content-type', 'etag', 'last-modified']);
    assert.deepEqual(pickResponseHeaders(upstream, { setCookie: true }).getSetCookie(), [
      'cl_session=a; HttpOnly',
      'cl_vid=b',
    ]);
  });

  it('본문 바이트와 Content-Type을 그대로 넘기고 Set-Cookie 없이 상태·본문을 돌려준다', async () => {
    let received: { method?: string; headers?: IncomingMessage['headers']; body?: Buffer } = {};
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received = { method: request.method, headers: request.headers, body: Buffer.concat(chunks) };
        response.writeHead(201, { 'content-type': 'application/json', 'set-cookie': 'cl_session=leak' });
        response.end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const bytes = new Uint8Array([0, 1, 2, 255]);
      const response = await forwardToApi(
        new URL(`http://127.0.0.1:${port}/api/me/files`),
        {
          method: 'POST',
          headers: new Headers({ 'Content-Type': 'multipart/form-data; boundary=x' }),
          body: bytes.buffer,
        },
        { setCookie: false },
      );
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.deepEqual(await response.json(), { ok: true });
      assert.equal(received.method, 'POST');
      assert.equal(received.headers?.['content-type'], 'multipart/form-data; boundary=x');
      assert.deepEqual([...(received.body ?? [])], [0, 1, 2, 255]);
    } finally {
      server.close();
    }
  });

  it('API에 연결하지 못하면 502 upstream_unavailable', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const response = await forwardToApi(
      new URL(`http://127.0.0.1:${port}/api/health`),
      { method: 'GET', headers: new Headers() },
      { setCookie: false },
    );
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'upstream_unavailable');
  });
});
