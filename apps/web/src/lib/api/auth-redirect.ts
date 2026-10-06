import 'server-only';

import { CRELINK_WEB_PATHS } from '@crelink/shared';
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
