# 0002 단일 검증 명령과 smoke 테스트

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

에이전트와 CI가 같은 명령 하나로 변경을 검증하고, 실패하면 무엇을 고칠지 출력에서 바로 알 수 있게 합니다. 실행 중인 API·웹을 브라우저로 확인하는 smoke 테스트를 추가해 타입 검사·빌드만으로 끝나는 검증을 줄입니다.

## 수용 기준

- [x] `pnpm verify`가 `tokens:check → work:check → docs:check → lint → typecheck → build → test`를, `pnpm verify --fast`가 `tokens:check → work:check → docs:check → lint → typecheck`를 순서대로 실행하고 단계별 결과·시간 요약과 실패 단계의 해결 안내를 출력한다. 실패가 있으면 0이 아닌 코드로 끝난다.
- [x] `pnpm verify`는 `.local/instance.env`가 있으면 그 값을 이미 설정된 환경변수를 덮어쓰지 않고 쓴다(테스트 DB 연결).
- [x] `pnpm smoke`가 `API_URL`·`WEB_URL` 환경변수, 없으면 `.local/instance.env`의 값으로 실행 중인 서비스에 Playwright 테스트(`tests/smoke/`)를 실행한다. API liveness·readiness, 웹 첫 화면 렌더링과 콘솔 오류 없음, 데스크톱·모바일 폭 가로 넘침 없음을 확인한다. 브라우저가 없거나 서비스가 꺼져 있으면 해결 명령을 출력한다.
- [x] CI가 검사 단계를 `pnpm verify`로 실행하고, 별도 smoke job이 빌드한 API·웹을 띄워 `pnpm smoke`를 실행한다. `work/NNNN-*` 브랜치 PR에서는 `pnpm work:scope`(0003)를 실행한다.
- [x] 검증 루프 기준 문서 `docs/development/verification.md`가 명령·CI·에이전트 완료 전 확인 범위를 설명한다.

## 범위

- 포함: `scripts/verify.mjs`, `scripts/smoke.mjs`, `tests/smoke/**`, `.github/workflows/ci.yml`, 검증 문서.
- 제외: 모바일 앱 자동 UI 테스트.

## 위험·복구

해당 없음.

## 연결

- [로컬 개발 환경](../../development/local-environment.md), 0001(인스턴스 설정), 0003(`docs:check`, `work:scope`)

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: 구현(`scripts/verify.mjs`, `scripts/smoke.mjs`, `tests/smoke/`, `.github/workflows/ci.yml`, `docs/development/verification.md`). 격리 작업공간에서 0001의 `scripts/lib/instance.mjs`를 계약대로 쓰는 임시 스텁으로 검증하고 스텁은 지웠습니다. 실행한 검증:
  - `pnpm install --frozen-lockfile` 후 `pnpm verify --fast`: `tokens:check`·`work:check` 통과, `docs:check`는 0003 스크립트가 아직 없어 실패(MODULE_NOT_FOUND), `lint`·`typecheck` 건너뜀 표시, 종료 코드 1. `--keep-going`으로 `lint`·`typecheck` 통과 확인.
  - 일부러 Prettier·타입 오류 파일을 넣고 `pnpm verify --fast --keep-going`: `lint`·`typecheck` 실패와 각 해결 안내 출력, 종료 코드 1. 파일 삭제로 원복.
  - 임시 PostgreSQL 컨테이너(포트 13932)와 임시 `.local/instance.env`로 `pnpm verify --keep-going`: `docs:check` 외 `lint`·`typecheck`·`build`·`test`(API 테스트 9개) 통과, 테스트 DB가 임시 컨테이너에 생성됨. `TEST_DATABASE_URL`을 잘못된 값으로 주면 `test`가 그 주소로 `ECONNREFUSED` 실패(기존 환경변수 우선 확인).
  - 빌드한 API(13930)·웹(`next start`, 13931)에 `API_URL=... WEB_URL=... pnpm smoke` 5개 통과, 환경변수 없이 `.local/instance.env`만으로도 5개 통과, `pnpm smoke -g liveness` 인자 전달 확인. 웹 `API_INTERNAL_URL`을 틀리게 띄우면 첫 화면 테스트가 안내 문구와 함께 실패.
  - 서비스 중지 상태·주소 없음·Chromium 없음(`PLAYWRIGHT_BROWSERS_PATH` 빈 디렉터리)에서 각각 `make up`·`pnpm logs`·`pnpm exec playwright install chromium` 안내와 종료 코드 1.
  - CI YAML은 `actionlint`가 없어 `yaml` 패키지로 파싱해 job·단계 구성을 확인. smoke job의 시작·준비 대기 셸 단계를 로컬 포트로 그대로 실행 후 `pnpm smoke` 5개 통과. GitHub Actions에서의 실제 실행은 아직 확인하지 않았습니다.
  - 임시 컨테이너·프로세스·`.local` 산출물 정리.
- 2026-10-01: 완료. 주 checkout·worktree에서 `pnpm verify`·`pnpm smoke` 통과를 확인했고 `main`에 통합. CI는 GitHub Actions에서 아직 실행하지 않음.
