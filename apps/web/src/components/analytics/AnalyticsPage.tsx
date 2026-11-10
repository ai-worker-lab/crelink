import {
  CRELINK_API_PATHS,
  type AiOperatorMetrics,
  type AnalyticsReport,
  type OperatorCreatorDetail,
  type OperatorCreatorListResponse,
} from '@crelink/shared';
import Link from 'next/link';
import {
  analyticsApiQuery,
  analyticsFilters,
  analyticsHref,
  type AnalyticsFilters,
  type AnalyticsSearch,
} from '../../lib/analytics';
import { formatDateTime, formatNumber } from '../../lib/format';
import { loadSignedIn, type ServerApiResult } from '../../lib/api/server';
import { AdminShell } from '../admin/AdminShell';
import { ErrorPanel } from '../ErrorPanel';
import {
  AnalyticsDashboard,
  AnalyticsFiltersForm,
  Tile,
  type AnalyticsMode,
  type CreatorOption,
} from './AnalyticsDashboard';

export async function CreatorAnalyticsPage({
  publicId,
  searchParams,
  mode,
}: {
  publicId: string;
  searchParams: Promise<AnalyticsSearch>;
  mode: AnalyticsMode;
}) {
  const filters = analyticsFilters(await searchParams);
  const result = await loadSignedIn<AnalyticsReport>(
    `${CRELINK_API_PATHS.meAnalytics}?${analyticsApiQuery(filters)}`,
    publicId,
  );
  const base = `/me/landings/${encodeURIComponent(publicId)}/${mode}`;
  if (!result.ok)
    return (
      <ErrorPanel
        title={errorTitle(result.error.status)}
        message={result.error.message}
        action={{
          href: result.error.status === 400 || result.error.status === 404 ? base : analyticsHref(base, filters),
          label: result.error.status === 400 || result.error.status === 404 ? '조회 조건 초기화' : '다시 시도',
          reload: result.error.status !== 400 && result.error.status !== 404,
        }}
      />
    );
  return (
    <div className="analytics-dashboard">
      <PageHead
        mode={mode}
        metricsBase={`/me/landings/${encodeURIComponent(publicId)}/metrics`}
        statsBase={`/me/landings/${encodeURIComponent(publicId)}/stats`}
        filters={filters}
        scope="내 랜딩페이지"
      />
      <AnalyticsFiltersForm base={base} filters={filters} />
      <AnalyticsDashboard report={result.data} mode={mode} />
    </div>
  );
}

export async function AdminAnalyticsPage({
  searchParams,
  mode,
}: {
  searchParams: Promise<AnalyticsSearch>;
  mode: AnalyticsMode;
}) {
  const filters = analyticsFilters(await searchParams, true);
  const base = `/admin/${mode}`;
  const choicesQuery = new URLSearchParams({ page: String(filters.creatorPage) });
  if (filters.creatorQuery) choicesQuery.set('query', filters.creatorQuery);
  const [result, choices, business] = await Promise.all([
    loadSignedIn<AnalyticsReport>(`${CRELINK_API_PATHS.adminAnalytics}?${analyticsApiQuery(filters, true)}`),
    loadSignedIn<OperatorCreatorListResponse>(`${CRELINK_API_PATHS.adminCreators}?${choicesQuery}`),
    mode === 'metrics' ? loadSignedIn<AiOperatorMetrics>(CRELINK_API_PATHS.adminMetrics) : null,
  ]);
  const items = choices.ok ? choices.data.items : [];
  const selected = items.find((item) => item.userId === filters.creatorId);
  const missingSelection =
    filters.creatorId && !selected && result.ok
      ? await loadSignedIn<OperatorCreatorDetail>(CRELINK_API_PATHS.adminCreator(filters.creatorId))
      : null;
  const label = (item: { displayName: string | null; email: string; slug: string }) =>
    `${item.displayName ?? item.email} · ${item.slug}`;
  const options: CreatorOption[] = items.map((item) => ({ id: item.userId, label: label(item) }));
  if (missingSelection?.ok) options.unshift({ id: missingSelection.data.userId, label: label(missingSelection.data) });
  else if (filters.creatorId && !selected)
    options.unshift({ id: filters.creatorId, label: '선택한 크리에이터 (이름 조회 실패)' });
  const selectionLabel = selected
    ? label(selected)
    : missingSelection?.ok
      ? label(missingSelection.data)
      : '선택한 크리에이터';
  const scope =
    result.ok && result.data.scope.kind === 'creator'
      ? selectionLabel
      : `전체 서비스 · 시험 계정 ${result.ok && result.data.scope.includeExcluded ? '포함' : '제외'}`;
  return (
    <AdminShell
      error={result.ok ? null : result.error}
      errorTitle={result.ok ? undefined : errorTitle(result.error.status)}
      retryHref={analyticsHref(base, filters)}
      backHref={base}
      backLabel="조회 조건 초기화"
    >
      {result.ok ? (
        <div className="analytics-dashboard">
          <PageHead mode={mode} metricsBase="/admin/metrics" statsBase="/admin/stats" filters={filters} scope={scope} />
          <AnalyticsFiltersForm
            base={base}
            filters={filters}
            creators={options}
            creatorPages={choices.ok ? Math.max(1, Math.ceil(choices.data.total / choices.data.pageSize)) : 1}
            creatorError={
              !choices.ok
                ? choices.error.message
                : missingSelection && !missingSelection.ok
                  ? missingSelection.error.message
                  : undefined
            }
          />
          <p className="field-help">
            기본 서비스 집계는 사람 크리에이터 중 지표 제외되지 않은 계정 기준이에요. 개별 크리에이터를 선택하면 시험
            계정 여부와 관계없이 해당 계정만 조회해요.
          </p>
          <AnalyticsDashboard report={result.data} mode={mode} />
          {business ? <BusinessMetrics result={business} retryHref={analyticsHref(base, filters)} /> : null}
        </div>
      ) : null}
    </AdminShell>
  );
}

