# 0018 크리링 MVP 통합 검증

- 단계: 티켓
- 역할: orchestrator
- 상위: 0014
- 선행: 0016, 0017
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

API와 웹을 실제로 연결해 E2E 시나리오를 확인하고 로컬 실행 설정을 정리합니다.

## 수용 기준

- [x] `make up`만으로 API가 `WEB_URL`·`SHORT_LINK_BASE_URL`을 받는다.
- [x] GeoIP mmdb 내려받기 명령이 있고, 없을 때의 동작(위치 비움)이 문서에 있다.
- [x] 설계 `검증 계획` E2E 1~4가 Playwright로 통과한다.
- [x] `pnpm verify`, `pnpm smoke` 통과.

## 범위

- 포함: 루트 스크립트·설정, `tests/`, 문서.
- 제외: 제품 기능 추가.

## 위험·복구

해당 없음

## 연결

- 설계: [검증 계획](../../specs/crelink-mvp.md#검증-계획)
- 요구: R1~R16

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 로컬 설정. 인스턴스 키 `SHORT_LINK_BASE_URL`(로컬 = `API_URL`), PM2가 API에 `WEB_URL`·`SHORT_LINK_BASE_URL`과 GeoIP 파일이 있으면 `GEOIP_MMDB_PATH`를 넘김(`ecosystem.config.cjs`). `pnpm geoip:download`(`scripts/geoip.mjs`, DB-IP Lite 2026-10, 약 121MB) 받음, `maxmind`로 공인 IP 표본 `211.234.0.1` → KR 조회 확인. 문서: `docs/development/local-environment.md#크리링-로컬-설정`, `environment-secrets.md`, `external-dependencies.md`. CI `인스턴스 포트` 단계에 `SHORT_LINK_BASE_URL` 추가.
- 2026-10-06: E2E. `tests/e2e/`(fixture는 가입과 같은 행 + 세션 행을 DB에 넣고 `cl_session` 쿠키를 심음, 테스트 데이터는 `@e2e.crelink.test`·`.e2e.test`만 쓰고 끝에 지움), `pnpm e2e`(`scripts/e2e.mjs`). 하위 에이전트 실행에서 연속 2회 통과, 결함 없음.
- 2026-10-06: 검증. `pnpm verify` 통과(8단계, API 48 tests). `pnpm verify`의 `next build`가 실행 중인 `next dev`의 `.next`를 덮어써 웹 `/`가 500(MODULE_NOT_FOUND)이 되는 것을 발견 → `make web-restart` 후 `pnpm smoke` 5 passed, `pnpm e2e` 5 passed. 이 문제는 0019로 등록. 구글 실로그인은 키 발급 후 수동 확인(에픽 0014 수용 기준).
