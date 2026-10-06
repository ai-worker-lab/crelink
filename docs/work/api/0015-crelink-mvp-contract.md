# 0015 크리링 MVP API 계약

- 단계: 티켓
- 역할: api
- 상위: 0014
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

API와 웹이 병렬로 구현할 수 있도록 경로·DTO·오류 코드를 `packages/shared`에 확정합니다.

## 수용 기준

- [x] 설계 `API 계약 초안`의 경로·요청·응답 DTO·오류 코드·임시 한도 값이 `packages/shared/src`에 있다.
- [x] `pnpm typecheck`가 통과한다.

## 범위

- 포함: `packages/shared` 타입·상수.
- 제외: 구현.

## 위험·복구

해당 없음

## 연결

- 설계: [API 계약 초안](../../specs/crelink-mvp.md#api-계약-초안), [데이터 모델](../../specs/crelink-mvp.md#데이터-모델)
- 요구: R1~R16

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: `packages/shared/src/crelink.ts` 작성, `index.ts`에서 내보냄. `pnpm --filter @crelink/shared build`·`pnpm typecheck` 통과. 설계와의 차이: 운영자 정지(`creator_not_found`)·도메인 삭제(`domain_not_found`)·주소 가용성 사유 `same_as_current` 오류 코드를 추가.
