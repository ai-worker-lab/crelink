'use client';

import { useSyncExternalStore } from 'react';

/** 관리 화면의 넓은 배치 경계. `styles.css`의 관리 화면 미디어 쿼리(1023px 이하 한 열)와 같은 값입니다. */
const WIDE_QUERY = '(min-width: 1024px)';

function subscribe(listener: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/**
 * 관리 화면이 넓은 배치(1024px 이상: 가운데 미리보기 무대와 오른쪽 편집 패널)인지 알려 줍니다.
 * 좁으면 편집 칩이 있는 전체 폭 미리보기와 하단 시트를 씁니다. 서버는 화면 폭을 모르므로 넓은 배치로 그리고 하이드레이션 뒤 실제 폭으로 바꿉니다
 * (좁은 화면에서 서버가 그린 무대와 처음 패널은 CSS로도 숨깁니다).
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}
