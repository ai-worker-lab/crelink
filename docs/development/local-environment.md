# 로컬 개발 환경

[infra/local/compose.yaml](../../infra/local/compose.yaml)은 로컬 PostgreSQL 17과 Valkey 8을 제공합니다. 구성 기본값은 이 파일, 개인 설정은 `infra/local/.env`에서 관리합니다. 추적되는 [환경변수 예시](../../infra/local/.env.example)에는 안전한 로컬 값만 둡니다. 서비스별 소유권과 원격 환경은 [환경과 비밀값 관리](environment-secrets.md)를 참고하세요.

## 시작

```sh
pnpm install
make up       # 인스턴스 설정과 없는 로컬 설정 파일을 만든 뒤 인프라·API·웹·Expo 시작
make status   # 인스턴스 주소, 컨테이너, PM2 프로세스
```

`make`는 처음 실행할 때 `pnpm instance`와 같은 일을 먼저 합니다. 없는 로컬 설정 파일(`infra/local/.env`, `apps/api/.env`, `apps/web/.env.local`, `apps/app/.env`)을 추적 예시에서 권한 `600`으로 만들고, 이미 있는 파일은 덮어쓰지 않습니다. 예시의 포트·연결 키(`PORT`, `DATABASE_URL`, `API_INTERNAL_URL`, `EXPO_PUBLIC_API_BASE_URL`, `API_PORT`, `WEB_PORT`, `EXPO_PORT`, `POSTGRES_PORT`, `VALKEY_PORT`)는 이 checkout 인스턴스의 값으로 씁니다. 앱 예시(`apps/*/.env.example`)의 이 키들은 숫자 없이 빈 값과 형식 주석만 둡니다. 웹 설정은 `API_INTERNAL_URL`, 앱 설정은 `EXPO_PUBLIC_API_BASE_URL`이며 웹·앱 `.env.example`은 각 영역 담당자가 관리합니다.

API는 시작 시 `apps/api/.env`가 있으면 읽고, 이미 프로세스 환경에 있는 값은 덮어쓰지 않습니다. 필수 설정은 `DATABASE_URL`(PostgreSQL 연결 문자열)과 `PORT`(API 포트)이며 기본값은 없습니다. 둘 중 하나가 빠지면 API는 `DATABASE_URL is required` 또는 `PORT is required` 오류로 종료됩니다. `pnpm instance`가 만든 `apps/api/.env`에 이 checkout 값이 들어 있고, `make api-up`은 인스턴스 값을 환경으로 넘깁니다. `.env`는 커밋하지 마세요. 마이그레이션은 API 시작 시 PostgreSQL advisory lock을 사용하여 인스턴스 간 직렬 실행됩니다.

`Makefile`은 인프라(PostgreSQL·Valkey)는 Docker Compose, API·웹·Expo 개발 서버는 checkout 전용 PM2(`PM2_HOME=.local/pm2`, `ecosystem.config.cjs`의 `crelink-api`·`crelink-web`·`crelink-app`)로 관리합니다. Compose project와 포트는 인스턴스 설정에서 옵니다. `*-up`은 PM2 프로세스를 지우고 다시 시작해 현재 인스턴스 값을 받습니다. 세 서버 시작 대상은 `packages/shared`를 먼저 빌드합니다. 웹·앱의 `@crelink/shared` import는 `packages/shared/package.json`의 `exports`/`main`이 가리키는 `dist/` 산출물을 사용합니다. `@crelink/design-tokens`는 커밋된 `generated/` 생성물을 가리키므로 빌드 단계가 없으며, 토큰을 바꾼 뒤에는 `pnpm tokens:generate`를 실행합니다([사용법](../../packages/design-tokens/docs/usage.md)). PM2 표시는 프로세스가 응답 가능함을 보장하지 않으므로, `make status`에 `online`으로 보여도 실패 시 `pnpm logs <서비스>`로 로그를 확인하세요.

