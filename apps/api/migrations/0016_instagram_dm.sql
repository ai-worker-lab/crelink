SET LOCAL lock_timeout = '5s';
-- Instagram 댓글 자동 DM(0254). 근거: docs/specs/instagram-comment-dm.md (데이터 모델).
-- 추가만 하므로 두 색이 겹쳐도 안전합니다. 기능은 instagram_dm_audience 기본값 off로 꺼져 있습니다.
-- 되돌리기(운영 데이터 생성 전, 운영 DB는 명시적 승인 뒤):
-- DROP TABLE instagram_deletion_requests, instagram_opt_out_owners, instagram_dm_opt_outs, instagram_dm_deliveries, instagram_dm_rules, instagram_connections;
-- ALTER TABLE platform_settings DROP COLUMN instagram_dm_audience;
-- DELETE FROM schema_migrations WHERE version = '0016_instagram_dm';
-- 데이터 생성 뒤에는 다음 migration으로 고칩니다.
ALTER TABLE platform_settings ADD COLUMN instagram_dm_audience text NOT NULL DEFAULT 'off'
  CHECK (instagram_dm_audience IN ('off','operators','everyone'));

CREATE TABLE instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  ig_user_id text NOT NULL,            -- /<IG_ID>/messages, 웹훅 entry.id
  meta_user_id text,                   -- signed_request user_id 대조용(S9)
  ig_username text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','messages_access_required','reauth_required')),
  token_ciphertext bytea,              -- iv || tag || ct, reauth_required면 NULL
  token_key_version smallint,
  token_expires_at timestamptz,        -- NULL이면 무기한
  token_revision int NOT NULL DEFAULT 1,  -- 토큰 교체마다 올림
  token_checked_at timestamptz NOT NULL DEFAULT now(),
  dm_paused_at timestamptz,            -- 크리에이터 정지
  operator_paused_at timestamptz,      -- 운영자 정지(크리에이터가 풀 수 없음)
  rate_window_started_at timestamptz NOT NULL DEFAULT now(),
  rate_window_count int NOT NULL DEFAULT 0,
  rate_limited_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'reauth_required') = (token_ciphertext IS NULL))
);
CREATE UNIQUE INDEX instagram_connections_ig_live
  ON instagram_connections (ig_user_id) WHERE status <> 'reauth_required';
-- 운영자 정지 확인(연결 시)과 수신 거부의 연결 잠금은 재인증 대기 행까지 ig_user_id로 찾습니다.
CREATE INDEX instagram_connections_ig_user ON instagram_connections (ig_user_id);
CREATE INDEX instagram_connections_check
  ON instagram_connections (token_checked_at) WHERE status <> 'reauth_required';
CREATE INDEX instagram_connections_meta_user
  ON instagram_connections (meta_user_id) WHERE meta_user_id IS NOT NULL;

CREATE TABLE instagram_dm_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]{10}$'),
  connection_id uuid NOT NULL REFERENCES instagram_connections (id) ON DELETE CASCADE,
  ig_media_id text NOT NULL,
  ig_media_child_ids text[] NOT NULL DEFAULT '{}',  -- S5 결과에 따라 쓰거나 뺀다
  version int NOT NULL DEFAULT 1,      -- keyword·message 수정, 비활성화, 보관마다 올림
  media_permalink text NOT NULL,
  media_caption_preview text NOT NULL DEFAULT '',
  keyword text NOT NULL CHECK (char_length(keyword) BETWEEN 1 AND 30),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 250),  -- 단위는 S11로 확정
  channel_link_code text NOT NULL REFERENCES channel_link_codes (code),
  enabled boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, connection_id)
);
CREATE UNIQUE INDEX instagram_dm_rules_one_per_media
  ON instagram_dm_rules (connection_id, ig_media_id) WHERE archived_at IS NULL;
CREATE INDEX instagram_dm_rules_active
  ON instagram_dm_rules (connection_id) WHERE archived_at IS NULL AND enabled;

CREATE TABLE instagram_dm_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES instagram_connections (id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  rule_version int NOT NULL,           -- 저장 시점의 규칙 version. 다르면 옛 문구이므로 보내지 않는다
  comment_id text NOT NULL,
  commenter_hash bytea NOT NULL CHECK (octet_length(commenter_hash) = 32),
  commented_at timestamptz NOT NULL,   -- 웹훅의 댓글 시각, 24시간 규칙의 기준
  message_body text NOT NULL,          -- 저장 시점의 최종 본문, 발송은 이 값으로만 한다
  status text NOT NULL CHECK (status IN
    ('pending','sending','sent','failed','unknown','expired','cancelled')),
  failure_code text,
  attempts smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, comment_id),
  FOREIGN KEY (rule_id, connection_id)
    REFERENCES instagram_dm_rules (id, connection_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX instagram_dm_deliveries_one_per_person ON instagram_dm_deliveries (rule_id, commenter_hash)
  WHERE status IN ('pending','sending','sent','unknown');
CREATE INDEX instagram_dm_deliveries_due ON instagram_dm_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX instagram_dm_deliveries_lease ON instagram_dm_deliveries (lease_until) WHERE status = 'sending';
CREATE INDEX instagram_dm_deliveries_history ON instagram_dm_deliveries (connection_id, created_at DESC, id DESC);
CREATE INDEX instagram_dm_deliveries_retention ON instagram_dm_deliveries (created_at);

CREATE TABLE instagram_dm_opt_outs (
  ig_user_id text NOT NULL,            -- 연결 FK 없음: 재연결·재인증에도 유지
  commenter_hash bytea NOT NULL CHECK (octet_length(commenter_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ig_user_id, commenter_hash)
);

-- Meta 데이터 삭제 콜백은 meta_user_id만 줍니다. 연결 행이 해제로 사라져도 수신 거부 기록을 찾아 파기하려고 대응표를 남깁니다.
CREATE TABLE instagram_opt_out_owners (
  ig_user_id text PRIMARY KEY,
  meta_user_id text NOT NULL
);
CREATE INDEX instagram_opt_out_owners_meta_user ON instagram_opt_out_owners (meta_user_id);

CREATE TABLE instagram_deletion_requests (
  confirmation_code text PRIMARY KEY CHECK (confirmation_code ~ '^[a-z0-9]{16}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
