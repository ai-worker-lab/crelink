import {
  CRELINK_WEB_PATHS,
  type OperatorActionTargetType,
  type OperatorActionType,
  type OperatorActionView,
  type OperatorActorKind,
} from '@crelink/shared';
import Link from 'next/link';
import { formatDateTime } from '../../lib/format';

/**
 * 운영자 행동 기록 표(서버 컴포넌트). `/admin/actions`와 실행 상세가 함께 씁니다. 넓은 화면은 표, 700px 이하는 공용
 * `.data-table.is-stacked` 카드입니다. 근거: docs/specs/crelink-ai-operator.md `화면 상태와 API 대응`.
 */

export const ACTOR_LABELS: Record<OperatorActorKind, string> = { human: '사람', ai: 'AI', system: '시스템' };

/** 행동 이름. 다른 에픽이 더한 행동도 오므로 모르는 값은 원래 키로 보여 줍니다. */
const ACTION_LABELS: Record<OperatorActionType, string> = {
  'creator.extra_slots': '추가 링크 슬롯 변경',
  'creator.suspension': '이용 정지·해제',
  'creator.banner_slot': '배너 슬롯 부여·회수',
  'creator.metrics_exclusion': '지표 제외 변경',
  'link.block': '링크 차단·해제',
  'banner.block': '배너 차단·해제',
  'blocked_domain.add': '차단 도메인 추가',
  'blocked_domain.remove': '차단 도메인 삭제',
  'ad_banner.create': '광고 배너 등록',
  'ad_banner.update': '광고 배너 수정',
  'ad_banner.reorder': '광고 배너 순서 변경',
  'ad_banner.end': '광고 배너 내리기',
  'ai_operator.pause': 'AI 멈춤 변경',
  'ai_operator.token_issue': 'AI 토큰 발급',
  'ai_operator.token_revoke': 'AI 토큰 폐기',
  'slot_event.period_update': '링크 슬롯 이벤트 기간 변경',
};

const TARGET_LABELS: Record<OperatorActionTargetType, string> = {
  user: '계정',
  link: '링크',
  creator_banner: '크리에이터 배너',
  blocked_domain: '차단 도메인',
  ad_banner: '광고 배너',
  ai_operator: 'AI 운영자',
  api_token: 'AI 토큰',
  slot_event: '링크 슬롯 이벤트',
};

const ACTOR_BADGES: Record<OperatorActorKind, string> = {
  human: 'badge',
  ai: 'badge badge-warning',
  system: 'badge',
};

/** 전후 값을 JSON 글자로 씁니다(React가 글자로 넣으므로 HTML로 해석되지 않음). 값이 없으면 `—`. */
function jsonText(value: unknown): string {
  return value === null || value === undefined ? '—' : JSON.stringify(value);
}

export function OperatorActionTable({
  items,
  caption,
  showRun = true,
}: {
  items: OperatorActionView[];
  caption: string;
  /** 실행 상세 안에서는 같은 실행 링크가 되풀이되므로 뺍니다. */
  showRun?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className="data-table is-stacked action-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">시각</th>
            <th scope="col">행위자</th>
            <th scope="col">행동</th>
            <th scope="col">대상</th>
            <th scope="col">크리에이터</th>
            <th scope="col">바뀐 값</th>
            {showRun ? <th scope="col">실행</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const label = (ACTION_LABELS as Record<string, string>)[item.action];
            const target = (TARGET_LABELS as Record<string, string>)[item.targetType] ?? item.targetType;
            const actor = ACTOR_LABELS[item.actor.kind] ?? item.actor.kind;
            return (
              <tr key={item.id}>
                <td className="action-col-time">{formatDateTime(item.createdAt)}</td>
                <td>
                  <span className="stacked-label">행위자 </span>
                  <span className={ACTOR_BADGES[item.actor.kind] ?? 'badge'}>{actor}</span>{' '}
                  <span className="action-actor">{item.actor.email ?? '—'}</span>
                </td>
                <th scope="row" className="action-col-name">
                  {label ?? <code>{item.action}</code>}
                </th>
                <td>
                  <span className="stacked-label">대상 </span>
                  {target}
                  {item.targetId ? (
                    <>
                      {' '}
                      <code className="action-target-id">{item.targetId}</code>
                    </>
                  ) : null}
                </td>
                <td>
                  <span className="stacked-label">크리에이터 </span>
                  {item.subjectUserId ? (
                    <Link href={`/admin/creators/${encodeURIComponent(item.subjectUserId)}`}>크리에이터 상세</Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <dl className="action-values">
                    <div>
                      <dt>이전</dt>
                      <dd>
                        <code>{jsonText(item.before)}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>이후</dt>
                      <dd>
                        <code>{jsonText(item.after)}</code>
                      </dd>
                    </div>
                  </dl>
                </td>
                {showRun ? (
                  <td>
                    <span className="stacked-label">실행 </span>
                    {item.runId ? <Link href={CRELINK_WEB_PATHS.adminAgentRun(item.runId)}>실행 기록</Link> : '—'}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
