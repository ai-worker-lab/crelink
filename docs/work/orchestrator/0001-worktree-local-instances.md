# 0001 worktree별 로컬 인스턴스와 로그 조회

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

에이전트가 격리 작업공간(git worktree)마다 인프라·API·웹·Expo를 따로 띄워 자기 변경을 실제 경로에서 검증할 수 있게 합니다. 지금은 Compose project와 포트가 고정되어(`Makefile`, `apps/web/package.json`, `apps/app/package.json`) 병렬 작업공간에서는 타입 검사·빌드까지만 확인할 수 있습니다.

## 수용 기준

- [x] `pnpm instance`가 현재 checkout의 인스턴스 설정 `.local/instance.env`를 만들거나 읽어 이름·포트·URL을 출력한다. 주 checkout은 슬롯 0(현재 포트와 Compose project `crelink` 그대로), 연결된 worktree는 다른 worktree가 쓰지 않는 가장 작은 슬롯 k≥1을 받고 포트는 기본 포트 + 100×k이다. `PORT_SLOT` 환경변수로 덮어쓸 수 있다.
- [x] `.local/instance.env` 키: `INSTANCE_NAME`, `PORT_SLOT`, `COMPOSE_PROJECT_NAME`, `API_PORT`, `WEB_PORT`, `EXPO_PORT`, `POSTGRES_PORT`, `VALKEY_PORT`, `PORT`, `DATABASE_URL`, `TEST_DATABASE_URL`, `API_INTERNAL_URL`, `EXPO_PUBLIC_API_BASE_URL`, `API_URL`, `WEB_URL`.
- [x] 새 worktree에서 없는 로컬 설정 파일(`infra/local/.env`, `apps/api/.env`, `apps/web/.env.local`, `apps/app/.env`)을 추적 예시에서 만들고 기존 파일은 덮어쓰지 않는다.
- [x] `scripts/lib/instance.mjs`가 `readInstanceEnv(root)`(없으면 `null`)와 `ensureInstance(root)`(없으면 생성 후 반환)를 내보낸다.
- [x] `make up`/`down`/`status`/`*-up`이 인스턴스 설정의 Compose project·포트로 동작하고, PM2 프로세스(`ecosystem.config.cjs`)가 인스턴스 포트·연결 문자열을 받는다. 웹·Expo `start` 스크립트는 `WEB_PORT`·`EXPO_PORT`가 없으면 기존 포트를 쓴다.
- [x] `make instance-destroy CONFIRM=1`이 연결된 worktree 인스턴스의 컨테이너·볼륨·PM2를 지우고, 주 checkout에서는 거부한다.
- [x] `pnpm logs <api|web|app|infra> [--lines N] [--follow]`가 해당 서비스의 최근 로그를 출력한다. 기본은 follow 없이 끝난다.
- [x] 주 checkout과 연결된 worktree 하나에서 동시에 `make up` 후 두 인스턴스의 `/api/health/ready`와 웹 주소가 각각 응답한다.
- [x] `scripts/init-project.mjs --port-offset`이 새 기본 포트를 계속 올바르게 바꾼다.

## 범위

- 포함: `scripts/instance.mjs`, `scripts/logs.mjs`, `scripts/lib/instance.mjs`, `Makefile`, `ecosystem.config.cjs`, 웹·앱 `start` 스크립트, 로컬 개발 문서, 인프라 규칙, ADR 0008.
- 제외: dev/prod 원격 환경, CI.

## 위험·복구

주 checkout의 Compose project·볼륨 이름(`crelink`)은 바꾸지 않습니다. 연결된 worktree 인스턴스는 별도 볼륨을 쓰며 `instance-destroy`는 그 볼륨만 지웁니다.

## 연결

- [영역별 병렬 개발](../../development/parallel-work.md), [로컬 개발 환경](../../development/local-environment.md)

## 진행 기록

