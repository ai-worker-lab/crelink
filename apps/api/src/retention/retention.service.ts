import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { CRELINK_LIMITS } from '@crelink/shared';
import { Database } from '../database';
import { ANALYTICS_DIMENSIONS_SQL } from '../analytics/dimensions';

/** 통계의 "날짜" 기준 시간대. 보존 작업·통계 API가 같은 값을 씁니다. */
export const STATS_TIME_ZONE = 'Asia/Seoul';

const RETENTION_LOCK_KEY = 931475211;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Sentry Cron 모니터 slug. 첫 체크인이 모니터를 만듭니다(`RETENTION_MONITOR_CONFIG` upsert). */
const RETENTION_MONITOR_SLUG = 'crelink-api-retention';

/**
 * 하루 간격(기동 때 실행 + `setInterval` 24시간이라 crontab이 아니라 interval). 배포·재시작은 다음 실행을 앞당길 뿐이라 늦지 않고,
 * `setInterval` 지연을 넉넉히 덮도록 체크인 여유 60분, 작업은 보통 수 초지만 다른 인스턴스의 advisory lock 대기를 덮도록 최대 실행 30분.
 */
const RETENTION_MONITOR_CONFIG: Parameters<typeof Sentry.withMonitor>[2] = {
  schedule: { type: 'interval', value: 1, unit: 'day' },
  timezone: STATS_TIME_ZONE,
  checkinMargin: 60,
  maxRuntime: 30,
};

