# 0019 pnpm verify의 웹 빌드가 실행 중인 개발 서버를 깨뜨림

- 단계: 티켓
- 역할: orchestrator
- 상태: 분류 대기
- 종류: 결함
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-06

## 목적

`make up`으로 웹 개발 서버(`next dev`)가 떠 있을 때 `pnpm verify`의 `build` 단계(`next build`)가 같은 `apps/web/.next`를 덮어써, 이후 웹 요청이 500(`MODULE_NOT_FOUND`)이 됩니다. 검증 순서(`pnpm verify` → `pnpm smoke`)대로 하면 smoke가 거짓 실패합니다.

## 수용 기준

- [ ] `make up` 상태에서 `pnpm verify` 뒤 웹 개발 서버를 다시 띄우지 않고 `pnpm smoke`가 통과한다.

## 범위

- 포함: 개발·빌드 출력 디렉터리 분리(예: Next `distDir`) 또는 verify 순서·안내 조정, 관련 문서.
- 제외: 기능 변경.

## 위험·복구

해당 없음. 우회: `make web-restart`.

## 연결

- 발견: `docs/work/orchestrator/0018-crelink-mvp-integration.md` 진행 기록
- 관련 문서: [검증 루프](../../development/verification.md)

## 진행 기록

- 2026-10-06: 생성. 재현: `make up` → `pnpm verify` → `curl $WEB_URL/` 500, `pnpm logs web`에 `.next/server/app/(public)/page.js` `MODULE_NOT_FOUND`.
