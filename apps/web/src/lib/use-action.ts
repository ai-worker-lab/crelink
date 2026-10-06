'use client';

import { useState } from 'react';
import { BrowserApiError, describeError } from './api/browser';

/**
 * 저장·삭제 같은 요청 하나의 진행 상태(저장 중·오류·완료 안내)를 관리합니다.
 * 세션이 끝나 401이 오면 홈으로 보냅니다.
 */
export function useAction() {
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
