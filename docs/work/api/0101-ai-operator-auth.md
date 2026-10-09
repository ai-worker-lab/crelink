# 0101 AI 계정·API 토큰 인증·실행 헤더·멈춤 검사·토큰 CLI

- 단계: 티켓
- 역할: api
- 상위: 0088
- 선행: 0100
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

AI 운영자가 사람 Google 로그인 없이 전용 계정 토큰으로 운영자·크리에이터 API를 쓰게 하고, 실행 밖 쓰기와 멈춤 중 쓰기를 막습니다. 요구는 R23 ①⑥입니다.

## 수용 기준

- [x] migration `apps/api/migrations/0004_ai_operator.sql`이 설계 `데이터 모델` 그대로(expand, `lock_timeout`, 되돌리기 주석) 있고 migration 테스트가 통과합니다.
- [x] 세 가드가 공용 인증으로 Bearer 토큰을 받습니다. 유효 토큰은 통과, 형식 오류·없음·폐기·정지·사람 계정 토큰은 401(OptionalSessionGuard 포함). `last_used_at` 1분 갱신. 확인: API 통합 테스트.
- [x] `@CurrentActor()`·`@ActorKinds`·`@AgentRunExempt`·`@AllowWhilePaused`와 오류 우선순위, AI 상태 변경 요청의 실행 헤더 409 `agent_run_required`(90분 조건 포함)·멈춤 409 `ai_operator_paused`가 운영자·크리에이터 API에 적용됩니다. 확인: API 통합 테스트.
- [x] `provisionAccount` 분리, CLI `apps/api/src/cli/ai-operator.ts`(`ensure-account`·`issue-token`·`list-tokens`·`revoke-token`)가 설계 `CLI` 규칙대로 동작합니다. 확인: 명령 함수 통합 테스트와 로컬 빌드 산출물 실제 실행.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ai-operator.md) `데이터 모델`·`인증·권한 규칙`·`CLI`.
- 제외: 행동 기록(0102), 실행 기록·지표(0103).

## 위험·복구

인증 경로를 바꿉니다. 쿠키 로그인 회귀는 기존 통합 테스트(`auth.e2e-spec.ts` 등)로 확인합니다. migration은 expand라 롤백 시 옛 API가 그대로 동작합니다(AI만 401).

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `티켓 분해` 0101
- 요구: [PRD](../../product/crelink.md#요구사항) R23 ①⑥

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해).
- 2026-10-10: 구현(api 담당, 통합 브랜치 `work/0091-ai-operator-design`, 커밋하지 않음).
  - migration `0004_ai_operator.sql`(설계 SQL 그대로, 첫 줄 `SET LOCAL lock_timeout = '5s'`, 머리말 되돌리기). 공용 인증 `AuthService.authenticateRequest`(Bearer면 쿠키 무시, `AI_TOKEN_PATTERN` → `api_tokens` 해시 조회 + `kind='ai' AND suspended_at IS NULL` + 폐기 제외, 같은 문장에서 `last_used_at` 1분 갱신), `src/auth/actor.ts`(`RequestActor`, `@CurrentActor`, `@ActorKinds`·`@AgentRunExempt`·`@AllowWhilePaused`), `src/auth/actor-policy.ts` `ActorPolicy`(AuthModule export, 세 가드가 인증 직후 부름). `provisionAccount`(`src/auth/provision.ts`), `withTransaction`(`src/database.ts`), `loadLocalEnvironment(file?)`, `hashToken`(`src/auth/token-hash.ts`). CLI `src/cli/ai-operator.ts`, 패키지 스크립트 `ai-operator`, 토큰 함수 `src/ai-operator/tokens.ts`.
  - 설계와 다른 점: CLI는 0004 전 DB를 `42P01`(테이블 없음)과 `42703`(컬럼 없음, `ensure-account`가 `users.kind`를 먼저 읽음) 둘 다 같은 안내로 처리합니다. `list-tokens` 첫 줄은 머리글(`id\tlabel\tprefix\tcreated_at\tlast_used_at\trevoked_at`)입니다. pnpm 스크립트로 부를 때는 `--silent`가 있어야 표준 출력이 결과만 남습니다(문서에 적음).
  - 실행: `pnpm --filter @crelink/shared build && pnpm --filter @crelink/api typecheck` 통과. `TEST_DATABASE_URL=postgresql://crelink:…@127.0.0.1:5952/crelink pnpm --filter @crelink/api test` 27 스위트 208건 통과(새 `test/ai-operator-auth.e2e-spec.ts` 7건, `test/ai-operator-cli.e2e-spec.ts` 6건, `test/migrations.e2e-spec.ts` 0004 4건, 기존 `auth.e2e-spec.ts` 등 회귀 없음). `pnpm exec eslint apps/api packages/shared` 0, `prettier --check apps/api packages/shared` 통과.
  - 로컬 빌드 산출물 실제 실행(DB 127.0.0.1:5952/crelink): `pnpm --filter @crelink/api build` 뒤 `node apps/api/dist/cli/ai-operator.js list-tokens` → 0004 전 DB라 "AI 운영자 테이블이 없습니다. migration 0004_ai_operator가 적용된 API를 먼저 배포…" 종료 1. dist `runMigrations`로 로컬 DB에 0001~0004 적용(빈 DB였음) 뒤 `ensure-account` 종료 0(userId 출력), `issue-token --label local-check` 종료 0(표준 출력 1줄 50자 `crl_ai_…`, 원문은 기록하지 않고 버림), `list-tokens` 종료 0(머리글 + 1행, 원문 없음), `pnpm --filter @crelink/api ai-operator revoke-token <id>` 종료 0(로컬 토큰 폐기), 없는 id 폐기 종료 1.
- 2026-10-10: 통합 확인(orchestrator, 0091 진행 기록). 실제 웹 토큰 경로로 E2E `tests/e2e/ai-operator.spec.ts` 통과(토큰 없음 401·토큰 200·실행 헤더 없는 쓰기 409·멈춤 409·폐기 뒤 401), 로컬 CLI `issue-token`·`list-tokens` 실제 실행, `pnpm verify` 통과. 상태 `완료`.
