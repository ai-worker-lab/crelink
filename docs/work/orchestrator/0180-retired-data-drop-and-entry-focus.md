# 0180 옛 슬롯 데이터 삭제와 진입·사용 허들 우선 방향 기록

- 단계: 티켓
- 역할: orchestrator
- 선행: 0175
- 상태: 검증
- 종류: 제품 결정
- 우선순위: P2
- 작성일: 2026-10-12

## 목적

2026-10-12 사용자 결정 두 가지를 한 PR로 반영합니다.

1. "0179: 사용하지 않는 데이터를 db에서 지우자." 0175에서 기능만 걷어 내고 남겨 둔 `users.extra_link_slots`, `slot_events`, `slot_event_entries`를 지웁니다.
2. "수익 쉐어 조건은 보류를 놔두자. 사용자의 진입, 사용 허들을 낮추는데 초점을 맞추자." 광고 수익 쉐어 조건을 보류로 두고, 제품 우선 방향을 PRD `목표`에 기록합니다.

## 수용 기준

- [x] 0179 수용 기준(운영 백업·행 수 기록, migration `0008_drop_retired_link_slot_data`)을 채웁니다.
- [x] `/privacy`가 이벤트 신청 기록을 더는 수집·보관 항목으로 고지하지 않고, 지운 사실을 적습니다.
- [x] PRD `목표`에 우선 방향(진입·사용 허들 낮추기, 광고 수익 쉐어 보류)이 `[사용자 확정, 2026-10-12]`로 있고, R20 참고와 설계 `미정`의 수익 배분이 `[보류]`입니다.
- [x] 관련 설계·API 문서·사람 할 일 목록에서 "지우지 않고 보관" 서술을 고칩니다.
- [ ] main 머지 뒤 Deploy가 성공합니다(`운영 주소 검사` 포함).

## 범위

- 포함: `apps/api/migrations/0008_drop_retired_link_slot_data.sql`, API migration 시험, `/privacy` 문구, PRD·설계·API 문서·변경 기록·`docs/ops/human-todo.md`.
- 제외: 운영자 행동 기록의 지난 `creator.extra_slots`·`slot_event.period_update` 행(감사 기록), 진입·사용 허들을 낮추는 구체 기능(우선 방향만 기록하고, 과제는 따로 work item으로 정함), 광고 수익 쉐어 설계.

## 위험·복구

migration은 운영 데이터를 지우고 되돌릴 수 없습니다. 백업과 롤백 제약은 [0179](../api/0179-drop-retired-link-slot-data.md)에 있습니다.

## 연결

- [0179](../api/0179-drop-retired-link-slot-data.md), 에픽 [0175](../epics/0175-link-limit-ad-block-toggle.md), [PRD](../../product/crelink.md) `목표`·R20·R24, [기술 설계](../../specs/crelink-link-limit-ad-toggle.md)

## 진행 기록

- 2026-10-12: 생성·착수(브랜치 `work/0180-retired-data-drop-and-entry-focus`, 기준 origin/main `c7824d2`).
- 2026-10-12: 검증(Node 24.20.0, 이 worktree 인스턴스 DB). `pnpm verify` 8단계 통과(API 28 suites·223 tests, 실제 PostgreSQL). `make api-up web-up` 기동 시 migration 적용 확인: 마지막 적용 `0008_drop_retired_link_slot_data`, `slot_event%` 테이블 0개, `users.extra_link_slots` 컬럼 0개. `pnpm smoke` 5건, `pnpm e2e` 17건 통과. 로컬 `/privacy`에 "끝난 외부 링크 +5 이벤트의 신청 기록은 2026년 10월 12일에 모두 지웠어요." 노출, 옛 수집 문구 없음. `검증`으로 넘깁니다.
