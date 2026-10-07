'use client';

import { LANDING_PASS_PARAM } from '@crelink/shared';
import { useEffect } from 'react';

/**
 * 단축 주소 리디렉트가 붙인 통과 표시(`?pass=`)를 주소창에서 지웁니다(PRD R7). 복사·공유되는 주소가 깨끗한 `/p/{publicId}`여야
 * 그 주소로 들어온 다음 방문이 다시 단축 주소를 거쳐 기록됩니다. Next 앱 라우터는 `history.replaceState`를 라우터 상태와 맞춥니다.
 */
export function PassCleanup() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(LANDING_PASS_PARAM)) return;
    url.searchParams.delete(LANDING_PASS_PARAM);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return null;
}
