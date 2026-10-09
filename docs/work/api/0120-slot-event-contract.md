# 0120 링크 슬롯 이벤트 공유 계약

- 단계: 티켓
- 역할: api
- 상위: 0089
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

링크 슬롯 +5 이벤트 기술 설계의 티켓 분해 0120입니다. 웹·API가 병렬로 구현할 수 있게 공유 타입·오류 코드·경로를 먼저 확정합니다.

## 수용 기준

- [x] `packages/shared/src/crelink.ts` 새 절 `링크 슬롯 이벤트 (R24)`에 설계 `공유 타입 초안`의 타입, `CrelinkErrorCode` 3개, `CRELINK_API_PATHS` 3개, `CreatorLandingState.slotEvent`·`OperatorCreatorDetail.slotEvent`, `LinkLimits.visibleMax` 주석이 있습니다. 확인: `pnpm --filter @crelink/shared build`.

## 범위

- 포함: 위 수용 기준.
- 제외: API·웹 구현(0121~0124).

## 위험·복구

해당 없음(타입만). `packages/shared/src/crelink.ts`는 에픽 0088과 함께 고치므로 새 타입은 파일 끝 새 절에 모았습니다.

## 연결

- 설계: [링크 슬롯 +5 이벤트 기술 설계](../../specs/crelink-slot-event.md) `API 계약 초안`
- 요구: [PRD](../../product/crelink.md) R24

## 진행 기록

- 2026-10-10: 생성(0092 설계 분해). 통합 브랜치 `work/0092-slot-event-design`에서 orchestrator가 바로 반영했습니다(계약이 웹·API 병렬 착수의 선행이라).
- 2026-10-10: `pnpm --filter @crelink/shared build` 통과. 설계 초안과 다른 점 하나: `OperatorSlotEventResponse.event`는 null이 아님(이벤트가 없으면 404이므로, 설계에도 반영). 0125 통합에서 API·웹이 이 계약을 끝까지 쓰는 것을 `pnpm verify`·E2E로 확인하고 `완료`로 바꿨습니다.
