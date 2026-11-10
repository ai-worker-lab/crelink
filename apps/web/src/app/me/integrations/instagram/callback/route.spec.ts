import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import ts from 'typescript';

const dataModule = (source: string) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const libApi = (file: string) => new URL(`../../../../../lib/api/${file}`, import.meta.url).href;

/** `.ts`/`.tsx`를 변환하고 import를 바꾼 data: 주소를 돌려줍니다. */
async function compile(url: string, imports: Record<string, string>): Promise<string> {
  let compiled = ts.transpileModule(await readFile(new URL(url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, replacement] of Object.entries(imports)) {
    compiled = compiled
      .replaceAll('"' + name + '"', JSON.stringify(replacement))
      .replaceAll("'" + name + "'", JSON.stringify(replacement));
  }
  return dataModule(compiled);
}

type Handler = (request: unknown) => Promise<Response>;
const shared = import.meta.resolve('@crelink/shared');
const empty = dataModule('');
const API_ORIGIN = 'https://api.test';
const SESSION = 'session-token';
const STATE_COOKIE = 'state-cookie-value';
const CODE = 'meta-code-value';
const STATE = 'state-query-value';
const CLEARED_BY_API = 'cl_ig_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure';
const OK_PAGES = {
  pages: [
    { publicId: 'shared00aa', role: 'editor' },
    { publicId: 'abc123def4', role: 'owner' },
  ],
};

async function loadRoute(serverModule: string): Promise<Handler> {
  const authRedirect = await compile(libApi('auth-redirect.ts'), {
    'server-only': empty,
    '@crelink/shared': shared,
    './errors': libApi('errors.ts'),
  });
  const menu = await compile(new URL('../../../../../components/manage/menu.tsx', import.meta.url).href, {
    'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
  });
  const route = await compile(new URL('./route.ts', import.meta.url).href, {
    '@crelink/shared': shared,
    '../../../../../components/manage/menu': menu,
    '../../../../../lib/api/auth-redirect': authRedirect,
    '../../../../../lib/api/server': serverModule,
  });
  return ((await import(route)) as { GET: Handler }).GET;
}

let cookieJar: Record<string, string> = {};
Object.assign(globalThis, { __igCallbackCookies: () => cookieJar });

function callbackRequest(query: string) {
  const request = new Request(`https://web.test/me/integrations/instagram/callback${query}`);
  const get = (name: string) => (cookieJar[name] === undefined ? undefined : { value: cookieJar[name] });
  return Object.assign(request, { nextUrl: new URL(request.url), cookies: { get } });
}

interface Upstream {
  callback?: () => Response;
  pages?: () => Response;
}
interface Call {
  url: string;
  init: RequestInit;
}

describe('Instagram 연결 콜백 route', () => {
  let GET: Handler;
  let calls: Call[] = [];
  const originalFetch = globalThis.fetch;
  const called = (suffix: string) => calls.filter((call) => call.url.endsWith(suffix));
  const callbackCalls = () => called('/api/me/instagram/callback');

  function stubApi({ callback, pages }: Upstream) {
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init: init! });
      if (String(url).endsWith('/api/me/pages')) return pages ? pages() : Response.json(OK_PAGES);
      if (String(url).endsWith('/api/me/instagram/callback') && callback) return callback();
      throw new TypeError('network');
    };
  }
  const apiFailure = (status: number, code: string, setCookies = [CLEARED_BY_API]) => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
    return new Response(JSON.stringify({ code, message: 'x' }), { status, headers });
  };
  const apiSuccess = () =>
    new Response(JSON.stringify({ igUsername: 'ig' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': CLEARED_BY_API },
    });
  const location = (response: Response) => response.headers.get('Location');

  before(async () => {
    process.env.API_INTERNAL_URL = API_ORIGIN;
    const server = await compile(libApi('server.ts'), {
      'server-only': empty,
      '@crelink/shared': shared,
      './errors': libApi('errors.ts'),
      'next/navigation': dataModule('export const redirect=()=>{};'),
      'next/headers': dataModule(
        'export const cookies=async()=>({get:(name)=>{const value=globalThis.__igCallbackCookies()[name];return value===undefined?undefined:{value}}});',
      ),
    });
    GET = await loadRoute(server);
  });
  beforeEach(() => {
    calls = [];
    cookieJar = { cl_session: SESSION, cl_ig_oauth_state: STATE_COOKIE };
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  after(() => {
    delete process.env.API_INTERNAL_URL;
  });

  it('세션·state 쿠키와 code·state를 API로 넘기고 소유 페이지 관리 화면으로 돌아간다', async () => {
    const logged: string[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      mock.method(console, level, (...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
    stubApi({ callback: apiSuccess });
    const response = await GET(callbackRequest(`?code=${CODE}&state=${STATE}`));
    mock.restoreAll();

    assert.equal(response.status, 302);
    assert.equal(location(response), '/me/landings/abc123def4/instagram');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(response.headers.getSetCookie(), [CLEARED_BY_API]);

    const [post] = callbackCalls();
    assert.equal(post.url, `${API_ORIGIN}/api/me/instagram/callback`);
    assert.equal(post.init.method, 'POST');
    assert.equal(post.init.cache, 'no-store');
    assert.deepEqual(JSON.parse(post.init.body as string), { code: CODE, state: STATE });
    assert.equal(
      new Headers(post.init.headers).get('Cookie'),
      `cl_session=${SESSION}; cl_ig_oauth_state=${STATE_COOKIE}`,
    );

    const [lookup] = called('/api/me/pages');
    assert.equal(new Headers(lookup.init.headers).get('Cookie'), `cl_session=${SESSION}`);
    assert.equal(new Headers(lookup.init.headers).has('X-Crelink-Page'), false);

    for (const secret of [CODE, STATE]) {
      assert.equal(location(response)!.includes(secret), false);
      assert.equal(logged.join('\n').includes(secret), false);
    }
  });

  it('API 오류 코드를 instagram_error로 전달하고 API의 쿠키 삭제를 붙인다', async () => {
    for (const [status, code] of [
      [400, 'oauth_state_invalid'],
      [409, 'instagram_account_in_use'],
      [409, 'instagram_account_selection_required'],
      [422, 'instagram_account_not_professional'],
      [502, 'instagram_upstream_failed'],
    ] as const) {
      stubApi({ callback: () => apiFailure(status, code) });
      const response = await GET(callbackRequest(`?code=${CODE}&state=${STATE}`));
      assert.equal(location(response), `/me/landings/abc123def4/instagram?instagram_error=${code}`);
      assert.deepEqual(response.headers.getSetCookie(), [CLEARED_BY_API]);
    }
  });

  it('코드 형식이 아니거나 본문이 깨진 오류는 일반 실패로 바꿔 주소에 싣지 않는다', async () => {
    for (const body of [
      JSON.stringify({ code: 'x&next=//evil.test' }),
      JSON.stringify({ message: 'no code' }),
      '<html>bad gateway</html>',
    ]) {
      stubApi({ callback: () => new Response(body, { status: 502 }) });
      const response = await GET(callbackRequest(`?code=${CODE}&state=${STATE}`));
      assert.equal(location(response), '/me/landings/abc123def4/instagram?instagram_error=instagram_upstream_failed');
    }
  });

  it('사용자가 거부하면 API를 부르지 않고 쿠키를 지운 뒤 거부 코드만 싣는다', async () => {
    stubApi({});
    const response = await GET(
      callbackRequest('?error=access_denied&error_reason=user_denied&error_description=raw%20text'),
    );
    assert.equal(location(response), '/me/landings/abc123def4/instagram?instagram_error=instagram_access_denied');
    assert.equal(callbackCalls().length, 0);
    const [cookie] = response.headers.getSetCookie();
    assert.match(cookie, /^cl_ig_oauth_state=; Path=\/; Max-Age=0;/);
  });

  it('error가 있으면 code가 함께 와도 교환하지 않는다', async () => {
    stubApi({ callback: apiSuccess });
    const response = await GET(callbackRequest(`?error=access_denied&code=${CODE}&state=${STATE}`));
    assert.equal(callbackCalls().length, 0);
    assert.equal(location(response)!.includes(CODE), false);
  });

  it('code나 state가 없으면 API를 부르지 않고 state 오류로 돌려보낸다', async () => {
    stubApi({});
    for (const query of [`?code=${CODE}`, `?state=${STATE}`, '']) {
      const response = await GET(callbackRequest(query));
      assert.equal(location(response), '/me/landings/abc123def4/instagram?instagram_error=oauth_state_invalid');
      assert.match(response.headers.getSetCookie()[0], /^cl_ig_oauth_state=; /);
    }
    assert.equal(callbackCalls().length, 0);
  });

  it('API에 연결하지 못하면 일반 실패로 돌려보낸다', async () => {
    stubApi({});
    const response = await GET(callbackRequest(`?code=${CODE}&state=${STATE}`));
    assert.equal(location(response), '/me/landings/abc123def4/instagram?instagram_error=instagram_upstream_failed');
    assert.match(response.headers.getSetCookie()[0], /^cl_ig_oauth_state=; /);
  });

  it('가드에서 막혀 API가 쿠키를 지우지 않으면 route가 지운다', async () => {
    stubApi({ callback: () => apiFailure(403, 'page_owner_only', []) });
    const response = await GET(callbackRequest(`?code=${CODE}&state=${STATE}`));
    assert.match(response.headers.getSetCookie()[0], /^cl_ig_oauth_state=; /);
    assert.equal(response.headers.getSetCookie().length, 1);
  });

  it('대상 페이지를 알 수 없으면 구글 콜백처럼 성공은 /me, 실패는 /notice로 보낸다', async () => {
    const noOwner = () => Response.json({ pages: [{ publicId: 'shared00aa', role: 'editor' }] });
    const unauthorized = () => Response.json({ code: 'unauthenticated' }, { status: 401 });
    for (const pages of [noOwner, unauthorized]) {
      stubApi({ callback: apiSuccess, pages });
      assert.equal(location(await GET(callbackRequest(`?code=${CODE}&state=${STATE}`))), '/me');

      stubApi({ callback: () => apiFailure(400, 'oauth_state_invalid'), pages });
      assert.equal(
        location(await GET(callbackRequest(`?code=${CODE}&state=${STATE}`))),
        '/notice?reason=oauth_state_invalid',
      );

      stubApi({ callback: () => apiFailure(409, 'instagram_account_in_use'), pages });
      assert.equal(location(await GET(callbackRequest(`?code=${CODE}&state=${STATE}`))), '/notice?reason=oauth_failed');
    }
  });

  it('세션이 없으면 페이지 조회를 하지 않고 /notice로 보낸다', async () => {
    cookieJar = { cl_ig_oauth_state: STATE_COOKIE };
    stubApi({ callback: () => apiFailure(401, 'unauthenticated', []) });
    const response = await GET(callbackRequest(`?code=${CODE}&state=${STATE}`));
    assert.equal(location(response), '/notice?reason=oauth_failed');
    assert.equal(new Headers(callbackCalls()[0].init.headers).get('Cookie'), `cl_ig_oauth_state=${STATE_COOKIE}`);
    assert.equal(called('/api/me/pages').length, 0);
  });

  it('API 주소 설정이 없으면 설정 안내로 보낸다', async () => {
    const unconfigured = await loadRoute(
      dataModule(
        "export const apiOrigin=''; export const apiRequestHeaders=(i)=>new Headers(i); export const serverApi=()=>{};",
      ),
    );
    stubApi({});
    const response = await unconfigured(callbackRequest(`?code=${CODE}&state=${STATE}`));
    assert.equal(location(response), '/notice?reason=auth_not_configured');
    assert.equal(calls.length, 0);
  });
});
