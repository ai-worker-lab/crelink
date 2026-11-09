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

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)이 `main` 대상 PR에서만 실행합니다. main push(PR 머지)에서는 다시 돌리지 않습니다(0060). 대신 GitHub ruleset `main 보호`(0061)가 머지를 막습니다: main 직접 push·force push·삭제 금지, PR 필수(squash만, 승인 0), 필수 검사 `CI 통과`, PR 브랜치가 최신 `main`을 포함해야 함(뒤처지면 PR의 `Update branch`). 그래서 PR이 검사한 내용과 머지 결과가 같습니다. 우회는 저장소 admin의 PR 머지만 가능하고 Actions가 돌지 않을 때만 씁니다(아래 CD 절). 설정 값은 `gh api repos/ai-worker-lab/crelink/rulesets`로 봅니다. 먼저 `changes` job이 바뀐 파일(병합 커밋의 첫 부모와 비교)이 문서뿐인지 판정합니다. 문서는 `docs/`·`design/` 아래 파일과 `*.md`이고, `RELEASES.md`는 웹 `/docs/releases`가 빌드 때 읽으므로 코드로 봅니다. 문서뿐이면 `docs` job만, 아니면(비교할 수 없을 때 포함) `check`·`smoke`·이미지 빌드를 실행합니다.

| job | 내용 |
| --- | --- |
| `변경 종류`(`changes`) | 전체 이력을 받아 위 기준으로 `code` 출력(`true`·`false`)을 정합니다. 판정 근거 파일 목록을 로그에 남깁니다. |
| `docs` | 문서만 바뀌었을 때 `.nvmrc` Node로 `pnpm install --frozen-lockfile` 후 `pnpm verify --docs --keep-going`. |
| `check` | 코드가 바뀌었을 때 지원 Node.js(`matrix.node`: 기준 LTS 24와 다음 LTS 후보 26)마다 `pnpm install --frozen-lockfile` 후 `pnpm verify --keep-going`. PostgreSQL 17 서비스 컨테이너에 `TEST_DATABASE_URL`로 연결합니다. 한 버전이 실패해도 나머지 버전 결과를 끝까지 봅니다. |
| `smoke` | 고정 `ubuntu-24.04`·`.nvmrc` Node·lockfile Playwright에서 공용 패키지/API/웹을 빌드하고 localhost PostgreSQL 서비스와 API/웹을 시작합니다. 인스턴스 주소를 job 환경에 넣은 뒤 smoke → 핵심 사용자 Chromium → personas → analytics-responsive 3엔진 → link-layout 3엔진을 같은 DB에서 순서대로 실행합니다. 실패는 job과 필수 `CI 통과`를 실패시키며 `always()` artifact에 suite별 HTML/JSON·PNG·trace와 API/웹 로그를14일 보관합니다. |
| `이미지 빌드 api`·`이미지 빌드 web` | 운영 이미지(`apps/api/Dockerfile`, `apps/web/Dockerfile`)가 `linux/amd64`로 빌드되는지 확인합니다(buildx, gha 캐시). 푸시하지 않습니다. 배포 대상 플랫폼 빌드는 `deploy.yml`이 합니다. |
| `work scope` | `work/NNNN-*` 브랜치의 PR에서만 전체 이력을 받아 `pnpm work:scope --base origin/<기준 브랜치>`로 변경 파일이 티켓 역할의 소유 경로 안에 있는지 검사합니다. |
| `CI 통과` | 위 job이 모두 끝난 뒤 항상 돌아, 하나라도 실패·취소면 실패합니다(건너뜀은 통과). ruleset의 필수 검사는 이 job 하나입니다. 개별 job을 필수로 걸면 문서만 바뀐 PR에서 건너뛴 matrix job이 치환되지 않은 이름(`check (Node ${{ matrix.node }})`)으로 보고되어 필수 이름이 오지 않기 때문입니다. job을 추가하면 이 job의 `needs`에도 넣습니다. |

