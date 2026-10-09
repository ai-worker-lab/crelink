import { HttpStatus, Injectable } from '@nestjs/common';
import { CountByValue, OperatorCreatorStats } from '@crelink/shared';
import { Database } from '../database';
import { apiError } from '../common/http';
import { STATS_TIME_ZONE } from '../retention/retention.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;

/** `YYYY-MM-DD` → UTC 0시 epoch ms. 형식이 틀리거나 없는 날짜면 null. */
function parseDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? null : time;
}

const DIMENSIONS = {
  referrer_host: 'referrers',
  device_type: 'devices',
  browser: 'browsers',
  os: 'operatingSystems',
  country: 'countries',
} as const;

/**
 * 운영자 통계(R10). 365일 안의 날짜는 원본(visits·link_clicks), 그보다 오래된 날짜는 보존 작업이 만든 집계 테이블에서 읽어 합칩니다.
 * 집계된 날짜의 순 방문자는 날짜별 순 방문자의 합입니다(원본이 지워져 날짜를 넘는 중복은 뺄 수 없음).
 */
@Injectable()
export class StatsService {
  constructor(private readonly database: Database) {}

  async stats(shortLinkId: string, fromInput: unknown, toInput: unknown): Promise<OperatorCreatorStats> {
    const today = Date.parse(
      `${new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE }).format(new Date())}T00:00:00Z`,
    );
    const to = toInput === undefined ? today : parseDay(toInput);
    const from = fromInput === undefined && to !== null ? to - (DEFAULT_RANGE_DAYS - 1) * DAY_MS : parseDay(fromInput);
    if (from === null || to === null || from > to || (to - from) / DAY_MS + 1 > MAX_RANGE_DAYS) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'date_range_invalid',
        `기간은 YYYY-MM-DD 형식으로, 시작일이 종료일보다 늦지 않게 최대 ${MAX_RANGE_DAYS}일까지 선택해 주세요.`,
      );
    }
    const fromDay = new Date(from).toISOString().slice(0, 10);
    const toDay = new Date(to).toISOString().slice(0, 10);
    const params = [shortLinkId, fromDay, toDay, STATS_TIME_ZONE];
    const range = `short_link_id = $1 AND occurred_at >= ($2::date::timestamp AT TIME ZONE $4)
                   AND occurred_at < (($3::date + 1)::timestamp AT TIME ZONE $4)`;
    const db = this.database.pool;
    const [rawDaily, rawClicksDaily, rolledDaily, rawUnique, rawDimensions, rolledDimensions, rawLinks, rolledLinks] =
      await Promise.all([
        db.query<{ day: string; visits: number; unique_visitors: number }>(
          `SELECT (occurred_at AT TIME ZONE $4)::date::text AS day, count(*)::int AS visits,
                  count(DISTINCT visitor_id)::int AS unique_visitors
           FROM visits WHERE ${range} GROUP BY 1`,
          params,
        ),
        db.query<{ day: string; clicks: number }>(
          `SELECT (occurred_at AT TIME ZONE $4)::date::text AS day, count(*)::int AS clicks
           FROM link_clicks WHERE ${range} GROUP BY 1`,
          params,
        ),
        db.query<{ day: string; visits: number; unique_visitors: number; link_clicks: number }>(
          `SELECT day::text, visits, unique_visitors, link_clicks FROM visit_daily_rollups
           WHERE short_link_id = $1 AND day BETWEEN $2::date AND $3::date`,
          params.slice(0, 3),
        ),
        db.query<{ count: number }>(
          `SELECT count(DISTINCT visitor_id)::int AS count FROM visits WHERE ${range}`,
          params,
        ),
        db.query<{ dimension: keyof typeof DIMENSIONS; value: string; count: number }>(
          `SELECT d.dimension, coalesce(d.value, 'unknown') AS value, count(*)::int AS count
           FROM visits,
                LATERAL (VALUES ('referrer_host', referrer_host), ('device_type', device_type), ('browser', browser),
                                ('os', os), ('country', country)) AS d(dimension, value)
           WHERE ${range} GROUP BY 1, 2`,
          params,
        ),
        db.query<{ dimension: keyof typeof DIMENSIONS; value: string; count: number }>(
          `SELECT dimension, value, sum(visits)::int AS count FROM visit_dimension_rollups
           WHERE short_link_id = $1 AND day BETWEEN $2::date AND $3::date GROUP BY 1, 2`,
          params.slice(0, 3),
        ),
        db.query<{ link_public_id: string; clicks: number }>(
          `SELECT link_public_id, count(*)::int AS clicks FROM link_clicks WHERE ${range} GROUP BY 1`,
          params,
        ),
        db.query<{ link_public_id: string; clicks: number }>(
          `SELECT link_public_id, sum(clicks)::int AS clicks FROM link_click_rollups
           WHERE short_link_id = $1 AND day BETWEEN $2::date AND $3::date GROUP BY 1`,
          params.slice(0, 3),
        ),
      ]);

    const daily = new Map<string, { day: string; visits: number; uniqueVisitors: number; linkClicks: number }>();
    for (let time = from; time <= to; time += DAY_MS) {
      const day = new Date(time).toISOString().slice(0, 10);
      daily.set(day, { day, visits: 0, uniqueVisitors: 0, linkClicks: 0 });
    }
    for (const row of rawDaily.rows) {
      const entry = daily.get(row.day);
      if (entry) {
        entry.visits += row.visits;
        entry.uniqueVisitors += row.unique_visitors;
      }
    }
    for (const row of rawClicksDaily.rows) {
      const entry = daily.get(row.day);
      if (entry) entry.linkClicks += row.clicks;
    }
    let rolledUnique = 0;
    for (const row of rolledDaily.rows) {
      const entry = daily.get(row.day);
      if (!entry) continue;
      entry.visits += row.visits;
      entry.uniqueVisitors += row.unique_visitors;
      entry.linkClicks += row.link_clicks;
      rolledUnique += row.unique_visitors;
    }
    const days = [...daily.values()];

    const distributions: Record<(typeof DIMENSIONS)[keyof typeof DIMENSIONS], Map<string, number>> = {
      referrers: new Map(),
      devices: new Map(),
      browsers: new Map(),
      operatingSystems: new Map(),
      countries: new Map(),
    };
    for (const row of [...rawDimensions.rows, ...rolledDimensions.rows]) {
      const counts = distributions[DIMENSIONS[row.dimension]];
      counts.set(row.value, (counts.get(row.value) ?? 0) + row.count);
    }
    const sorted = (counts: Map<string, number>): CountByValue[] =>
      [...counts]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    const clicksByLink = new Map<string, number>();
    for (const row of [...rawLinks.rows, ...rolledLinks.rows]) {
      clicksByLink.set(row.link_public_id, (clicksByLink.get(row.link_public_id) ?? 0) + row.clicks);
    }
    const titles = await db.query<{ public_id: string; title: string }>(
      'SELECT public_id, title FROM links WHERE public_id = ANY($1::text[])',
      [[...clicksByLink.keys()]],
    );
    const titleByLink = new Map(titles.rows.map((row) => [row.public_id, row.title]));

    return {
      from: fromDay,
      to: toDay,
      totals: {
        visits: days.reduce((sum, day) => sum + day.visits, 0),
        uniqueVisitors: rawUnique.rows[0].count + rolledUnique,
        linkClicks: days.reduce((sum, day) => sum + day.linkClicks, 0),
      },
      daily: days,
      referrers: sorted(distributions.referrers),
      devices: sorted(distributions.devices),
      browsers: sorted(distributions.browsers),
      operatingSystems: sorted(distributions.operatingSystems),
      countries: sorted(distributions.countries),
      // linkId는 링크 공개 ID(클릭 주소의 {linkPublicId})입니다. 지운 링크는 title이 null입니다.
      linkClicks: [...clicksByLink]
        .map(([linkId, clicks]) => ({ linkId, title: titleByLink.get(linkId) ?? null, clicks }))
        .sort((a, b) => b.clicks - a.clicks),
      // 배너별 클릭(creator_banner_clicks·집계 합계)은 0073(클릭 경로·보존)이 채웁니다.
      bannerClicks: [],
    };
  }
}
