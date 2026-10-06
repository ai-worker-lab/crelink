# 0019 pnpm verify의 웹 빌드가 실행 중인 개발 서버를 깨뜨림

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 결함
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-06

## 목적

`make up`으로 웹 개발 서버(`next dev`)가 떠 있을 때 `pnpm verify`의 `build` 단계(`next build`)가 같은 `apps/web/.next`를 덮어써, 이후 웹 요청이 500(`MODULE_NOT_FOUND`)이 됩니다. 검증 순서(`pnpm verify` → `pnpm smoke`)대로 하면 smoke가 거짓 실패합니다.

## 수용 기준

- [x] `make up` 상태에서 `pnpm verify` 뒤 웹 개발 서버를 다시 띄우지 않고 `pnpm smoke`가 통과한다.

## 범위

- 포함: 개발·빌드 출력 디렉터리 분리(예: Next `distDir`) 또는 verify 순서·안내 조정, 관련 문서.
- 제외: 기능 변경.

## 위험·복구

해당 없음. 이 변경 전 checkout에서 생긴 `apps/web/.next`는 그대로 두어도 되며, 개발 서버는 다음 `make web-up`부터 `.next-dev/`를 씁니다.

## 연결

- 발견: `docs/work/orchestrator/0018-crelink-mvp-integration.md` 진행 기록
- 관련 문서: [검증 루프](../../development/verification.md)

## 진행 기록

- 2026-10-06: 생성. 재현: `make up` → `pnpm verify` → `curl $WEB_URL/` 500, `pnpm logs web`에 `.next/server/app/(public)/page.js` `MODULE_NOT_FOUND`.
- 2026-10-06: 착수(브랜치 `work/0019-verify-build-clobbers-dev-web`). 원인: `next dev`와 `next build`가 같은 `distDir`(`.next`)를 씀. 고침: `next.config.ts`의 `distDir: process.env.NEXT_DIST_DIR || '.next'`, 웹 `start`가 `NEXT_DIST_DIR=.next-dev`로 개발 서버 실행. `next-env.d.ts`는 개발·빌드가 각자 경로(`./.next-dev/types/routes.d.ts` ↔ `./.next/types/routes.d.ts`)로 다시 써 변경이 반복되므로 Next.js 문서 권고대로 Git에서 제외(`git rm --cached`, `.gitignore`)하고 웹 `typecheck`를 `next typegen && tsc --noEmit`으로 바꿈. `tsconfig.json` include에 `.next-dev/types/**/*.ts`, `.gitignore`·`.prettierignore`·ESLint 무시 목록에 `.next-dev/`.
- 2026-10-06: 검증. `make web-restart` 후 개발 서버가 `apps/web/.next-dev/` 생성, `tsconfig.json`을 Next.js가 다시 쓰지 않음. 개발 서버가 떠 있는 상태로 `pnpm verify` 8단계 통과(typecheck·build 포함) → 곧바로 `curl $WEB_URL/` 200, `/p/{id}` 200, `pnpm smoke` 5 passed, `pnpm e2e` 6 passed(재시작 없음). 새 checkout 상황 재현: `next-env.d.ts`와 `.next/types` 삭제 뒤 `pnpm --filter @crelink/web typecheck`가 `next typegen`으로 파일을 만들고 통과. 같은 문제가 원본 템플릿 `skeleton-repository`에도 있음(이 저장소 밖, 반영하지 않음).
