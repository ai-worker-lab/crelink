import { Injectable } from '@nestjs/common';
import { CountByValue, OperatorCreatorStats } from '@crelink/shared';
import { Database } from '../database';
import { STATS_TIME_ZONE } from '../retention/retention.service';
import { analyticsRange } from '../analytics/date-range';

const DIMENSIONS = {
  referrer_host: 'referrers',
  device_type: 'devices',
  browser: 'browsers',
  os: 'operatingSystems',
  country: 'countries',
} as const;

/**
 * 운영자 통계(R10). 365일 안의 날짜는 원본(visits·link_clicks·creator_banner_clicks), 그보다 오래된 날짜는 보존 작업이 만든 집계
 * 테이블에서 읽어 합칩니다. 집계된 날짜의 순 방문자는 날짜별 순 방문자의 합입니다(원본이 지워져 날짜를 넘는 중복은 뺄 수 없음).
 */
@Injectable()
export class StatsService {
  constructor(private readonly database: Database) {}

  async stats(shortLinkId: string, fromInput: unknown, toInput: unknown): Promise<OperatorCreatorStats> {
    const { from: fromDay, to: toDay, days: rangeDays } = analyticsRange(fromInput, toInput);
    const params = [shortLinkId, fromDay, toDay, STATS_TIME_ZONE];
    const range = `short_link_id = $1 AND occurred_at >= ($2::date::timestamp AT TIME ZONE $4)
                   AND occurred_at < (($3::date + 1)::timestamp AT TIME ZONE $4)`;
    return this.database.snapshot(async (db) => {
      const rawDaily = await db.query<{ day: string; visits: number; unique_visitors: number }>(
        `SELECT (occurred_at AT TIME ZONE $4)::date::text AS day, count(*)::int AS visits,
                  count(DISTINCT visitor_id)::int AS unique_visitors
           FROM visits WHERE ${range} GROUP BY 1`,
        params,
      );
      const rawClicksDaily = await db.query<{ day: string; clicks: number }>(
        `SELECT (occurred_at AT TIME ZONE $4)::date::text AS day, count(*)::int AS clicks
           FROM link_clicks WHERE ${range} GROUP BY 1`,
        params,
      );
      const rolledDaily = await db.query<{ day: string; visits: number; unique_visitors: number; link_clicks: number }>(
        `SELECT day::text, visits, unique_visitors, link_clicks FROM visit_daily_rollups
           WHERE short_link_id = $1 AND day BETWEEN $2::date AND $3::date`,
        params.slice(0, 3),
      );
      const rawUnique = await db.query<{ count: number }>(
        `SELECT count(DISTINCT visitor_id)::int AS count FROM visits WHERE ${range}`,
        params,
      );
      const rawDimensions = await db.query<{ dimension: keyof typeof DIMENSIONS; value: string; count: number }>(
        `SELECT d.dimension, coalesce(d.value, 'unknown') AS value, count(*)::int AS count
           FROM visits,
                LATERAL (VALUES ('referrer_host', referrer_host), ('device_type', device_type), ('browser', browser),
                                ('os', os), ('country', country)) AS d(dimension, value)
           WHERE ${range} GROUP BY 1, 2`,
        params,
      );
      const rolledDimensions = await db.query<{ dimension: keyof typeof DIMENSIONS; value: string; count: number }>(
        `SELECT dimension, value, sum(visits)::int AS count FROM visit_dimension_rollups
           WHERE short_link_id = $1 AND day BETWEEN $2::date AND $3::date GROUP BY 1, 2`,
        params.slice(0, 3),
      );
      const rawLinks = await db.query<{ link_public_id: string; clicks: number }>(
        `SELECT link_public_id, count(*)::int AS clicks FROM link_clicks WHERE ${range} GROUP BY 1`,
        params,
      );
      const rolledLinks = await db.query<{ link_public_id: string; clicks: number }>(
        `SELECT link_public_id, sum(clicks)::int AS clicks FROM link_click_rollups
           WHERE short_link_id = $1 AND day BETWEEN $2::date AND $3::date GROUP BY 1`,
        params.slice(0, 3),
      );
      const rawBanners = await db.query<{ banner_public_id: string; clicks: number }>(
        `SELECT banner_public_id, count(*)::int AS clicks FROM creator_banner_clicks WHERE ${range} GROUP BY 1`,
        params,
      );
      const rolledBanners = await db.query<{ banner_public_id: string; clicks: number }>(
        `SELECT banner_public_id, sum(clicks)::int AS clicks FROM creator_banner_click_rollups
           WHERE short_link_id = $1 AND day BETWEEN $2::date AND $3::date GROUP BY 1`,
        params.slice(0, 3),
      );

      const daily = new Map<string, { day: string; visits: number; uniqueVisitors: number; linkClicks: number }>();
      for (const day of rangeDays) {
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
      const clicksByBanner = new Map<string, number>();
      for (const row of [...rawBanners.rows, ...rolledBanners.rows]) {
        clicksByBanner.set(row.banner_public_id, (clicksByBanner.get(row.banner_public_id) ?? 0) + row.clicks);
      }
      const titles = await db.query<{ public_id: string; title: string }>(
        'SELECT public_id, title FROM links WHERE public_id = ANY($1::text[])',
        [[...clicksByLink.keys()]],
      );
      const alts = await db.query<{ public_id: string; alt: string }>(
        'SELECT public_id, alt FROM creator_banners WHERE public_id = ANY($1::text[])',
        [[...clicksByBanner.keys()]],
      );
      const titleByLink = new Map(titles.rows.map((row) => [row.public_id, row.title]));
      const altByBanner = new Map(alts.rows.map((row) => [row.public_id, row.alt]));

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
        // bannerId는 배너 공개 ID(클릭 주소 `{SHORT}/b/{bannerPublicId}`의 값)입니다. 지운 배너는 alt가 null입니다.
        // 링크 클릭 합계(totals.linkClicks·daily)에는 넣지 않습니다.
        bannerClicks: [...clicksByBanner]
          .map(([bannerId, clicks]) => ({ bannerId, alt: altByBanner.get(bannerId) ?? null, clicks }))
          .sort((a, b) => b.clicks - a.clicks),
      };
    });
  }
}
