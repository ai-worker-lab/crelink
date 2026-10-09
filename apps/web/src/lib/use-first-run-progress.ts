'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { firstRunGuideKey, parseFirstRunProgress, type FirstRunProgress } from './first-run-guide';

/**
 * 읽거나 쓴 진행(열쇠별). 같은 값을 돌려줘야 `useSyncExternalStore`가 다시 그리지 않고, 로컬 저장을 쓸 수 없는 브라우저
 * (사생활 보호 모드 오류 등)도 이 값으로 화면이 열린 동안 진행합니다(새로 불러오면 다시 처음부터).
 */
const cache = new Map<string, FirstRunProgress>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string): FirstRunProgress {
  const cached = cache.get(key);
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // 로컬 저장을 쓸 수 없으면 빈 진행으로 시작합니다.
  }
  const progress = parseFirstRunProgress(raw);
  cache.set(key, progress);
  return progress;
}

/**
 * 시작 안내 카드의 기기 로컬 진행(`crelink.firstRunGuide.<publicId>`, design/first-run-guide/handoff.md). 서버 렌더와 하이드레이션 중에는
 * null이라 카드를 그리지 않고, 하이드레이션 뒤에 로컬 저장을 읽습니다(깜빡임·불일치 방지). `update`는 참인 키를 더하고 저장합니다.
 */
export function useFirstRunProgress(publicId: string): [FirstRunProgress | null, (patch: FirstRunProgress) => void] {
  const key = firstRunGuideKey(publicId);
  const progress = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const update = useCallback(
    (patch: FirstRunProgress) => {
      const current = read(key);
      const next = { ...current, ...patch };
      if (Object.keys(next).length === Object.keys(current).length) return;
      cache.set(key, next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 쓸 수 없으면 메모리(cache)로만 진행합니다.
      }
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [progress, update];
}
