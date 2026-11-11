# 검증 루프

에이전트와 CI는 같은 명령으로 변경을 검증합니다. 정적 검사·빌드·테스트는 `pnpm verify`, 실행 중인 API·웹 확인은 `pnpm smoke`입니다. 각 명령의 실제 단계는 스크립트가 기준이며 이 문서는 사용법과 완료 전 확인 범위를 설명합니다.

## `pnpm verify`

[`scripts/verify.mjs`](../../scripts/verify.mjs)가 루트 `package.json`의 script를 `pnpm run <단계>`로 순서대로 실행합니다. 각 단계의 출력은 그대로 보이고, 끝에 단계별 결과(`통과`·`실패`·`건너뜀`)와 소요 시간, 실패 단계의 해결 안내를 요약합니다. 실패가 하나라도 있으면 종료 코드 1로 끝납니다.

| 명령 | 단계 |
| --- | --- |
| `pnpm verify` | `tokens:check → work:check → docs:check → design:check → lint → typecheck → build → test` |
| `pnpm verify --fast` | `tokens:check → work:check → docs:check → design:check → lint → typecheck` |
| `pnpm verify --docs` | `work:check → docs:check → design:check` (문서·디자인 산출물만 바뀐 변경. `*.md`와 `design/`은 Prettier·ESLint 대상이 아님, `.prettierignore`) |