| 영역 | 시작 | 종료 | 재시작 |
| --- | --- | --- | --- |
| 전체 | `make up` | `make down` | `make restart` |
| DB·Valkey | `make infra-up` | `make infra-down` | `make infra-restart` |
| API | `make api-up` | `make api-down` | `make api-restart` |
| 웹 | `make web-up` | `make web-down` | `make web-restart` |
| Expo | `make app-up` | `make app-down` | `make app-restart` |

## 인스턴스와 포트

checkout마다 인스턴스 설정 `.local/instance.env`(Git 제외)가 Compose project, 포트, 연결 주소를 정합니다([ADR 0008](../adr/0008-worktree-local-instances.md), 구현 [`scripts/lib/instance.mjs`](../../scripts/lib/instance.mjs)). `pnpm instance`는 설정을 만들거나 읽어 서비스별 포트·주소를 표로, `pnpm instance --print-env`는 전체 `KEY=VALUE`를, `pnpm instance --get <KEY>`(예: `--get WEB_PORT`)는 값 하나를 출력합니다. 이 문서와 다른 문서는 포트 숫자를 적지 않으므로 실제 값은 `pnpm instance`로 확인합니다.

| 서비스 | 포트 키 | 주소 |
| --- | --- | --- |
| API | `API_PORT`(API의 `PORT`) | `http://127.0.0.1:<API 포트>/api/health` (준비 상태 `/api/health/ready`) |
| 웹 | `WEB_PORT` | `http://127.0.0.1:<웹 포트>` |
| Expo Metro | `EXPO_PORT` | `http://127.0.0.1:<Expo 포트>` |
| PostgreSQL | `POSTGRES_PORT` | `127.0.0.1:<PostgreSQL 포트>` |
| Valkey | `VALKEY_PORT` | `127.0.0.1:<Valkey 포트>` |

- 주 checkout은 슬롯 0 포트와 Compose project `crelink`을 씁니다. 슬롯 0 포트의 유일한 원본은 추적 파일 [`infra/local/.env.example`](../../infra/local/.env.example)의 위 다섯 키입니다(개인 설정 `infra/local/.env`가 아님). 템플릿에서 새 서비스를 만들 때는 `scripts/init-project.mjs`가 이 값을 정합니다.
- 슬롯 0 포트를 바꾸려면 `infra/local/.env.example`만 고친 뒤 `pnpm instance`를 실행합니다. 포트가 원본과 달라진 `.local/instance.env`를 새 값으로 다시 만듭니다(이름·Compose project는 유지). `make`는 이미 있는 `.local/instance.env`를 그대로 읽으므로 `pnpm instance`를 먼저 실행합니다. 이미 있는 로컬 `.env` 파일은 덮어쓰지 않으므로, 파일 값을 쓰는 직접 실행(`pnpm dev:api` 등)에 새 포트를 쓰려면 그 파일을 지우고 `pnpm instance`로 다시 만듭니다.
- 연결된 git worktree는 다른 worktree가 쓰지 않는 가장 작은 슬롯 k(1~20)를 받아 모든 포트에 100×k를 더하고, Compose project `crelink-<worktree 디렉터리 이름>`과 그 project의 별도 볼륨을 씁니다. 주 checkout에서 복사해 온 슬롯 0 설정은 버리고 새 슬롯을 받습니다. 슬롯은 `PORT_SLOT=<번호> pnpm instance`로 바꿀 수 있습니다(Compose project는 유지). 이미 있는 로컬 `.env` 파일의 포트는 바뀌지 않으며, `make`로 띄운 서버는 인스턴스 값을 프로세스 환경으로 받아 파일 값보다 우선합니다.
- 웹 `start`는 `WEB_PORT`, 앱 `start`·`android`·`ios`는 `EXPO_PORT` 환경변수를 쓰고, 없으면 `pnpm instance --get`으로 이 checkout 인스턴스의 포트를 읽으므로 worktree에서 직접 실행해도 그 슬롯 포트를 씁니다.
- Compose(`infra/local/compose.yaml`)는 포트 기본값이 없어 `POSTGRES_PORT`·`VALKEY_PORT`가 없으면 해결 안내와 함께 실패합니다. `make`는 인스턴스 값을 넘기고, Compose를 직접 실행할 때는 `--env-file infra/local/.env`를 넘깁니다.
- worktree를 지우기 전에 `make instance-destroy CONFIRM=1`로 그 인스턴스의 컨테이너·데이터 볼륨·PM2 프로세스를 지웁니다. 주 checkout(슬롯 0, project `crelink`)에서는 거부하며, 주 checkout은 `make down`으로 멈추고 볼륨을 보존합니다.

