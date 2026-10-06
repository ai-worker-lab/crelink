# 외부 서비스·도구 의존

crelink이 의존하는 외부 SaaS와 개발 도구를 한곳에서 찾기 위한 색인입니다. 버전·설정 값은 여기 복사하지 않고 각 항목의 기준 위치가 원본입니다. 의존을 추가·제거·교체하면 같은 변경에서 이 표와 기준 위치를 함께 갱신합니다.

상태는 `사용 중`(현재 저장소 동작에 필요), `선택`(특정 작업 방식에서만 사용), `계획`(문서에 목표로만 있고 저장소에 구성되지 않음)으로 구분합니다.

## 개발·빌드

| 대상 | 종류 | 상태 | 용도 | 기준 위치 |
| --- | --- | --- | --- | --- |
| GitHub (`ai-worker-lab/crelink`) | SaaS | 사용 중 | 원격 Git 저장소, Pull Request. Issues는 끔. Release는 선택 | [ADR 0002](../adr/0002-work-items-in-repository.md), `.github/pull_request_template.md` |
| GitHub Actions | SaaS | 사용 중 | PR·`main` push 검사(Node 22·24·26 matrix, PostgreSQL 서비스 컨테이너, API·웹 이미지 빌드), `main` CI 성공 시 운영 배포·수동 롤백 | `.github/workflows/ci.yml`, `deploy.yml`, `rollback.yml` |
| GitHub Container Registry(GHCR) | SaaS | 사용 중(패키지는 Deploy 첫 실행 때 생성) | 운영 이미지 `ghcr.io/ai-worker-lab/crelink-api:<SHA>`·`crelink-web:<SHA>` | `.github/workflows/deploy.yml`, [prod 런북](../../infra/docs/prod-runbook.md) |
| Dependabot | SaaS | 사용 중 | npm·Actions·Docker(`apps/api`·`apps/web` Dockerfile)·Docker Compose(`infra/prod`) 의존성 갱신 PR(주 1회) | `.github/dependabot.yml` |
| npm registry | SaaS | 사용 중 | `pnpm install`의 패키지 다운로드 | `pnpm-lock.yaml`, 각 `package.json` |
| Node.js · pnpm(corepack) | 도구 | 사용 중 | 런타임과 workspace 관리. 지원 버전은 CI matrix, 로컬 기본값은 `.nvmrc` | `.github/workflows/ci.yml`, `.nvmrc`, 루트 `package.json`의 `packageManager` |
| Docker Engine/Compose · Docker Hub 이미지 | 도구·SaaS | 사용 중 | 로컬 PostgreSQL(`postgres:17-alpine`)·Valkey(`valkey/valkey:8-alpine`), 운영 이미지 베이스(`node:22-slim`)와 운영 스택(`caddy`, `alpine`) | `infra/local/compose.yaml`, `apps/*/Dockerfile`, `infra/prod/compose.yaml` |
| PM2 | 도구 | 사용 중 | 로컬 API·웹·Expo 개발 서버 실행 | `ecosystem.config.cjs`, `Makefile` |
| Next.js 텔레메트리 | SaaS | 사용 중(기본값, 운영 이미지 빌드는 끔) | 로컬·CI `next build`가 익명 사용 통계를 Next.js 운영사(Vercel)에 전송. 빌드 출력에서 확인. 웹 이미지는 `NEXT_TELEMETRY_DISABLED=1` | `apps/web`, `apps/web/Dockerfile` |

## 모바일 개발·검증

| 대상 | 종류 | 상태 | 용도 | 기준 위치 |
| --- | --- | --- | --- | --- |
| Expo CLI · Expo Go | 도구 | 사용 중 | 개발 서버와 기기·시뮬레이터 실행 | `apps/app/package.json`, [기기 검증](../../apps/app/docs/device-testing.md) |
| Xcode · Android SDK/에뮬레이터 | 도구 | 선택 | iOS 시뮬레이터·Android 에뮬레이터 검증 | [기기 검증](../../apps/app/docs/device-testing.md) |
| Orca · serve-sim | 도구 | 선택 | 에뮬레이터·시뮬레이터 자동 조작 | [기기 검증](../../apps/app/docs/device-testing.md) |
| EAS · Apple Developer/App Store Connect · Google Play Console | SaaS | 계획 | 앱 빌드·서명·스토어 제출. 식별자·계정 미설정 | [런타임 설정](../../apps/app/docs/runtime-configuration.md) |

## 배포·운영

