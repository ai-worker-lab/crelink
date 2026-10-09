import { CRELINK_API_PATHS, CRELINK_WEB_PATHS, type AgentRunDetail } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '../../../../components/admin/AdminShell';
import { AgentRunBody, runDurationText, RunStatusBadge } from '../../../../components/admin/AgentRuns';
import { OperatorActionTable } from '../../../../components/admin/OperatorActions';
import { loadSignedIn } from '../../../../lib/api/server';
import { formatDateTime } from '../../../../lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'AI 실행 상세 · 운영자', robots: { index: false } };

/** AI 실행 한 건의 전체 내용과 그 실행이 남긴 운영자 행동 기록(R23 ③④). 없으면 404 안내와 `AI 실행 기록으로`. */
export default async function AgentRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const result = await loadSignedIn<AgentRunDetail>(CRELINK_API_PATHS.adminAgentRun(runId));
  // eslint-disable-next-line react-hooks/purity -- 동적 서버 컴포넌트는 요청마다 한 번만 렌더되고 브라우저에서 다시 그리지 않습니다.
  const now = Date.now();
  const list = CRELINK_WEB_PATHS.adminAgentRuns;
  return (
    <AdminShell
      error={result.ok ? null : result.error}
      errorTitle={
        result.ok || result.error.status !== 404 ? 'AI 실행 기록을 불러오지 못했어요.' : '실행 기록이 없어요.'
      }
      retryHref={CRELINK_WEB_PATHS.adminAgentRun(runId)}
      backHref={list}
      backLabel="AI 실행 기록으로"
    >
      {result.ok ? (
        <>
          <p className="breadcrumb">
            <Link href={list}>AI 실행 기록</Link>
          </p>
          <h1 className="page-title">AI 실행 {formatDateTime(result.data.startedAt)}</h1>
          <p className="run-card-head">
            <RunStatusBadge status={result.data.status} />
            <span className="run-card-duration">{runDurationText(result.data, now)}</span>
          </p>
          <section className="card" aria-labelledby="run-summary-title">
            <h2 id="run-summary-title">요약</h2>
            <p className="run-summary-text">{result.data.summary ?? '요약 없음'}</p>
            <AgentRunBody run={result.data} />
          </section>
          <section className="card" aria-labelledby="run-actions-title">
            <h2 id="run-actions-title">이 실행의 운영 기록</h2>
            {result.data.operatorActions.length === 0 ? (
              <p className="empty-text">이 실행에서 남긴 운영 기록이 없어요.</p>
            ) : (
              <OperatorActionTable items={result.data.operatorActions} caption="이 실행의 운영 기록" showRun={false} />
            )}
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