/**
 * 접근 로그 보존 작업(R11). 기동 시와 24시간마다 365일보다 오래된 날짜의 visits·link_clicks·creator_banner_clicks를 집계 테이블로
 * 옮기고 같은 트랜잭션에서 원본을 지웁니다. 여러 API 인스턴스가 동시에 돌지 않게 트랜잭션 advisory lock을 잡습니다.
 * 실행마다 Sentry Cron 체크인(`in_progress` → `ok`·`error`)을 보냅니다. `SENTRY_DSN`이 비면 보내지 않고 작업만 실행합니다.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly database: Database) {}

  onApplicationBootstrap() {
    const runLogged = () =>
      Sentry.withMonitor(RETENTION_MONITOR_SLUG, () => this.runOnce(), RETENTION_MONITOR_CONFIG).catch(
        (error: unknown) =>
          this.logger.error(`보존 작업 실패: ${error instanceof Error ? error.message : String(error)}`),
      );
    void runLogged();
    this.timer = setInterval(runLogged, DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** 한 번 실행합니다. 다른 인스턴스가 실행 중이면 끝날 때까지 기다렸다가 남은 것만 처리합니다. */
  async runOnce(): Promise<{ visits: number; linkClicks: number; bannerClicks: number; reservations: number }> {
    const moved = await this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [RETENTION_LOCK_KEY]);
      // 오늘(Asia/Seoul) - 365일 0시보다 이전 원본이 대상입니다.
      const boundary = await client.query<{ boundary: Date }>(
        `SELECT ((((now() AT TIME ZONE $1)::date - $2::int)::timestamp) AT TIME ZONE $1) AS boundary`,
        [STATS_TIME_ZONE, CRELINK_LIMITS.rawLogRetentionDays],
      );
      const values = [STATS_TIME_ZONE, boundary.rows[0].boundary];
      await client.query(
        `INSERT INTO visit_daily_rollups (day, short_link_id, visits, unique_visitors, link_clicks)
         SELECT day, short_link_id, sum(visits), sum(unique_visitors), sum(link_clicks) FROM (
           SELECT (occurred_at AT TIME ZONE $1)::date AS day, short_link_id,
                  count(*) AS visits, count(DISTINCT visitor_id) AS unique_visitors, 0 AS link_clicks
           FROM visits WHERE occurred_at < $2 GROUP BY 1, 2
           UNION ALL
           SELECT (occurred_at AT TIME ZONE $1)::date, short_link_id, 0, 0, count(*)
           FROM link_clicks WHERE occurred_at < $2 GROUP BY 1, 2
         ) old GROUP BY day, short_link_id
         ON CONFLICT (short_link_id, day) DO UPDATE SET
           visits = visit_daily_rollups.visits + EXCLUDED.visits,
           unique_visitors = visit_daily_rollups.unique_visitors + EXCLUDED.unique_visitors,
           link_clicks = visit_daily_rollups.link_clicks + EXCLUDED.link_clicks`,
        values,
      );
      // 분포(R10)는 IP 없이 값별 방문 수만 남깁니다. 값이 없으면 'unknown'.
      await client.query(
        `INSERT INTO visit_dimension_rollups (day, short_link_id, dimension, value, visits)
         SELECT (occurred_at AT TIME ZONE $1)::date, short_link_id, d.dimension, coalesce(d.value, 'unknown'), count(*)
         FROM visits,
              LATERAL (VALUES ('referrer_host', referrer_host), ('device_type', device_type), ('browser', browser),
                              ('os', os), ('country', country)) AS d(dimension, value)
         WHERE occurred_at < $2
         GROUP BY 1, 2, 3, 4
         ON CONFLICT (short_link_id, day, dimension, value) DO UPDATE SET
           visits = visit_dimension_rollups.visits + EXCLUDED.visits`,
        values,
      );
      await client.query(
        `INSERT INTO link_click_rollups (day, short_link_id, link_public_id, clicks)
         SELECT (occurred_at AT TIME ZONE $1)::date, short_link_id, link_public_id, count(*)
         FROM link_clicks WHERE occurred_at < $2 GROUP BY 1, 2, 3
         ON CONFLICT (short_link_id, day, link_public_id) DO UPDATE SET
           clicks = link_click_rollups.clicks + EXCLUDED.clicks`,
        values,
      );
      // 크리에이터 배너 클릭은 visit_daily_rollups.link_clicks에 섞지 않고 배너별 집계로만 옮깁니다.
      await client.query(
        `INSERT INTO creator_banner_click_rollups (day, short_link_id, banner_public_id, clicks)
         SELECT (occurred_at AT TIME ZONE $1)::date, short_link_id, banner_public_id, count(*)
         FROM creator_banner_clicks WHERE occurred_at < $2 GROUP BY 1, 2, 3
         ON CONFLICT (short_link_id, day, banner_public_id) DO UPDATE SET
           clicks = creator_banner_click_rollups.clicks + EXCLUDED.clicks`,
        values,
      );
      // 브라우저 보고 계측은 기존 302 클릭 지표와 섞지 않고 개인 식별 없는 일별 집계만 남깁니다.
      await client.query(
        `INSERT INTO landing_event_daily_rollups(day, short_link_id, kind, target_kind, target_id,
           events, unique_visitors, unique_sessions, active_ms, max_scroll_percent,
           clicked_page_views, observed_clicks, scroll_25, scroll_50, scroll_75, scroll_100)
         SELECT (e.occurred_at AT TIME ZONE $1)::date, e.short_link_id, e.kind, e.target_kind, e.target_id,
           count(*)::int, count(DISTINCT e.visitor_id)::int, count(DISTINCT e.session_id)::int,
           coalesce(sum(e.active_ms) FILTER (WHERE e.kind='page_view'),0), max(e.scroll_percent),
           count(*) FILTER (WHERE e.kind='page_view' AND EXISTS (
             SELECT 1 FROM landing_events c WHERE c.page_view_id=e.page_view_id AND c.kind='click'))::int,
           count(*) FILTER (WHERE e.kind='impression' AND EXISTS (
             SELECT 1 FROM landing_events c WHERE c.page_view_id=e.page_view_id AND c.kind='click'
               AND c.target_kind=e.target_kind AND c.target_id=e.target_id AND c.occurred_at>=e.occurred_at))::int,
           count(*) FILTER (WHERE e.kind='page_view' AND e.scroll_percent>=25)::int,
           count(*) FILTER (WHERE e.kind='page_view' AND e.scroll_percent>=50)::int,
           count(*) FILTER (WHERE e.kind='page_view' AND e.scroll_percent>=75)::int,
           count(*) FILTER (WHERE e.kind='page_view' AND e.scroll_percent>=100)::int
         FROM landing_events e WHERE e.occurred_at < $2 GROUP BY 1,2,3,4,5
         ON CONFLICT(short_link_id,day,kind,target_kind,target_id) DO UPDATE SET
           events=landing_event_daily_rollups.events+EXCLUDED.events,
           unique_visitors=landing_event_daily_rollups.unique_visitors+EXCLUDED.unique_visitors,
           unique_sessions=landing_event_daily_rollups.unique_sessions+EXCLUDED.unique_sessions,
           active_ms=landing_event_daily_rollups.active_ms+EXCLUDED.active_ms,
           max_scroll_percent=greatest(landing_event_daily_rollups.max_scroll_percent,EXCLUDED.max_scroll_percent),
           clicked_page_views=landing_event_daily_rollups.clicked_page_views+EXCLUDED.clicked_page_views,
           observed_clicks=landing_event_daily_rollups.observed_clicks+EXCLUDED.observed_clicks,
           scroll_25=landing_event_daily_rollups.scroll_25+EXCLUDED.scroll_25,
           scroll_50=landing_event_daily_rollups.scroll_50+EXCLUDED.scroll_50,
           scroll_75=landing_event_daily_rollups.scroll_75+EXCLUDED.scroll_75,
           scroll_100=landing_event_daily_rollups.scroll_100+EXCLUDED.scroll_100`,
        values,
      );
      await client.query(
        `INSERT INTO landing_event_dimension_rollups(day,short_link_id,dimension,value,page_views)
         SELECT (e.occurred_at AT TIME ZONE $1)::date,e.short_link_id,d.dimension,
           coalesce(nullif(d.value,''),'unknown'),count(*)::int
         FROM landing_events e, ${ANALYTICS_DIMENSIONS_SQL}
         WHERE e.kind='page_view' AND e.occurred_at<$2 GROUP BY 1,2,3,4
         ON CONFLICT(short_link_id,day,dimension,value) DO UPDATE SET
           page_views=landing_event_dimension_rollups.page_views+EXCLUDED.page_views`,
        values,
      );
      await client.query('DELETE FROM landing_events WHERE occurred_at < $1', [boundary.rows[0].boundary]);
      await client.query("DELETE FROM landing_event_limits WHERE window_start < now() - interval '15 minutes'");
      const visits = await client.query('DELETE FROM visits WHERE occurred_at < $1', [boundary.rows[0].boundary]);
      const clicks = await client.query('DELETE FROM link_clicks WHERE occurred_at < $1', [boundary.rows[0].boundary]);
      const bannerClicks = await client.query('DELETE FROM creator_banner_clicks WHERE occurred_at < $1', [
        boundary.rows[0].boundary,
      ]);
      // 사전 신청(R30)은 집계 없이 보관 기간이 지나면 지웁니다. 기능 플래그와 무관하게 돕니다.
      const reservations = await client.query(
        'DELETE FROM link_reservations WHERE created_at < now() - make_interval(days => $1)',
        [CRELINK_LIMITS.reservationRetentionDays],
      );
      return {
        visits: visits.rowCount ?? 0,
        linkClicks: clicks.rowCount ?? 0,
        bannerClicks: bannerClicks.rowCount ?? 0,
        reservations: reservations.rowCount ?? 0,
      };
    });
    this.logger.log(
      `보존 작업 완료: 방문 원본 ${moved.visits}건, 클릭 원본 ${moved.linkClicks}건, 배너 클릭 원본 ${moved.bannerClicks}건을 집계로 옮기고 지웠습니다. 사전 신청 ${moved.reservations}건을 지웠습니다.`,
    );
    return moved;
  }
}
