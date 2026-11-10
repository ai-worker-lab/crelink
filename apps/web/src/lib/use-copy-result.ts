'use client';

import { useEffect, useRef, useState } from 'react';

export type CopyResult = 'copied' | 'failed';

/** 복사 성공 문장을 보여 주는 시간. 복사 아이콘의 체크 표시와 같습니다. */
export const COPY_RESULT_MS = 4000;

/**
 * 주소 막대 아래 복사 결과 문장의 상태(design/manager-address-bar/handoff.md `메시지 자리`).
 * 성공은 4초 뒤 사라지고, 실패는 전체 주소를 직접 선택할 수 있게 `clear`할 때까지 남습니다.
 */
export function useCopyResult() {
  const [result, setResult] = useState<CopyResult | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function report(next: CopyResult) {
    window.clearTimeout(timer.current);
    setResult(next);
    if (next === 'copied') timer.current = window.setTimeout(() => setResult(null), COPY_RESULT_MS);
  }

  return { result, report, clear: () => setResult(null) };
}
