import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { backendRules } from './backend-rules.ts';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
const allowed = (method: string, path: string) =>
  backendRules.some((rule) => rule.methods.includes(method) && rule.pattern.test(path));

describe('Instagram DM BFF 허용 목록', () => {
  it('계약의 메서드만 허용한다', () => {
    for (const [path, methods] of [
      ['api/me/instagram', ['GET', 'DELETE']],
      ['api/me/instagram/connect', ['POST']],
      ['api/me/instagram/recheck', ['POST']],
      ['api/me/instagram/pause', ['PUT']],
      ['api/me/instagram/media', ['GET']],
      ['api/me/instagram/deliveries', ['GET']],
      ['api/me/instagram/rules', ['GET', 'POST']],
      ['api/me/instagram/rules/abc123def4', ['PATCH', 'DELETE']],
      ['api/public/instagram-dm-opt-outs', ['POST']],
    ] as const) {
      for (const method of METHODS) {
        assert.equal(allowed(method, path), (methods as readonly string[]).includes(method), `${method} ${path}`);
      }
      assert.equal(allowed(methods[0], `${path}/extra`), false, `${path}/extra`);
    }
  });

  it('콜백·웹훅과 계약에 없는 경로는 어떤 메서드로도 막는다', () => {
    for (const path of [
      'api/me/instagram/callback',
      'api/webhooks/instagram',
      'api/webhooks/instagram/data-deletion',
      'api/me/instagramx',
      'api/me/instagram/',
      'api/me/instagram/unknown',
      'api/me/instagram/rules/..',
      'api/me/instagram/rules/ABC123DEF4',
      'api/me/instagram/rules/abc123def',
      'api/me/instagram/rules/abc123def4x',
      'api/me/instagram/rules/..%2F..%2Fadmin',
      'x/api/me/instagram',
      'api/public/instagram-dm-opt-outsx',
    ]) {
      for (const method of METHODS) assert.equal(allowed(method, path), false, `${method} ${path}`);
    }
  });
});

const dataModule = (source: string) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

async function loadBffRoute() {
  const source = await readFile(new URL('../../app/api/backend/[...path]/route.ts', import.meta.url), 'utf8');
  let compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, replacement] of Object.entries({
    '@crelink/shared': import.meta.resolve('@crelink/shared'),
    '../../../../lib/api/backend-rules': new URL('./backend-rules.ts', import.meta.url).href,
    '../../../../lib/api/page-context': new URL('./page-context.ts', import.meta.url).href,
    '../../../../lib/api/proxy': new URL('./proxy.ts', import.meta.url).href,
    '../../../../lib/api/server': dataModule(
      "export const apiOrigin='https://api.test'; export const apiRequestHeaders=(init)=>new Headers(init);",
    ),
    '../../../../lib/api/visitor-event': dataModule(
      'export const forwardVisitorEvent=(body,send)=>send(body); export const readVisitorEventBody=async()=>({type: "pageview"});',
    ),
  })) {
    compiled = compiled
      .replaceAll('"' + name + '"', JSON.stringify(replacement))
      .replaceAll("'" + name + "'", JSON.stringify(replacement));
  }
  return import(dataModule(compiled));
}

describe('Instagram DM BFF 전달', () => {
  async function send(path: string, requestHeaders: Record<string, string>, method = 'POST', session?: string) {
    const route = await loadBffRoute();
    const original = globalThis.fetch;
    const upstream: string[] = [];
    const forwardedHeaders: Headers[] = [];
    globalThis.fetch = async (url, init) => {
      forwardedHeaders.push(new Headers(init?.headers));
      upstream.push(String(url));
      return new Response(null, { status: 204 });
    };
    try {
      const request = new Request(`https://web.test/api/backend/${path}`, {
        method,
        headers: requestHeaders,
        body: method === 'GET' ? undefined : '{"token":"opaque"}',
      });
      Object.assign(request, {
        nextUrl: new URL(request.url),
        cookies: { get: () => (session ? { value: session } : undefined) },
      });
      const response = (await route[method](request, {
        params: Promise.resolve({ path: path.split('/') }),
      })) as Response;
      return { response, upstream, forwardedHeaders };
    } finally {
      globalThis.fetch = original;
    }
  }

  it('로그인 세션은 랜딩 방문 수집에만 전달하고 가입 경로 수집에는 전달하지 않는다', async () => {
    const headers = { origin: 'https://web.test', host: 'web.test' };
    for (const [path, expectedCookie] of [
      ['api/landings/abc123def4/events', 'cl_session=owner-test-session'],
      ['api/signup-funnel/events', null],
    ] as const) {
      const result = await send(path, headers, 'POST', 'owner-test-session');
      assert.equal(result.response.status, 204, path);
      assert.equal(result.forwardedHeaders.length, 1, path);
      assert.equal(result.forwardedHeaders[0]!.get('cookie'), expectedCookie, path);
    }
    const anonymous = await send('api/landings/abc123def4/events', headers);
    assert.equal(anonymous.response.status, 204);
    assert.equal(anonymous.forwardedHeaders[0]!.get('cookie'), null);
  });

  it('공개 수신 거부의 IP 전달과 소유자 경로의 세션 전달을 유지한다', async () => {
    const result = await send('api/public/instagram-dm-opt-outs', {
      origin: 'https://web.test',
      host: 'web.test',
      'x-forwarded-for': '192.0.2.123',
    });
    assert.equal(result.response.status, 204);
    assert.equal(result.forwardedHeaders[0]!.get('x-forwarded-for'), '192.0.2.123');
    const owner = await send(
      'api/me/instagram/connect',
      {
        origin: 'https://web.test',
        host: 'web.test',
      },
      'POST',
      'owner-test-session',
    );
    assert.equal(owner.response.status, 204);
    assert.equal(owner.forwardedHeaders[0]!.get('cookie'), 'cl_session=owner-test-session');
  });

  it('같은 출처의 공개 수신 거부만 API로 넘긴다', async () => {
    const path = 'api/public/instagram-dm-opt-outs';
    const accepted = await send(path, { origin: 'https://web.test', host: 'web.test' });
    assert.equal(accepted.response.status, 204);
    assert.deepEqual(accepted.upstream, [`https://api.test/${path}`]);

    const rejectedHeaders: Record<string, string>[] = [
      { origin: 'https://evil.test', host: 'web.test' },
      { host: 'web.test' },
    ];
    for (const headers of rejectedHeaders) {
      const rejected = await send(path, headers);
      assert.equal(rejected.response.status, 403);
      assert.equal(((await rejected.response.json()) as { code: string }).code, 'forbidden');
      assert.deepEqual(rejected.upstream, []);
    }
  });

  it('다른 출처의 소유자 변경 요청은 API로 넘기지 않는다', async () => {
    const rejected = await send('api/me/instagram/connect', { origin: 'https://evil.test', host: 'web.test' });
    assert.equal(rejected.response.status, 403);
    assert.deepEqual(rejected.upstream, []);
  });

  it('허용 목록 밖 경로는 같은 출처여도 API로 넘기지 않는다', async () => {
    for (const path of ['api/webhooks/instagram', 'api/me/instagram/callback', 'api/internal/anything']) {
      const rejected = await send(path, { origin: 'https://web.test', host: 'web.test' });
      assert.equal(rejected.response.status, 404, path);
      assert.equal(((await rejected.response.json()) as { code: string }).code, 'route_not_allowed', path);
      assert.deepEqual(rejected.upstream, [], path);
    }
  });
});
