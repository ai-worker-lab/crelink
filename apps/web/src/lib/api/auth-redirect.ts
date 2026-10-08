import 'server-only';

import { COOKIE_NAMES, CRELINK_WEB_PATHS, LOGIN_RETURN_TO_PATTERN } from '@crelink/shared';
import { isNoticeReason } from './errors';

/**
 * 302 응답에 API가 보낸 `Set-Cookie`를 그대로 붙입니다. 본 도메인 경로는 상대 주소로 보내
 * 브라우저가 연 호스트(127.0.0.1·localhost)를 바꾸지 않습니다. 그래야 방금 받은 쿠키가 다음 요청에 붙습니다.
 */
export function redirectWithCookies(location: string, setCookies: readonly string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

/** 로그인 실패 코드를 `/notice` 주소로 바꿉니다. 안내 사유가 아닌 코드는 `oauth_failed`로 봅니다. */
export function noticeLocation(code: string | null | undefined): string {
  return CRELINK_WEB_PATHS.notice(isNoticeReason(code) ? code : 'oauth_failed');
}

/** 로그인 뒤 돌아갈 주소 쿠키(`cl_return_to`)의 유지 시간. 구글 로그인 화면을 오가는 동안만 씁니다. */
const RETURN_TO_SECONDS = 10 * 60;

/**
 * 로그인 성공 뒤 랜딩으로 돌아가는 두 단계(PRD R19). 돌아갈 주소는 쿼리가 아니라 `cl_return_to` 쿠키로만 넘깁니다.
 * - `AUTH_RETURN_PATH`(`app/auth/return/page.tsx`): 콜백이 302로 보내는 화면. 콜백의 리디렉트 체인은 구글에서 시작해 여기서 바로
 *   랜딩으로 보내면 랜딩 요청이 `Sec-Fetch-Site: cross-site`가 되고, 랜딩은 그런 요청을 단축 주소로 보내 방문을 한 번 더 기록합니다(PRD R7).
 *   그래서 이 문서가 `AUTH_RETURN_CONTINUE_PATH`로 새 이동을 시작합니다(같은 출처에서 시작한 이동).
 * - `AUTH_RETURN_CONTINUE_PATH`(`app/auth/return/go/route.ts`): 쿠키를 읽어 지우고 허용 형식이면 그 랜딩으로, 아니면 `/me`로 302.
 *   체인 전체가 같은 출처라 랜딩 요청은 `same-origin`입니다. 쿠키 없이 이 주소를 외부에 공유해도 `/me`로 가므로 R7을 우회하지 못합니다.
 */
export const AUTH_RETURN_PATH = '/auth/return';
export const AUTH_RETURN_CONTINUE_PATH = '/auth/return/go';

/** `LOGIN_RETURN_TO_PATTERN`(`/p/{publicId}`와 선택 `#guestbook`)에 맞는 값만 돌려줍니다(열린 리디렉트 방지). */
export function validReturnTo(value: string | null | undefined): string | null {
  return value && LOGIN_RETURN_TO_PATTERN.test(value) ? value : null;
}

/**
 * `cl_return_to` 쿠키(HttpOnly·SameSite=Lax·Path=/, 10분). `value`가 null이면 삭제 쿠키입니다.
 * Secure 여부는 API가 같은 응답으로 보낸 쿠키(`apiSetCookies`)를 따릅니다. API는 본 도메인이 https면 Secure를 붙이는데
 * (`apps/api/src/config.service.ts` `webCookieSecure`), 웹은 자기 공개 주소를 모르고 운영 TLS는 앞단(Cloudflare)에서 끝나므로
 * 판단을 API 설정 하나에 맞춥니다.
 */
export function returnToCookie(value: string | null, apiSetCookies: readonly string[]): string {
  const secure = apiSetCookies.some((cookie) => /;\s*secure\s*(?:;|$)/i.test(cookie));
  return [
    `${COOKIE_NAMES.returnTo}=${value === null ? '' : encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${value === null ? 0 : RETURN_TO_SECONDS}`,
    ...(value === null ? ['Expires=Thu, 01 Jan 1970 00:00:00 GMT'] : []),
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
