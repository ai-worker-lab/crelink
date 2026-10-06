import {
  COOKIE_NAMES,
  CRELINK_API_PATHS,
  type ApiError,
  type GoogleAuthCallbackRequest,
  type GoogleAuthCallbackResponse,
} from '@crelink/shared';
import type { NextRequest } from 'next/server';
import { noticeLocation, redirectWithCookies } from '../../../../lib/api/auth-redirect';
import { apiOrigin } from '../../../../lib/api/server';

export const dynamic = 'force-dynamic';

/**
 * 구글 로그인 콜백: 브라우저의 `cl_oauth_state` 쿠키와 code·state를 API로 보내고,
 * 성공하면 API가 발급한 `cl_session`(과 state 쿠키 삭제)을 붙여 `/me`로, 실패하면 `/notice`로 보냅니다.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  if (!code || !state) return redirectWithCookies(noticeLocation('oauth_failed'));
  if (!apiOrigin) return redirectWithCookies(noticeLocation('auth_not_configured'));

  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json' });
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
    return redirectWithCookies(noticeLocation('oauth_failed'));
  }
  const setCookies = response.headers.getSetCookie();
  const body = (await response.json().catch(() => null)) as (GoogleAuthCallbackResponse & ApiError) | null;
  if (!response.ok) return redirectWithCookies(noticeLocation(body?.code), setCookies);
  return redirectWithCookies('/me', setCookies);
}
