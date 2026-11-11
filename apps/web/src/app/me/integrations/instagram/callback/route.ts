import { COOKIE_NAMES, CRELINK_API_PATHS, type ApiError, type ManagedPagesResponse } from '@crelink/shared';
import type { NextRequest } from 'next/server';
import { managerHref } from '../../../../../components/manage/menu';
import { noticeLocation, redirectWithCookies } from '../../../../../lib/api/auth-redirect';
import { apiOrigin, apiRequestHeaders, serverApi } from '../../../../../lib/api/server';

export const dynamic = 'force-dynamic';

/** API가 발급하는 state 쿠키 이름(`apps/api/src/instagram/connection.service.ts`). 공유 계약 `COOKIE_NAMES`에는 없습니다. */
const OAUTH_STATE_COOKIE = 'cl_ig_oauth_state';
/** API 응답이 없는 경로의 state 쿠키 삭제. https 응답은 `Secure` 없이도 같은 이름을 지웁니다(`returnToCookie(null, [])`와 같음). */
const EXPIRED_OAUTH_STATE_COOKIE = `${OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`;
/** 동의 화면에서 거부한 경우. Meta가 보낸 `error` 값은 주소로 옮기지 않습니다. */
const ACCESS_DENIED = 'instagram_access_denied';
/** API에 닿지 못했거나 응답에 쓸 수 있는 코드가 없을 때. */
const UPSTREAM_FAILED = 'instagram_upstream_failed';

/** 연결은 항상 세션 사용자 본인 페이지에 저장되므로(`InstagramConnectionService.complete`) 돌아갈 곳도 본인 페이지입니다. */
async function ownPagePublicId(): Promise<string | null> {
  try {
    const { pages } = await serverApi<ManagedPagesResponse>(CRELINK_API_PATHS.pages, { session: true });
    return pages.find((page) => page.role === 'owner')?.publicId ?? null;
  } catch {
    return null;
  }
}

/** 관리 화면으로 돌아갑니다. 대상 페이지를 알 수 없으면 구글 로그인 콜백처럼 성공은 `/me`, 실패는 `/notice`로 보냅니다. */
async function finish(failure: string | null, setCookies: readonly string[]): Promise<Response> {
  const publicId = await ownPagePublicId();
  if (!publicId) return redirectWithCookies(failure ? noticeLocation(failure) : '/me', setCookies);
  const screen = managerHref(publicId, 'instagram');
  return redirectWithCookies(failure ? `${screen}?instagram_error=${failure}` : screen, setCookies);
}

/** API 오류 코드만 주소에 씁니다. 코드 형식이 아니면 일반 실패로 봅니다. 화면은 아는 코드만 안내합니다. */
function failureCode(code: string | undefined): string {
  return code && /^[a-z][a-z0-9_]*$/.test(code) ? code : UPSTREAM_FAILED;
}

/**
 * Instagram 연결 콜백(docs/specs/instagram-comment-dm.md `OAuth·토큰·삭제`): 세션 쿠키, `cl_ig_oauth_state` 쿠키, code·state를
 * API로 보내고 관리 화면으로 돌아갑니다. 실패는 `?instagram_error=<코드>`로 표시합니다. code·state는 주소와 로그에 남기지 않습니다.
 */
export async function GET(request: NextRequest) {
  const clearState = [EXPIRED_OAUTH_STATE_COOKIE];
  if (!apiOrigin) return redirectWithCookies(noticeLocation('auth_not_configured'), clearState);
  const query = request.nextUrl.searchParams;
  if (query.has('error')) return finish(ACCESS_DENIED, clearState);
  const code = query.get('code');
  const state = query.get('state');
  if (!code || !state) return finish('oauth_state_invalid', clearState);

  const headers = apiRequestHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' });
  const cookies = [COOKIE_NAMES.session, OAUTH_STATE_COOKIE].flatMap((name) => {
    const value = request.cookies.get(name)?.value;
    return value ? [`${name}=${value}`] : [];
  });
  if (cookies.length) headers.set('Cookie', cookies.join('; '));
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}${CRELINK_API_PATHS.meInstagramCallback}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code, state }),
      cache: 'no-store',
    });
  } catch {
    return finish(UPSTREAM_FAILED, clearState);
  }
  const setCookies = response.headers.getSetCookie();
  // 가드(401·403)에서 막히면 컨트롤러가 돌지 않아 API가 state 쿠키를 지우지 않습니다.
  if (!setCookies.some((cookie) => cookie.startsWith(`${OAUTH_STATE_COOKIE}=`))) {
    setCookies.push(EXPIRED_OAUTH_STATE_COOKIE);
  }
  if (response.ok) return finish(null, setCookies);
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return finish(failureCode(body?.code), setCookies);
}
