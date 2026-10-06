/** 요청 결과 안내. 화면 낭독기가 바뀐 내용을 읽도록 live region을 늘 둡니다. */
export function ActionStatus({ error, notice }: { error?: string | null; notice?: string | null }) {
  return (
    <div className="action-status" aria-live="polite">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : notice ? (
        <p className="form-success">{notice}</p>
      ) : null}
    </div>
  );
}
