# crelink 웹

Next.js App Router와 TypeScript 기반 크리링(CreLink) 웹 클라이언트입니다. 서버 컴포넌트는 서버 전용 `API_INTERNAL_URL`로 Nest API를 직접 읽고(`src/lib/api/server.ts`, 로그인 화면은 요청의 `cl_session` 쿠키를 함께 보냄), 브라우저 요청은 same-origin BFF(`/api/backend`)를 거쳐 Nest API로 전달합니다. 웹이 API로 보내는 서버 측 요청(서버 컴포넌트·BFF·구글 로그인 route handler)은 모두 `apiRequestHeaders()`(`src/lib/api/server.ts`)로 헤더를 만들어, 서버 전용 `API_INTERNAL_TOKEN`이 있을 때만 `X-Crelink-Internal` 내부 토큰 헤더를 붙입니다(운영 API 호스트의 Caddy가 `/api/*` 전달 여부를 이 헤더로 판단, [운영 배포 설계](../../docs/specs/crelink-prod-deploy.md)). 화면·API 계약의 기준은 [크리링 MVP 기술 설계](../../docs/specs/crelink-mvp.md)와 [`packages/shared/src/crelink.ts`](../../packages/shared/src/crelink.ts)입니다.

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 소개, 로그인 전 `구글로 시작하기`, 로그인 후 `/me`·랜딩 관리 화면(운영자는 `/admin`) 링크 |
| `/auth/google`, `/auth/google/callback` | 구글 로그인 route handler. API의 `cl_oauth_state`·`cl_session` `Set-Cookie`를 그대로 붙여 302 |
| `/me` | 크리에이터 편집(단축 URL 복사·주소 변경, 프로필, SNS, 포트폴리오)과 외부 링크 요약·관리 화면 진입점. 401이면 `/` |
| `/me/landings/[publicId]` | 랜딩 관리 화면(PRD R18). 기본 편집 모드: 랜딩과 같은 배치에서 외부 링크 추가·수정·삭제(하단 시트), 끌어서 순서 변경(마우스·터치·키보드), 숨기기 스위치, 한도·차단 표시. `?mode=view` 보기 모드: 공개 랜딩과 같은 `Landing`으로 방문자 화면(숨긴·차단 링크 제외, 링크는 클릭 기록 없이 저장된 URL로). 내 랜딩이 아니면 찾을 수 없음 안내, 401이면 `/` |
| `/p/[publicId]` | 공개 랜딩(SSR, `src/components/landing/Landing.tsx`). 404·410 안내 |
| `/notice?reason=` | 단축 주소·로그인 오류 안내 |
| `/privacy` | 개인정보 수집·보관·쿠키 고지(법률 검토 전 문구) |
| `/admin`, `/admin/creators/[userId]`, `/admin/blocked-domains` | 운영자 화면. 401이면 `/`, 403이면 권한 없음 안내 |

SNS 채널 아이콘 자산의 출처·상표 사용 규칙은 [SNS 채널 아이콘](docs/sns-icons.md)에 있습니다.

## BFF(`src/app/api/backend/[...path]/route.ts`)

- 허용 목록(메서드·경로)에 있는 요청만 전달하고 나머지는 404 `route_not_allowed`입니다. 로그인 시작·콜백은 BFF가 아니라 위 route handler가 부릅니다.
- 요청 쿠키 중 `cl_session`만 API로 넘기고, API 응답의 `Set-Cookie`·`Content-Type`·`Cache-Control`·`ETag`·`Last-Modified`와 본문(이미지 바이너리 포함)을 그대로 돌려줍니다. 204는 본문 없이 돌려줍니다.
- `POST api/me/files`만 multipart 본문과 `Content-Type`(boundary 포함)을 그대로 넘기고, 그 밖의 본문은 JSON으로 넘깁니다.
- POST·PUT·PATCH·DELETE는 `Origin` 헤더의 호스트가 요청 호스트와 같아야 하며, 없거나 다르면 403 `forbidden`입니다.

## 실행

저장소 루트에서 `pnpm dev:web` 또는 `pnpm --filter @crelink/web start`로 개발 서버를 `http://localhost:<웹 포트>`에서 실행하고, `pnpm --filter @crelink/web build`로 프로덕션 빌드를 생성합니다. `<웹 포트>`는 `WEB_PORT` 환경변수, 없으면 이 checkout 인스턴스의 웹 포트(`pnpm instance --get WEB_PORT`)이고, API는 `http://127.0.0.1:<API 포트>`를 사용합니다. 실제 포트는 `pnpm instance`로 확인합니다.

