import { CRELINK_API_PATHS, type ApiError, type GoogleAuthStartResponse } from '@crelink/shared';
import { noticeLocation, redirectWithCookies } from '../../../lib/api/auth-redirect';
import { apiOrigin, apiRequestHeaders } from '../../../lib/api/server';

export const dynamic = 'force-dynamic';

/** 구글 로그인 시작: API가 발급한 state 쿠키를 붙여 구글 인증 화면으로 보냅니다. */
export async function GET() {
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
  return redirectWithCookies(body.authorizationUrl, response.headers.getSetCookie());
}
