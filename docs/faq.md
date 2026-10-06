# 자주 묻는 질문

질문과 간결한 답을 모아 둡니다. 구현·설정의 기준은 이 문서가 아니라 연결된 코드와 가이드입니다. 문서 원칙은 저장소 루트의 [AGENTS.md](../AGENTS.md)를 따릅니다.

## 저장소 구조와 문서

### 왜 디자인, 앱, 웹, API를 각각 나누나요?

OpenDesign 산출물은 `design/`, 모바일 앱은 `apps/app/`, 웹 클라이언트는 `apps/web/`, API는 `apps/api/`에 둡니다. 각 영역을 독립적으로 개발·검증할 수 있고, 웹은 앱 설치 없이 이용하는 진입점이 됩니다. 공통 TypeScript 계약은 `packages/shared/`에, 디자인·웹·앱이 함께 쓰는 디자인 토큰은 `packages/design-tokens/`에 둡니다. 현재 웹·앱은 제품 이름·컨셉과 API health 상태만 보여 주는 시작 화면이며 제품 기능은 아직 구현되지 않았습니다. 현재 폴더는 루트 `README.md`에 정리되어 있습니다.

### 제품·개발 문서와 ADR은 어디에 두나요?

여러 영역에 걸친 문서는 루트 `docs/`, 특정 영역 전용 문서는 해당 앱이나 패키지 안의 `docs/`에 둡니다. ADR도 영향 범위가 넓으면 `docs/adr/`, 한 영역에 한정되면 그 영역의 `docs/adr/`에 둡니다. 자세한 배치·동기화 규칙은 [저장소 공통 정책](development/repository-policy.md#배치와-범위)이 단일 기준입니다.

### 문서가 코드와 어긋나지 않게 하려면 어떻게 하나요?

영향받는 문서를 코드·설정·디자인과 같은 변경에서 함께 갱신합니다. 실행 가능한 설정을 현재 동작의 기준으로 삼고, 문서에 중복된 과거 설명을 쌓지 않습니다. 규칙은 [저장소 공통 정책](development/repository-policy.md#기준-정보와-최신성), 탐색 링크는 [문서 인덱스](README.md)를 참고하세요. 링크·anchor·고아 문서·ADR 형식·변경 기록 순서는 `pnpm docs:check`가 검사합니다.

### 루트와 영역별 AGENTS.md가 충돌하지 않나요?

루트 `AGENTS.md`는 핵심 규칙과 문서 위치만 담은 지도이고, 공통 정책 원문은 [저장소 공통 정책](development/repository-policy.md)에 있으며, 하위 파일은 해당 영역의 추가 규칙만 담당합니다. 같은 규칙을 두 곳에 복사하지 않습니다. 작업할 영역의 파일 목록은 [루트 AGENTS.md](../AGENTS.md#반드시-지킬-규칙)에서 확인합니다.

### 현재 구조가 제품 아키텍처보다 스켈레톤에 가까운가요?

현재는 제품 기능보다 개발 환경·명령·작업 규칙이 먼저 정리된 상태입니다. 폴더 분리가 도메인 모델이나 데이터 흐름까지 결정했다는 뜻은 아닙니다. 실제 기능에 필요한 구조만 추가하고, 원격 환경이 준비되지 않았는데 배포가 구현된 것처럼 표시하지 않습니다.

### infra와 local/dev/prod는 어떻게 구분하나요?

`apps/`는 애플리케이션 코드, `infra/`는 실행 환경을 관리합니다. local은 실제 PC에서 실행하고 dev/prod는 분리된 원격 자원을 대상으로 합니다. 현재 원격 설정은 없으며, 환경별 위치와 구성 전 필요한 정보는 [인프라 안내](../infra/README.md)에 정리되어 있습니다.

### 인프라·API·웹·앱마다 secret 파일이 필요한가요?

모든 영역에 빈 파일을 만드는 대신 소비 서비스와 권한에 맞게 분리합니다. 현재 Compose는 `infra/local/.env`만 읽고 API에 자동으로 전달하지 않습니다. API는 자신의 `apps/api/.env`를 읽고, 웹·앱에는 공개 설정만 둡니다. 원격 비밀값과 서비스별 경계는 [환경과 비밀값 관리](development/environment-secrets.md)가 기준입니다.

## 개발 도구

### 왜 pnpm을 사용하나요? npm이나 다른 도구는 안 되나요?

현재 저장소는 `pnpm-workspace.yaml`로 앱과 공용 패키지를 하나의 workspace로 관리하고, `workspace:*` 의존성과 `pnpm-lock.yaml`로 내부 패키지 연결·설치를 고정합니다. 그래서 pnpm은 지금 구조에 잘 맞는 실용적인 선택입니다. npm workspaces나 Yarn도 대안이지만, 이 저장소에서는 도구를 바꾸는 이득보다 설정·lockfile·작업 흐름을 함께 바꾸는 비용이 큽니다. pnpm이 모든 프로젝트에서 유일한 최선이라는 뜻은 아닙니다. 사용 버전은 루트 `package.json`의 `packageManager`가 기준입니다.

### PM2는 왜 필요하고, 반드시 써야 하나요?

`make api-up/down/restart`, `make web-up/down/restart`, `make app-up/down/restart`가 각 개발 서버를 터미널과 분리해 관리하도록 PM2를 사용합니다. PM2는 루트 개발 의존성으로 고정했고, 상태는 checkout 전용 `.local/pm2/`에 둬 다른 프로젝트·다른 worktree의 PM2 상태와 분리합니다. 운영 서버의 프로세스 관리 수단으로 추가한 것은 아닙니다.

PM2 없이 `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:app`을 터미널에서 직접 실행해도 됩니다. 한 터미널에서 여러 프로세스를 함께 실행하는 도구도 대안이지만, 각 영역의 개별 종료·재시작이 목적이면 PM2가 편리합니다. 기능이 늘거나 팀·운영 요구가 달라지면 다시 평가합니다.

### 전체 로컬 개발 환경을 어떻게 실행하고 종료하나요?

루트에서 `make up`으로 PostgreSQL·Valkey와 API·웹·Expo 서버를 시작하고, `make status`로 확인합니다. `make api-restart`, `make web-down`, `make infra-restart`처럼 한 영역만 관리할 수도 있습니다. `make down`은 모두 종료하며 데이터 volume은 유지합니다. 자세한 대상, 주소, 초기화 주의사항은 [로컬 개발 환경 안내](development/local-environment.md)를 참고하세요.

### Redis 대신 Valkey를 쓰는 이유는 무엇인가요?

현재 로컬 설정은 [infra/local/compose.yaml](../infra/local/compose.yaml)에서 Valkey 8을 사용하지만 API는 아직 연결하지 않았습니다. Valkey는 BSD 3-Clause 라이선스를 사용하고 Redis 7.2.4 명령 API 호환성을 제공해 로컬 개발용으로 선택하기 쉬운 대안입니다. Redis 8도 라이선스 선택지가 있으므로 Redis 사용이 배제된 것은 아니며, 이 설정만으로 프로덕션 선택이 확정된 것도 아닙니다. 세부 비교는 [Redis와 Valkey 레퍼런스](references/redis-vs-valkey.md)를 참고하세요.

## 제품·배포

### 웹 앱을 모바일 앱과 별도로 두는 이유는 무엇인가요?

모바일 앱 설치가 어렵거나 원치 않는 사용자가 브라우저로 접근할 수 있도록 웹 클라이언트도 별도 앱으로 둡니다. 지금은 시작 화면만 있고 제품 기능과 MVP 범위는 아직 정하지 않았습니다. 배포 목표와 미구현 범위는 [배포 대상 아키텍처](architecture/deployment-target.md)에 기록되어 있습니다.

### 프로덕션은 어디에 배포할 계획인가요?

웹은 Vercel, PostgreSQL은 Supabase, API는 Oracle ARM 서버(목표 사양 2 OCPU·12 GB RAM)를 사용하는 방향입니다. 이는 아직 계획이며 배포·보안·백업 자동화가 구성된 상태는 아닙니다. 프로덕션 캐시 제품과 배치 위치는 미정이며, 로컬 Valkey 설정만으로 프로덕션 선택이 확정된 것은 아닙니다. 자세한 내용은 [배포 대상 아키텍처](architecture/deployment-target.md)를 참고하세요.

### 지금 다국어 번역을 지원하나요?

아직 지원하지 않습니다. 한국어가 주 언어이며 다국어(i18n)는 추후 검토할 예정입니다. 현재 번역 프레임워크나 로케일 전환 구조는 추가하지 않습니다. 도입 시 ADR로 결정합니다. 기준은 [저장소 공통 정책](development/repository-policy.md#언어)입니다.
