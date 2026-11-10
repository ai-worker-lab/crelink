# 0254 migration(위 스키마)·모듈 뼈대·설정(`META_*` 키)·암호화·v27.0 상수·Sentry(`E

- 단계: 티켓
- 역할: api
- 상위: 0251
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

migration(위 스키마)·모듈 뼈대·설정(`META_*` 키)·암호화·v27.0 상수·Sentry(`EAA` 스크럽)

위험 등급 R3, 담당 Opus high.

## 수용 기준

- [x] `pnpm --filter @crelink/api test -- "health|migrations|instagram-crypto|sentry"` 통과. 복호화 AAD 위조 실패, 부분 설정 기동 거부, 토큰 스크럽 시험; Graph 오류 코드·서브코드만 로그에 남고 원문 오류는 버려지는 시험; `INSTAGRAM_OPT_OUT_KEY`를 포함한 부분 설정 기동 거부

## 범위

- 포함: `apps/api/migrations/0016_instagram_dm.sql`, `apps/api/src/instagram/{instagram.module,crypto,graph,빈 controller·service}.ts`, `config.service.ts`, `app.module.ts`, `monitoring/sentry.ts`, `.env.example`, `docs/**`, `test/health.e2e-spec.ts`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현(worktree `0254-instagram-dm-foundation`). 스파이크 0252가 보류(승인 A1~A3 전)라 실제 Meta 호출 없이 fetch를 교체한 시험으로만 확인했습니다. 실제 Meta 연동은 미검증이고 `graph.ts`의 `[M?]` 호출 형식도 미실측입니다.
- 2026-11-11: 검증(`make infra-up` 뒤 실행). `pnpm --filter @crelink/api test -- "health|migrations|instagram-crypto|sentry"` 5 suites·79 tests 통과. `pnpm --filter @crelink/api test -- "config.service"` 31 tests 통과. `pnpm --filter @crelink/api test` 36 suites·358 tests 통과. `pnpm --filter @crelink/api typecheck` 통과. `pnpm lint` 통과(오류 0, 기존 웹 경고 2). `pnpm docs:check`·`pnpm work:check` 통과. 변형 시험: AAD 제거, 복합 FK 변경, `reauth_required` CHECK 제거, `EAA` 정규식 무효화, 서명 헤더 제거, 부분 설정 허용, 코드 허용 목록 우회, 원문 로그 추가 8가지 모두 해당 시험이 실패함을 확인하고 되돌렸습니다.
- 2026-11-11: 시험 위치. 부분 설정 실제 기동 거부와 migration CHECK·복합 FK 위반 시험은 소유 경로의 `test/health.e2e-spec.ts`에, Graph 시험은 수용 명령 패턴에 들어가도록 `src/instagram/instagram-crypto.spec.ts`에 뒀습니다. `INSTAGRAM_DM_HOURLY_LIMIT`는 0258 소유 경로에 설정 파일이 없어 이 티켓에서 파서·문서를 더했습니다(전부-또는-전무 대상 아님).
- 2026-11-11: `pnpm work:scope 0254`는 실패합니다(소유 경로 밖 3개: `docs/product/crelink.md`, `docs/specs/README.md`, `docs/specs/instagram-comment-dm.md`). 세 파일은 이 티켓이 아니라 브랜치의 시작 커밋 `2736f47`(0251 설계)의 변경이고, 그 커밋이 로컬 `main`(`4eb9919`)에 없어 기준에 포함됩니다. 이 티켓의 변경만 보는 `pnpm work:scope 0254 --base 2736f47`는 통과합니다(29개 파일 모두 소유 경로 안). `2736f47`이 `main`에 들어가면 기본 명령도 같은 결과가 됩니다.
