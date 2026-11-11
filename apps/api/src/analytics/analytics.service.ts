import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ANALYTICS_LIMITS,
  CRELINK_LIMITS,
  isBotUserAgent,
  type AnalyticsBreakdowns,
  type AnalyticsDaily,
  type AnalyticsReport,
  type AnalyticsSourceRow,
  type AnalyticsTarget,
  type AnalyticsTotals,
  type CountByValue,
} from '@crelink/shared';
import { apiError, UUID_PATTERN } from '../common/http';
import { Database } from '../database';
import { STATS_TIME_ZONE } from '../retention/retention.service';
import { isMetaCrawlerIp } from './bot-ip';
import { analyticsRange } from './date-range';
import { ANALYTICS_DIMENSIONS, ANALYTICS_DIMENSIONS_SQL } from './dimensions';

type DailyRow = {
  day: string;
  page_views: string;
  clicks: string;
  impressions: string;
  active_ms: string;
  unique_visitors: string;
  sessions: string;
  daily_visitors?: string;
  daily_sessions?: string;
  owner_page_views?: string;
  owner_unique_visitors?: string;
  clicked_page_views: string;
  scroll_25: string;
  scroll_50: string;
  scroll_75: string;
  scroll_100: string;
  incomplete: boolean;
};
type TargetRow = {
  target_kind: AnalyticsTarget['targetKind'];
  target_id: string;
  clicks: string;
  impressions: string;
  observed_clicks: string;
  incomplete: boolean;
};
type DimensionRow = { dimension: string; value: string; count: string };
type RawDimensionRow = DimensionRow & { clicked: string };

