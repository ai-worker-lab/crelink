import { AdminShell } from '../../../components/admin/AdminShell';

/** 이벤트 화면을 불러오는 동안의 뼈대(제목, 기간 카드 1, 행 3, 반복 애니메이션 없음. design/slot-event/handoff.md D11). */
export default function SlotEventLoading() {
  return (
    <AdminShell>
      <div role="status" aria-live="polite">
        <h1 className="page-title">외부 링크 +5 이벤트</h1>
        <p className="visually-hidden">이벤트를 불러오는 중…</p>
        <div className="skeleton-menu" aria-hidden="true">
          <span className="skeleton-bar slot-event-skeleton-card" />
          <span className="skeleton-bar slot-event-skeleton-row" />
          <span className="skeleton-bar slot-event-skeleton-row" />
          <span className="skeleton-bar slot-event-skeleton-row" />
        </div>
      </div>
    </AdminShell>
  );
}