Compose는 Valkey 서비스를 제공하지만 API 소스(`apps/api/src`)에는 Valkey/Redis 연결 소비 코드가 없어 현재 API는 이를 사용하지 않습니다([ADR 0005](../adr/0005-keep-valkey-local-infra.md)). Compose 기본 자격 증명은 로컬 전용이며 프로덕션에 복사하지 않습니다.

## 로그

```sh
pnpm logs api                 # API의 최근 100줄(PM2 out·error 로그)
pnpm logs web --lines 20      # 웹 최근 20줄
pnpm logs app --follow        # Expo 로그를 계속 출력(Ctrl+C로 종료)
pnpm logs infra --lines 50    # 이 인스턴스 Compose project의 PostgreSQL·Valkey 로그
```

api·web·app은 `.local/pm2/logs/crelink-<서비스>-out.log`·`-error.log`, infra는 `docker compose logs`를 읽습니다([`scripts/logs.mjs`](../../scripts/logs.mjs)). 기본은 마지막 100줄을 출력하고 끝납니다. 로그가 없으면 `make <서비스>-up` 또는 `make infra-up`을 안내합니다.

## 테스트

```sh
make infra-up   # 테스트는 실제 PostgreSQL이 필요합니다
pnpm test       # 공용 패키지 빌드 후 test 스크립트가 있는 모든 workspace의 테스트 실행
```

현재 테스트는 API 통합 테스트(`apps/api/test/*.e2e-spec.ts`, Jest + ts-jest)뿐입니다. 테스트마다 일회용 데이터베이스(`crelink_test_*`)를 만들고 끝나면 지우므로 개발 DB의 데이터는 바뀌지 않습니다. 관리 연결은 `TEST_DATABASE_URL`, 없으면 `apps/api/.env`의 `DATABASE_URL`을 쓰며, 그 사용자에게 데이터베이스 생성 권한이 필요합니다(로컬 Compose 사용자는 권한이 있습니다). `pnpm verify`는 `.local/instance.env`의 `TEST_DATABASE_URL`을 넘기므로 worktree에서도 그 인스턴스 DB로 테스트합니다. `pnpm test`를 직접 실행할 때는 worktree 인스턴스 값을 `TEST_DATABASE_URL`로 넘깁니다. 한 영역만 실행하려면 `pnpm --filter @crelink/api test`를 씁니다.

## 코드 검사

커밋 전에 `pnpm verify --fast`(토큰·work item·문서·디자인 산출물·lint·타입 검사)를 실행하고, 서식 오류는 `pnpm format`으로 고칩니다. 규칙은 루트 `eslint.config.mjs`(영역 경계 `no-restricted-imports` 포함)와 `.prettierrc.json`에 있으며 도구 선택 배경은 [ADR 0004](../adr/0004-lint-format.md)입니다. Markdown 문서는 Prettier 대상이 아니며 `pnpm docs:check`가 링크·형식을 검사합니다.

## CI

CI job 구성과 로컬에서 같은 검사를 실행하는 방법(`pnpm verify`, `pnpm smoke`)은 [검증 루프](verification.md#ci)를 기준으로 합니다.
