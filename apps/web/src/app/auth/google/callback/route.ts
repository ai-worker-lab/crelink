import {
  COOKIE_NAMES,
  CRELINK_API_PATHS,
  type ApiError,
  type GoogleAuthCallbackRequest,
  type GoogleAuthCallbackResponse,
} from '@crelink/shared';
import type { NextRequest } from 'next/server';
import {
  AUTH_RETURN_PATH,
  noticeLocation,
  redirectWithCookies,
  returnToCookie,
  validReturnTo,
} from '../../../../lib/api/auth-redirect';
import { apiOrigin, apiRequestHeaders } from '../../../../lib/api/server';

export const dynamic = 'force-dynamic';

/**
 * 구글 로그인 콜백: 브라우저의 `cl_oauth_state` 쿠키와 code·state를 API로 보내고,
 * 성공하면 API가 발급한 `cl_session`(과 state 쿠키 삭제)을 붙여, `cl_return_to`가 허용 형식이면 쿠키를 그대로 두고
 * `/auth/return`으로(그다음 `/auth/return/go`가 쿠키를 읽고 지움, 설명: `lib/api/auth-redirect.ts` `AUTH_RETURN_PATH`),
 * 아니면 쿠키를 지우고 `/me`로 보냅니다. 실패하면 쿠키를 지우고 `/notice`로 보냅니다.
 */
export async function GET(request: NextRequest) {
  const returnTo = validReturnTo(request.cookies.get(COOKIE_NAMES.returnTo)?.value);
  /** API 응답이 없는 실패 경로의 쿠키 삭제(Secure 판단에 쓸 API 쿠키가 없음). */
  const clearReturnTo = [returnToCookie(null, [])];
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  if (!code || !state) return redirectWithCookies(noticeLocation('oauth_failed'), clearReturnTo);
  if (!apiOrigin) return redirectWithCookies(noticeLocation('auth_not_configured'), clearReturnTo);

  const headers = apiRequestHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' });
  const stateCookie = request.cookies.get(COOKIE_NAMES.oauthState)?.value;
  if (stateCookie) headers.set('Cookie', `${COOKIE_NAMES.oauthState}=${stateCookie}`);
  const payload: GoogleAuthCallbackRequest = { code, state };
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}${CRELINK_API_PATHS.authGoogleCallback}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return redirectWithCookies(noticeLocation('oauth_failed'), clearReturnTo);
  }
  const setCookies = response.headers.getSetCookie();
  const body = (await response.json().catch(() => null)) as (GoogleAuthCallbackResponse & ApiError) | null;
  if (!response.ok || !returnTo) setCookies.push(returnToCookie(null, setCookies));
  if (!response.ok) return redirectWithCookies(noticeLocation(body?.code), setCookies);
  return redirectWithCookies(returnTo ? AUTH_RETURN_PATH : '/me', setCookies);
}
