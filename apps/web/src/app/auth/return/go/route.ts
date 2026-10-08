import { COOKIE_NAMES } from '@crelink/shared';
import type { NextRequest } from 'next/server';
import { redirectWithCookies, returnToCookie, validReturnTo } from '../../../../lib/api/auth-redirect';

export const dynamic = 'force-dynamic';

/**
 * 로그인 뒤 랜딩 복귀의 마지막 단계(설명: `lib/api/auth-redirect.ts` `AUTH_RETURN_PATH`). `cl_return_to`가 허용 형식이면 그 주소로,
 * 없거나 형식 밖이면 `/me`로 302하고 쿠키는 늘 지웁니다(한 번만 씀).
 */
export function GET(request: NextRequest) {
  const returnTo = validReturnTo(request.cookies.get(COOKIE_NAMES.returnTo)?.value);
  return redirectWithCookies(returnTo ?? '/me', [returnToCookie(null, [])]);
}
