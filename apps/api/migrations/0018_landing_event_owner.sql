SET LOCAL lock_timeout = '5s';
-- 크리에이터 본인 방문 표시(0233). 숫자에서 빼지 않고 표시만 하며 계정·세션 값은 저장하지 않습니다.
-- 추가 전용입니다. 이전 API로 rollback할 때도 컬럼과 값을 남겨 둡니다. 과거 행은 구분할 수 없어 false이고, 조회는 첫 본인 표시 전 구간을 표시 없음으로 다룹니다.
ALTER TABLE landing_events ADD COLUMN is_owner boolean NOT NULL DEFAULT false;
