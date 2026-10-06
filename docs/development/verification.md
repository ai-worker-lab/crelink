# 검증 루프

에이전트와 CI는 같은 명령으로 변경을 검증합니다. 정적 검사·빌드·테스트는 `pnpm verify`, 실행 중인 API·웹 확인은 `pnpm smoke`입니다. 각 명령의 실제 단계는 스크립트가 기준이며 이 문서는 사용법과 완료 전 확인 범위를 설명합니다.

## `pnpm verify`

[`scripts/verify.mjs`](../../scripts/verify.mjs)가 루트 `package.json`의 script를 `pnpm run <단계>`로 순서대로 실행합니다. 각 단계의 출력은 그대로 보이고, 끝에 단계별 결과(`통과`·`실패`·`건너뜀`)와 소요 시간, 실패 단계의 해결 안내를 요약합니다. 실패가 하나라도 있으면 종료 코드 1로 끝납니다.

| 명령 | 단계 |
| --- | --- |
| `pnpm verify` | `tokens:check → work:check → docs:check → design:check → lint → typecheck → build → test` |
| `pnpm verify --fast` | `tokens:check → work:check → docs:check → design:check → lint → typecheck` |

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

실패한 테스트의 trace는 `.local/smoke/test-results/`에 남습니다. `pnpm exec playwright show-trace <trace.zip>`으로 엽니다.

## `pnpm e2e`

