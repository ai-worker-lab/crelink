import { Database } from '../database';

/** `landing_event_limits`의 오래된 버킷을 지우는 기준(분). 창은 이 값보다 길게 쓸 수 없습니다. */
const LIMIT_BUCKET_TTL_MINUTES = 15;

/**
 * 서명된 방문자·방문 시각과 연결되는 단축 주소 방문(`visits` 별칭 `v`). 파라미터 `$1` publicId, `$2` visitorId, `$3` sourceAt(epoch 초).
 * BFF 소켓·임의 XFF는 방문자 IP가 아니므로, 방문자 IP는 이 경로로만 얻습니다.
 * shortcut: 시각으로 연결해 동시 진입은 구분 못 함, 진입별 정확한 연결이 필요하면 방문 ID를 서명에 포함합니다.
 */
export const SOURCE_VISIT_SQL = `FROM visits v JOIN short_links sl ON sl.id=v.short_link_id JOIN landings l ON l.id=sl.landing_id
       WHERE l.public_id=$1 AND v.visitor_id=$2
         AND v.occurred_at BETWEEN to_timestamp($3::double precision-5) AND to_timestamp($3::double precision+60)
       ORDER BY abs(extract(epoch FROM v.occurred_at)-$3::double precision) LIMIT 1`;

/**
 * 고정 창 제한 버킷을 순서대로 하나씩 소비합니다. 한 버킷이라도 넘으면 false이고 뒤 버킷은 소비하지 않습니다.
 * 트랜잭션은 커밋하므로 초과한 요청도 앞 버킷에 남습니다. 방문 이벤트와 사전 신청이 같은 테이블을 쓰며 버킷 이름으로 분리합니다.
 */
export async function consumeLimitBuckets(
  database: Database,
  buckets: ReadonlyArray<readonly [string, number]>,
  windowMinutes: number,
): Promise<boolean> {
  if (windowMinutes > LIMIT_BUCKET_TTL_MINUTES)
    throw new Error(`제한 창은 ${LIMIT_BUCKET_TTL_MINUTES}분을 넘을 수 없습니다.`);
  return database.transaction(async (client) => {
    await client.query("DELETE FROM landing_event_limits WHERE window_start < now() - interval '15 minutes'");
    for (const [bucket, max] of buckets) {
      const result = await client.query<{ used: number }>(
        `INSERT INTO landing_event_limits(bucket,used) VALUES($1,1)
         ON CONFLICT(bucket) DO UPDATE SET used = CASE WHEN landing_event_limits.window_start < now() - make_interval(mins => $2) THEN 1 ELSE landing_event_limits.used + 1 END,
         window_start = CASE WHEN landing_event_limits.window_start < now() - make_interval(mins => $2) THEN now() ELSE landing_event_limits.window_start END RETURNING used`,
        [bucket, windowMinutes],
      );
      if (result.rows[0].used > max) return false;
    }
    return true;
  });
}
