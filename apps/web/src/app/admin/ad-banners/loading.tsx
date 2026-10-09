import { AdminShell } from '../../../components/admin/AdminShell';

/** 광고 배너 목록을 불러오는 동안의 뼈대(제목과 행 3개, 반복 애니메이션 없음). */
export default function AdBannersLoading() {
  return (
    <AdminShell>
      <div role="status" aria-live="polite">
        <h1 className="page-title">광고 배너</h1>
        <p className="visually-hidden">광고 배너를 불러오는 중…</p>
        <div className="skeleton-menu ad-banners-skeleton" aria-hidden="true">
          <span className="skeleton-bar ad-banners-skeleton-filters" />
          <span className="skeleton-bar ad-banners-skeleton-row" />
          <span className="skeleton-bar ad-banners-skeleton-row" />
          <span className="skeleton-bar ad-banners-skeleton-row" />
        </div>
      </div>
    </AdminShell>
  );
}
