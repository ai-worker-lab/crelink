# 0100 AI 운영자 공유 계약

- 단계: 티켓
- 역할: api
- 상위: 0088
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

AI 운영자 기술 설계의 계약 티켓입니다. API·웹이 병렬로 구현할 수 있게 공유 타입·상수·오류 코드·경로를 먼저 확정합니다. 요구는 R23 ①③④⑥⑧입니다.

## 수용 기준

- [x] `packages/shared/src/crelink.ts`의 `AI 운영자 (R23)` 절에 설계 `공유 타입 초안`의 타입·상수(`AI_OPERATOR_LIMITS`, `AGENT_RUN_HEADER`, `AI_TOKEN_PREFIX`·`AI_TOKEN_PATTERN`, `AI_AGENT_PROXY_PATH`), `OperatorCreatorSummary.accountKind`·`metricsExcluded`, 오류 코드 6개, API·웹 경로 상수가 있습니다. 확인: 파일 검토.
- [x] 웹 `apps/web/src/lib/api/errors.ts`에 새 오류 코드 문구가 있고 `pnpm typecheck`가 통과합니다(API 구현 0101~0103과 함께).

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ai-operator.md) `API 계약 초안`.
- 제외: API·웹 구현.

## 위험·복구

해당 없음(타입만).

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `API 계약 초안`·`티켓 분해` 0100
- 요구: [PRD](../../product/crelink.md#요구사항) R23

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해). 통합 브랜치 `work/0091-ai-operator-design`에서 orchestrator가 계약을 먼저 썼습니다(웹 문구 포함, 0067 선례).
- 2026-10-10: api 담당 보정(0101~0103 구현 중). 형태 변경 없음. `AiOperatorStatus.runningRun`·`lastRun` 의미를 주석으로 확정(진행 중 실행 / 가장 최근에 시작한 `running` 밖 실행)하고, 커밋된 `crelink.ts`의 Prettier 형식 위반을 `prettier --write`로 고쳤습니다. 웹 담당에게 알렸고 웹 변경 없음. `pnpm --filter @crelink/shared build`·`pnpm --filter @crelink/api typecheck` 통과. 웹을 포함한 `pnpm typecheck`는 통합 때 orchestrator가 돌립니다.
- 2026-10-10: 통합 확인(orchestrator, 0091 진행 기록). `pnpm verify`의 typecheck(shared·api·web·app) 통과, API·웹이 계약 형태 변경 없이 구현. 경로 상수 중 `adminAgentRuns`는 `cursor`를 받는 함수(방명록 `landingGuestbook`과 같은 형식)입니다. 상태 `완료`.
