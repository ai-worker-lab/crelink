import {
  AI_OPERATOR_LIMITS,
  CRELINK_WEB_PATHS,
  type AgentRunRefKind,
  type AgentRunStatus,
  type AgentRunTrigger,
  type AgentRunView,
} from '@crelink/shared';
import Link from 'next/link';
import { formatDateTime, formatDuration, formatNumber } from '../../lib/format';

/**
 * AI 실행 기록 표시(서버 컴포넌트). `/admin/agent-runs` 목록 카드와 `/admin/agent-runs/{runId}` 상세가 함께 씁니다.
 * 근거: docs/specs/crelink-ai-operator.md `화면 상태와 API 대응`. 걸린 시간·"진행 중 n분째"는 요청 시각 `now`(밀리초)로 서버에서 계산합니다.
 */

const STATUS: Record<AgentRunStatus, { label: string; className: string }> = {
  running: { label: '진행 중', className: 'badge badge-warning' },
  succeeded: { label: '성공', className: 'badge badge-positive' },
  failed: { label: '실패', className: 'badge badge-danger' },
  paused: { label: '멈춤', className: 'badge' },
  abandoned: { label: '포기', className: 'badge badge-danger' },
};

const TRIGGER_LABELS: Record<AgentRunTrigger, string> = { schedule: '30분 주기', manual: '수동' };

const REF_KIND_LABELS: Record<AgentRunRefKind, string> = {
  pr: 'PR',
  work_item: 'work item',
  commit: '커밋',
  deploy: '배포',
  other: '기타',
};

const STALE_RUN_MS = AI_OPERATOR_LIMITS.staleRunMinutes * 60_000;

const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });

export function RunStatusBadge({ status }: { status: AgentRunStatus }) {
  const { label, className } = STATUS[status];
  return <span className={className}>{label}</span>;
}

/** 시작 뒤 `staleRunMinutes`가 지난 진행 중 실행. 다음 실행 시작이 `abandoned`로 닫습니다. */
export function isStaleRun(run: AgentRunView, now: number): boolean {
  return run.status === 'running' && now - Date.parse(run.startedAt) > STALE_RUN_MS;
}

/** 카드·상세 머리의 걸린 시간 글. 진행 중은 `진행 중 n분째`, 멈춤은 합친 횟수. */
export function runDurationText(run: AgentRunView, now: number): string {
  const started = Date.parse(run.startedAt);
  if (run.status === 'running') {
    const elapsed = now - started;
    const text = elapsed < 60_000 ? '방금 시작' : `진행 중 ${formatDuration(elapsed)}째`;
    return isStaleRun(run, now) ? `${text} · 다음 실행 때 포기 처리됨` : text;
  }
  if (run.status === 'paused') return `멈춤으로 ${formatNumber(run.pausedCount)}번 건너뜀`;
  return run.endedAt ? `걸린 시간 ${formatDuration(Date.parse(run.endedAt) - started)}` : '—';
}

/** http(s) 주소만 링크로 그립니다(API도 http(s)만 받지만 화면에서 다시 거릅니다). */
function httpUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function TextList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty-text">{empty}</p>
      ) : (
        <ul className="run-text-list">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/** 실행 한 건의 펼친 내용: 한 일·다음 할 일·관련 링크·실행 정보. */
export function AgentRunBody({ run }: { run: AgentRunView }) {
  return (
    <div className="run-body">
      <TextList title="한 일" items={run.actions} empty="적힌 일이 없어요." />
      <TextList title="다음 할 일" items={run.nextSteps} empty="적힌 다음 할 일이 없어요." />
      <h3>관련 링크</h3>
      {run.refs.length === 0 ? (
        <p className="empty-text">관련 링크가 없어요.</p>
      ) : (
        <ul className="run-text-list">
          {run.refs.map((ref, index) => {
            const href = httpUrl(ref.url);
            return (
              <li key={index}>
                <span className="badge">{REF_KIND_LABELS[ref.kind] ?? ref.kind}</span>{' '}
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {ref.label}
                  </a>
                ) : (
                  ref.label
                )}
                {ref.url && !href ? <span className="url-text"> {ref.url}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      <dl className="meta-list">
        <div>
          <dt>실행 방식</dt>
          <dd>{TRIGGER_LABELS[run.trigger] ?? run.trigger}</dd>
        </div>
        <div>
          <dt>실행 계정</dt>
          <dd>{run.actorEmail ?? '—'}</dd>
        </div>
        <div>
          <dt>실행 호스트</dt>
          <dd>{run.host ?? '—'}</dd>
        </div>
        <div>
          <dt>시작</dt>
          <dd>{formatDateTime(run.startedAt)}</dd>
        </div>
        <div>
          <dt>끝</dt>
          <dd>{run.endedAt ? formatDateTime(run.endedAt) : '—'}</dd>
        </div>
        <div>
          <dt>모델</dt>
          <dd>{run.model ?? '—'}</dd>
        </div>
        <div>
          <dt>비용</dt>
          <dd>{run.costUsd === null ? '—' : usdFormat.format(run.costUsd)}</dd>
        </div>
        <div>
          <dt>토큰 수</dt>
          <dd>
            입력 {run.inputTokens === null ? '—' : formatNumber(run.inputTokens)} · 출력{' '}
            {run.outputTokens === null ? '—' : formatNumber(run.outputTokens)}
          </dd>
        </div>
        <div>
          <dt>운영 기록</dt>
          <dd>{formatNumber(run.operatorActionCount)}건</dd>
        </div>
      </dl>
    </div>
  );
}

/** 실행 카드 목록. 모든 폭에서 `<details>` 카드이고 펼치면 내용과 상세 링크가 나옵니다(서버 컴포넌트만으로 펼침). */
export function AgentRunList({ runs, now }: { runs: AgentRunView[]; now: number }) {
  return (
    <ul className="run-list">
      {runs.map((run) => (
        <li key={run.id}>
          <details className="run-card">
            <summary>
              <span className="run-card-head">
                <RunStatusBadge status={run.status} />
                <span className="run-card-time">{formatDateTime(run.startedAt)}</span>
                <span className="run-card-duration">{runDurationText(run, now)}</span>
              </span>
              <span className="run-card-summary">{run.summary ?? '요약 없음'}</span>
            </summary>
            <AgentRunBody run={run} />
            <p className="run-card-link">
              <Link href={CRELINK_WEB_PATHS.adminAgentRun(run.id)}>실행 상세 보기</Link>
            </p>
          </details>
        </li>
      ))}
    </ul>
  );
}
