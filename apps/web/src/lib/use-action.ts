'use client';

import { useState } from 'react';
import { BrowserApiError, describeError } from './api/browser';

/** `useAction`이 돌려주는 요청 하나의 진행 상태와 실행 함수. 폼을 감싸는 쪽(하단 시트 등)이 진행 상태를 함께 볼 때 넘깁니다. */
export interface ActionState {
  pending: boolean;
  error: string | null;
  notice: string | null;
  /** `task`를 실행하고 성공하면 `successNotice`를 안내합니다. 성공 여부를 돌려줍니다. */
  run: (task: () => Promise<void>, successNotice?: string) => Promise<boolean>;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
}

/**
 * 저장·삭제 같은 요청 하나의 진행 상태(저장 중·오류·완료 안내)를 관리합니다.
 * 세션이 끝나 401이 오면 홈으로 보냅니다.
 */
export function useAction(): ActionState {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(task: () => Promise<void>, successNotice?: string): Promise<boolean> {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      if (successNotice) setNotice(successNotice);
      return true;
    } catch (caught) {
      if (caught instanceof BrowserApiError && caught.status === 401) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 끝난 세션의 화면이 클라이언트 라우터 캐시에 남지 않도록 문서를 새로 불러옵니다.
        window.location.assign('/');
        return false;
      }
      setError(describeError(caught));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { pending, error, notice, run, setError, setNotice };
}
