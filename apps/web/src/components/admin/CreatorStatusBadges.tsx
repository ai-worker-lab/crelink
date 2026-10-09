import type { OperatorCreatorSummary } from '@crelink/shared';

/**
 * 크리에이터 목록·상세의 상태 칸: `정지`(아니면 `이용 중`)와 AI 계정·지표 제외 배지(R23 ①⑧).
 * `aiLabel`은 목록이 `AI`, 상세가 `AI 계정`입니다.
 */
export function CreatorStatusBadges({
  creator,
  aiLabel = 'AI',
}: {
  creator: Pick<OperatorCreatorSummary, 'suspended' | 'accountKind' | 'metricsExcluded'>;
  aiLabel?: string;
}) {
  return (
    <span className="badges">
      {creator.suspended ? <span className="badge badge-danger">정지</span> : <span>이용 중</span>}
      {creator.accountKind === 'ai' ? <span className="badge badge-warning">{aiLabel}</span> : null}
      {creator.metricsExcluded ? <span className="badge badge-muted">지표 제외</span> : null}
    </span>
  );
}
