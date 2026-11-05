import { ANALYTICS_LIMITS, type LandingTargetKind } from '@crelink/shared';
import { formatNumber, recentRange } from './format.ts';

export type AnalyticsSearch = Record<string, string | string[] | undefined>;
export interface AnalyticsFilters {
  from: string;
  to: string;
  creatorId: string;
  creatorQuery: string;
  creatorPage: number;
  includeExcluded: boolean;
}

/** creatorId 등의 화면 쿼리를 내 통계 API로 보내지 않습니다. 날짜의 실제 유효성은 API가 판정합니다. */
export function analyticsFilters(search: AnalyticsSearch, admin = false): AnalyticsFilters {
  const value = (key: string) => {
    const entry = search[key];
    return (Array.isArray(entry) ? entry[0] : entry)?.trim() ?? '';
  };
  const fallback = recentRange(ANALYTICS_LIMITS.defaultRangeDays);
  const page = Number(value('creatorPage'));
  return {
    from: value('from') || fallback.from,
    to: value('to') || fallback.to,
    creatorId: admin ? value('creatorId').toLowerCase() : '',
    creatorQuery: admin ? value('creatorQuery').slice(0, 100) : '',
    creatorPage: admin && Number.isSafeInteger(page) && page > 0 ? page : 1,
    includeExcluded: admin && value('includeExcluded') === '1',
  };
}

export function analyticsApiQuery(filters: AnalyticsFilters, admin = false): URLSearchParams {
  const query = new URLSearchParams({ from: filters.from, to: filters.to });
  if (admin && filters.creatorId) query.set('creatorId', filters.creatorId);
  if (admin && filters.includeExcluded) query.set('includeExcluded', '1');
  return query;
}

export function analyticsHref(base: string, filters: AnalyticsFilters, change: Partial<AnalyticsFilters> = {}): string {
  const next = { ...filters, ...change };
  const query = analyticsApiQuery(next, true);
  if (next.creatorQuery) query.set('creatorQuery', next.creatorQuery);
  if (next.creatorPage > 1) query.set('creatorPage', String(next.creatorPage));
  return `${base}?${query}`;
}

const decimal = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
export const analyticsCount = (value: number | null) => (value === null ? '확인 불가' : formatNumber(value));
export const analyticsPercent = (value: number | null) =>
  value === null ? '계산 불가' : `${decimal.format(value * 100)}%`;
export function analyticsDuration(value: number | null): string {
  if (value === null) return '계산 불가';
  if (value < 60_000) return `${decimal.format(value / 1000)}초`;
  return `${formatNumber(Math.floor(value / 60_000))}분 ${Math.floor((value % 60_000) / 1000)}초`;
}

export function analyticsDimension(value: string): string {
  return value === 'unknown' || !value ? '알 수 없음' : value === 'other' ? '기타' : value;
}

export const ANALYTICS_TARGET_LABELS: Record<LandingTargetKind, string> = {
  block: '링크 구역',
  link: '링크',
  social: 'SNS',
  portfolio: '포트폴리오',
  creator_banner: '크리에이터 배너',
  ad_banner: '광고 배너',
};
