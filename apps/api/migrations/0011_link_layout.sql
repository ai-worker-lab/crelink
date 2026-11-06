SET LOCAL lock_timeout = '5s';
-- 추가 전용입니다. 이전 API로 rollback할 때도 컬럼을 남겨 두며 값은 보존합니다.
ALTER TABLE landings ADD COLUMN link_layout text NOT NULL DEFAULT 'list'
  CHECK (link_layout IN ('list', 'grid'));
