# 0268 계약·경계 시험 보강

- 단계: 티켓
- 역할: api
- 상위: 0251
- 선행: 0257, 0258, 0260
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

계약·경계 시험 보강

위험 등급 R1, 담당 Luna high.

## 수용 기준

- [ ] `... test -- instagram-contract` 통과. 대상 경계값에 두 ID 필드 포함

## 범위

- 포함: `apps/api/test/instagram-contract.e2e-spec.ts`, `packages/shared/src/instagram-dm.spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: DTO 경계 e2e와 shared 계약 시험을 추가했다. `pnpm --filter @crelink/shared test`, shared/API typecheck는 통과했다. e2e 명령은 시험 DB URL이 없어 `createTestDatabase` 단계에서 실패했으며, DB가 준비된 메인 세션에서 재실행해야 한다. R3의 서명·중복·토큰 비노출 기준은 기존 시험에 맡겼다.
- 2026-11-11: Claude가 로컬 DB에서 재검증(`instagram-contract` 4건, `@crelink/shared` 134건 통과).
