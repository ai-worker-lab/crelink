import { CRELINK_API_PATHS, CRELINK_WEB_PATHS, type OperatorActionPage, type OperatorActorKind } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '../../../components/admin/AdminShell';
import { ACTOR_LABELS, OperatorActionTable } from '../../../components/admin/OperatorActions';
import { loadSignedIn } from '../../../lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '운영 기록 · 운영자', robots: { index: false } };

type Search = { cursor?: string | string[]; actor?: string | string[] };

const FILTERS: Array<{ value: OperatorActorKind | null; label: string }> = [
  { value: null, label: '전체' },
  { value: 'human', label: ACTOR_LABELS.human },
  { value: 'ai', label: ACTOR_LABELS.ai },
  { value: 'system', label: ACTOR_LABELS.system },
];

/** 운영자 쓰기 기록(R23 ③). 걸러보기는 `?actor=`, 이전 기록은 `?cursor=`. 값 검사는 API(400)가 하고 화면은 처음 주소로 안내합니다. */
export default async function OperatorActionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const cursor = (Array.isArray(params.cursor) ? params.cursor[0] : params.cursor) || null;
  const actor = (Array.isArray(params.actor) ? params.actor[0] : params.actor) || null;
  const result = await loadSignedIn<OperatorActionPage>(
    CRELINK_API_PATHS.adminActions({ cursor, actor: actor as OperatorActorKind | null }),
  );
  const base = CRELINK_WEB_PATHS.adminActions;
  const href = (query: { actor?: string | null; cursor?: string | null }) => {
    const search = new URLSearchParams();
    if (query.actor) search.set('actor', query.actor);
    if (query.cursor) search.set('cursor', query.cursor);
    const text = search.toString();
    return text ? `${base}?${text}` : base;
  };

  return (
    <AdminShell
      error={result.ok ? null : result.error}
      errorTitle={
        result.ok || result.error.status !== 400 ? '운영 기록을 불러오지 못했어요.' : '주소가 올바르지 않아요.'
      }
      retryHref={base}
      backHref={base}
      backLabel="처음으로"
    >
      {result.ok ? (
        <>
          <h1 className="page-title">운영 기록</h1>
          <p className="section-help">
            운영자 화면·AI·서버 CLI가 바꾼 운영 설정과 그 전후 값이에요. 바뀐 값만 담고 이메일·토큰은 담지 않아요.
          </p>
          <nav className="filter-chips" aria-label="행위자로 걸러 보기">
            {FILTERS.map((filter) => (
              <Link
                key={filter.label}
                className="filter-chip"
                href={href({ actor: filter.value })}
                aria-pressed={filter.value === actor}
              >
                {filter.label}
              </Link>
            ))}
          </nav>
          {result.data.items.length === 0 ? (
            <p className="empty-text">{cursor ? '이 뒤로는 운영 기록이 없어요.' : '운영 기록이 없어요.'}</p>
          ) : (
            <OperatorActionTable items={result.data.items} caption="운영 기록" />
          )}
          {cursor || result.data.nextCursor ? (
            <nav className="pagination" aria-label="운영 기록 쪽 이동">
              {cursor ? <Link href={href({ actor })}>처음으로</Link> : <span aria-hidden="true" />}
              {result.data.nextCursor ? (
                <Link href={href({ actor, cursor: result.data.nextCursor })}>이전 기록</Link>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>
          ) : null}
        </>
      ) : null}
    </AdminShell>
  );
}
