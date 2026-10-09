import {
  AI_OPERATOR_LIMITS,
  CRELINK_API_PATHS,
  CRELINK_WEB_PATHS,
  type AgentRunPage,
  type AgentRunView,
  type AiAccountView,
  type AiOperatorMetrics,
  type AiOperatorStatus,
} from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '../../../components/admin/AdminShell';
import { AgentRunList, isStaleRun, runDurationText, RunStatusBadge } from '../../../components/admin/AgentRuns';
import { PauseControl, TokenRevokeButton } from '../../../components/admin/AiOperatorControls';
import { loadSignedIn, type ServerApiResult } from '../../../lib/api/server';
import { formatDateTime, formatNumber } from '../../../lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'AI 실행 기록 · 운영자', robots: { index: false } };

type Search = { cursor?: string | string[] };

/**
 * AI 실행 기록(R23 ①④⑥⑧). 첫 쪽은 멈춤 스위치·진행 중 실행·지표·실행 목록·AI 계정, `?cursor=` 쪽은 실행 목록만 그립니다.
 * 근거: docs/specs/crelink-ai-operator.md `화면 상태와 API 대응`.
 */
export default async function AgentRunsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const cursor = (Array.isArray(params.cursor) ? params.cursor[0] : params.cursor) || null;
  const base = CRELINK_WEB_PATHS.adminAgentRuns;
  const [runs, status, metrics] = await Promise.all([
    loadSignedIn<AgentRunPage>(CRELINK_API_PATHS.adminAgentRuns(cursor)),
    cursor ? null : loadSignedIn<AiOperatorStatus>(CRELINK_API_PATHS.adminAiOperator),
    cursor ? null : loadSignedIn<AiOperatorMetrics>(CRELINK_API_PATHS.adminMetrics),
  ]);
  const error = (status && !status.ok ? status.error : null) ?? (runs.ok ? null : runs.error);
  // 걸린 시간·"진행 중 n분째"는 요청 시각 기준으로 서버에서 한 번 계산합니다.
  // eslint-disable-next-line react-hooks/purity -- 동적 서버 컴포넌트는 요청마다 한 번만 렌더되고 브라우저에서 다시 그리지 않습니다.
  const now = Date.now();

  return (
    <AdminShell
      error={error}
      errorTitle={error?.status === 400 ? '주소가 올바르지 않아요.' : 'AI 실행 기록을 불러오지 못했어요.'}
      retryHref={base}
      backHref={base}
      backLabel="처음으로"
    >
      {runs.ok ? (
        <>
          <h1 className="page-title">AI 실행 기록</h1>
          {status?.ok ? (
            <>
              <OperatorStatus status={status.data} now={now} />
              {metrics ? <Metrics metrics={metrics} /> : null}
            </>
          ) : null}
          <section className="card" aria-labelledby="runs-title">
            <h2 id="runs-title">실행 기록</h2>
            {runs.data.items.length === 0 ? (
              <EmptyRuns first={!cursor} />
            ) : (
              <AgentRunList runs={runs.data.items} now={now} />
            )}
            {cursor || runs.data.nextCursor ? (
              <nav className="pagination" aria-label="실행 기록 쪽 이동">
                {cursor ? <Link href={base}>처음으로</Link> : <span aria-hidden="true" />}
                {runs.data.nextCursor ? (
                  <Link href={`${base}?${new URLSearchParams({ cursor: runs.data.nextCursor })}`}>이전 기록</Link>
                ) : (
                  <span aria-hidden="true" />
                )}
              </nav>
            ) : null}
          </section>
          {status?.ok ? <AiAccounts accounts={status.data.accounts} /> : null}
        </>
      ) : null}
    </AdminShell>
  );
}

function EmptyRuns({ first }: { first: boolean }) {
  if (!first) return <p className="empty-text">이 뒤로는 실행 기록이 없어요.</p>;
  return (
    <>
      <p className="empty-text">아직 AI 실행 기록이 없어요.</p>
      <p className="section-help">
        실행 호스트에 AI 운영자 헌장(<code>docs/ops/ai-operator.md</code>)의 설치 절차대로 토큰과 30분 주기 자동화를
        두면 실행마다 여기에 기록이 남아요.
      </p>
    </>
  );
}

/** 멈춤 스위치와 진행 중 실행. */
function OperatorStatus({ status, now }: { status: AiOperatorStatus; now: number }) {
  const running = status.runningRun;
  return (
    <section className="card" aria-labelledby="pause-title">
      <h2 id="pause-title">멈춤 스위치</h2>
      <dl className="meta-list">
        <div>
          <dt>상태</dt>
          <dd>
            {status.paused ? (
              <span className="badge badge-danger">멈춤</span>
            ) : (
              <span className="badge badge-positive">동작 중</span>
            )}
          </dd>
        </div>
        <div>
          <dt>사유</dt>
          <dd>{status.pausedReason ?? '—'}</dd>
        </div>
        <div>
          <dt>바꾼 사람</dt>
          <dd>{status.updatedBy ?? '—'}</dd>
        </div>
        <div>
          <dt>바꾼 시각</dt>
          <dd>{formatDateTime(status.updatedAt)}</dd>
        </div>
      </dl>
      <p className="section-help">
        멈추면 다음 실행부터 시작하지 않고 멈춤 기록만 남아요. 진행 중 실행의 쓰기도 바로 막혀요.
      </p>
      <PauseControl paused={status.paused} hasRunningRun={running !== null} />
      <h3 className="run-current-title">진행 중 실행</h3>
      {running ? <RunningRun run={running} now={now} /> : <p className="empty-text">진행 중인 실행이 없어요.</p>}
    </section>
  );
}