const invalid = () => apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '통계 조회 조건을 확인해 주세요.');
const emptyTotals = (): AnalyticsTotals => ({
  pageViews: 0,
  clicks: 0,
  impressions: 0,
  activeMs: 0,
  averageActiveMs: null,
  uniqueVisitors: 0,
  sessions: 0,
  dailyPageUniqueVisitors: 0,
  dailyPageSessions: 0,
  clickedPageViews: 0,
  clickThroughRate: null,
  scroll25: 0,
  scroll50: 0,
  scroll75: 0,
  scroll100: 0,
});
const ratio = (count: number | null, total: number) => (count !== null && total > 0 ? count / total : null);

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: Database) {}

  async report(query: Record<string, unknown>, ownUserId?: string): Promise<AnalyticsReport> {
    const allowed = ownUserId ? ['from', 'to'] : ['from', 'to', 'creatorId', 'landingPublicId', 'includeExcluded'];
    if (Object.keys(query).some((key) => !allowed.includes(key))) throw invalid();
    const range = analyticsRange(query.from, query.to);
    if (query.creatorId !== undefined && (typeof query.creatorId !== 'string' || !UUID_PATTERN.test(query.creatorId)))
      throw invalid();
    if (
      query.landingPublicId !== undefined &&
      (typeof query.landingPublicId !== 'string' || !/^[a-z0-9]{10}$/.test(query.landingPublicId))
    )
      throw invalid();
    if (query.includeExcluded !== undefined && query.includeExcluded !== '1') throw invalid();

    // 운영자도 자기 랜딩은 조회하며, 관리자 집계는 기존 사람 크리에이터 범위를 유지한다.
    const creatorRole = ownUserId ? '' : "AND u.role='creator'";
    return this.database.snapshot(async (db) => {
      let creatorId = ownUserId ?? (query.creatorId as string | undefined);
      let landingPublicId = query.landingPublicId as string | undefined;
      if (creatorId || landingPublicId) {
        const selected = await db.query<{ user_id: string; public_id: string }>(
          `SELECT l.user_id,l.public_id FROM landings l JOIN users u ON u.id=l.user_id
           WHERE u.kind='human' ${creatorRole} AND ($1::uuid IS NULL OR l.user_id=$1)
             AND ($2::text IS NULL OR l.public_id=$2)`,
          [creatorId ?? null, landingPublicId ?? null],
        );
        if (!selected.rows[0])
          throw apiError(HttpStatus.NOT_FOUND, 'creator_not_found', '크리에이터를 찾을 수 없습니다.');
        creatorId = selected.rows[0].user_id;
        landingPublicId = selected.rows[0].public_id;
      }
      const service = !creatorId;
      const includeExcluded = service && query.includeExcluded === '1';
      const params = [creatorId ?? null, includeExcluded, range.from, range.to, STATS_TIME_ZONE];
      const scope = `WITH scope AS (
        SELECT sl.id FROM short_links sl JOIN users u ON u.id=sl.user_id
        WHERE u.kind='human' ${creatorRole} AND ($1::uuid IS NULL OR u.id=$1)
          AND ($1::uuid IS NOT NULL OR $2::boolean OR u.metrics_excluded_at IS NULL)
      )`;
      const rawRange = `e.short_link_id IN (SELECT id FROM scope)
        AND e.occurred_at >= ($3::date::timestamp AT TIME ZONE $5)
        AND e.occurred_at < (($4::date+1)::timestamp AT TIME ZONE $5)`;
      const rolledRange = `short_link_id IN (SELECT id FROM scope) AND day BETWEEN $3::date AND $4::date`;
      // 합계에서 뺄 User-Agent·IP를 판별 함수로 고릅니다. SQL은 값 비교만 하고 원문은 응답에 넣지 않습니다.
      const storedValues = (column: 'user_agent' | 'ip') =>
        db.query<{ value: string }>(
          `${scope}
          SELECT DISTINCT ${column} AS value FROM (
            SELECT e.${column} FROM landing_events e WHERE e.short_link_id IN (SELECT id FROM scope)
              AND e.occurred_at < (($4::date+1)::timestamp AT TIME ZONE $5)
            UNION ALL SELECT e.${column} FROM visits e WHERE ${rawRange}
            UNION ALL SELECT e.${column} FROM link_clicks e WHERE ${rawRange}
            UNION ALL SELECT e.${column} FROM creator_banner_clicks e WHERE ${rawRange}
          ) stored WHERE ${column} IS NOT NULL`,
          params,
        );
      const agents = await storedValues('user_agent');
      const addresses = await storedValues('ip');
      const rawParams = [
        ...params,
        agents.rows.map((row) => row.value).filter((agent) => isBotUserAgent(agent)),
        addresses.rows.map((row) => row.value).filter((ip) => isMetaCrawlerIp(ip)),
      ];
      const isBot = `(coalesce(e.user_agent = ANY($6::text[]),false) OR coalesce(e.ip = ANY($7::inet[]),false))`;
      const rawDaily = await db.query<DailyRow>(
        `${scope}
          SELECT (e.occurred_at AT TIME ZONE $5)::date::text AS day,
            count(*) FILTER(WHERE e.kind='page_view') AS page_views,
            count(*) FILTER(WHERE e.kind='click') AS clicks,
            count(*) FILTER(WHERE e.kind='impression') AS impressions,
            coalesce(sum(e.active_ms) FILTER(WHERE e.kind='page_view'),0) AS active_ms,
            count(DISTINCT e.visitor_id) FILTER(WHERE e.kind='page_view') AS unique_visitors,
            count(DISTINCT e.session_id) FILTER(WHERE e.kind='page_view') AS sessions,
            count(DISTINCT (e.short_link_id,e.visitor_id)) FILTER(WHERE e.kind='page_view') AS daily_visitors,
            count(DISTINCT (e.short_link_id,e.session_id)) FILTER(WHERE e.kind='page_view') AS daily_sessions,
            count(*) FILTER(WHERE e.kind='page_view' AND e.is_owner) AS owner_page_views,
            count(DISTINCT e.visitor_id) FILTER(WHERE e.kind='page_view' AND e.is_owner) AS owner_unique_visitors,
            count(*) FILTER(WHERE e.kind='page_view' AND EXISTS(SELECT 1 FROM landing_events c
              WHERE c.page_view_id=e.page_view_id AND c.kind='click')) AS clicked_page_views,
            count(*) FILTER(WHERE e.kind='page_view' AND e.scroll_percent>=25) AS scroll_25,
            count(*) FILTER(WHERE e.kind='page_view' AND e.scroll_percent>=50) AS scroll_50,
            count(*) FILTER(WHERE e.kind='page_view' AND e.scroll_percent>=75) AS scroll_75,
            count(*) FILTER(WHERE e.kind='page_view' AND e.scroll_percent>=100) AS scroll_100,
            false AS incomplete
          FROM landing_events e WHERE ${rawRange} AND NOT ${isBot} GROUP BY 1`,
        rawParams,
      );
      const rolledDaily = await db.query<DailyRow>(
        `${scope}
          SELECT day::text,coalesce(sum(events) FILTER(WHERE kind='page_view'),0) AS page_views,
            coalesce(sum(events) FILTER(WHERE kind='click'),0) AS clicks,
            coalesce(sum(events) FILTER(WHERE kind='impression'),0) AS impressions,
            sum(active_ms) AS active_ms,
            coalesce(sum(unique_visitors) FILTER(WHERE kind='page_view'),0) AS unique_visitors,
            coalesce(sum(unique_sessions) FILTER(WHERE kind='page_view'),0) AS sessions,
            coalesce(sum(clicked_page_views) FILTER(WHERE kind='page_view'),0) AS clicked_page_views,
            coalesce(sum(scroll_25) FILTER(WHERE kind='page_view'),0) AS scroll_25,
            coalesce(sum(scroll_50) FILTER(WHERE kind='page_view'),0) AS scroll_50,
            coalesce(sum(scroll_75) FILTER(WHERE kind='page_view'),0) AS scroll_75,
            coalesce(sum(scroll_100) FILTER(WHERE kind='page_view'),0) AS scroll_100,
            bool_or(kind='page_view' AND (clicked_page_views IS NULL OR scroll_25 IS NULL
              OR scroll_50 IS NULL OR scroll_75 IS NULL OR scroll_100 IS NULL)) AS incomplete
          FROM landing_event_daily_rollups WHERE ${rolledRange} GROUP BY day`,
        params.slice(0, 4),
      );
      const exact = await db.query<{
        visitors: string;
        sessions: string;
        daily_visitors: string;
        daily_sessions: string;
        owner_page_views: string;
        owner_visitors: string;
        first_owner_day: string | null;
      }>(
        `${scope}, views AS (
          SELECT e.*,(e.occurred_at AT TIME ZONE $5)::date AS day FROM landing_events e
          WHERE ${rawRange} AND NOT ${isBot} AND e.kind='page_view'
        ) SELECT count(DISTINCT visitor_id) AS visitors,count(DISTINCT session_id) AS sessions,
          count(*) FILTER(WHERE is_owner) AS owner_page_views,
          count(DISTINCT visitor_id) FILTER(WHERE is_owner) AS owner_visitors,
          (SELECT min((e.occurred_at AT TIME ZONE $5)::date)::text FROM landing_events e
            WHERE e.short_link_id IN (SELECT id FROM scope) AND NOT ${isBot} AND e.kind='page_view' AND e.is_owner) AS first_owner_day,
          (SELECT coalesce(sum(n),0) FROM (SELECT count(DISTINCT visitor_id) n FROM views GROUP BY day,short_link_id) d) AS daily_visitors,
          (SELECT coalesce(sum(n),0) FROM (SELECT count(DISTINCT session_id) n FROM views GROUP BY day,short_link_id) d) AS daily_sessions FROM views`,
        rawParams,
      );
      // 컬럼 추가 전 행은 false라 본인이 없었는지 알 수 없습니다. 조회 범위의 첫 본인 표시부터만 값을 냅니다.
      const firstOwnerDay = exact.rows[0].first_owner_day;
      const rawDimensions = await db.query<RawDimensionRow>(
        `${scope}
          SELECT d.dimension,coalesce(nullif(d.value,''),'unknown') AS value,count(*) AS count,
            count(*) FILTER(WHERE d.dimension IN ('referrer_host','utm_source') AND EXISTS(SELECT 1 FROM landing_events c
              WHERE c.page_view_id=e.page_view_id AND c.kind='click')) AS clicked
          FROM landing_events e,${ANALYTICS_DIMENSIONS_SQL}
          WHERE ${rawRange} AND NOT ${isBot} AND e.kind='page_view' GROUP BY 1,2`,
        rawParams,
      );
      const rolledDimensions = await db.query<DimensionRow>(
        `${scope} SELECT dimension,value,sum(page_views) AS count
          FROM landing_event_dimension_rollups WHERE ${rolledRange} GROUP BY 1,2`,
        params.slice(0, 4),
      );
      const targets = await db.query<TargetRow>(
        `${scope}, target_counts AS (
          SELECT e.target_kind,e.target_id,count(*) FILTER(WHERE e.kind='click') AS clicks,
            count(*) FILTER(WHERE e.kind='impression') AS impressions,
            count(*) FILTER(WHERE e.kind='impression' AND EXISTS(SELECT 1 FROM landing_events c
              WHERE c.page_view_id=e.page_view_id AND c.kind='click' AND c.target_kind=e.target_kind
                AND c.target_id=e.target_id AND c.occurred_at>=e.occurred_at)) AS observed_clicks,false AS incomplete
          FROM landing_events e WHERE ${rawRange} AND NOT ${isBot} AND e.kind IN ('click','impression') GROUP BY 1,2
          UNION ALL
          SELECT target_kind,target_id,coalesce(sum(events) FILTER(WHERE kind='click'),0),
            coalesce(sum(events) FILTER(WHERE kind='impression'),0),
            coalesce(sum(observed_clicks) FILTER(WHERE kind='impression'),0),
            bool_or(kind='impression' AND observed_clicks IS NULL)
          FROM landing_event_daily_rollups WHERE ${rolledRange} AND kind IN ('click','impression') GROUP BY 1,2
        ) SELECT target_kind,target_id,sum(clicks) AS clicks,sum(impressions) AS impressions,
            sum(observed_clicks) AS observed_clicks,bool_or(incomplete) AS incomplete
          FROM target_counts GROUP BY 1,2 ORDER BY sum(clicks) DESC,sum(impressions) DESC,target_kind,target_id
          LIMIT ${ANALYTICS_LIMITS.targets}`,
        rawParams,
      );
      const legacy = await db.query<{ day: string; kind: string; count: string }>(
        `${scope}, legacy AS (
          SELECT (e.occurred_at AT TIME ZONE $5)::date AS day,'visits' AS kind,count(*) AS count
            FROM visits e WHERE ${rawRange} AND NOT ${isBot} GROUP BY 1
          UNION ALL SELECT (e.occurred_at AT TIME ZONE $5)::date,'linkClicks',count(*) FROM link_clicks e WHERE ${rawRange} AND NOT ${isBot} GROUP BY 1
          UNION ALL SELECT (e.occurred_at AT TIME ZONE $5)::date,'creatorBannerClicks',count(*) FROM creator_banner_clicks e WHERE ${rawRange} AND NOT ${isBot} GROUP BY 1
          UNION ALL SELECT day,'visits',visits FROM visit_daily_rollups WHERE ${rolledRange}
          UNION ALL SELECT day,'linkClicks',link_clicks FROM visit_daily_rollups WHERE ${rolledRange}
          UNION ALL SELECT day,'creatorBannerClicks',clicks FROM creator_banner_click_rollups WHERE ${rolledRange}
        ) SELECT day::text,kind,sum(count) AS count FROM legacy GROUP BY 1,2`,
        rawParams,
      );
      const excluded = await db.query<{
        page_views: string;
        visits: string;
        redirect_clicks: string;
        legacy_rollups: boolean;
      }>(
        `${scope} SELECT
          (SELECT count(*) FROM landing_events e WHERE ${rawRange} AND ${isBot} AND e.kind='page_view') AS page_views,
          (SELECT count(*) FROM visits e WHERE ${rawRange} AND ${isBot}) AS visits,
          (SELECT count(*) FROM link_clicks e WHERE ${rawRange} AND ${isBot})
            + (SELECT count(*) FROM creator_banner_clicks e WHERE ${rawRange} AND ${isBot}) AS redirect_clicks,
          EXISTS(SELECT 1 FROM visit_daily_rollups WHERE ${rolledRange})
            OR EXISTS(SELECT 1 FROM creator_banner_click_rollups WHERE ${rolledRange}) AS legacy_rollups`,
        rawParams,
      );
      // 기간 안 방문자를 전에 본 적이 있는지로 나눕니다. 같은 소유 범위의 원본만 보므로 다른 크리에이터 방문은 재방문이 아닙니다.
      const recency = await db.query<{ new_visitors: string; returning_visitors: string }>(
        `${scope}, in_range AS (
          SELECT DISTINCT e.visitor_id FROM landing_events e
          WHERE ${rawRange} AND NOT ${isBot} AND e.kind='page_view'
        ), earlier AS (
          SELECT DISTINCT e.visitor_id FROM landing_events e
          WHERE e.short_link_id IN (SELECT id FROM scope) AND NOT ${isBot} AND e.kind='page_view'
            AND e.occurred_at < ($3::date::timestamp AT TIME ZONE $5)
        ) SELECT count(*) FILTER(WHERE b.visitor_id IS NULL) AS new_visitors,count(b.visitor_id) AS returning_visitors
          FROM in_range a LEFT JOIN earlier b USING (visitor_id)`,
        rawParams,
      );
      const coverage = await db.query<{ generated_at: Date; raw_from: string; first_day: string | null }>(
        `${scope}
          SELECT now() AS generated_at,((now() AT TIME ZONE $3)::date-${CRELINK_LIMITS.rawLogRetentionDays})::text AS raw_from,
            (SELECT min(day)::text FROM (
              SELECT min((occurred_at AT TIME ZONE $3)::date) AS day FROM landing_events
                WHERE short_link_id IN(SELECT id FROM scope) AND kind='page_view'
              UNION ALL SELECT min(day) FROM landing_event_daily_rollups
                WHERE short_link_id IN(SELECT id FROM scope) AND kind='page_view'
            ) available) AS first_day`,
        [params[0], params[1], params[4]],
      );
      const daily = new Map<string, AnalyticsDaily>(
        range.days.map((day) => [
          day,
          {
            day,
            ...emptyTotals(),
            legacyVisits: 0,
            legacyLinkClicks: 0,
            legacyCreatorBannerClicks: 0,
            ownerPageViews: firstOwnerDay !== null && day >= firstOwnerDay ? 0 : null,
            ownerUniqueVisitors: firstOwnerDay !== null && day >= firstOwnerDay ? 0 : null,
          },
        ]),
      );
      const merge = (row: DailyRow, archived: boolean) => {
        const day = daily.get(row.day)!;
        day.pageViews += Number(row.page_views);
        day.clicks += Number(row.clicks);
        day.impressions += Number(row.impressions);
        day.activeMs += Number(row.active_ms);
        day.dailyPageUniqueVisitors += Number(row.daily_visitors ?? row.unique_visitors);
        day.dailyPageSessions += Number(row.daily_sessions ?? row.sessions);
        if (archived) {
          day.uniqueVisitors = null;
          day.sessions = null;
          day.ownerPageViews = null;
          day.ownerUniqueVisitors = null;
        } else {
          day.uniqueVisitors = Number(row.unique_visitors);
          day.sessions = Number(row.sessions);
          if (day.ownerPageViews !== null) {
            day.ownerPageViews = Number(row.owner_page_views);
            day.ownerUniqueVisitors = Number(row.owner_unique_visitors);
          }
        }
        for (const [field, column] of [
          ['clickedPageViews', 'clicked_page_views'],
          ['scroll25', 'scroll_25'],
          ['scroll50', 'scroll_50'],
          ['scroll75', 'scroll_75'],
          ['scroll100', 'scroll_100'],
        ] as const) {
          day[field] = row.incomplete || day[field] === null ? null : day[field]! + Number(row[column]);
        }
      };
      rawDaily.rows.forEach((row) => merge(row, false));
      rolledDaily.rows.forEach((row) => merge(row, true));
      const legacyTotals = { visits: 0, linkClicks: 0, creatorBannerClicks: 0 };
      for (const row of legacy.rows) {
        const field = row.kind as keyof typeof legacyTotals;
        legacyTotals[field] += Number(row.count);
        const day = daily.get(row.day)!;
        const dayFields = {
          visits: 'legacyVisits',
          linkClicks: 'legacyLinkClicks',
          creatorBannerClicks: 'legacyCreatorBannerClicks',
        } as const;
        day[dayFields[field]] += Number(row.count);
      }
      const summary = emptyTotals();
      for (const day of daily.values()) {
        day.averageActiveMs = ratio(day.activeMs, day.pageViews);
        day.clickThroughRate = ratio(day.clickedPageViews, day.pageViews);
        for (const field of ['pageViews', 'clicks', 'impressions', 'activeMs'] as const) summary[field] += day[field];
        for (const field of ['clickedPageViews', 'scroll25', 'scroll50', 'scroll75', 'scroll100'] as const)
          summary[field] = summary[field] === null || day[field] === null ? null : summary[field]! + day[field]!;
      }
      const archived = rolledDaily.rows.length > 0;
      summary.uniqueVisitors = archived ? null : Number(exact.rows[0].visitors);
      summary.sessions = archived ? null : Number(exact.rows[0].sessions);
      const ownerKnown = !archived && firstOwnerDay !== null && range.to >= firstOwnerDay;
      summary.dailyPageUniqueVisitors =
        Number(exact.rows[0].daily_visitors) +
        rolledDaily.rows.reduce((sum, row) => sum + Number(row.unique_visitors), 0);
      summary.dailyPageSessions =
        Number(exact.rows[0].daily_sessions) + rolledDaily.rows.reduce((sum, row) => sum + Number(row.sessions), 0);
      summary.averageActiveMs = ratio(summary.activeMs, summary.pageViews);
      summary.clickThroughRate = ratio(summary.clickedPageViews, summary.pageViews);
      const dimensions = new Map<string, Map<string, number>>(
        ANALYTICS_DIMENSIONS.map((dimension) => [dimension, new Map()]),
      );
      for (const row of [...rawDimensions.rows, ...rolledDimensions.rows]) {
        const counts = dimensions.get(row.dimension);
        if (counts) counts.set(row.value, (counts.get(row.value) ?? 0) + Number(row.count));
      }
      const rolledViews = rolledDaily.rows.reduce((sum, row) => sum + Number(row.page_views), 0);
      let hasMissingDimensions = false;
      for (const dimension of ANALYTICS_DIMENSIONS) {
        const known = rolledDimensions.rows
          .filter((row) => row.dimension === dimension)
          .reduce((sum, row) => sum + Number(row.count), 0);
        const missing = Math.max(0, rolledViews - known);
        if (missing) {
          hasMissingDimensions = true;
          const counts = dimensions.get(dimension)!;
          counts.set('unknown', (counts.get('unknown') ?? 0) + missing);
        }
      }
      const values = (dimension: string): CountByValue[] => {
        const rows = [...dimensions.get(dimension)!]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
        const selected = rows.slice(0, ANALYTICS_LIMITS.breakdownValues);
        if (rows.length > selected.length) {
          const remainder = rows.slice(selected.length).reduce((sum, row) => sum + row.count, 0);
          const other = selected.find((row) => row.value === 'other');
          if (other) other.count += remainder;
          else selected.push({ value: 'other', count: remainder });
        }
        return selected;
      };
      const breakdowns: AnalyticsBreakdowns = {
        referrers: values('referrer_host'),
        countries: values('country'),
        cities: values('city'),
        devices: values('device_type'),
        browsers: values('browser'),
        operatingSystems: values('os'),
        languages: values('language'),
        timeZones: values('time_zone'),
        viewports: values('viewport'),
        screenSizes: values('screen'),
        pixelRatios: values('pixel_ratio'),
        utm: {
          source: values('utm_source'),
          medium: values('utm_medium'),
          campaign: values('utm_campaign'),
          term: values('utm_term'),
          content: values('utm_content'),
          id: values('utm_id'),
        },
      };
      const clickedSources = new Map<string, Map<string, number>>([
        ['referrer_host', new Map()],
        ['utm_source', new Map()],
      ]);
      for (const row of rawDimensions.rows) clickedSources.get(row.dimension)?.set(row.value, Number(row.clicked));
      const sourceRows = (dimension: 'referrer_host' | 'utm_source'): AnalyticsSourceRow[] => {
        const clicked = clickedSources.get(dimension)!;
        const rows = values(dimension);
        const named = rows.reduce((sum, row) => sum + (row.value === 'other' ? 0 : (clicked.get(row.value) ?? 0)), 0);
        const total = [...clicked.values()].reduce((sum, count) => sum + count, 0);
        return rows.map(({ value, count }) => {
          const clickedPageViews = archived ? null : value === 'other' ? total - named : (clicked.get(value) ?? 0);
          return { value, pageViews: count, clickedPageViews, clickThroughRate: ratio(clickedPageViews, count) };
        });
      };
      const ids = targets.rows.map((row) => row.target_id);
      const labels = ids.length
        ? await db.query<{ kind: string; id: string; label: string; owner: string | null }>(
            `${scope}, labels AS (
        SELECT 'link' AS kind,l.public_id AS id,l.title AS label,la.display_name AS owner FROM links l JOIN short_links sl ON sl.user_id=l.user_id JOIN landings la ON la.id=sl.landing_id WHERE sl.id IN(SELECT id FROM scope)
        UNION ALL SELECT 'social',s.id::text,s.platform,la.display_name FROM social_links s JOIN short_links sl ON sl.landing_id=s.landing_id JOIN landings la ON la.id=sl.landing_id WHERE sl.id IN(SELECT id FROM scope)
        UNION ALL SELECT 'portfolio',p.id::text,p.title,la.display_name FROM portfolio_items p JOIN short_links sl ON sl.landing_id=p.landing_id JOIN landings la ON la.id=sl.landing_id WHERE sl.id IN(SELECT id FROM scope)
        UNION ALL SELECT 'creator_banner',b.public_id,b.alt,la.display_name FROM creator_banners b JOIN short_links sl ON sl.landing_id=b.landing_id JOIN landings la ON la.id=sl.landing_id WHERE sl.id IN(SELECT id FROM scope)
        UNION ALL SELECT 'block',b.id::text,'링크 목록',la.display_name FROM landing_blocks b JOIN short_links sl ON sl.landing_id=b.landing_id JOIN landings la ON la.id=sl.landing_id WHERE sl.id IN(SELECT id FROM scope)
        UNION ALL SELECT 'ad_banner',public_id,alt,NULL FROM ad_banners
      ) SELECT * FROM labels WHERE id=ANY($3::text[])`,
            [params[0], params[1], ids],
          )
        : { rows: [] };
      const names = new Map(
        labels.rows.map((row) => [
          `${row.kind}:${row.id}`,
          service && row.owner ? `${row.owner} · ${row.label}` : row.label,
        ]),
      );
      return {
        from: range.from,
        to: range.to,
        timeZone: STATS_TIME_ZONE,
        generatedAt: coverage.rows[0].generated_at.toISOString(),
        coverage: {
          rawFrom: coverage.rows[0].raw_from,
          includesRollups: archived,
          firstRecordedDay: coverage.rows[0].first_day,
          hasMissingDimensions,
        },
        scope: {
          kind: service ? 'service' : 'creator',
          creatorId: creatorId ?? null,
          landingPublicId: landingPublicId ?? null,
          includeExcluded,
        },
        summary,
        daily: [...daily.values()],
        legacy: legacyTotals,
        breakdowns,
        sources: { referrers: sourceRows('referrer_host'), utmSources: sourceRows('utm_source') },
        visitorRecency: {
          newVisitors: archived ? null : Number(recency.rows[0].new_visitors),
          returningVisitors: archived ? null : Number(recency.rows[0].returning_visitors),
        },
        botExclusions: {
          pageViews: archived ? null : Number(excluded.rows[0].page_views),
          visits: excluded.rows[0].legacy_rollups ? null : Number(excluded.rows[0].visits),
          redirectClicks: excluded.rows[0].legacy_rollups ? null : Number(excluded.rows[0].redirect_clicks),
        },
        ownerVisits: {
          pageViews: ownerKnown ? Number(exact.rows[0].owner_page_views) : null,
          uniqueVisitors: ownerKnown ? Number(exact.rows[0].owner_visitors) : null,
        },
        targets: targets.rows.map((row) => ({
          targetKind: row.target_kind,
          targetId: row.target_id,
          label: names.get(`${row.target_kind}:${row.target_id}`) ?? null,
          clicks: Number(row.clicks),
          impressions: Number(row.impressions),
          clickThroughRate: row.incomplete ? null : ratio(Number(row.observed_clicks), Number(row.impressions)),
        })),
      };
    });
  }
}
