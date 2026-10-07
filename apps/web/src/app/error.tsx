'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * 화면 오류 경계(루트 레이아웃 안). 루트 레이아웃 자체의 오류는 `global-error.tsx`가 맡습니다.
 * 브라우저에서 난 오류만 Sentry로 보냅니다. `digest`가 있는 오류는 서버 오류라 서버의 `onRequestError`가 이미 보냈습니다.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <main className="public-page">
      <div className="empty-state" role="alert">
        <span className="error-badge" aria-hidden="true">
          !
        </span>
        <h1>화면을 불러오지 못했어요.</h1>
        <p>{error.message || '잠시 후 다시 시도해 주세요.'}</p>
        <button className="primary" onClick={reset}>
          다시 시도
        </button>
      </div>
    </main>
  );
}
