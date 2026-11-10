SET LOCAL lock_timeout = '5s';
-- 공유관리 페이지. 근거: docs/specs/shared-pages.md (데이터 모델).
-- 새 테이블만 추가하므로 기존 API와 함께 배포할 수 있습니다.
-- 되돌리기(운영 데이터 생성 전, 운영 DB는 명시적 승인 뒤):
-- DROP TABLE page_invites, page_members;
-- DELETE FROM schema_migrations WHERE version = '0014_shared_pages';
-- 데이터 생성 뒤에는 다음 migration으로 고칩니다.
CREATE TABLE page_members (
  page_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_user_id, member_user_id),
  CHECK (page_user_id <> member_user_id)
);
CREATE INDEX page_members_member_idx ON page_members (member_user_id);
CREATE TABLE page_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX page_invites_page_idx ON page_invites (page_user_id);
