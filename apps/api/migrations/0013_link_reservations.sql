SET LOCAL lock_timeout = '5s';
-- 링크별 사전 신청(R29~R31). 추가 전용입니다. 기존 컬럼·행을 바꾸지 않고, 이전 API로 rollback할 때도 컬럼과 값을 남겨 둡니다.
-- 기능은 RESERVATIONS_ENABLED로 꺼 두지만 migration은 플래그와 무관하게 적용됩니다. 운영 데이터가 생긴 뒤에는 지우지 않고 다음 migration으로 고칩니다.
ALTER TABLE links
  ADD COLUMN reservation_state text NOT NULL DEFAULT 'off' CHECK (reservation_state IN ('off', 'open', 'closed')),
  ADD COLUMN reservation_methods text[] NOT NULL DEFAULT '{}'::text[] CHECK (reservation_methods <@ ARRAY['email', 'phone']::text[]);

CREATE TABLE link_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES links (id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('email', 'phone')),
  -- 정규화한 연락처(이메일 소문자, 휴대폰 숫자만). 로그·오류 메시지·Sentry·분석 이벤트·URL에 남기지 않습니다.
  contact text NOT NULL,
  consent_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_id, method, contact)
);
CREATE INDEX link_reservations_list_idx ON link_reservations (link_id, created_at DESC, id DESC);
-- 보존 작업(90일 삭제)이 씁니다.
CREATE INDEX link_reservations_created_idx ON link_reservations (created_at);
