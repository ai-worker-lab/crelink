'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import '@crelink/design-tokens/tokens.css';
import '../styles.css';

/**
 * 루트 레이아웃까지 실패했을 때의 오류 화면. 루트 레이아웃을 대신하므로 `<html>`·`<body>`를 직접 그립니다.
 * 브라우저에서 난 오류만 Sentry로 보냅니다. `digest`가 있는 오류는 서버 오류라 서버의 `onRequestError`(src/instrumentation.ts)가 이미 보냈습니다.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main className="public-page">
          <div className="empty-state" role="alert">
            <span className="error-badge" aria-hidden="true">
              !
            </span>
            <h1>화면을 불러오지 못했어요.</h1>
            <p>잠시 후 다시 시도해 주세요.</p>
            <button className="primary" onClick={retry}>
              다시 시도
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
