-- 리스트 밀도(R5). 기존 랜딩은 8개형으로 유지합니다.
-- 추가 전용입니다. 이전 API로 rollback할 때도 컬럼과 값을 남겨 둡니다.
ALTER TABLE landings ADD COLUMN list_density smallint NOT NULL DEFAULT 8
  CHECK (list_density IN (8, 10, 12));
