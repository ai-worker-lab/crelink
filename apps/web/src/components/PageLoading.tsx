/**
 * 로그인 화면(`/me`, `/admin`)의 `loading.tsx`가 쓰는 불러오는 중 화면.
 * 루트에 두지 않는 이유: 루트 `loading.tsx`는 모든 화면을 Suspense로 감싸 응답을 먼저 보내므로, 공개 랜딩(`/p/{publicId}`)의
 * 단축 주소 리디렉트(PRD R7)가 HTTP 307이 아니라 200 + meta refresh가 됩니다(메신저 미리보기 봇은 따라가지 않음).
 */
export function PageLoading() {
  return (
    <main className="public-page">
      <div className="loading-indicator" role="status" aria-live="polite">
        <p>불러오는 중…</p>
      </div>
    </main>
  );
}
