/**
 * Instagram 표의 잠금 순서. 모든 경로가 이 순서로 잠가 40P01(교착)을 막습니다. 설계: docs/specs/instagram-comment-dm.md#잠금-순서.
 *
 *   platform_settings → instagram_connections(여러 행이면 id 순) → users → instagram_dm_rules(여러 행이면 id 순) → instagram_dm_deliveries
 *
 * - `instagram_dm_deliveries`를 여러 행 바꾸는 트랜잭션은 그 행들의 연결 행을 먼저 잡습니다. 같은 연결의 일괄 변경이 연결 행으로 줄을 서므로
 *   발송 행끼리의 순서는 따로 정하지 않습니다. 연결 행을 잡지 않는 일괄 변경(worker `sweep`)은 `SKIP LOCKED`로 기다리지 않습니다.
 * - 웹훅 저장(`FOR SHARE`)이 쓰기 트랜잭션과 줄을 서는 것은 잠금을 잡은 뒤 INSERT의 새 스냅샷이 현재 값을 보기 때문입니다.
 * - worker 선점은 `SKIP LOCKED`라 기다리지 않아 교착에 끼지 않습니다.
 */
export const LOCK_SETTINGS = 'SELECT 1 FROM platform_settings FOR SHARE';
export const LOCK_CONNECTIONS = 'SELECT id FROM instagram_connections WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE';
export const LOCK_CONNECTIONS_OF_ACCOUNT =
  'SELECT id FROM instagram_connections WHERE ig_user_id = $1 ORDER BY id FOR SHARE';
export const LOCK_ALL_CONNECTIONS = 'SELECT id FROM instagram_connections ORDER BY id FOR NO KEY UPDATE';
export const LOCK_RULES = 'SELECT id FROM instagram_dm_rules WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE';
