import type { LinkLimits, LinkView } from '@crelink/shared';
import Link from 'next/link';

/** `/me`의 외부 링크 요약. 링크 추가·수정·순서·숨기기는 랜딩 관리 화면(`/me/landings/{publicId}`)에서 합니다. */
export function LinksSummary({ publicId, links, limits }: { publicId: string; links: LinkView[]; limits: LinkLimits }) {
  const hidden = links.filter((link) => link.hidden).length;
  const blocked = links.filter((link) => link.blocked).length;
  return (
    <section className="card" aria-labelledby="links-summary-title">
      <div className="section-head">
        <h2 id="links-summary-title">링크 관리</h2>
        <p className={`limit-badge${limits.visibleUsed >= limits.visibleMax ? ' limit-full' : ''}`}>
          보이는 링크 {limits.visibleUsed}/{limits.visibleMax}
        </p>
      </div>
      <p className="section-help">
        외부 링크는 랜딩페이지 모양 그대로 보면서 추가·수정·순서 변경·숨기기 할 수 있어요. 숨긴 링크 {hidden}개 · 차단된
        링크 {blocked}개 · 전체 {limits.totalUsed}/{limits.totalMax}개.
      </p>
      <Link className="primary" href={`/me/landings/${encodeURIComponent(publicId)}`}>
        링크 관리 화면 열기
      </Link>
    </section>
  );
}
