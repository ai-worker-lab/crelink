'use client';

import { CRELINK_API_PATHS } from '@crelink/shared';
import { browserApi } from './api/browser';
import { useAction } from './use-action';

/** BFF로 로그아웃(세션 쿠키 삭제)한 뒤 홈으로 갑니다. 진행 중의 클릭은 무시합니다(프로필 메뉴는 초점을 지키려고 `disabled`를 쓰지 않음). */
export function useLogout() {
  const { pending, error, run } = useAction();

  async function logout() {
    if (pending) return;
    const ok = await run(() => browserApi<void>(CRELINK_API_PATHS.authLogout, { method: 'POST' }));
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 로그아웃한 세션의 화면이 클라이언트 라우터 캐시에 남지 않도록 문서를 새로 불러옵니다.
    if (ok) window.location.assign('/');
  }

  return { pending, error, logout };
}