| 대상 | 종류 | 상태 | 용도 | 기준 위치 |
| --- | --- | --- | --- | --- |
| 운영 서버(`home-server`, 자체 서버) | 서버 | 사용 중(1차 배포 대상) | 웹·API Compose 스택 실행. 대상 목록은 `targets.json`, 나중에 OCI·AWS 추가 가능 | `infra/prod/targets.json`, [prod 런북](../../infra/docs/prod-runbook.md) |
| Cloudflare(DNS·Tunnel) | SaaS | 사용 중 | `shaul.kr` DNS, TLS 종료, 원격 관리형 Tunnel로 `go`·`links` 공개(서버 인바운드 없음) | [운영 배포 설계](../specs/crelink-prod-deploy.md), [prod 런북](../../infra/docs/prod-runbook.md#3-cloudflare-tunnel-공개-호스트) |
| Tailscale | SaaS | 사용 중(CI 접속은 관리 화면 설정 후) | 운영자 관리 접속, CI 배포 접속(workload identity federation, `tag:ci`). Personal 무료 플랜은 비상업 조건 | [prod 런북](../../infra/docs/prod-runbook.md#2-ci-접속-설정-tailscalegithub) |
| Supabase | SaaS | 사용 중 | 관리형 PostgreSQL(세션 풀러, TLS `verify-full`) | [운영 배포 설계](../specs/crelink-prod-deploy.md), [prod 런북](../../infra/docs/prod-runbook.md#12-supabase-주의사항) |
| SOPS · age | 도구 | 사용 중 | 운영 비밀값 암호문(`infra/prod/secrets/`)과 서버 복호화 | `.sops.yaml`, `infra/prod/bootstrap.sh` |
| Caddy(공식 Docker 이미지) | 도구 | 사용 중 | 운영 스택의 공개 경로 정책(http, TLS는 Cloudflare) | `infra/prod/Caddyfile` |

운영 비밀값은 대상별 SOPS 암호문으로만 저장소에 있고 평문·계정 자격 증명은 없습니다. 로컬 Valkey는 표준 구성으로 유지하지만 API는 아직 사용하지 않으며, 운영 캐시 제품과 위치는 미정입니다([ADR 0005](../adr/0005-keep-valkey-local-infra.md)).

## 제품 기능

| 대상 | 종류 | 상태 | 용도 | 기준 위치 |
| --- | --- | --- | --- | --- |
| Google OAuth 2.0 / OpenID Connect | SaaS | 사용 중(키는 사용자가 발급, 없으면 로그인 503) | 크리에이터·운영자 구글 로그인(R15). `google-auth-library`로 code 교환·ID 토큰 검증 | [MVP 기술 설계](../specs/crelink-mvp.md), [API 문서](../../apps/api/docs/README.md#환경변수), [로컬 개발 환경](../development/local-environment.md#크리링-로컬-설정) |
| DB-IP IP to City Lite (MMDB) | 데이터(CC BY 4.0) | 선택 | 방문·클릭 IP의 국가·도시(R9). 결과를 쓰는 웹 `/privacy`에 출처 링크 필요. 파일이 없으면 위치는 비움 | `scripts/geoip.mjs`, [로컬 개발 환경](../development/local-environment.md#크리링-로컬-설정) |
| 링크된 외부 사이트의 `favicon.ico` | 외부 사이트 | 사용 중 | 랜딩·편집 화면의 사이트 아이콘(R5). 방문자 브라우저가 직접 요청 | [MVP 기술 설계](../specs/crelink-mvp.md#화면-상태와-api-대응) |
| 각 SNS 공식 브랜드 자료(Meta·YouTube·TikTok·NAVER·X) | 상표·브랜드 자산 | 사용 중 | SNS 채널 아이콘(R12). 공식 원본 파일을 `apps/web/public/icons/sns/`에 두고 변형 없이 표시. 틱톡은 사전 서면 허가 확인이 필요하고 네이버 블로그는 전용 배포 키트가 없음 | [SNS 채널 아이콘](../../apps/web/docs/sns-icons.md) |

## AI 작업 도구

| 대상 | 종류 | 상태 | 용도 | 기준 위치 |
| --- | --- | --- | --- | --- |
| OMP | 도구 | 선택 | agent 위임과 격리 작업 | `.omp/`, [영역별 병렬 개발](../development/parallel-work.md) |
| jev_route · TypeSafe Jev API | 도구·SaaS | 선택 | OMP 요청 분류·라우팅. 요청 문장을 TypeSafe API로 전송 | `.jev.config.json`, [영역별 병렬 개발](../development/parallel-work.md) |
| OpenDesign 데스크톱 앱(OpenDesign Cloud 또는 Local Codex 실행) | 도구·SaaS | 선택 | `designer`의 산출물 생성·검토. MCP `mcp__open_design_*`, `pnpm od`·`pnpm design:sync`·`pnpm design:check`(실행 중일 때 `od lint`)로 연결. 없어도 `design:check`의 나머지 검사는 동작 | [OpenDesign 사용 기준](../../design/docs/opendesign.md), `.omp/agents/designer.md`, `.omp/skills/opendesign/SKILL.md`, `.jev.config.json` |

이 도구들이 없어도 저장소의 빌드·실행·검증은 동작해야 합니다. 문서·코드의 원본은 저장소에 두고 도구 내부 상태에 의존하지 않습니다.

## 폰트

| 대상 | 종류 | 상태 | 용도 | 기준 위치 |
| --- | --- | --- | --- | --- |
| Pretendard | 폰트 파일 | 사용 중 | 웹 제목용 굵은 글꼴(`apps/web/public/Pretendard-ExtraBold.woff2`), 토큰 글꼴 목록 | `apps/web/src/styles.css`, `packages/design-tokens/src/tokens.json` |

Pretendard는 SIL Open Font License 1.1로 배포되며, 글꼴 파일을 재배포할 때 저작권 고지와 라이선스를 함께 포함해야 합니다. 저작권 고지와 라이선스 전문은 글꼴과 함께 공개되도록 [`apps/web/public/Pretendard-OFL.txt`](../../apps/web/public/Pretendard-OFL.txt)에 둡니다. 출처는 [orioncactus/pretendard](https://github.com/orioncactus/pretendard)이며, 포함된 `Pretendard-ExtraBold.woff2`는 글꼴 메타데이터 기준 버전 1.309(릴리스 v1.3.9), SHA-256 `dd7c1e156f508eb962acc7a33a7a1896d1e0b71e11156fad96e731689ceb6dc3`입니다. 라이선스 전문은 2026-10-01에 해당 저장소의 `LICENSE`에서 가져왔습니다. 글꼴 파일을 바꾸면 이 기록과 라이선스 파일을 함께 갱신합니다.