`make up`(또는 `pnpm instance`)이 `apps/web/.env.local`이 없으면 `.env.example`에서 만들고 `API_INTERNAL_URL`을 이 checkout 인스턴스의 API 주소(`pnpm instance --get API_INTERNAL_URL`)로 채웁니다. `make web-up`으로 띄우면 인스턴스 값이 파일 값보다 우선합니다([로컬 개발 환경](../../docs/development/local-environment.md#인스턴스와-포트)). `.env.local`에는 실제 비밀값을 저장하지 말고 서버 비밀값도 `NEXT_PUBLIC_*`로 설정하지 않습니다.

## Vercel 배포

운영 웹은 Vercel(`https://links.shaul.kr`)이고, 배포는 Vercel Git 연동이 아니라 GitHub Actions가 저장소 루트에서 `vercel pull`·`vercel build --prod`·`vercel deploy --prebuilt --prod`로 합니다([ADR 0010](../../docs/adr/0010-prod-deployment-topology.md), `.github/workflows/deploy.yml`). 빌드 설정의 원본은 [`vercel.json`](vercel.json)이고, 프로젝트 설정은 대시보드에서 아래 값으로 둡니다.

| 설정 | 값 | 근거 |
| --- | --- | --- |
| Framework Preset | Next.js (`vercel.json`의 `framework: "nextjs"`) | [vercel.json `framework`](https://vercel.com/docs/project-configuration/vercel-json#framework) |
| Root Directory | `apps/web`. CLI도 이 설정을 따르므로 `vercel`은 저장소 루트에서 실행합니다 | [Root Directory](https://vercel.com/docs/builds/configure-a-build#root-directory), [Monorepos: CLI](https://vercel.com/docs/monorepos#add-a-monorepo-through-vercel-cli) |
| Include files outside of the Root Directory in the Build Step | 켬(2020-08-27 이후 프로젝트 기본값). 꺼져 있으면 `packages/*`·루트 lockfile을 읽지 못해 빌드가 실패합니다 | [Monorepos FAQ](https://vercel.com/docs/monorepos/monorepo-faq#can-i-share-source-files-between-projects-are-shared-packages-supported) |
| Install Command | `pnpm install --frozen-lockfile`(`vercel.json`). 워크스페이스 안에서 `pnpm install`은 모든 프로젝트를 설치하므로 `apps/web`에서 실행해도 루트 lockfile 기준으로 설치됩니다 | [vercel.json `installCommand`](https://vercel.com/docs/project-configuration/vercel-json#installcommand), [pnpm install](https://pnpm.io/10.x/cli/install) |
| Build Command | `pnpm --filter @crelink/design-tokens check && pnpm --filter @crelink/shared build && pnpm --filter @crelink/web build`(`vercel.json`, 루트 `pnpm build`와 같은 선행 순서). 디자인 토큰은 생성물이 Git에 있어 `check`로 원본과 일치하는지만 확인하고, `@crelink/shared`는 `dist/`를 만듭니다 | [vercel.json `buildCommand`](https://vercel.com/docs/project-configuration/vercel-json#buildcommand) |
| Output Directory | 기본값(Next.js `.next`). `NEXT_DIST_DIR`은 설정하지 않습니다 | [Output Directory](https://vercel.com/docs/builds/configure-a-build#output-directory) |
| Node.js Version | 22.x. `package.json`의 `engines.node`(`22.x`)가 프로젝트 설정보다 우선하며 루트 `.nvmrc`와 같은 메이저로 맞춥니다 | [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions#version-overrides-in-package.json) |
| 패키지 관리자 | pnpm. 루트 `pnpm-lock.yaml`(`lockfileVersion: 9.0`)로 감지합니다. CD는 GitHub Actions 러너의 pnpm(루트 `packageManager`)으로 `vercel build`를 실행합니다. Vercel 원격 빌드를 쓰게 되면 환경변수 `ENABLE_EXPERIMENTAL_COREPACK=1`로 `packageManager` 버전을 고정합니다 | [Package managers](https://vercel.com/docs/package-managers), [Corepack](https://vercel.com/docs/builds/configure-a-build#corepack) |
| Git 연동 자동 배포 | 쓰지 않음(CI 통과 뒤 CLI로만 배포) | [ADR 0010](../../docs/adr/0010-prod-deployment-topology.md) |
| Function Region | 기본 `iad1`. 서버 측 API 호출이 OCI 서버까지 왕복하므로 OCI 서버와 가까운 리전으로 바꾸는 것을 0029에서 정합니다 | [vercel.json `regions`](https://vercel.com/docs/project-configuration/vercel-json#regions) |

환경변수(Vercel 프로젝트, Production만 설정):

| 키 | 값 | 비고 |
| --- | --- | --- |
| `API_INTERNAL_URL` | `https://go.shaul.kr`(임시 API 호스트) | 서버 전용. 코드에 호스트를 두지 않습니다 |
| `API_INTERNAL_TOKEN` | 서버 `/opt/edge/.env`의 `CRELINK_INTERNAL_TOKEN`과 같은 값(edge Caddy가 검사) | 서버 전용 비밀값(Sensitive). `NEXT_PUBLIC_`를 붙이지 않습니다. 바꿀 때는 서버와 Vercel을 함께 바꾸고 웹을 다시 배포합니다 |

- Preview·Development 환경에는 두 값을 넣지 않습니다. 미리보기 배포가 운영 API에 붙지 않고 `api_not_configured`로 남습니다.
- 토큰은 서버 코드에서 실행 시점에 읽고(`process.env`, 빌드 인라인 없음) 로그·오류 메시지·응답에 쓰지 않습니다. 임의 토큰으로 빌드한 `.next` 전체에서 토큰 문자열이 나오지 않는 것을 확인했습니다(`docs/work/web/0026-web-internal-token-vercel.md`).
- 업로드(`POST /api/backend/api/me/files`)와 이미지 조회(`/api/backend/api/files/{id}`)가 BFF(Vercel Function, 요청·응답 본문 4.5MB 한도)를 지나므로 이미지 한도(`CRELINK_LIMITS.imageMaxBytes`)를 4MB로 둡니다. 화면 문구는 이 상수에서 계산합니다([Functions limitations](https://vercel.com/docs/functions/limitations#request-body-size)).
