SET LOCAL lock_timeout = '5s';
-- 쓰지 않는 링크 슬롯 데이터 삭제(work item 0179, 2026-10-12 사용자 결정 "사용하지 않는 데이터를 db에서 지우자").
-- 0175(0007)에서 운영자 추가 슬롯과 링크 슬롯 +5 이벤트(R24 철회)를 코드에서 걷어 낸 뒤 남겨 둔 컬럼·테이블을 지웁니다(contract).
-- 0007 이후 API는 이 컬럼·테이블을 읽지 않으므로 Blue/Green 겹침 동안 옛 색도 영향이 없습니다.
-- 운영자 행동 기록(operator_actions)의 지난 creator.extra_slots·slot_event.period_update 행은 감사 기록이라 그대로 둡니다.
-- 첫 줄의 lock_timeout: users ALTER가 5초 안에 잠금을 잡지 못하면 이 파일 전체가 되돌려지고 새 색이 기동에 실패합니다(활성 색 유지).
-- 되돌릴 수 없습니다. 운영 데이터는 적용 전에 백업했습니다(행 수·백업 위치: docs/work/api/0179-drop-retired-link-slot-data.md 진행 기록).
-- 이 migration 뒤에는 0007보다 앞선 릴리스(extra_link_slots·slot_event_entries를 읽는 코드)로 롤백하면 API가 실패합니다.
-- 복구가 필요하면 0005_slot_event.sql의 CREATE TABLE·INDEX와 0001의 extra_link_slots 정의로 다시 만들고 백업을 넣는 새 migration을 씁니다.

DROP TABLE slot_event_entries;
DROP TABLE slot_events;
ALTER TABLE users DROP COLUMN extra_link_slots;