- 2026-10-01: 생성. 에이전트 친화 하네스 구성(0001~0005)의 검증 루프 기반.
- 2026-10-01: 구현([ADR 0008](../../adr/0008-worktree-local-instances.md)). `/tmp` 임시 clone(주 checkout 역할, 사용자 Compose project와 겹치지 않게 `PORT_SLOT=31`과 project `crelink-tmpmain0001`로 덮어씀)과 그 연결 worktree에서 확인했다.
  - `pnpm instance`: 임시 주 checkout `PORT_SLOT=31` → 슬롯 31(API 16100·웹 18273·Expo 21181·PG 18532·Valkey 19479). 연결 worktree 두 개는 자동으로 슬롯 1(`crelink-wt0001`, API 13100), 슬롯 2(`crelink-wt0001b`)를 받음. `--print-env`가 15개 키를 출력. 없는 로컬 설정 4개를 권한 600으로 만들고 인스턴스 포트를 채움, 미리 만든 `apps/web/.env.local`은 그대로 유지. `PORT_SLOT=-1`·`600`은 오류와 사용법 출력(종료 코드 1).
  - 두 인스턴스(슬롯 31, 연결 worktree `PORT_SLOT=32`) 동시 `make up` 후 `curl /api/health/ready` 둘 다 200 `{"status":"ready"}`, 웹 `/` 둘 다 200, BFF `/api/backend/api/health` 둘 다 `{"status":"ok"}`(`.env.local`의 다른 `API_INTERNAL_URL`보다 PM2 값 우선 확인), Expo `/status` 둘 다 `packager-status:running`. 컨테이너·볼륨이 project별로 분리됨.
  - 연결 worktree에서 `PORT_SLOT=33` 후 `make api-up` → API 로그에 새 DB 포트 `ECONNREFUSED 127.0.0.1:18732`(이전 env가 남지 않음), `PORT_SLOT=32` 복귀 후 ready 200.
  - `pnpm logs api --lines 20`이 PM2 out·error 로그 마지막 20줄 출력, `pnpm logs infra --lines 3`이 postgres·valkey 로그 출력, `pnpm logs foo`는 사용법과 종료 코드 1. `--follow`는 계속 출력하고 종료 신호를 받으면 `tail` 자식 없이 끝남.
  - `make instance-destroy`: CONFIRM 없으면 거부, 연결 worktree `CONFIRM=1 PORT_SLOT=0`·임시 주 checkout `CONFIRM=1`은 거부, 연결 worktree `CONFIRM=1`은 컨테이너 2·볼륨 2·네트워크 삭제(남은 컨테이너·볼륨 0, PM2 프로세스·포트 없음). 주 인스턴스는 계속 ready 200. `make down`은 볼륨 보존.
  - 새 임시 clone에서 `node scripts/init-project.mjs --name tmp-svc --port-offset 7 --no-verify` → 웹 `${WEB_PORT:-5180}`, 앱 `${EXPO_PORT:-8088}`, `scripts/lib/instance.mjs` 기본 포트 3007·5180·8088·5439·6386과 이름 `tmp-svc`, 낡은 `.local/instance.env` 삭제. 이어서 `pnpm instance --print-env` 슬롯 0 = project `tmp-svc`, API 3007, `DATABASE_URL` 포트 5439. `make help`가 없는 `.local/instance.env`를 만듦.
  - 변경 스크립트 `pnpm exec eslint`·`pnpm exec prettier --check` 통과, `pnpm work:check` 통과. 임시 clone·worktree·컨테이너·볼륨·PM2는 모두 정리했고 사용자 주 checkout의 `crelink` 서비스·볼륨은 건드리지 않음.
- 2026-10-01: 통합 검증(주 저장소). 주 checkout(슬롯 0)에서 `make up`, 연결 worktree `/tmp/skel-wt-smoke2`(슬롯 1, project `crelink-skel-wt-smoke2`)에서 `make infra-up api-up web-up`을 동시에 띄워 두 곳 모두 `/api/health/ready` 200, `pnpm smoke` 5 passed. worktree에서 `pnpm verify` 7단계 통과(테스트가 슬롯 1 DB 사용). worktree `make instance-destroy CONFIRM=1`이 컨테이너·볼륨을 지우고 주 checkout에서는 거부됨.
  - 발견·수정: 주 checkout의 `.local/instance.env`(슬롯 0)가 복사된 연결 worktree는 그 값을 그대로 써서 주 인스턴스의 Compose project·포트와 겹쳤다. `ensureInstance`가 연결 worktree의 슬롯 0 설정을 버리고 새 슬롯을 받도록 고침(`scripts/lib/instance.mjs`). 복사 후 `pnpm instance`가 슬롯 1을 받는 것을 확인.
- 2026-10-01: 완료. 수용 기준과 통합 검증을 확인했고 `main`에 통합. 사용자가 다음 단계(템플릿 준비, 0006)를 요청.
