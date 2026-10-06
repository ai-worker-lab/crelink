# 환경과 비밀값 관리

실행 환경과 접근 권한이 다른 서비스별로 설정을 관리합니다. `.env`는 파일 형식이지 암호화나 비밀 저장소가 아닙니다. 실제 값을 Git·이미지·클라이언트 번들·로그에 넣지 않습니다.

## 환경 경계

| 환경 | 목적 | 현재 상태 |
| --- | --- | --- |
| local | 개발자 PC에서 구현·확인 | [로컬 개발 가이드](local-environment.md)의 Compose와 호스트 개발 서버로 실행 |
| dev | 원격에서 통합·배포 확인 | [원격 개발 환경](../../infra/dev/README.md)에 자원 분리 기준과 구성 전 필요한 정보를 기록 |
| prod | 실제 사용자 서비스 | 배포 대상 서버의 Compose 스택. 구성은 [운영 환경](../../infra/prod/README.md), 절차는 [prod 런북](../../infra/docs/prod-runbook.md) |

`dev`와 `prod`는 별도 DB·캐시·계정·비밀값·배포 대상을 사용합니다. 원격 dev에서 prod DB를 사용하거나, 로컬 파일을 그대로 운영 환경에 복사하지 않습니다. 같은 서버를 공유하더라도 실행 사용자·네트워크·볼륨·권한을 분리해야 하며, 폴더를 나눈 것만으로 격리되지는 않습니다.

현재 Makefile은 **local 전용**입니다. `dev-up`, `prod-up` 또는 환경 선택 옵션은 없습니다. 운영 배포는 GitHub Actions(`.github/workflows/deploy.yml`)만 하며, 원격 대상과 자격 증명이 정해지지 않은 환경은 로컬로 대신 실행하거나 성공으로 표시하는 명령을 만들지 않습니다.

## 서비스별 설정 소유권

