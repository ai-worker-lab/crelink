'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
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
