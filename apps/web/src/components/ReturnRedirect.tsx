'use client';

import { useEffect } from 'react';

/**
 * 하이드레이션 뒤 `to`(같은 출처 경로)로 문서를 바꿉니다. 이 문서가 시작한 이동이라 그 뒤 같은 출처 리디렉트까지 포함해
 * 요청이 `Sec-Fetch-Site: same-origin`이고, `replace`라 뒤로 가기에 이 화면이 남지 않습니다.
 */
export function ReturnRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}
