# 0179 쓰지 않는 추가 슬롯·링크 슬롯 이벤트 데이터 삭제 결정

- 단계: 티켓
- 역할: api
- 상태: 분류 대기
- 종류: 유지보수
- 우선순위: P3 (AI 제안)
- 작성일: 2026-10-12

## 목적

0175에서 운영자 추가 슬롯과 링크 슬롯 이벤트를 제거했지만, 데이터 파괴 금지 정책과 사용자 안내(기존 부여 기록 보존)에 따라 DB는 그대로 두었습니다. 남은 컬럼·테이블을 언제 지울지 사람이 명시적으로 정해야 합니다.

## 수용 기준

- [ ] 사용자가 삭제 여부와 시점을 명시적으로 결정합니다(결정 전에는 아무것도 지우지 않음).
- [ ] 삭제로 정하면 새 migration이 `users.extra_link_slots`, `slot_event_entries`, `slot_events`를 지우고, 지우기 전 행 수와 백업 위치를 진행 기록에 남깁니다.

## 범위

- 포함: `users.extra_link_slots`(0001), `slot_events`·`slot_event_entries`(0005).
- 제외: 운영자 행동 기록(`operator_actions`)의 지난 `creator.extra_slots`·`slot_event.period_update` 행(감사 기록이라 지우지 않음).

## 위험·복구

삭제는 되돌릴 수 없습니다(백업 복원만 가능). 결정 전까지 현재 상태(읽지 않고 보관)는 비용이 거의 없습니다.

## 연결

- 에픽 [0175](../epics/0175-link-limit-ad-block-toggle.md), 설계 [기술 설계](../../specs/crelink-link-limit-ad-toggle.md) `데이터 모델`

## 진행 기록

- 2026-10-12: 생성(0175 통합 중 등록).
