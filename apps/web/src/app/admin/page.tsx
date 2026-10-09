import { CRELINK_API_PATHS, type OperatorCreatorListResponse } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '../../components/admin/AdminShell';
import { CreatorStatusBadges } from '../../components/admin/CreatorStatusBadges';
import { loadSignedIn } from '../../lib/api/server';
import { formatDate, formatNumber } from '../../lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '크리에이터 · 운영자', robots: { index: false } };

type Search = { query?: string | string[]; page?: string | string[] };

export default async function AdminCreatorsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const query = (Array.isArray(params.query) ? params.query[0] : params.query)?.trim() ?? '';
  const pageValue = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const search = new URLSearchParams({ page: String(page) });
  if (query) search.set('query', query);
  const result = await loadSignedIn<OperatorCreatorListResponse>(`${CRELINK_API_PATHS.adminCreators}?${search}`);

  const pageHref = (target: number) => {
    const next = new URLSearchParams({ page: String(target) });
    if (query) next.set('query', query);
    return `/admin?${next}`;
  };

  return (
    <AdminShell error={result.ok ? null : result.error}>
      {result.ok ? (
        <>
          <h1 className="page-title">크리에이터</h1>
          <form className="search-form" action="/admin" method="get" role="search">
            <label htmlFor="creator-query">이메일·이름·주소 검색</label>
            <div className="inline-fields">
              <input id="creator-query" className="input" name="query" type="search" defaultValue={query} />
              <button type="submit" className="primary">
                검색
              </button>
            </div>
          </form>
          <CreatorTable list={result.data} query={query} pageHref={pageHref} />
        </>
      ) : null}
    </AdminShell>
  );
}

function CreatorTable({
  list,
  query,
  pageHref,
}: {
  list: OperatorCreatorListResponse;
  query: string;
  pageHref: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  if (list.items.length === 0)
    return (
      <p className="empty-text">
        {query ? `'${query}'에 맞는 크리에이터가 없어요.` : '아직 가입한 크리에이터가 없어요.'}
      </p>
    );
  return (
    <>
      <p className="section-help">
        전체 {formatNumber(list.total)}명 · {list.page}/{pages}쪽
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">이메일</th>
              <th scope="col">이름</th>
              <th scope="col">단축 주소</th>
              <th scope="col" className="num">
                최근 30일 방문
              </th>
              <th scope="col">상태</th>
              <th scope="col">가입일</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((creator) => (
              <tr key={creator.userId}>
                <td>
                  <Link href={`/admin/creators/${encodeURIComponent(creator.userId)}`}>{creator.email}</Link>
                </td>
                <td>{creator.displayName ?? '—'}</td>
                <td>
                  <code>{creator.slug}</code>
                </td>
                <td className="num">{formatNumber(creator.visitsLast30Days)}</td>
                <td>
                  <CreatorStatusBadges creator={creator} />
                </td>
                <td>{formatDate(creator.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav className="pagination" aria-label="쪽 이동">
          {list.page > 1 ? <Link href={pageHref(list.page - 1)}>이전 쪽</Link> : <span aria-hidden="true" />}
          <span>
            {list.page} / {pages}
          </span>
          {list.page < pages ? <Link href={pageHref(list.page + 1)}>다음 쪽</Link> : <span aria-hidden="true" />}
        </nav>
      ) : null}
    </>
  );
}