function errorTitle(status: number): string {
  return status === 400
    ? '조회 조건을 확인해 주세요.'
    : status === 403
      ? '통계를 볼 권한이 없어요.'
      : status === 404
        ? '조회 대상을 찾을 수 없어요.'
        : '통계를 불러오지 못했어요.';
}

function PageHead({
  mode,
  filters,
  scope,
  metricsBase,
  statsBase,
}: {
  mode: AnalyticsMode;
  filters: AnalyticsFilters;
  scope: string;
  metricsBase: string;
  statsBase: string;
}) {
  return (
    <header className="analytics-head">
      <h1 className="page-title">{mode === 'metrics' ? '지표' : '통계'}</h1>
      <p className="section-help">
        {scope} ·{' '}
        {mode === 'metrics' ? '핵심 숫자와 방문 추이를 확인해요.' : '일별 행동과 유입·대상·환경을 자세히 확인해요.'}
      </p>
      <nav className="preset-links" aria-label="분석 화면">
        <Link href={analyticsHref(metricsBase, filters)} aria-current={mode === 'metrics' ? 'page' : undefined}>
          지표 요약
        </Link>
        <Link href={analyticsHref(statsBase, filters)} aria-current={mode === 'stats' ? 'page' : undefined}>
          상세 통계
        </Link>
      </nav>
    </header>
  );
}

function BusinessMetrics({ result, retryHref }: { result: ServerApiResult<AiOperatorMetrics>; retryHref: string }) {
  if (!result.ok)
    return (
      <section className="card" aria-labelledby="business-metrics-title">
        <h2 id="business-metrics-title">서비스 운영 지표</h2>
        <p className="form-error" role="alert">
          운영 지표를 불러오지 못했어요. {result.error.message} <a href={retryHref}>다시 시도</a>
        </p>
      </section>
    );
  const metrics = result.data;
  const rows = [
    ['실사용자 / 목표', `${formatNumber(metrics.realUsers)} / ${formatNumber(metrics.goal.realUsers)}`],
    ['사람 크리에이터', formatNumber(metrics.creators.total)],
    ['지표 제외 크리에이터', formatNumber(metrics.creators.excluded)],
    ['가입 · 최근 24시간', formatNumber(metrics.signups.last24Hours)],
    ['가입 · 최근 7일', formatNumber(metrics.signups.last7Days)],
    ['가입 · 최근 30일', formatNumber(metrics.signups.last30Days)],
    ['첫 공개 링크 생성자 · 최근 7일', formatNumber(metrics.activation.firstVisibleLinkCreatorsLast7Days)],
    ['첫 공개 링크 생성자 · 최근 30일', formatNumber(metrics.activation.firstVisibleLinkCreatorsLast30Days)],
    ['302 방문 · 최근 7일', formatNumber(metrics.visits.last7Days)],
    ['302 방문 · 최근 30일', formatNumber(metrics.visits.last30Days)],
    ['302 링크 클릭 · 최근 7일', formatNumber(metrics.linkClicks.last7Days)],
    ['302 링크 클릭 · 최근 30일', formatNumber(metrics.linkClicks.last30Days)],
    ['게시 중 광고 배너', formatNumber(metrics.adBanners.live)],
    ['기존 광고 노출 · 최근 7일', formatNumber(metrics.adBanners.impressionsLast7Days)],
    ['302 광고 클릭 · 최근 7일', formatNumber(metrics.adBanners.clicksLast7Days)],
  ];
  return (
    <section className="card" aria-labelledby="business-metrics-title">
      <h2 id="business-metrics-title">서비스 운영 지표</h2>
      <p className="section-help">
        전체 서비스의 별도 운영 집계예요. 위 날짜·크리에이터·시험 계정 포함 필터를 적용하지 않아요.
        실사용자·가입·활성화·방문·링크 클릭은 지표 제외·AI 계정을 빼고 계산해요. 크리에이터 수와 광고는 각 항목의 전체
        집계예요.
      </p>
      <p className="field-help">
        실사용자는 보이는 링크나 포트폴리오가 있는 정지되지 않은 사람 크리에이터예요. 기준 시각{' '}
        {formatDateTime(metrics.generatedAt)}
      </p>
      <dl className="stat-tiles analytics-tiles">
        {rows.map(([title, value]) => (
          <Tile key={title} title={title} value={value} />
        ))}
      </dl>
    </section>
  );
}
