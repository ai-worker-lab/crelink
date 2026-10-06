# ADR 0008: worktree별 로컬 인스턴스

- 날짜: 2026-10-01
- 상태: 승인
- 범위: 루트 `Makefile`, `ecosystem.config.cjs`, `scripts/lib/instance.mjs`, `scripts/instance.mjs`, `scripts/logs.mjs`, 웹·앱 `start` 스크립트, `infra/local/` (인프라)

## 배경

- 에이전트는 work item마다 격리된 git worktree에서 작업합니다([작업 실행기](../development/agent-runner.md)). 자기 변경을 실제 경로(DB 연결, API·웹 응답)에서 검증하려면 작업공간마다 인프라와 개발 서버를 띄울 수 있어야 합니다.
- 기존 구성은 Compose project(`crelink`)와 서비스별 호스트 포트(API·웹·Expo·PostgreSQL·Valkey)가 고정되어 두 checkout이 동시에 서비스를 띄우면 서로의 컨테이너·볼륨을 공유하거나 포트가 충돌했습니다.
- 주 checkout의 기존 Compose project와 데이터 볼륨은 그대로 유지해야 합니다([인프라 작업 규칙](../../infra/AGENTS.md)).

## 결정

1. checkout마다 인스턴스 설정 `.local/instance.env`(Git 제외)를 둡니다. `scripts/lib/instance.mjs`의 `ensureInstance(root)`가 없으면 만들고 `readInstanceEnv(root)`가 읽습니다. `pnpm instance`가 이름·포트·주소를 출력하고, `make`는 파일이 없으면 먼저 만듭니다.
2. 주 checkout(`git rev-parse --git-dir`와 `--git-common-dir`가 같음)은 슬롯 0으로 기존 포트와 Compose project `crelink`을 그대로 씁니다. 연결된 worktree는 `git worktree list`의 다른 worktree가 쓰지 않는 가장 작은 슬롯 k(1~20)를 받고 모든 포트에 100×k를 더합니다. Compose project는 `crelink-<worktree 디렉터리 이름>`(이미 쓰이면 뒤에 `-<슬롯>`)이며 한 번 정하면 슬롯을 바꿔도 유지합니다. `PORT_SLOT` 환경변수로 슬롯을 직접 지정할 수 있습니다.
3. `Makefile`은 인스턴스 값으로 Compose project·포트를 정하고, `ecosystem.config.cjs`는 각 PM2 앱에 자기 값만(API: `PORT`·`DATABASE_URL`, 웹: `WEB_PORT`·`API_INTERNAL_URL`, Expo: `EXPO_PORT`·`EXPO_PUBLIC_API_BASE_URL`) 프로세스 환경으로 넘깁니다. API·Next.js·Expo는 이미 있는 프로세스 환경값을 로컬 `.env` 파일보다 우선합니다. `*-up`은 PM2 프로세스를 지우고 다시 시작해 현재 인스턴스 값을 읽습니다.
4. 새 worktree에서 없는 로컬 설정 파일(`infra/local/.env`, `apps/api/.env`, `apps/web/.env.local`, `apps/app/.env`)은 추적 예시에서 만들고, 예시에 있는 인스턴스 키는 그 인스턴스 값으로 씁니다. 기존 파일은 덮어쓰지 않습니다.
5. `make instance-destroy CONFIRM=1`은 연결된 worktree 인스턴스의 컨테이너·데이터 볼륨·PM2 프로세스를 지웁니다. 주 checkout, 슬롯 0, project `crelink`에서는 거부합니다. 로그는 `pnpm logs <api|web|app|infra>`로 봅니다.

## 결과와 트레이드오프

- 여러 worktree가 같은 PC에서 서로의 데이터·포트와 섞이지 않고 동시에 전체 스택을 띄워 검증할 수 있습니다. 주 checkout 사용법과 데이터 볼륨은 바뀌지 않습니다.
- 인스턴스마다 컨테이너 2개·볼륨 2개·개발 서버 3개를 차지합니다. worktree를 지우기 전에 `make instance-destroy CONFIRM=1`을 실행하지 않으면 그 Compose project의 컨테이너·볼륨이 남습니다.
- 슬롯은 각 worktree의 `.local/instance.env`로만 점유를 판단합니다. 두 worktree가 동시에 처음 설정을 만들면 같은 슬롯을 받을 수 있고, 저장소 밖 프로그램이 쓰는 포트는 확인하지 않습니다. 겹치면 `PORT_SLOT=<번호> pnpm instance`로 바꿉니다.
- 슬롯을 바꿔도 이미 있는 로컬 `.env` 파일의 포트는 그대로입니다. `make`로 띄운 프로세스는 인스턴스 값을 받지만, 그 파일을 직접 읽는 명령(예: `pnpm test`의 `DATABASE_URL` 대체값)은 파일을 고치거나 `TEST_DATABASE_URL`을 넘겨야 합니다.
- Makefile·`start` 스크립트의 `${VAR:-기본값}`은 POSIX 셸 기준이며 Windows 기본 셸은 지원하지 않습니다(기존 Makefile도 POSIX 셸 전용).