function RunningRun({ run, now }: { run: AgentRunView; now: number }) {
  return (
    <div className={`run-current${isStaleRun(run, now) ? ' is-stale' : ''}`}>
      <p className="run-card-head">
        <RunStatusBadge status={run.status} />
        <span className="run-card-time">{formatDateTime(run.startedAt)} 시작</span>
        <span className="run-card-duration">{runDurationText(run, now)}</span>
      </p>
      {run.summary ? <p className="run-card-summary">{run.summary}</p> : null}
      <p className="run-card-link">
        <Link href={CRELINK_WEB_PATHS.adminAgentRun(run.id)}>실행 상세 보기</Link>
      </p>
    </div>
  );
}

/** 지표 카드. 지표만 실패하면 이 자리에 오류 문구를 두고 나머지는 그립니다. */
function Metrics({ metrics }: { metrics: ServerApiResult<AiOperatorMetrics> }) {
  return (
    <section className="card" aria-labelledby="metrics-title">
      <h2 id="metrics-title">지표</h2>
      {metrics.ok ? (
        <MetricTiles metrics={metrics.data} />
      ) : (
        <p className="form-error" role="alert">
          지표를 불러오지 못했어요. {metrics.error.message}
        </p>
      )}
    </section>
  );
}

function MetricTiles({ metrics }: { metrics: AiOperatorMetrics }) {
  const tiles: Array<{ label: string; value: string }> = [
    { label: '실사용자', value: `${formatNumber(metrics.realUsers)} / ${formatNumber(metrics.goal.realUsers)}` },
    {
      label: '크리에이터(지표 제외)',
      value: `${formatNumber(metrics.creators.total)} (${formatNumber(metrics.creators.excluded)})`,
    },
    { label: '가입 · 최근 24시간', value: formatNumber(metrics.signups.last24Hours) },
    { label: '가입 · 최근 7일', value: formatNumber(metrics.signups.last7Days) },
    { label: '가입 · 최근 30일', value: formatNumber(metrics.signups.last30Days) },
    { label: '방문 · 최근 7일', value: formatNumber(metrics.visits.last7Days) },
    { label: '방문 · 최근 30일', value: formatNumber(metrics.visits.last30Days) },
    { label: '링크 클릭 · 최근 7일', value: formatNumber(metrics.linkClicks.last7Days) },
    { label: '링크 클릭 · 최근 30일', value: formatNumber(metrics.linkClicks.last30Days) },
    { label: '게시 중 광고 배너', value: formatNumber(metrics.adBanners.live) },
    { label: '광고 노출 · 최근 7일', value: formatNumber(metrics.adBanners.impressionsLast7Days) },
    { label: '광고 클릭 · 최근 7일', value: formatNumber(metrics.adBanners.clicksLast7Days) },
    ...metrics.events.map((event) => ({ label: event.label, value: formatNumber(event.value) })),
  ];
  return (
    <>
      <p className="section-help">
        실사용자는 보이는 링크나 포트폴리오가 있는 정지되지 않은 사람 크리에이터예요(지표 제외 계정 빼고). 목표{' '}
        {formatNumber(AI_OPERATOR_LIMITS.realUserGoal)}명. 광고 노출·클릭은 한국 날짜 오늘 포함 7일이에요.
      </p>
      <dl className="stat-tiles">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
      <p className="field-help metric-time">기준 시각 {formatDateTime(metrics.generatedAt)}</p>
    </>
  );
}

/** AI 계정과 토큰. 토큰 발급은 서버 CLI(런북 17)로만 합니다. */
function AiAccounts({ accounts }: { accounts: AiAccountView[] }) {
  return (
    <section className="card" aria-labelledby="accounts-title">
      <h2 id="accounts-title">AI 계정</h2>
      {accounts.length === 0 ? (
        <>
          <p className="empty-text">아직 AI 계정이 없어요.</p>
          <p className="section-help">
            계정과 토큰은 운영 서버 CLI로만 만들어요. 운영 런북 17(AI 운영자 토큰)의 발급 절차를 따라 주세요.
          </p>
        </>
      ) : (
        accounts.map((account) => <AiAccount key={account.userId} account={account} />)
      )}
    </section>
  );
}

function AiAccount({ account }: { account: AiAccountView }) {
  const active = account.tokens.filter((token) => token.revokedAt === null);
  return (
    <div className="ai-account">
      <h3 className="item-title">
        <Link href={`/admin/creators/${encodeURIComponent(account.userId)}`}>{account.email}</Link>
      </h3>
      <p className="badges">
        <span className="badge badge-warning">AI 계정</span>
        {account.suspended ? <span className="badge badge-danger">정지</span> : null}
      </p>
      <p className="field-help">만든 날 {formatDateTime(account.createdAt)}</p>
      {active.length === 0 ? <p className="notice-box">쓸 수 있는 토큰이 없어요. 다음 실행부터 멈춥니다.</p> : null}
      <ul className="edit-list" aria-label={`${account.email} 토큰`}>
        {account.tokens.map((token) => (
          <li key={token.id} className="item-card">
            <div className="item-body">
              <div className="item-text">
                <p className="item-title">
                  {token.label} <code>{token.prefix}…</code>
                </p>
                <p className="field-help">
                  만든 날 {formatDateTime(token.createdAt)} · 마지막 사용{' '}
                  {token.lastUsedAt ? formatDateTime(token.lastUsedAt) : '없음'}
                </p>
                {token.revokedAt ? (
                  <p className="badges">
                    <span className="badge badge-muted">폐기 {formatDateTime(token.revokedAt)}</span>
                  </p>
                ) : null}
              </div>
              {token.revokedAt ? null : (
                <TokenRevokeButton tokenId={token.id} label={token.label} last={active.length === 1} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
