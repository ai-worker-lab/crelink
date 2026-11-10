import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { backendRules } from './backend-rules.ts';
import { forwardPageHeader, isPageOwner, pageIdFromPath } from './page-context.ts';
import { takeInviteToken, INVITE_STORAGE_KEY } from '../invite.ts';
import { errorMessage } from './errors.ts';

const dataModule = (source: string) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function loadModule(path: string, imports: Record<string, string>) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, replacement] of Object.entries(imports)) {
    compiled = compiled
      .replaceAll('"' + name + '"', JSON.stringify(replacement))
      .replaceAll("'" + name + "'", JSON.stringify(replacement));
  }
  return import(dataModule(compiled));
}
const shared = import.meta.resolve('@crelink/shared');
const allowed = (method: string, path: string) =>
  backendRules.some((rule) => rule.methods.includes(method) && rule.pattern.test(path));

describe('공유 페이지 BFF', () => {
  it('공유 경로마다 계약 메서드만 허용하고 UUID 경계를 검사한다', () => {
    for (const [path, methods] of [
      ['api/me/pages', ['GET']],
      ['api/me/page-invites', ['POST', 'DELETE']],
      ['api/me/page-members', ['GET']],
      ['api/me/page-members/me', ['DELETE']],
      ['api/me/page-members/12345678-1234-1234-1234-123456789abc', ['DELETE']],
      ['api/page-invites/preview', ['POST']],
      ['api/page-invites/accept', ['POST']],
    ] as const) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
        assert.equal(allowed(method, path), (methods as readonly string[]).includes(method), method + ' ' + path);
      assert.equal(allowed(methods[0], path + '/extra'), false);
    }
    assert.equal(allowed('DELETE', 'api/me/page-members/not-uuid'), false);
  });

  it('유효한 헤더만 실제 route의 일반·업로드 전달 fetch에 남긴다', async () => {
    const route = await loadModule('../../app/api/backend/[...path]/route.ts', {
      '@crelink/shared': shared,
      '../../../../lib/api/backend-rules': new URL('./backend-rules.ts', import.meta.url).href,
      '../../../../lib/api/page-context': new URL('./page-context.ts', import.meta.url).href,
      '../../../../lib/api/proxy': new URL('./proxy.ts', import.meta.url).href,
      '../../../../lib/api/server': dataModule(
        "export const apiOrigin='https://api.test'; export const apiRequestHeaders=(init)=>new Headers(init);",
      ),
      '../../../../lib/api/visitor-event': dataModule(
        'export const forwardVisitorEvent=()=>{}; export const readVisitorEventBody=()=>{};',
      ),
    });
    const original = globalThis.fetch;
    const received: RequestInit[] = [];
    globalThis.fetch = async (_url, init) => {
      received.push(init!);
      return new Response('{}', { status: 200 });
    };
    try {
      for (const path of ['api/me/landing', 'api/me/files']) {
        for (const value of ['abc123def4', 'ABC123def4', 'abc', 'abc123def4,xyz', '../abc123def4']) {
          const upload = path.endsWith('files');
          const request = new Request('https://web.test/api/backend/' + path, {
            method: upload ? 'POST' : 'PATCH',
            headers: {
              origin: 'https://web.test',
              host: 'web.test',
              'X-Crelink-Page': value,
              'Content-Type': upload ? 'multipart/form-data; boundary=test' : 'application/json',
            },
            body: upload ? 'file-bytes' : '{}',
          });
          Object.assign(request, { nextUrl: new URL(request.url), cookies: { get: () => ({ value: 'session' }) } });
          const response = await route[request.method](request, { params: Promise.resolve({ path: path.split('/') }) });
          assert.equal(response.status, 200);
          const init = received.at(-1)!;
          assert.equal(new Headers(init.headers).get('X-Crelink-Page'), value === 'abc123def4' ? value : null);
          if (upload) {
            assert.equal(new Headers(init.headers).get('Content-Type'), 'multipart/form-data; boundary=test');
            assert.equal(new TextDecoder().decode(init.body as ArrayBuffer), 'file-bytes');
          }
        }
      }
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('브라우저 관리 대상', () => {
  it('browserApi가 개인·공유 관리 경로와 업로드에 붙이고 다른 경로·GET me에는 붙이지 않는다', async () => {
    const { browserApi } = await loadModule('./browser.ts', {
      './errors': new URL('./errors.ts', import.meta.url).href,
      './page-context': new URL('./page-context.ts', import.meta.url).href,
    });
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const calls: RequestInit[] = [];
    globalThis.fetch = async (_url, init) => {
      calls.push(init!);
      return new Response('{}');
    };
    try {
      for (const pathname of [
        '/me/landings/abc123def4',
        '/me/landings/xyz123def4/settings',
        '/invite',
        '/me',
        '/admin',
        '/p/abc123def4',
        '/me/landings/INVALID',
      ]) {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { pathname } } });
        for (const path of ['/api/me/landing', '/api/me/files', '/api/me']) {
          await browserApi(path, {
            headers: { 'X-Crelink-Page': 'forged' },
            ...(path.endsWith('files') ? { method: 'POST', body: new FormData() } : {}),
          });
          assert.equal(
            new Headers(calls.at(-1)!.headers).get('X-Crelink-Page'),
            path === '/api/me' ? null : pageIdFromPath(pathname),
          );
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
  it('헤더가 없거나 잘못됐으면 기존 값도 지운다', () => {
    const target = new Headers({ 'X-Crelink-Page': 'abc123def4' });
    forwardPageHeader(new Headers(), target);
    assert.equal(target.has('X-Crelink-Page'), false);
  });
  it('편집자는 소유자 제어를 숨기며 계약 누락은 소유자다', () => {
    assert.equal(isPageOwner({ role: 'editor' }), false);
    assert.equal(isPageOwner({ role: 'owner' }), true);
    assert.equal(isPageOwner(), true);
  });
});

describe('초대 토큰과 오류', () => {
  it('해시를 읽자마자 주소에서 제거하고 로그인 복귀 토큰은 한 번만 읽는다', () => {
    const events: string[] = [];
    const storage = {
      getItem: (key: string) => {
        assert.equal(key, INVITE_STORAGE_KEY);
        events.push('get');
        return 'saved';
      },
      removeItem: () => {
        events.push('remove');
      },
    };
    assert.equal(
      takeInviteToken(
        { hash: '#new-token', pathname: '/invite', search: '' },
        {
          replaceState: (_data, _unused, url) => {
            events.push(url);
          },
        },
        storage,
      ),
      'new-token',
    );
    assert.deepEqual(events, ['/invite', 'get', 'remove']);
    assert.equal(
      takeInviteToken({ hash: '', pathname: '/invite', search: '' }, { replaceState: () => assert.fail() }, storage),
      'saved',
    );
    assert.equal(
      takeInviteToken(
        { hash: '', pathname: '/invite', search: '' },
        { replaceState: () => {} },
        { getItem: () => null, removeItem: () => {} },
      ),
      null,
    );
  });
  it('저장소 차단 중에도 해시는 지운다', () => {
    let cleared = false;
    assert.equal(
      takeInviteToken(
        { hash: '#token', pathname: '/invite', search: '' },
        {
          replaceState: () => {
            cleared = true;
          },
        },
        {
          getItem: () => {
            throw Error();
          },
          removeItem: () => {},
        },
      ),
      'token',
    );
    assert.equal(cleared, true);
  });
  it('PageErrorCode 전체가 서버 문구 대신 한국어 안내를 갖는다', () => {
    const messages = [
      'page_not_found',
      'page_suspended',
      'page_owner_only',
      'page_member_limit',
      'member_not_found',
      'invite_invalid',
      'invite_own_page',
      'already_member',
    ].map((code) => errorMessage(code, 'SERVER', 403));
    assert.equal(new Set(messages).size, 8);
    for (const message of messages) assert.match(message, /[가-힣]/);
  });
});

describe('편집자 화면 렌더', () => {
  it('광고 스위치는 편집자에게 없고 owner·계약 누락에는 표시한다', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    for (const role of ['editor', 'owner', undefined]) {
      const { AdBlockSwitch } = await loadModule('../../components/manage/AdBlockSwitch.tsx', {
        'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
        '../../lib/api/page-context': new URL('./page-context.ts', import.meta.url).href,
        './ManagerContext': dataModule(
          'export const useManager=()=>(' +
            JSON.stringify({
              state: { pageAccess: role ? { role } : undefined, adBlock: { enabled: true } },
              adBlockAction: { pending: false },
            }) +
            ');',
        ),
      });
      const html = renderToStaticMarkup(AdBlockSwitch());
      assert.equal(html.includes('role="switch"'), role !== 'editor');
    }
  });
});

describe('초대 화면 동작', () => {
  it('토큰은 POST 본문에만 보내며 수락은 대상 관리 주소로 이동하고 오류를 표시한다', async () => {
    const slots: unknown[] = [];
    const effects: Array<() => void> = [];
    let cursor = 0;
    const harness = {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [
          slots[index],
          (value: unknown) => {
            slots[index] = value;
          },
        ];
      },
      useRef(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useEffect(effect: () => void) {
        effects.push(effect);
      },
    };
    Object.assign(globalThis, { __inviteHooks: harness });
    const calls: Array<{ path: string; init: RequestInit }> = [];
    let errorCode: string | null = null;
    Object.assign(globalThis, {
      __inviteApi: async (path: string, init: RequestInit) => {
        calls.push({ path, init });
        if (errorCode) throw Error(errorMessage(errorCode, null, 409));
        return { publicId: 'abc123def4', displayName: '공유 테스트' };
      },
    });
    const { InvitePage } = await loadModule('../../components/InvitePage.tsx', {
      '@crelink/shared': shared,
      'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
      react: dataModule('export const {useState,useRef,useEffect}=globalThis.__inviteHooks;'),
      'next/link': dataModule('export default function Link(){return null}'),
      '../lib/api/browser': dataModule(
        'export class BrowserApiError extends Error{status=401}; export const browserApi=async(...args)=>{try{return await globalThis.__inviteApi(...args)}catch(e){if(e.message.includes("로그인이 필요"))throw new BrowserApiError(e.message);throw e}}; export const describeError=(e)=>e.message;',
      ),
      '../lib/invite': new URL('../invite.ts', import.meta.url).href,
      './ActionStatus': dataModule('export function ActionStatus(){return null}'),
      './SignInLink': dataModule('export function SignInLink(){return null}'),
    });
    const originals = ['window', 'sessionStorage'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
    );
    let hashCleared = false;
    let destination = '';
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          hash: '#private-token',
          pathname: '/invite',
          search: '',
          assign: (url: string) => {
            destination = url;
          },
        },
        history: {
          replaceState: () => {
            hashCleared = true;
          },
        },
      },
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        removeItem: () => {},
        setItem: (key: string, value: string) => {
          assert.equal(key, INVITE_STORAGE_KEY);
          assert.equal(value, 'private-token');
        },
      },
    });
    type Element = { props?: { children?: unknown; onClick?: () => Promise<void>; error?: string; returnTo?: string } };
    const nodes = (tree: unknown): Element[] =>
      Array.isArray(tree)
        ? tree.flatMap(nodes)
        : tree && typeof tree === 'object'
          ? [tree as Element, ...nodes((tree as Element).props?.children)]
          : [];
    const render = () => {
      cursor = 0;
      return InvitePage();
    };
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    try {
      render();
      effects.shift()!();
      await flush();
      assert.equal(hashCleared, true);
      assert.equal(calls[0].path, '/api/page-invites/preview');
      assert.equal(calls[0].init.method, 'POST');
      assert.deepEqual(JSON.parse(calls[0].init.body as string), { token: 'private-token' });
      const accept = nodes(render()).find((node) => node.props?.children === '수락')!;
      errorCode = 'page_member_limit';
      await accept.props!.onClick!();
      await flush();
      assert.equal(
        nodes(render()).some((node) => node.props?.error === errorMessage('page_member_limit', null, 409)),
        true,
      );
      errorCode = null;
      await nodes(render()).find((node) => node.props?.children === '수락')!.props!.onClick!();
      await flush();
      assert.equal(calls.at(-1)!.path, '/api/page-invites/accept');
      assert.equal(calls.at(-1)!.init.method, 'POST');
      assert.deepEqual(JSON.parse(calls.at(-1)!.init.body as string), { token: 'private-token' });
      assert.equal(destination, '/me/landings/abc123def4');
      slots.length = 0;
      effects.length = 0;
      errorCode = 'unauthenticated';
      render();
      effects.shift()!();
      await flush();
      assert.equal(
        nodes(render()).some((node) => node.props?.returnTo === '/invite'),
        true,
      );
    } finally {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
      Reflect.deleteProperty(globalThis, '__inviteApi');
      Reflect.deleteProperty(globalThis, '__inviteHooks');
    }
  });
});