지원 Node.js 버전을 바꾸면 workflow의 `matrix.node`, `.nvmrc`, 운영 이미지 베이스(`apps/*/Dockerfile`), `apps/web/package.json`의 `engines`, README 요구사항을 함께 고칩니다. 버전 선택 기준은 [저장소 공통 정책](repository-policy.md#의존성-버전)입니다.

### 브라우저 gate와 시각 기준선

현재 PR 선택 범위는 workflow의 명령이 원본입니다. 핵심 사용자 검사는 작성·공개·권한·안내·방명록·출시 QA와 합성 사용자 세션을 포함합니다. AI 운영자 실행·광고 전역 스위치 전체 회귀를 매 PR에 중복 실행하지 않습니다. OAuth fixture와 외부 목적지 mock의 한계는 [가상 사용자 계약](user-simulation.md)을 따릅니다.

시각 기준선은 고정 Linux CI의 Chromium·viewport·합성 콘텐츠·폰트 준비 조건에서 생성하고 PNG 원본을 직접 검토한 뒤에만 등록합니다. macOS 캡처를 Linux baseline으로 바꾸거나 실패 이미지를 자동 승인하지 않습니다. 최초 기준선 부재로 실패한 실행은 중간 실패이며, 같은 실행의 artifact와 필수 gate 실패를 확인한 뒤 기준선을 명시적으로 추가하고 정상 최종 SHA에서 전체 gate 성공을 확인해야 합니다. 검증 기록은 [출시 QA 설계](../specs/release-qa.md), 결과는 [0200](../work/orchestrator/0200-release-qa.md)에 연결합니다.

## 로컬 CI

[`scripts/ci-local.mjs`](../../scripts/ci-local.mjs)의 `pnpm ci:local`이 위 CI job을 이 기기에서 재현합니다([ADR 0016](../adr/0016-devoffice-takeover.md) 결정 5). 전환 전이라 `ci.yml`과 ruleset은 그대로이고, 이 명령은 그 옆에서 같은 판정을 미리 돌려 봅니다.

| 판정 | 순서 |
| --- | --- |
| 문서만 바뀜 | `pnpm verify --docs --keep-going` → `work:scope` |
| 코드가 바뀜(비교할 수 없을 때 포함) | `work:scope` → `make infra-up` → `pnpm verify --keep-going` → `make up` → ego-lite 시험 모음 → `apps/api`·`apps/web` 이미지 빌드(기기 고유 플랫폼, 내보내지 않음) |

- **판정 기준:** CI `changes` job과 같은 규칙으로 `git diff origin/main...HEAD`와 작업 트리 변경(추적하지 않는 파일 포함)을 봅니다. 작업 트리도 보는 것은 `pnpm verify`가 작업 트리를 검사하기 때문입니다. 이름 변경은 옛 경로와 새 경로를 모두 세므로(`--no-renames`) 코드를 `docs/`로 옮긴 변경은 코드입니다. CI보다 넓게 검사하는 쪽의 차이입니다.
- **결과:** 단계별 결과·시간을 요약합니다. CI job처럼 한 단계가 실패해도 남은 단계를 돌리고, 하나라도 실패하면 종료 코드 1입니다. `Ctrl-C`·`SIGTERM`은 진행 중인 단계를 멈추고 스택을 정리한 뒤 130·143으로 끝납니다.
- **스택 정리:** 시작할 때 DB 컨테이너와 API·웹·앱 포트를 확인해 이 실행이 띄운 것만 내립니다. 이미 떠 있던 서비스는 다시 시작하지도 내리지도 않고 그대로 씁니다. 스택은 ego 시험 뒤 바로 내리고 이미지 빌드는 그다음에 합니다.
- **시험 모음:** ego-lite 시험은 스크립트의 `EGO_SUITES`, 아직 옮기지 않은 검사와 Node 26은 `NOT_LOCAL`이 원본입니다. 코드 경로의 실행 요약에 `로컬 CI 미포함`으로 나옵니다. `playwright install`을 하지 않습니다.
- **Node:** `.nvmrc`(24) 기준입니다. 다른 버전으로 실행하면 경고합니다.
- **이미지 플랫폼:** 이미지 단계는 Docker 서버의 고유 플랫폼(Apple Silicon은 `linux/arm64`)으로 빌드해 Dockerfile·의존성 오류를 잡습니다. `linux/amd64`를 쓰지 않는 이유는 Apple Silicon의 QEMU에서 `apps/web`의 `next build`가 크래시하기 때문입니다(2026-11-10 네 번 재현, [0210](../work/orchestrator/0210-local-ci.md)). amd64 빌드는 Deploy에서 검증합니다. [`deploy.yml`](../../.github/workflows/deploy.yml)의 `배포` job은 `이미지` job이 성공(또는 건너뜀)해야 돌고 플랫폼은 [`infra/prod/targets.json`](../../infra/prod/targets.json)을 따르므로, 빌드가 실패하면 서버를 건드리지 않고 멈춥니다. 실행 요약의 `로컬 CI 미포함`에 `amd64 빌드는 Deploy에서 검증`으로 표시합니다.
- **이미지 플랫폼의 한계:** amd64에서만 나는 빌드 실패는 머지 뒤 Deploy에서 드러납니다. 운영에는 나가지 않지만 그 사이 `main`에 고장 난 커밋이 남고, 되돌리거나 후속 PR로 고쳐야 합니다. 전환 전까지는 `ci.yml`의 `이미지 빌드` job이 PR에서 amd64도 검사합니다.

### commit status 기록

`pnpm ci:local --report`는 모든 단계가 통과하고, 시작과 끝에 작업 트리가 깨끗하고, 실행 중 HEAD가 그대로이고, HEAD가 같은 이름의 원격 브랜치 tip일 때만 그 커밋에 commit status(`context` `CI 통과`, `state` `success`)를 `gh api`로 기록합니다. 인증은 `gh`의 현재 인증(`GH_TOKEN` 또는 `gh auth`)을 씁니다. 조건을 못 맞추거나 호출이 실패하면 종료 코드 1입니다. `--report --dry-run`은 같은 판정까지 하고 대상 SHA·`context`·호출 내용만 출력합니다. 옵션 없이 실행하면 기록하지 않습니다.

전제: ruleset `main 보호`의 필수 검사 `CI 통과`는 `integration_id: 15368`(GitHub Actions)로 묶여 있고 `strict` 정책이 켜져 있습니다. 지금은 이 명령이 기록한 status가 필수 검사로 인정되지 않으므로, CI를 옮기는 전환 단계에서 ruleset을 바꿔야 합니다. `strict` 때문에 `main`보다 뒤처진 커밋은 머지할 수 없으니 브랜치를 갱신한 뒤 다시 실행합니다. HEAD가 `origin/main`을 포함하지 않으면 경고합니다. 쓰기 권한자는 검증 없이도 status를 기록할 수 있다는 한계는 ADR 0016에 적었습니다.

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

work item을 `검증` 상태로 올리거나 완료를 보고하기 전에 변경 영역에 맞는 명령을 실제로 실행하고, 실행한 명령과 결과를 work item `진행 기록`에 남깁니다. 실행하지 않은 검증을 통과로 적지 않습니다.

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