기능 시나리오 E2E는 `pnpm smoke`와 분리해 [`tests/e2e/`](../../tests/e2e/README.md)에 둡니다. [`scripts/e2e.mjs`](../../scripts/e2e.mjs)가 실행 중인 인스턴스(`make up`)의 웹·API·DB에 Playwright로 크리링 MVP 시나리오([MVP 기술 설계 검증 계획](../specs/crelink-mvp.md#검증-계획))를 실행합니다. 로그인 상태는 DB fixture가 세션 행을 넣어 만들고, 테스트 데이터는 끝에 지웁니다.

웹 개발 서버(`make up`의 `next dev`)는 `apps/web/.next-dev/`, 빌드(`pnpm verify`의 `next build`)는 `apps/web/.next/`에 출력하므로 개발 서버를 띄운 채 `pnpm verify` → `pnpm smoke`·`pnpm e2e` 순서로 실행해도 됩니다(`apps/web/next.config.ts`의 `distDir`). `apps/web/next-env.d.ts`는 Next.js가 출력 디렉터리에 맞춰 다시 쓰는 생성 파일이라 Git에서 제외하고, 웹 `typecheck`가 `next typegen`으로 만듭니다.

## CI

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)이 `main` 대상 PR과 `main` push에서 실행합니다.

| job | 내용 |
| --- | --- |
| `check` | 지원 Node.js LTS(`matrix.node`: 22·24·26)마다 `pnpm install --frozen-lockfile` 후 `pnpm verify --keep-going`. PostgreSQL 17 서비스 컨테이너에 `TEST_DATABASE_URL`로 연결합니다. 한 버전이 실패해도 나머지 버전 결과를 끝까지 봅니다. |
| `smoke` | `.nvmrc` Node로 `node scripts/instance.mjs --print-env`의 슬롯 0 포트·주소(`API_PORT`·`WEB_PORT`·`API_URL`·`WEB_URL`, 원본 `infra/local/.env.example`)를 job 환경에 넣고, 공용 패키지·API·웹을 빌드해 PostgreSQL 서비스에 연결한 API(`node apps/api/dist/main.js`, `PORT=$API_PORT`)와 웹(`next start --port $WEB_PORT`)을 백그라운드로 띄운 뒤 준비를 기다려 `pnpm smoke`를 실행합니다. 실패하면 API·웹 로그를 출력합니다. |
| `이미지 빌드 api`·`이미지 빌드 web` | 운영 이미지(`apps/api/Dockerfile`, `apps/web/Dockerfile`)가 `linux/amd64`로 빌드되는지 확인합니다(buildx, gha 캐시). 푸시하지 않습니다. 배포 대상 플랫폼 빌드는 `deploy.yml`이 합니다. |
| `work scope` | `work/NNNN-*` 브랜치의 PR에서만 전체 이력을 받아 `pnpm work:scope --base origin/<기준 브랜치>`로 변경 파일이 티켓 역할의 소유 경로 안에 있는지 검사합니다. |

지원 Node.js 버전을 바꾸면 workflow의 `matrix.node`와 README 요구사항을 함께 고칩니다.

## CD(운영 배포)

[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)이 `main` push의 `CI`가 성공하면 운영에 배포합니다(main에서 수동 실행, `force`로 두 이미지 새로 빌드). 설계(각 job의 조건·흐름)는 [운영 배포·CD 기술 설계](../specs/crelink-prod-deploy.md#워크플로), 접속 설정·장애 대응은 [prod 런북](../../infra/docs/prod-runbook.md)입니다.

| job | 내용 |
| --- | --- |
| `plan` | 배포 커밋, 변경 영역(`api`·`web`·`release`, 태그 `deploy/prod-api`·`deploy/prod-web`·`deploy/prod` 기준), `infra/prod/targets.json`의 사용 대상·플랫폼, 접속 설정(`vars.TS_OIDC_*`·`DEPLOY_SSH_KEY`) 여부. 접속 설정이 없으면 이미지까지만 만들고 배포를 건너뛰며 경고를 남깁니다. |
| `이미지 api`·`이미지 web` | 바뀐 영역만 `ghcr.io/ai-worker-lab/crelink-<api\|web>:<SHA>`로 푸시(대상 플랫폼 합집합) |
| `배포 <대상>` | 대상마다 차례로 Tailscale(OIDC, `tag:ci`) → `ssh deploy@<host> deploy …`로 `infra/prod` 묶음을 보내 서버 `deploy.sh` 실행(비활성 색에 올려 헬스를 통과하면 edge Caddy reload로 전환하는 Blue/Green 무중단 배포). 새 색이 헬스에 실패하면 서버가 그 색만 내려 활성 색·트래픽은 그대로이고 job이 실패합니다. 이어서 `운영 주소 검사` 단계가 `ssh deploy@<host> verify`(서버의 `verify.sh`가 Cloudflare를 거쳐 웹 `/`·`/privacy`·BFF health 200, `https://go.shaul.kr/<없는 주소>` 302 → notice, `https://go.shaul.kr/api/health` 404 확인)를 실행하고, 실패하면 `자동 롤백` 단계가 직전 릴리스로 되돌린 뒤(같은 무중단 전환) job을 실패로 끝냅니다. |
| `배포 기록 태그` | 성공하면 `deploy/prod`와 바뀐 영역의 `deploy/prod-api`·`deploy/prod-web`를 옮깁니다. |

수동 롤백은 [`.github/workflows/rollback.yml`](../../.github/workflows/rollback.yml)(입력 `target`·`release`)입니다. 의존성 갱신 PR은 [`.github/dependabot.yml`](../../.github/dependabot.yml)이 주 1회 엽니다. 워크플로 문법은 `actionlint`로 검사합니다(로컬 설치 시 `actionlint .github/workflows/*.yml`).

## 완료 보고 전 확인 범위

work item을 `검증` 상태로 올리거나 완료를 보고하기 전에 변경 영역에 맞는 명령을 실제로 실행하고, 실행한 명령과 결과를 work item `진행 기록`에 남깁니다. 실행하지 않은 검증을 통과로 적지 않습니다.

| 변경 영역 | 실행 |
| --- | --- |
| 문서·work item만 | `pnpm verify --fast` |
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
- CI: 실패한 job의 단계 로그를 봅니다. `check`는 `pnpm verify` 요약을, `smoke`는 `pnpm smoke` 출력과 `API·웹 로그` 단계를 확인합니다.