- 기본은 첫 실패에서 멈추고 남은 단계를 `건너뜀`으로 표시합니다. 모든 단계 결과를 보려면 `--keep-going`을 붙입니다.
- `.local/instance.env`([인스턴스 설정](local-environment.md))가 있으면 그 값을 환경변수로 보충합니다. 이미 설정된 환경변수가 우선합니다. `test` 단계의 API 통합 테스트는 이 값의 `TEST_DATABASE_URL`로 현재 작업공간의 PostgreSQL에 연결합니다.
- `test`는 실제 PostgreSQL이 필요합니다. 먼저 `make infra-up`으로 DB를 띄웁니다.
- `design:check`는 `design/` 산출물의 색 리터럴과 인계 문서를 검사하고, 로컬 OpenDesign이 실행 중일 때만 `od lint`를 함께 돌립니다([OpenDesign 사용 기준](../../design/docs/opendesign.md#검사)). CI에는 OpenDesign이 없으므로 `od lint`는 건너뜁니다.

## `pnpm smoke`

[`scripts/smoke.mjs`](../../scripts/smoke.mjs)가 실행 중인 API·웹에 [Playwright 테스트](../../tests/smoke/smoke.spec.ts)를 실행합니다. 서비스를 띄우지 않으며, 띄운 서비스의 주소만 받습니다.

1. 주소는 `API_URL`·`WEB_URL` 환경변수, 없으면 `.local/instance.env`의 같은 키를 씁니다. 둘 다 없으면 `make up` 안내와 함께 실패합니다.
2. 두 주소가 연결을 받는지 먼저 확인하고, 응답이 없으면 `make up`·`pnpm logs api`·`pnpm logs web` 안내와 함께 실패합니다.
3. Playwright Chromium을 실행할 수 없으면 `pnpm exec playwright install chromium` 안내와 함께 실패합니다.
4. `playwright test -c tests/smoke/playwright.config.ts`를 실행합니다. `pnpm smoke` 뒤의 인자는 그대로 넘깁니다(예: `pnpm smoke --headed`, `pnpm smoke -g 모바일`).

검사 항목([`tests/smoke/smoke.spec.ts`](../../tests/smoke/smoke.spec.ts)):

- API liveness `GET /api/health`가 200과 `{ status: 'ok' }`, readiness `GET /api/health/ready`가 200과 `{ status: 'ready' }`. 경로와 응답 형식의 기준은 [`packages/shared/src/index.ts`](../../packages/shared/src/index.ts)입니다.
- 웹 첫 화면(`/`)이 200으로 열리고 보이는 내용이 있으며 브라우저 콘솔 오류와 페이지 예외가 없음. 특정 화면 문구는 검사하지 않으므로 첫 화면을 바꾸는 기능 티켓도 smoke를 고치지 않고 통과합니다. 화면별 시나리오와 웹→API 연결은 기능의 통합 티켓이 E2E로 확인합니다([기술 설계와 티켓 분해](../specs/README.md)).
- 1280px·390px 폭에서 `document.documentElement.scrollWidth <= clientWidth`(가로 넘침 없음).

웹 화면 변경의 UI/UX 완료 기준은 [디자인 시스템의 기기·OS·브라우저 대응](../../design/system/DESIGN.md#기기os브라우저-대응)에 있다. 위 smoke는 Chromium 기반의 공통 상태 검사다. 변경한 내부 페이지의 입력 겹침·카드 경계·표/차트 가독성·정보 배치와 WebKit/Firefox·실물 결함의 확인 결과는 기능별 검증에 별도로 남긴다. 디자인 기준 추가만으로 현재 smoke에 다중 엔진 검사가 구현됐다고 설명하지 않는다.

실패한 테스트의 trace는 `.local/smoke/test-results/`에 남습니다. `pnpm exec playwright show-trace <trace.zip>`으로 엽니다.

## `pnpm e2e`

기능 시나리오 E2E는 `pnpm smoke`와 분리해 [`tests/e2e/`](../../tests/e2e/README.md)에 둡니다. [`scripts/e2e.mjs`](../../scripts/e2e.mjs)가 실행 중인 인스턴스(`make up`)의 웹·API·DB에 Playwright로 크리링 MVP 시나리오([MVP 기술 설계 검증 계획](../specs/crelink-mvp.md#검증-계획))를 실행합니다. 로그인 상태는 DB fixture가 세션 행을 넣어 만들고, 테스트 데이터는 끝에 지웁니다.

웹 개발 서버(`make up`의 `next dev`)는 `apps/web/.next/dev/`, 빌드(`pnpm verify`의 `next build`)는 그 밖의 `apps/web/.next/`에 출력하므로 개발 서버를 띄운 채 `pnpm verify` → `pnpm smoke`·`pnpm e2e` 순서로 실행해도 됩니다(Next.js 16 기본 동작, `next build`가 `.next/dev`를 건드리지 않음). `apps/web/next-env.d.ts`는 Next.js가 출력 디렉터리에 맞춰 다시 쓰는 생성 파일이라 Git에서 제외하고, 웹 `typecheck`가 `next typegen`으로 만듭니다.

## CI

PR마다 GitHub Actions에서 도는 CI는 없습니다(0237, [ADR 0016](../adr/0016-devoffice-takeover.md) 결정 5). 머지 전 검사는 [로컬 CI](#로컬-ci)의 `pnpm ci:local --report`가 맡습니다. GitHub ruleset `main 보호`(0061)가 머지를 막습니다: main 직접 push·force push·삭제 금지, PR 필수(squash만, 승인 0), 필수 검사 `CI 통과`, PR 브랜치가 최신 `main`을 포함해야 함. `CI 통과`는 `--report`가 기록하는 commit status로 충족합니다. 어느 앱에서 온 status인지는 묶지 않으므로 쓰기 권한자는 검증 없이도 기록할 수 있습니다(ADR 0016의 한계).

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)은 수동 실행 전용입니다(`gh workflow run CI --ref <브랜치>`). 실제 변경 영향이 로컬 검사로 덮이지 않는 로그인·권한·개인정보 계약, 브라우저 엔진 차이, 의존성 major 또는 amd64 빌드 위험에 닿을 때 필요한 범위를 확인해 실행합니다. 관리 화면의 단순 옵션·문구 변경이라는 이유만으로 원격 전수 CI를 실행하지 않습니다. 관련 unit·계약 검사와 지정 QA로 충분한 변경은 해당 로컬 profile을 씁니다. 수동 CI가 성공하면 같은 이름의 `CI 통과`가 남습니다.

| job | 내용 |
| --- | --- |
| `check` | 지원 Node.js(`matrix.node`: 24, 26)마다 `pnpm verify --keep-going`. PostgreSQL 17 서비스 컨테이너를 씁니다. |
| `smoke` | 고정 `ubuntu-24.04`·lockfile Playwright에서 smoke → 핵심 사용자 Chromium → personas → analytics-responsive 3엔진 → link-layout 3엔진을 순서대로 실행합니다. 실패 시 artifact에 suite별 HTML/JSON·PNG·trace와 API/웹 로그를 남깁니다. |
| `이미지 빌드 api`·`이미지 빌드 web` | 운영 이미지가 `linux/amd64`로 빌드되는지 확인합니다(푸시 안 함). |
| `CI 통과` | 위 job 중 하나라도 실패·취소면 실패합니다. |

지원 Node.js 버전을 바꾸면 workflow의 `matrix.node`, `.nvmrc`, 운영 이미지 베이스(`apps/*/Dockerfile`), `apps/web/package.json`의 `engines`, README 요구사항을 함께 고칩니다. 버전 선택 기준은 [저장소 공통 정책](repository-policy.md#의존성-버전)입니다.

### 브라우저 gate와 시각 기준선

현재 PR 선택 범위는 workflow의 명령이 원본입니다. 핵심 사용자 검사는 작성·공개·권한·안내·방명록·출시 QA와 합성 사용자 세션을 포함합니다. AI 운영자 실행·광고 전역 스위치 전체 회귀를 매 PR에 중복 실행하지 않습니다. OAuth fixture와 외부 목적지 mock의 한계는 [가상 사용자 계약](user-simulation.md)을 따릅니다.

시각 기준선은 고정 Linux CI의 Chromium·viewport·합성 콘텐츠·폰트 준비 조건에서 생성하고 PNG 원본을 직접 검토한 뒤에만 등록합니다. macOS 캡처를 Linux baseline으로 바꾸거나 실패 이미지를 자동 승인하지 않습니다. 최초 기준선 부재로 실패한 실행은 중간 실패이며, 같은 실행의 artifact와 필수 gate 실패를 확인한 뒤 기준선을 명시적으로 추가하고 정상 최종 SHA에서 전체 gate 성공을 확인해야 합니다. 검증 기록은 [출시 QA 설계](../specs/release-qa.md), 결과는 [0200](../work/orchestrator/0200-release-qa.md)에 연결합니다.

## 로컬 CI

[`scripts/ci-local.mjs`](../../scripts/ci-local.mjs)가 실행하고 [`scripts/lib/ci-local.mjs`](../../scripts/lib/ci-local.mjs)의 registry가 범위와 명령을 정합니다([ADR 0016](../adr/0016-devoffice-takeover.md) 결정 5). push 전에 clean HEAD에서 영향 범위를 덮는 profile을 성공시켜 receipt를 만들고, push 뒤 머지 전에 **동일 옵션**으로 `--report`를 실행합니다. report는 receipt 대조·status 등록만 하며 테스트를 다시 실행하지 않습니다. Dependabot도 같은 기준입니다. 기본 profile은 항상 `full`이며 report에서 이전 profile을 추정하지 않습니다.

| profile | concrete CLI 예와 범위 |
| --- | --- |
| `full` (기본) | `pnpm ci:local` → push → `pnpm ci:local --report`. 기존 전체 코드/문서 경로 유지 |
| `config` | `pnpm ci:local --profile config` → push → `pnpm ci:local --profile config --report`. 기존 `infra/prod/secrets/home-server.sops.env`의 암호문 교체 또는 기존 `INSTAGRAM_REQUIRED_KEYS` 8개 전체의 최초 암호문 등록만 허용. 미등록 이름·삭제·부분 등록·평문·수신자·파서·배포동작 변경은 full |
| `hotfix` | `pnpm ci:local --profile hotfix --select api:src/instagram/rules.service.ts,api:src/instagram/webhook.service.ts`. rules/webhook 옵션 변경의 관련 unit·각 e2e·공개 계약만 검사. web/shared 변경이 있으면 해당 selector 추가 |
| `auth` | `pnpm ci:local --profile auth --select api:src/instagram/graph.ts,api:test/fixtures/instagram-graph.fixtures.ts`. offline 인증 계약 예. 같은 변경에 web/shared가 있으면 selector를 명시적으로 추가 |
| 지정 QA | QA 이름은 `smoke`, `analytics-responsive`, `visitor`, `signup-funnel`. 해당 변경과 실제 관련된 모음에만 `--qa <이름>`을 지정 |

hotfix/auth도 report 때 `--profile`, `--select`, `--qa`를 위 실행과 동일하게 전달합니다. 예: `pnpm ci:local --profile auth --select api:src/instagram/graph.ts,api:test/fixtures/instagram-graph.fixtures.ts --report`. selector 목록 순서는 정규화합니다. `full`에는 `--select`/`--qa`를 붙여 축소할 수 없습니다.

### 범위와 실행

- 실행 전 변경 파일·profile·selector·QA·필수/관측 명령을 출력해 고정합니다. 비교는 `origin/main...HEAD`와 작업 트리(추적하지 않는 파일 포함)이며 이름 변경의 양쪽 경로를 검사합니다. 등록되지 않은 소스·관련 범위 누락·빈 selector·알 수 없는 인자는 종료 코드 2로 거부합니다. 임의 shell 명령은 받지 않고 registry의 `spawn`/`execFile` argv만 실행합니다.
- runner(`scripts/`), lockfile, package manifest, `.github/`, 공통 infra, Dockerfile 변경은 full입니다. config의 기존 암호문 교체와 기존 8개 키 최초 일괄 등록만 예외이며 암호문 구조/기존 메타데이터를 비교합니다. 허용 이름은 `apps/api/src/config.service.ts`의 기존 `INSTAGRAM_REQUIRED_KEYS`와 unit으로 대조합니다. 이는 기존 정의값 주입이며 새 파서 정의가 아닙니다. 이 검사는 **복호화 값 형식이나 운영 정상의 증거가 아닙니다**.
- API의 `api:src/instagram/rules.service.ts`는 rules 서비스·컨트롤러와 rules/contract e2e, `api:src/instagram/webhook.service.ts`는 webhook 서비스·컨트롤러·payload·raw-body·서명과 signed-request unit 및 webhook/contract e2e를 선택합니다. `api:src/instagram/graph.ts`와 `api:test/fixtures/instagram-graph.fixtures.ts`는 Graph unit만 선택합니다. `api:src/instagram`은 모듈 전체 unit과 Instagram 도메인의 모든 e2e를 선택합니다(루트 전체 시험 제외). 각 그룹의 변경 시험 파일도 같은 selector로 덮으며, connection e2e 단독 selector도 유지합니다. 모두 API typecheck를 포함합니다. Jest는 `--runTestsByPath`로 지정하고 테스트 0건은 실패합니다. **선택한 시험에 e2e가 있을 때만** DB를 시작합니다.
- `web`은 Instagram 설정·발송 내역·callback·삭제 상태 경로와 `instagram-dm-audience`만 덮습니다. 관련 `state.spec.ts`·audience·callback·삭제 상태 unit과 web typecheck를 실행합니다. web typecheck만으로 성공시키지 않습니다.
- `shared`는 `packages/shared/src/instagram-dm.ts`와 해당 spec만 덮으며 shared build/test 및 API·web·app 소비자 typecheck를 실행합니다. 새 공통 계약은 등록하거나 full로 확인합니다.
- hotfix/auth는 `shared` selector가 없어도 API/web workspace import의 `dist`를 준비하려고 소비자 시험·typecheck 전에 shared build를 실행합니다. shared test와 추가 소비자 typecheck는 `shared` 선택 등 기존 필요조건을 유지합니다. 새 checkout/오래된 dist의 순서는 synthetic 소비자가 dist 일치를 확인하는 hermetic 시험으로 고정합니다.
- registry QA는 실제 관련된 경우에만 선택합니다. `visitor`는 공개 방문 경로 검사이므로 Instagram 설정 폼 부분 QA의 근거가 아닙니다. Instagram 폼 같은 화면은 기존 fixture와 동일 소스 증거를 사용하는 별도 부분 QA가 필요하며, registry unit/typecheck만으로 화면 QA 완료를 주장하지 않습니다.
- 좁은 profile은 `pnpm verify --docs --keep-going`, `work:scope`, 변경한 코드 파일 ESLint·Prettier를 함께 실행합니다. 이미지 빌드와 ego 네 모음은 자동 추가하지 않습니다. QA를 지정했을 때만 스택을 준비합니다.
- full은 기존 동작을 유지합니다. 문서만 바뀌면 `pnpm verify --docs --keep-going` → `work:scope`; 코드 변경(비교 불가 포함)은 `work:scope` → 인스턴스 설정 → `make infra-up` → `pnpm verify --keep-going` → 스택 준비 → ego 네 모음 → 스택 정리 → API/web 이미지 빌드입니다. 이미 떠 있던 서비스는 보존하고 이번 실행이 만든 서비스만 내립니다.
- 단계가 실패해도 나머지 필수 검사를 실행하고 실패를 유지합니다. SIGINT/SIGTERM은 자식 프로세스 그룹을 중단하고 정리한 뒤 130/143입니다. dirty·중단·필수 실패/누락이면 성공 receipt를 쓰지 않고 실패합니다. 동일 SHA 재실행 시작 시 이전 receipt를 지워 실패 뒤 옛 성공을 재사용하지 못하게 합니다.
- Node 기준은 `.nvmrc`이며 다르면 경고합니다. full 이미지는 Docker 서버 고유 플랫폼으로 `cacheonly` 빌드합니다. Apple Silicon QEMU의 amd64 Next 빌드 오류 때문에 amd64는 Deploy에서 검사하며, 머지 전에 이 위험을 확인해야 하는 변경이면 수동 CI를 사용합니다. 실제 포함되지 않은 E2E·Node 26 범위는 실행기의 `NOT_LOCAL`을 요약에 표시합니다.

### receipt와 commit status 기록

성공 receipt는 `.local/ci/receipts/<sha>.json`에 원자적으로 저장합니다(Git 제외, 영구 보관 스키마 아님). SHA, 현재 base SHA, clean 여부, profile/selectors/QA와 변경 파일, 전체 명령 계획·실제 단계 argv, Node/platform, lock hash, runner 지문, 환경 지문, 필수 결과(`results`)와 외부 관측(`observations`)을 분리하고 완전성·중단 여부를 기록합니다. 환경은 비밀값을 출력하지 않고 전체 digest만 저장합니다. `gh` 등록 인증과 터미널·pnpm 호출 메타데이터를 제외한 실행 환경 및 로컬 env 파일은 지문으로 대조합니다.

`--report`는 현재 registry로 계획을 다시 계산해 모든 필드·필수 여부·결과의 누락/중복/순서·실제 실행 argv를 대조합니다. receipt 없음·손상·빈 required·불명·불일치·dirty·실패/중단이면 종료 코드 1이며 full을 자동 실행하지 않습니다. 출력의 `tests 0 (검사 명령 0회)`로 재사용 경로를 확인합니다. source·테스트·registry·HEAD/base·환경이 바뀌면 검증을 다시 실행해야 합니다.

통과한 receipt가 있고 현재 HEAD가 같은 이름의 원격 브랜치 tip이며 시작/끝 clean·HEAD 고정을 만족할 때만 `gh api`로 `context=CI 통과`, `state=success`를 등록합니다. `--report --dry-run`은 같은 대조 후 등록만 생략합니다. 옵션 없이 실행하면 status를 등록하지 않습니다. ruleset의 strict 조건 때문에 main 갱신/rebase 뒤에는 새 SHA에서 검증이 필요합니다. 쓰기 권한자의 status·receipt 위조를 암호학적으로 막지는 않는다는 신뢰 한계는 ADR 0016 그대로입니다.

### 내부 계약과 외부 관측

기본 auth 검사는 실제 Meta 네트워크 없이 [test-only synthetic fixture](../../apps/api/test/fixtures/instagram-graph.fixtures.ts)를 `FetchInstagramGraph` fetch 경계에서 재생합니다. 2026-11-11 관측 shape의 출처와 가짜 값은 fixture·[API 안내](../../apps/api/docs/README.md#instagram-공개-답글과-unified-login-보강)에 구분합니다. 복수 계정은 Graph 목록 반환/서비스 409이며 malformed·timeout은 기존 `indeterminate`, 연결 전 실패는 `connect_failed` 계약을 보존합니다.

별도 opt-in `INSTAGRAM_LIVE=1 pnpm ci:local --profile auth --select api:src/instagram/graph.ts`은 registry에 미리 선언된 `Meta 도달 관측`만 추가합니다. 이 관측은 비밀 없이 공개 Graph 호스트 도달만 확인하며 실제 로그인·실계정 성공을 뜻하지 않습니다. 외부 관측 불가는 별도 **실패** 결과로 남기되 비차단입니다. 필수 내부 계약 실패를 외부 장애라고 재분류하거나 FAIL을 PASS로 바꾸지 않습니다. `EGO_TEST_ONLY`·`EGO_TEST_FAULT`·`EGO_TEST_INJECT_CSS`로 필수 결과를 숨기거나 조작할 수 없습니다.

## CD(운영 배포)

[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)이 `main` push(PR 머지)마다 운영에 배포합니다(main에서 수동 실행, `force`로 두 이미지 새로 빌드). main에서는 CI를 다시 돌리지 않으므로 머지된 코드의 안전장치는 배포의 이미지 빌드(실패하면 배포하지 않음)와 `운영 주소 검사`·자동 롤백입니다. 문서만 바뀐 머지는 `plan`만 돌고 재배포하지 않습니다. 설계(각 job의 조건·흐름)는 [운영 배포·CD 기술 설계](../specs/crelink-prod-deploy.md#워크플로), 접속 설정·장애 대응은 [prod 런북](../../infra/docs/prod-runbook.md)입니다.

| job | 내용 |
| --- | --- |
| `plan` | 배포 커밋, 변경 영역(`api`·`web`·`release`, 태그 `deploy/prod-api`·`deploy/prod-web`·`deploy/prod` 기준), `infra/prod/targets.json`의 사용 대상·플랫폼, 접속 설정(`vars.TS_OIDC_*`·`DEPLOY_SSH_KEY`) 여부. 접속 설정이 없으면 이미지까지만 만들고 배포를 건너뛰며 경고를 남깁니다. |
| `이미지 api`·`이미지 web` | 바뀐 영역만 `ghcr.io/ai-worker-lab/crelink-<api\|web>:<SHA>`로 푸시(대상 플랫폼 합집합). Sentry 빌드 인자(`SENTRY_RELEASE`·`vars.SENTRY_*`)를 넘기고, secret `SENTRY_AUTH_TOKEN`이 있으면 빌드 중 소스맵을 Sentry에 올립니다(실패하면 빌드 실패, 없으면 건너뜀. [ADR 0012](../adr/0012-error-monitoring-sentry.md)) |
| `배포 <대상>` | 대상마다 차례로 Tailscale(OIDC, `tag:ci`) → `ssh deploy@<host> deploy …`로 `infra/prod` 묶음을 보내 서버 `deploy.sh` 실행(비활성 색에 올려 헬스를 통과하면 edge Caddy reload로 전환하는 Blue/Green 무중단 배포). 새 색이 헬스에 실패하면 서버가 그 색만 내려 활성 색·트래픽은 그대로이고 job이 실패합니다. 이어서 `운영 주소 검사` 단계가 `ssh deploy@<host> verify`(서버의 `verify.sh`가 Cloudflare를 거쳐 웹 `/`·`/privacy`·BFF health 200, 토큰 없는 AI 토큰 경로 `/api/agent/api/health` 401, `https://go.shaul.kr/<없는 주소>` 302 → notice, 배너 클릭 `/b/<없는 배너>`·`/a/<없는 배너>/<없는 랜딩>` 302 → `link_unavailable` notice, `https://go.shaul.kr/api/health` 404 확인, 모두 11개)를 실행하고, 실패하면 `자동 롤백` 단계가 직전 릴리스로 되돌린 뒤(같은 무중단 전환) job을 실패로 끝냅니다. |
| `배포 기록 태그` | 성공하면 `deploy/prod`와 바뀐 영역의 `deploy/prod-api`·`deploy/prod-web`를 옮깁니다. |

수동 롤백은 [`.github/workflows/rollback.yml`](../../.github/workflows/rollback.yml)(입력 `target`·`release`)입니다. 의존성 갱신 PR은 [`.github/dependabot.yml`](../../.github/dependabot.yml)이 주 1회 엽니다. 워크플로 문법은 `actionlint`로 검사합니다(로컬 설치 시 `actionlint .github/workflows/*.yml`).

GitHub Actions가 돌지 않을 때(장애, 비공개 시절의 사용량 한도 초과)는 CI 대신 로컬 `pnpm verify`·`pnpm smoke`·`pnpm e2e`를 실행해 PR에 결과를 적고, `CI 통과`가 오지 않으므로 저장소 admin이 ruleset 우회로 머지한 뒤, 운영자 컴퓨터에서 [`infra/prod/deploy-local.sh`](../../infra/prod/deploy-local.sh)로 같은 순서(변경 판별 → 대상 서버에서 이미지 빌드 → `deploy` → `운영 주소 검사`·실패 시 롤백 → 배포 기록 태그)의 배포를 실행합니다. 이때 머지 뒤 확인은 이 스크립트 출력(`완료` 줄)입니다. 절차와 한계(소스맵 업로드 없음, 이미지는 서버에만)는 [런북 16](../../infra/docs/prod-runbook.md#16-github-actions-없이-배포)입니다.

### 운영 확인

`배포 <대상>` job의 `운영 주소 검사`가 배포마다 운영 주소를 확인하므로, 머지 뒤 확인은 Deploy 실행 결과(어느 커밋의 실행이 `이미지`·`배포` job을 돌렸는지 포함)로 충분합니다. 그 밖에 운영에서 직접 요청을 보내거나 화면을 열어 확인·시험하는 일은 시간·CI·외부 서비스 사용량과 운영 데이터·모니터링 기록을 남기므로, 로컬·CI 검증으로 볼 수 없는 위험이 있을 때만 합니다.

- 명분이 되는 예: 운영 설정·비밀값(운영 DSN 빌드에서만 그려지는 화면 등), 데이터 migration, 인프라·네트워크 경로(Caddy·Cloudflare·Blue/Green) 변경, 외부 서비스 연동, 사용자가 보고한 운영 장애 재현.
- 명분이 아닌 예: 로컬 `pnpm e2e`·`pnpm smoke`로 이미 확인한 화면·흐름, `운영 주소 검사`와 같은 주소 다시 부르기, 운영 확인 기록만을 위한 별도 PR.
- 할 때는 먼저 사용자에게 이유·범위(읽기만인지, 쓰기·데이터 생성이 있는지, 쓸 계정)를 알리고, 결과는 해당 work item `진행 기록`에 남깁니다.
- AI 운영자 실행은 사용자에게 먼저 알리는 대신 이유·범위를 실행 기록(`/admin/agent-runs`)과 work item에 남깁니다. 운영 공개 주소(단축 주소·공개 랜딩·클릭 주소)는 방문·클릭 통계를 바꾸므로 열지 않습니다([AI 운영자 헌장](../ops/ai-operator.md), [저장소 공통 정책](repository-policy.md#ai-운영자-위임)).

## 완료 보고 전 확인 범위

work item을 `검증` 상태로 올리거나 완료를 보고하기 전에 변경 영역에 맞는 명령을 실제로 실행하고, 실행한 명령과 결과를 work item `진행 기록`에 남깁니다. 위 registry가 지원하는 변경은 선택 profile의 관련 시험·계약·부분 QA가 이 표의 전체 명령보다 우선하며, 이미 확인한 같은 대상의 성공 검증을 중복 실행하지 않습니다. 미등록·공통 기반 변경은 full을 사용합니다. 실행하지 않은 검증을 통과로 적지 않습니다.

| 변경 영역 | 실행 |
| --- | --- |
| 문서·work item만 | `pnpm verify --docs`(CI `docs` job과 같음) |
| 디자인(`design/`, 토큰 원본) | `pnpm tokens:generate`, `pnpm design:sync`, `pnpm design:check --require-lint`, `pnpm verify --fast`. 미리보기는 1280px·390px에서 직접 확인합니다([OpenDesign 사용 기준](../../design/docs/opendesign.md)). |
| 스크립트·설정·`packages/*` | `pnpm verify` |
| API(`apps/api/`) | `make infra-up` 후 `pnpm verify`, `make up` 후 `pnpm smoke` |
| 웹(`apps/web/`) | `pnpm verify`, `make up` 후 `pnpm smoke`. 바꾼 화면은 브라우저로 직접 확인합니다([웹 규칙](../../apps/web/AGENTS.md)). |
| 앱(`apps/app/`) | `pnpm verify`. 화면 동작은 [기기 테스트](../../apps/app/docs/device-testing.md)로 확인합니다(자동 UI 테스트 없음). |
| 인프라·`Makefile`·PM2 설정 | `make up` 후 `make status`, `pnpm smoke` |
| `.github/workflows/` | `pnpm verify --fast`, 바꾼 job이 실행하는 명령을 로컬에서 같은 순서로 실행 |

## 실패 출력 읽는 법

- `pnpm verify`: 맨 아래 `검증 요약`에서 `실패` 단계를 찾고, `해결 안내`의 명령을 먼저 실행합니다. 원인은 요약 위쪽의 `▶ <단계>` 아래 출력에 있습니다. 같은 단계만 다시 볼 때는 `pnpm <단계>`(예: `pnpm lint`)를 실행합니다.
- `pnpm smoke`: 테스트 전 확인 단계가 실패하면 출력의 명령(`make up`, `pnpm logs api`, `pnpm exec playwright install chromium`)을 따릅니다. 테스트 실패는 Playwright 출력의 테스트 이름·기대값과 함께 적힌 설명(예: readiness 503이면 API의 `DATABASE_URL`)을 확인합니다. 콘솔 오류는 `pnpm logs web`·`pnpm logs api`와 함께 봅니다.
- CI: 실패한 job의 단계 로그를 봅니다. `check`는 `pnpm verify` 요약을, `docs`는 `pnpm verify --docs` 요약을, `smoke`는 `pnpm smoke` 출력과 `API·웹 로그` 단계를 확인합니다. 문서만 바꿨는데 전체 검사가 돌았다면 `변경 종류` job 로그의 코드 파일 목록을 봅니다.