| 영역 | 로컬 설정 위치·주입 방식 | 현재 소비 범위 |
| --- | --- | --- |
| 인프라 | `infra/local/.env` / 추적하는 예시는 `infra/local/.env.example` | Compose의 PostgreSQL 계정·DB명과 호스트 포트. Makefile의 `--env-file`로 명시적으로 전달하며, 호스트 포트는 `.local/instance.env`의 값이 셸 환경으로 넘어가 `--env-file` 값보다 우선함. 추적 예시의 `API_PORT`·`WEB_PORT`·`EXPO_PORT`·`POSTGRES_PORT`·`VALKEY_PORT`는 슬롯 0 포트의 유일한 원본([로컬 개발 환경](local-environment.md#인스턴스와-포트)) |
| API | `apps/api/.env` / 추적되는 안전한 예시 `apps/api/.env.example`; 운영은 `infra/prod/secrets/<대상>.sops.env`를 서버가 복호화해 Compose `env_file`로 주입 | `loadLocalEnvironment()`가 Nest 생성 전에 로컬 `.env`를 읽고 이미 주입된 값을 덮어쓰지 않음. `DATABASE_URL`·`PORT`·`WEB_URL`·`SHORT_LINK_BASE_URL` 필수(기본값 없음, 로컬은 `pnpm instance`가 채우고 `make`는 PM2로 넘김). 비밀값 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`과 `OPERATOR_EMAILS`는 사용자가 채우며 비면 로그인 API가 503. 선택 `UPLOAD_DIR`(기본 `.local/uploads`), `GEOIP_MMDB_PATH`(`pnpm geoip:download` 파일이 있으면 PM2가 넘김). 키 설명은 [API 문서](../../apps/api/docs/README.md#환경변수) |
| 웹 | `apps/web/.env.local`; 웹 영역 소유의 추적 예시 `apps/web/.env.example`; 운영은 `infra/prod/compose.yaml`의 `web.environment` | 서버 전용 `API_INTERNAL_URL`로 Nest API에 연결(운영은 내부 주소 `http://api:3000`). 현재 `NEXT_PUBLIC_*` 공개 변수는 없음 |
| 모바일 앱 | `apps/app/.env`; 앱 영역 소유의 추적 예시 `apps/app/.env.example` | Expo client의 `EXPO_PUBLIC_API_BASE_URL`. 서명 자격 증명은 앱 번들에 넣지 않음 |

환경 파일은 소비 코드가 실제로 읽는 서비스에만 둡니다. API bootstrap은 `apps/api/.env`를 Nest provider 검증 전에 로드하고, 이미 전달된 프로세스 환경값은 유지합니다. Next.js와 Expo 공개 변수는 각 도구의 개발·빌드 환경에서 주입되며 공개 prefix 값만 클라이언트 번들에 포함할 수 있습니다. 새 설정은 소비 코드, 안전한 예시, 관련 서비스 문서를 같은 변경에서 갱신합니다.

각 프로세스는 자신의 설정만 받습니다. 인프라 전체 `.env`를 API·웹·앱에 일괄 주입하지 않습니다. DB 비밀번호와 API 연결 문자열처럼 연관된 값은 로컬에서 서로 맞아야 하지만, 운영에서는 API에 필요한 최소 권한의 DB 계정을 별도로 사용합니다. 변경 시 소비 서비스까지 함께 갱신합니다.

## 클라이언트 값은 비밀이 아님

- 웹의 `NEXT_PUBLIC_*`와 앱의 `EXPO_PUBLIC_*`는 클라이언트에 포함될 수 있는 **공개 설정**입니다. API 공개 주소 같은 값만 사용합니다.
- DB 암호, 서명용 비밀 키, Supabase `service_role` 키, 서버 전용 토큰은 API 또는 제한된 배포 작업에서만 사용합니다.
- 호스팅·빌드 서비스의 비밀 설정에 넣었더라도 번들에 삽입하면 공개됩니다. 변수 이름에서 공개 접두사를 제거하는 것만으로 안전해지는 것도 아닙니다.
- 앱 스토어 업로드·서명 자격 증명은 앱 런타임 설정과 분리해 배포 시스템에서 관리합니다.

## 원격 비밀값 주입

- 운영 앱 설정·비밀값의 원본은 저장소의 대상별 SOPS(age) 암호문 `infra/prod/secrets/<대상>.sops.env`입니다. 수신자는 운영자 키와 그 대상 서버 키뿐이고(`.sops.yaml`), 배포 때 서버가 자기 키(`/etc/crelink/age.key`)로 복호화해 tmpfs `/run/crelink/app.env`에 Compose 실행 동안만 둡니다. 키 목록과 위치 표는 [운영 배포 설계](../specs/crelink-prod-deploy.md#비밀값과-환경변수), 편집·키 보관·회전 절차는 [prod 런북](../../infra/docs/prod-runbook.md#4-비밀값-sopsage)입니다.
- CI(GitHub Actions)에는 앱 비밀값을 두지 않습니다. GitHub Free 비공개 저장소는 environment secrets·브랜치 보호가 없어 push 권한이 있으면 모든 secret을 읽을 수 있기 때문입니다. CI가 가진 것은 Tailscale 접속 설정값(variables)과 배포 명령만 실행하는 SSH 키(`DEPLOY_SSH_KEY`)뿐입니다.
- 운영자 age 개인키는 평문 파일로 두지 않고 키체인에서 `SOPS_AGE_KEY_CMD`로 꺼냅니다. 복호화 결과를 파일·로그·채팅에 남기지 않습니다.
- Supabase: dev·prod 프로젝트와 자격 증명을 분리하고 서버 전용 키는 클라이언트에 전달하지 않습니다.

## 로컬 파일과 노출 대응

`make up`(또는 `pnpm instance`, [scripts/lib/instance.mjs](../../scripts/lib/instance.mjs))은 위 네 로컬 파일이 없으면 추적 예시에서 권한 `600`으로 만들고, 예시에 있는 포트·주소 값은 이 checkout의 인스턴스 값으로 채웁니다. 기존 개인 설정은 덮어쓰지 않습니다. 같은 checkout의 포트·연결 문자열은 `.local/instance.env`에 있고, PM2가 각 프로세스에 자기 값만 넘깁니다(`ecosystem.config.cjs`).

[`.gitignore`](../../.gitignore)는 모든 깊이의 `.env`, `.env.*`를 제외하고 `.env.example`만 허용합니다. 예시에는 변수 이름과 안전한 로컬 값만 넣습니다. 로컬 권한 제한은 같은 사용자로 실행되는 다른 프로그램으로부터의 격리를 보장하지 않습니다.

`.env.dev`, `.env.prod`에 실제 원격 비밀값을 저장소 안에서 관리하지 않습니다. 비밀값을 출력하는 전체 환경 덤프나 `docker compose config` 결과를 공유하지 않고, 구성 검사에는 `config --quiet`를 사용합니다.

비밀이 커밋·로그·채팅 등에 노출되면 먼저 해당 값을 폐기·교체합니다. 파일 삭제나 `.gitignore` 추가만으로 기존 노출이 해소되지는 않습니다.
