import { Injectable } from '@nestjs/common';
import { AI_OPERATOR_LIMITS, AiOperatorMetrics } from '@crelink/shared';
import { Database } from '../database';
import { VISIBLE_LINK_CONDITION } from '../creator/creator.service';

/** 지표 대상 계정(`users` 별칭 `u`): 사람 크리에이터이고 운영자가 지표에서 빼지 않음. */
const METRICS_TARGET = `u.role = 'creator' AND u.kind = 'human' AND u.metrics_excluded_at IS NULL`;

interface MetricsRow {
  generated_at: Date;
  real_users: number;
  creators_total: number;
  creators_excluded: number;
  signups_24h: number;
  signups_7d: number;
  signups_30d: number;
  visits_7d: number;
  visits_30d: number;
  clicks_7d: number;
  clicks_30d: number;
  ad_live: number;
  ad_impressions_7d: number;
  ad_clicks_7d: number;
}

/**
 * `GET /api/admin/metrics`(R23 ⑧, PRD `목표`). 정의: docs/specs/crelink-ai-operator.md `지표 정의`.
 * 실사용자 = 지표 대상이고 정지되지 않았으며 보이는 링크(`VISIBLE_LINK_CONDITION`, 공개 랜딩과 같음)나 포트폴리오가 1개 이상.
 * 방문·클릭은 기간으로 먼저 거른 뒤 계정 조건을 붙이고, 광고 배너 노출·클릭은 서울 날짜 오늘 포함 7일입니다. 한 문장(같은 `now()`)입니다.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly database: Database) {}

  async metrics(): Promise<AiOperatorMetrics> {
    const result = await this.database.query<MetricsRow>(
      `WITH recent_visits AS (
         SELECT v.occurred_at FROM visits v
         JOIN short_links sl ON sl.id = v.short_link_id JOIN users u ON u.id = sl.user_id
         WHERE v.occurred_at > now() - interval '30 days' AND ${METRICS_TARGET}
       ), recent_clicks AS (
         SELECT c.occurred_at FROM link_clicks c
         JOIN short_links sl ON sl.id = c.short_link_id JOIN users u ON u.id = sl.user_id
         WHERE c.occurred_at > now() - interval '30 days' AND ${METRICS_TARGET}
       )
       SELECT now() AS generated_at,
         (SELECT count(*)::int FROM users u
          WHERE ${METRICS_TARGET} AND u.suspended_at IS NULL
            AND (EXISTS (SELECT 1 FROM links l WHERE l.user_id = u.id AND ${VISIBLE_LINK_CONDITION})
                 OR EXISTS (SELECT 1 FROM portfolio_items p JOIN landings la ON la.id = p.landing_id
                            WHERE la.user_id = u.id))) AS real_users,
         (SELECT count(*)::int FROM users u WHERE u.role = 'creator' AND u.kind = 'human') AS creators_total,
         (SELECT count(*)::int FROM users u
          WHERE u.role = 'creator' AND u.kind = 'human' AND u.metrics_excluded_at IS NOT NULL) AS creators_excluded,
         (SELECT count(*)::int FROM users u
          WHERE ${METRICS_TARGET} AND u.created_at > now() - interval '24 hours') AS signups_24h,
         (SELECT count(*)::int FROM users u
          WHERE ${METRICS_TARGET} AND u.created_at > now() - interval '7 days') AS signups_7d,
         (SELECT count(*)::int FROM users u
          WHERE ${METRICS_TARGET} AND u.created_at > now() - interval '30 days') AS signups_30d,
         (SELECT count(*)::int FROM recent_visits WHERE occurred_at > now() - interval '7 days') AS visits_7d,
         (SELECT count(*)::int FROM recent_visits) AS visits_30d,
         (SELECT count(*)::int FROM recent_clicks WHERE occurred_at > now() - interval '7 days') AS clicks_7d,
         (SELECT count(*)::int FROM recent_clicks) AS clicks_30d,
         (SELECT count(*)::int FROM ad_banners
          WHERE starts_at <= now() AND (ends_at IS NULL OR ends_at > now())) AS ad_live,
         (SELECT coalesce(sum(impressions), 0)::int FROM ad_banner_daily_stats
          WHERE day > (now() AT TIME ZONE 'Asia/Seoul')::date - 7) AS ad_impressions_7d,
         (SELECT coalesce(sum(clicks), 0)::int FROM ad_banner_daily_stats
          WHERE day > (now() AT TIME ZONE 'Asia/Seoul')::date - 7) AS ad_clicks_7d`,
    );
    const row = result.rows[0];
    return {
      generatedAt: row.generated_at.toISOString(),
      goal: { realUsers: AI_OPERATOR_LIMITS.realUserGoal },
      realUsers: row.real_users,
      creators: { total: row.creators_total, excluded: row.creators_excluded },
      signups: { last24Hours: row.signups_24h, last7Days: row.signups_7d, last30Days: row.signups_30d },
      visits: { last7Days: row.visits_7d, last30Days: row.visits_30d },
      linkClicks: { last7Days: row.clicks_7d, last30Days: row.clicks_30d },
      adBanners: { live: row.ad_live, impressionsLast7Days: row.ad_impressions_7d, clicksLast7Days: row.ad_clicks_7d },
      // R24 이벤트 수치(0089)가 `{ key, label, value }`를 더하는 확장 지점입니다.
      events: [],
    };
  }
}
