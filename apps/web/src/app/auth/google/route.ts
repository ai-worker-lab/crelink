import {
  COOKIE_NAMES,
  CRELINK_API_PATHS,
  LOGIN_RETURN_TO_PARAM,
  type ApiError,
  type GoogleAuthStartResponse,
} from '@crelink/shared';
import type { NextRequest } from 'next/server';
import { noticeLocation, redirectWithCookies, returnToCookie, validReturnTo } from '../../../lib/api/auth-redirect';
import { apiOrigin, apiRequestHeaders } from '../../../lib/api/server';

export const dynamic = 'force-dynamic';

/**
 * 구글 로그인 시작: API가 발급한 state 쿠키를 붙여 구글 인증 화면으로 보냅니다.
 * `?returnTo=`가 허용 형식(`LOGIN_RETURN_TO_PATTERN`)이면 로그인 뒤 돌아갈 주소를 `cl_return_to` 쿠키로 붙이고(PRD R19),
 * 없거나 허용 형식 밖이면 버리며 이전 시도가 남긴 쿠키도 지웁니다(콜백이 `/me`로 보냄).
 */
export async function GET(request: NextRequest) {
  if (!apiOrigin) return redirectWithCookies(noticeLocation('auth_not_configured'));
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}${CRELINK_API_PATHS.authGoogleStart}`, {
      headers: apiRequestHeaders({ Accept: 'application/json' }),
      cache: 'no-store',
    });
  } catch {
    return redirectWithCookies(noticeLocation('oauth_failed'));
  }
  const body = (await response.json().catch(() => null)) as (GoogleAuthStartResponse & ApiError) | null;
  if (!response.ok || !body?.authorizationUrl) return redirectWithCookies(noticeLocation(body?.code));
  const setCookies = response.headers.getSetCookie();
  const returnTo = validReturnTo(request.nextUrl.searchParams.get(LOGIN_RETURN_TO_PARAM));
  if (returnTo) setCookies.push(returnToCookie(returnTo, setCookies));
  else if (request.cookies.has(COOKIE_NAMES.returnTo)) setCookies.push(returnToCookie(null, setCookies));
  return redirectWithCookies(body.authorizationUrl, setCookies);
}