describe('서버 관리 조회', () => {
  it('landing·analytics는 주소 publicId를 보내고 계정 me는 보내지 않는다', async () => {
    const server = await loadModule('./server.ts', {
      'server-only': dataModule(''),
      '@crelink/shared': shared,
      'next/headers': dataModule("export const cookies=async()=>({get:()=>({value:'session'})});"),
      'next/navigation': dataModule("export const redirect=()=>{throw Error('redirect')};"),
      './errors': new URL('./errors.ts', import.meta.url).href,
    });
    const originalFetch = globalThis.fetch;
    const originalOrigin = process.env.API_INTERNAL_URL;
    // server.ts는 모듈 초기화 시 주소를 읽으므로 환경을 정한 별도 모듈을 불러옵니다.
    process.env.API_INTERNAL_URL = 'https://api.test';
    const configured = await loadModule('./server.ts', {
      'server-only': dataModule(' '),
      '@crelink/shared': shared,
      'next/headers': dataModule("export const cookies=async()=>({get:()=>({value:'session'})});"),
      'next/navigation': dataModule("export const redirect=()=>{throw Error('redirect')};"),
      './errors': new URL('./errors.ts', import.meta.url).href,
    });
    assert.equal(typeof server.loadSignedIn, 'function');
    globalThis.fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      const path = new URL(String(_url)).pathname;
      assert.equal(headers.get('X-Crelink-Page'), path === '/api/me' ? null : 'abc123def4');
      assert.equal(headers.get('Cookie'), 'cl_session=session');
      return new Response('{}');
    };
    try {
      for (const path of ['/api/me/landing', '/api/me/analytics?days=7', '/api/me'])
        assert.equal((await configured.loadSignedIn(path, 'abc123def4')).ok, true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalOrigin === undefined) delete process.env.API_INTERNAL_URL;
      else process.env.API_INTERNAL_URL = originalOrigin;
    }
  });
});
