SET LOCAL lock_timeout = '5s';
-- 광고 블록 켜고 끄기(R20 ⑩): 운영자 플랫폼 스위치와 크리에이터 스위치. 근거: docs/specs/crelink-link-limit-ad-toggle.md (데이터 모델).
-- 새 테이블과 상수 기본값 컬럼만 더합니다(expand). 옛 API는 이 테이블·컬럼을 모르고 광고 블록을 그대로 그립니다.
-- 첫 줄의 lock_timeout: users ALTER가 5초 안에 잠금을 잡지 못하면 이 파일 전체가 되돌려지고 새 색이 기동에 실패합니다(활성 색 유지).
-- 두 스위치 모두 기본 false라 이 migration 뒤 새 API에서는 운영자가 켜기 전까지 광고 블록이 보이지 않습니다.
-- 링크 한도 단순화로 더 읽지 않는 users.extra_link_slots, slot_events, slot_event_entries와 그 행은 그대로 둡니다(삭제 결정: work item 0179).
-- 되돌리기(운영 데이터가 생기기 전, 운영 DB는 명시적 승인 뒤 손으로):
--   DROP TABLE platform_settings;
--   ALTER TABLE users DROP COLUMN ad_block_enabled;
--   DELETE FROM schema_migrations WHERE version = '0007_ad_block_toggle';
-- 운영 데이터가 생긴 뒤에는 지우지 않고 다음 migration으로 고칩니다.

-- 플랫폼 설정. 행은 항상 1개(id = true)입니다(ai_operator_settings와 같은 방식).
CREATE TABLE platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- 운영자 광고 블록 스위치. 꺼져 있으면 어떤 공개 랜딩에도 광고 블록을 그리지 않고 크리에이터 스위치도 바꿀 수 없습니다.
  ad_block_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL
);
INSERT INTO platform_settings DEFAULT VALUES;

-- 크리에이터 광고 블록 스위치(계정 단위). 배너 슬롯이 부여된 계정에는 쓰지 않습니다.
ALTER TABLE users ADD COLUMN ad_block_enabled boolean NOT NULL DEFAULT false;
