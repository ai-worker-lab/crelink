import { SiteHeader } from '../SiteHeader';

/**
 * 관리 화면(`/me/landings/{publicId}/…`)을 불러오는 동안의 뼈대: 메뉴·무대(주소 막대·휴대폰 프레임과 광고 블록 자리 3:1 회색 면)·편집 패널 자리
 * (반복 애니메이션 없음).
 * `app/me/landings/loading.tsx`가 씁니다. 공개 랜딩의 단축 주소 리디렉트가 HTTP 307로 남도록 루트에는 두지 않습니다(`PageLoading` 설명).
 */
export function ManagerLoading() {
  return (
    <div className="app-page manager-page">
      <SiteHeader />
      <div className="manager" aria-busy="true">
        <div className="manager-menu skeleton-menu" aria-hidden="true">
          <span className="skeleton-bar" />
          <span className="skeleton-bar" />
          <span className="skeleton-bar" />
          <span className="skeleton-bar" />
        </div>
        <div className="manager-stage" aria-hidden="true">
          <div className="address-bar skeleton-address" />
          <div className="preview-device">
            <div className="preview-screen skeleton-screen">
              <span className="skeleton-banner" />
            </div>
          </div>
        </div>
        <main className="manager-panel">
          <p className="visually-hidden" role="status">
            불러오는 중…
          </p>
          <div className="card skeleton-card" aria-hidden="true" />
          <div className="card skeleton-card" aria-hidden="true" />
        </main>
      </div>
    </div>
  );
}
