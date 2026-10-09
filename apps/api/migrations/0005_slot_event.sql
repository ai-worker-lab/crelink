SET LOCAL lock_timeout = '5s';
-- 링크 슬롯 +5 이벤트(R24). 근거: docs/specs/crelink-slot-event.md (데이터 모델).
-- 새 테이블과 시드 행만 더합니다(expand). 옛 API는 이 테이블을 모르고 한도를 5 + 추가 슬롯으로 계산합니다.
-- 첫 줄의 lock_timeout: 기존 테이블을 고치지 않지만 users FK 추가가 users 잠금을 5초 안에 잡지 못하면 이 파일 전체가 되돌려지고 새 색이 기동에 실패합니다(활성 색 유지).
-- 시드 이벤트는 이 migration을 실행한 트랜잭션 시각(now())에 열리고 끝이 없습니다. 끝은 운영자 화면(PUT /api/admin/slot-event)에서 정합니다.
-- 되돌리기(운영 데이터가 생기기 전, 운영 DB는 명시적 승인 뒤 손으로):
--   DROP TABLE slot_event_entries, slot_events;
--   DELETE FROM schema_migrations WHERE version = '0005_slot_event';
-- 신청 행이 생긴 뒤에는 지우지 않고(보너스 회수 없음) 다음 migration으로 고칩니다. 기능만 끄려면 운영자가 끝을 지금으로 저장합니다.

-- 이벤트 한 행. 열림 = starts_at <= now() < ends_at(끝 없음이면 계속). 같은 시각 끝은 한 번도 열리지 않는 입력 실수라 막습니다.
CREATE TABLE slot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{1,40}$'),
  bonus_links integer NOT NULL CHECK (bonus_links BETWEEN 1 AND 45),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

-- 신청 한 행(계정당 이벤트마다 한 번, R24 ①). bonus_links는 신청 시점 이벤트 값의 사본이라 이벤트 설정이 바뀌어도 그대로입니다.
-- 계정을 지우면 함께 지워지고(R24 ⑦), 신청 행이 있는 이벤트는 지울 수 없습니다(받은 보너스 보호).
CREATE TABLE slot_event_entries (
  event_id uuid NOT NULL REFERENCES slot_events (id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bonus_links integer NOT NULL CHECK (bonus_links BETWEEN 1 AND 45),
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
-- 운영자 신청자 목록(최신순)과 한도 합(사용자별).
CREATE INDEX slot_event_entries_event_id_applied_at_idx ON slot_event_entries (event_id, applied_at DESC);
CREATE INDEX slot_event_entries_user_id_idx ON slot_event_entries (user_id);

INSERT INTO slot_events (code, bonus_links, starts_at, ends_at) VALUES ('link-slots-plus-5', 5, now(), NULL);
