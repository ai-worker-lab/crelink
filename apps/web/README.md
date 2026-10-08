# crelink 웹

Next.js App Router와 TypeScript 기반 크리링(CreLink) 웹 클라이언트입니다. 서버 컴포넌트는 서버 전용 `API_INTERNAL_URL`로 Nest API를 직접 읽고(`src/lib/api/server.ts`, 로그인 화면은 요청의 `cl_session` 쿠키를 함께 보냄), 브라우저 요청은 same-origin BFF(`/api/backend`)를 거쳐 Nest API로 전달합니다. 웹이 API로 보내는 서버 측 요청(서버 컴포넌트·BFF·구글 로그인 route handler)은 모두 `apiRequestHeaders()`(`src/lib/api/server.ts`)로 헤더를 만들고, 서버 전용 `API_INTERNAL_TOKEN`이 있을 때만 `X-Crelink-Internal` 헤더를 붙입니다. 운영은 내부 네트워크로 API를 부르므로 이 값을 두지 않습니다([운영 컨테이너 이미지](#운영-컨테이너-이미지)). 화면·API 계약의 기준은 [크리링 MVP 기술 설계](../../docs/specs/crelink-mvp.md)와 [`packages/shared/src/crelink.ts`](../../packages/shared/src/crelink.ts)입니다.

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 소개, 로그인 전 `구글로 시작하기`, 로그인 후 `내 크리링 편집`(`/me`, 운영자는 `/admin`도) 링크 |
| `/auth/google`, `/auth/google/callback` | 구글 로그인 route handler. API의 `cl_oauth_state`·`cl_session` `Set-Cookie`를 그대로 붙여 302. 시작의 `?returnTo=`가 `LOGIN_RETURN_TO_PATTERN`(`/p/{publicId}`와 선택 `#guestbook`)에 맞으면 `cl_return_to` 쿠키(HttpOnly·SameSite=Lax·10분, Secure는 API 쿠키를 따름)를 붙이고, 없거나 형식 밖이면 남은 쿠키를 지움. 콜백은 성공 시 쿠키 값이 맞으면 쿠키를 그대로 두고 `/auth/return`으로, 아니면 쿠키를 지우고 `/me`로 보냄. 실패하면 쿠키를 지우고 `/notice` |
| `/auth/return`, `/auth/return/go` | 로그인 뒤 랜딩 복귀(PRD R19). 돌아갈 주소는 쿼리 없이 `cl_return_to` 쿠키로만 넘김. `/auth/return`(화면)이 `location.replace('/auth/return/go')`로 새 이동을 시작하고, `/auth/return/go`(route handler)가 쿠키를 지우며 허용 형식이면 그 랜딩으로, 아니면 `/me`로 302. 콜백 302 체인은 구글에서 시작해 `Sec-Fetch-Site: cross-site`라 랜딩으로 바로 보내면 단축 주소를 다시 거치므로(방문 중복 기록) 같은 출처 이동을 새로 시작함. 쿠키가 없으면 `/me`라 이 주소를 외부에 공유해도 단축 주소(R7)를 우회하지 못함 |
| `/me` | 로그인 뒤 도착지. 내 랜딩(MVP는 1개)의 관리 화면 `페이지 편집`으로 307. 401(로그아웃·정지로 끊긴 세션)이면 `/`, 그 밖의 API 오류는 다시 시도 안내. Suspense 경계(`loading.tsx`)를 두지 않아 이동이 HTTP 307로 나감 |
| `/me/landings/[publicId]`, `…/guestbook`, `…/settings` | 랜딩 관리 화면(PRD R18·R19, 디자인 `design/desktop-landing-manager/`). 레이아웃(`[publicId]/layout.tsx`)이 편집 상태·`GET /api/me`를 읽어 머리글(운영자 화면·공개 페이지 열기(새 창)·로그아웃)과 관리 화면 틀(`src/components/manage/ManagerShell.tsx`: `관리 메뉴` · 머리 카드 · 관리 패널 · 미리보기)을 그리고, 편집 상태와 저장하지 않은 입력(초안)은 `ManagerProvider`가 들고 있어 메뉴를 옮겨도 남음. 메뉴는 `src/components/manage/menu.tsx`의 배열 한 곳에서 정의(메뉴 이름 = h1·문서 제목): `페이지 편집`(기본 주소, 프로필·SNS 채널·외부 링크·포트폴리오·방명록 켜기 카드), `방명록`(켜기 스위치, 크리에이터 세션의 글 목록·숨기기·숨김 해제·더 보기, 꺼져 있으면 목록 대신 안내), `주소 설정`(내 크리링 링크 복사, 주소 바꾸기, 계정 이메일). 저장 방식은 프로필·SNS·링크·포트폴리오 폼은 버튼, 숨기기·순서·방명록 켜기는 즉시 저장(실패하면 되돌림). 링크·포트폴리오 추가·수정은 1024px 이상 패널 안 펼침 폼, 1023px 이하 하단 시트(`EditSheet`, 같은 폼). 미리보기는 공개 랜딩과 같은 `Landing`에 `toLandingPreview(저장 상태, 초안)`(숨긴·차단 링크 제외)을 그리고 초안이 있으면 `저장하지 않은 변경 포함` 칩, 안의 링크는 눌러도 이동하지 않으며 탭은 주소 해시를 바꾸지 않는 제어형(방명록 메뉴에서는 방명록 탭, 방문자 시점이라 비밀·숨긴 글 제외와 비회원 안내). 배치는 1200px 이상 세 열(sticky 미리보기), 1024~1199px 위쪽 가로 탭 + 두 열, 1023px 이하 한 열 + 떠 있는 `미리보기` 버튼(전체 화면 대화상자). 옛 보기 모드 주소 `?mode=view`는 `페이지 편집`으로 이동. 내 랜딩이 아니면 찾을 수 없음 안내, 401이면 `/` |
| `/p/[publicId]` | 공개 랜딩(SSR, `src/components/landing/Landing.tsx`). 404·410 안내. 외부 진입은 단축 주소를 거침(PRD R7): `Sec-Fetch-Site: same-origin`(서비스 화면에서 연 경우)이거나 API가 단축 주소 302의 통과 표시 `?pass=`를 받아들이면(`passAccepted`) 그리고 주소창의 `pass`를 지우며(`PassCleanup`, 해시는 유지), 그 밖은 API가 준 `shortUrl`로 307. 이 리디렉트가 HTTP 307이 되도록 불러오는 중 화면(`loading.tsx`)은 루트가 아니라 `/me/landings`(관리 화면 뼈대)·`/admin`에만 둠. 방명록을 켠 랜딩은 프로필·SNS 아래 `링크`·`방명록` 탭(`LandingTabs`, 해시 `#guestbook`, SSR은 `링크` 탭)과 방명록 패널(`GuestbookPanel`, 브라우저가 BFF로 목록·작성·삭제·숨김) |
| `/notice?reason=` | 단축 주소·로그인 오류 안내 |
| `/privacy` | 개인정보 수집·보관·쿠키 고지(법률 검토 전 문구) |
| `/docs`, `/docs/guide`, `/docs/releases`, `/docs/brand` | 공개 문서(목록 `src/lib/docs.ts`): 크리에이터 사용 안내, 릴리스 노트(빌드 때 루트 `RELEASES.md`의 첫 `## `부터 끝까지, 없으면 빈 상태), 브랜드와 디자인(`@crelink/design-tokens` 값으로 만든 색·글꼴·간격·모서리 견본), `/privacy` 링크. 모두 정적 화면 |
| `/admin`, `/admin/creators/[userId]`, `/admin/blocked-domains` | 운영자 화면. 401이면 `/`, 403이면 권한 없음 안내 |

SNS 채널 아이콘 자산의 출처·상표 사용 규칙은 [SNS 채널 아이콘](docs/sns-icons.md)에 있습니다.

## BFF(`src/app/api/backend/[...path]/route.ts`)

- 허용 목록(메서드·경로)에 있는 요청만 전달하고 나머지는 404 `route_not_allowed`입니다. 로그인 시작·콜백은 BFF가 아니라 위 route handler가 부릅니다.
- 요청 쿠키 중 `cl_session`만 API로 넘기고, API 응답의 `Set-Cookie`·`Content-Type`·`Cache-Control`·`ETag`·`Last-Modified`와 본문(이미지 바이너리 포함)을 그대로 돌려줍니다. 204는 본문 없이 돌려줍니다.
- `POST api/me/files`만 multipart 본문과 `Content-Type`(boundary 포함)을 그대로 넘기고, 그 밖의 본문은 JSON으로 넘깁니다.
- POST·PUT·PATCH·DELETE는 `Origin` 헤더의 호스트가 요청 호스트와 같아야 하며, 없거나 다르면 403 `forbidden`입니다.

## 실행

저장소 루트에서 `pnpm dev:web` 또는 `pnpm --filter @crelink/web start`로 개발 서버를 `http://localhost:<웹 포트>`에서 실행하고, `pnpm --filter @crelink/web build`로 프로덕션 빌드를 생성합니다. `<웹 포트>`는 `WEB_PORT` 환경변수, 없으면 이 checkout 인스턴스의 웹 포트(`pnpm instance --get WEB_PORT`)이고, API는 `http://127.0.0.1:<API 포트>`를 사용합니다. 실제 포트는 `pnpm instance`로 확인합니다.

웹 단위 시험은 화면 없이 확인할 수 있는 순수 함수(`src/lib/*.test.ts`, 지금은 관리 화면 미리보기의 초안 덮어쓰기 `landing-preview.ts`)에만 두고 Node 내장 시험 실행기로 돌립니다: `pnpm --filter @crelink/web test`(루트 `pnpm test`에 포함). 화면 동작은 E2E(`tests/e2e/`)가 맡습니다.

`make up`(또는 `pnpm instance`)이 `apps/web/.env.local`이 없으면 `.env.example`에서 만들고 `API_INTERNAL_URL`을 이 checkout 인스턴스의 API 주소(`pnpm instance --get API_INTERNAL_URL`)로 채웁니다. `make web-up`으로 띄우면 인스턴스 값이 파일 값보다 우선합니다([로컬 개발 환경](../../docs/development/local-environment.md#인스턴스와-포트)). `.env.local`에는 실제 비밀값을 저장하지 말고 서버 비밀값도 `NEXT_PUBLIC_*`로 설정하지 않습니다.

## 운영 컨테이너 이미지

운영 웹은 배포 대상 서버에서 `infra/prod/compose.yaml`의 `web` 서비스로 색(blue·green)별 스택(project `crelink-blue`·`crelink-green`)에 `ghcr.io/ai-worker-lab/crelink-web:<SHA>` 이미지로 실행하고, 배포와 무관하게 떠 있는 edge Caddy(project `crelink-edge`)가 `https://links.shaul.kr`의 요청을 전부 활성 색 웹(`web-<색>:3000`)으로 넘깁니다. 배포·롤백은 비활성 색에 새 웹·API를 올린 뒤 edge를 reload로 전환하고 옛 색을 SIGTERM으로 멈춥니다(아래 종료 동작). 배포 구성은 [운영 배포 설계](../../docs/specs/crelink-prod-deploy.md), 이미지 빌드·배포는 `.github/workflows/deploy.yml`입니다.

```bash
# 저장소 루트에서(빌드 컨텍스트 = 루트, 허용 목록은 루트 .dockerignore)
docker build -f apps/web/Dockerfile -t crelink-web:local .
```

- [`Dockerfile`](Dockerfile): 빌드 단계(`node:24-slim`)에서 루트 `packageManager`의 pnpm으로 `pnpm install --frozen-lockfile --filter @crelink/web...` → `@crelink/shared` 빌드 → 웹 빌드. 디자인 토큰 생성물은 커밋된 것을 쓰고 원본과의 일치 검사는 CI(`pnpm typecheck`)가 맡습니다.
- `next.config.ts`의 `output: 'standalone'`으로 `.next/standalone`(`server.js`와 추적된 의존성)만 런타임 단계(`node:24-slim`)에 옮기고 `.next/static`·`public`을 합칩니다. 실행은 `node` 사용자, `CMD node apps/web/server.js`, `PORT=3000`·`HOSTNAME=0.0.0.0`, `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`.
- `HEALTHCHECK`: 내장 `fetch`로 `/privacy`(API를 부르지 않는 정적 화면)를 확인합니다. Compose는 이 정의를 재사용하고 루트 파일 시스템을 읽기 전용(`/tmp`만 tmpfs)으로 둡니다.
- 이미지는 amd64·arm64 모두 만들 수 있습니다(대상 플랫폼은 `infra/prod/targets.json`). 크기는 약 432MB(2026-10-07, Next 16.4.0, `docker image inspect` 기준). Sentry SDK 추가 뒤 약 443MB(같은 날, arm64).
- 빌드 인자 `NEXT_PUBLIC_SENTRY_DSN`·`SENTRY_RELEASE`·`SENTRY_ORG`·`SENTRY_PROJECT`와 BuildKit secret `sentry_auth_token`은 [오류 모니터링](#오류-모니터링)에 있습니다. DSN이 빌드 시점에 들어가므로 Sentry를 켠 이미지는 배포 대상(Sentry 프로젝트)별입니다.

환경변수(서버 전용, 실행 시점에 읽음. 이미지에 넣지 않음):

| 키 | 운영 값 | 비고 |
| --- | --- | --- |
| `API_INTERNAL_URL` | `http://api-${CRELINK_COLOR}:3000`(`infra/prod/compose.yaml`) | 같은 색 API로 공용 네트워크 `crelink-edge`를 거쳐 바로 감(웹·API는 항상 같은 릴리스 쌍). 공개 Caddy를 거치지 않음 |
| `API_INTERNAL_TOKEN` | 비움 | 내부 네트워크라 필요 없음. 값이 있으면 `X-Crelink-Internal`을 붙이는 기능은 코드에 남아 있음(로그·오류·응답에 쓰지 않고, 빌드 산출물에 들어가지 않음) |

- 업로드(`POST /api/backend/api/me/files`)와 이미지 조회(`/api/backend/api/files/{id}`)는 BFF를 지납니다. 이미지 한도 `CRELINK_LIMITS.imageMaxBytes`는 4MB(MVP 임시값)이고 화면 문구는 이 상수에서 계산합니다. 운영 edge Caddy는 웹 호스트 요청 본문을 6MB로 제한합니다.

### 종료 동작(SIGTERM)

standalone `server.js`는 Next의 `startServer`(`next/dist/server/lib/start-server.js`)를 그대로 쓰고, 이 저장소는 신호 처리를 따로 넣지 않습니다(`NEXT_MANUAL_SIG_HANDLE` 미설정). Next 16.4.0 이미지에서 확인한 동작:

- SIGTERM·SIGINT를 받으면 `server.close()`로 listen 소켓과 쉬는 keep-alive 연결을 닫고(새 연결은 곧바로 `ECONNREFUSED`), 진행 중 요청(SSR·BFF·route handler)이 끝나면 `nextServer.close()` 뒤 신호에 맞춘 종료 코드(SIGTERM 143, SIGINT 130)로 스스로 끝납니다. Next 15는 같은 순서로 끝나되 종료 코드가 0이었습니다. 143은 SIGKILL(137)과 달리 Next가 신호를 받아 정상 정리를 마쳤다는 뜻입니다. Compose `init: true`의 `docker-init`이 PID 1로서 신호를 node에 넘깁니다.
- Next 자체에는 종료 상한이 없습니다. 진행 중 요청이 Docker grace(`docker stop -t`, Compose `stop_grace_period`) 안에 끝나지 않으면 Docker가 SIGKILL로 끝내고(종료 코드 137) 그 요청은 끊깁니다. grace를 정하지 않으면 엔진 기본값을 쓰는데, 로컬 Docker Desktop 29.8.1은 약 3초였습니다(`docker stop`·`docker compose stop` 모두. Docker 문서상 Linux 엔진 기본은 10초). 그래서 grace는 Compose에 명시합니다([0034](../../docs/work/infra/0034-prod-compose-graceful-stop.md)).
- 신호를 받을 때 요청을 처리 중이던 keep-alive 연결은 응답 뒤에도 닫지 않습니다(`Connection: keep-alive`). 같은 연결로 새 요청이 계속 오면 그것도 처리해 grace까지 살아 있을 수 있고, 새 요청이 없으면 keep-alive 제한 시간(Node 기본 5초) 뒤에 끝납니다. 앞단 프록시(Caddy)는 컨테이너를 멈추기 전에 이 컨테이너로 보내기를 멈춰야 합니다([ADR 0011](../../docs/adr/0011-zero-downtime-deploy.md)의 전환 순서).
- 실측(2026-10-07, 로컬 arm64, 운영과 같은 `--init --read-only --tmpfs /tmp`, 실제 로컬 API로 5초 늦게 전달하는 모형): Next 16.4.0 이미지에서 진행 중 BFF(`/api/backend/api/health`) 3건과 SSR(`/p/[publicId]`, `Sec-Fetch-Site: same-origin`) 1건이 모두 200, `docker stop -t 30`·`-t 10`은 마지막 응답 직후 종료 코드 143(SIGKILL 없음). Next 15.5.27 때의 조건별 결과는 [0033 진행 기록](../../docs/work/web/0033-web-standalone-sigterm.md#진행-기록)에 있습니다.

## 오류 모니터링

Sentry(SaaS, 미국 리전)로 서버·브라우저 오류, 요청·화면 이동 10%의 성능 추적, 브라우저 세션(Release Health), 오류 세션 화면 리플레이, 서버·브라우저 콘솔 warn·error 로그(Sentry Logs), 관리 화면의 사용자 의견(User Feedback)을 보냅니다. 결정과 대안·위험은 [ADR 0012](../../docs/adr/0012-error-monitoring-sentry.md)와 수집 범위를 넓힌 [ADR 0014](../../docs/adr/0014-sentry-free-plan-features.md), 운영 설정은 [런북](../../infra/docs/prod-runbook.md), 개인정보 고지는 `/privacy`(`src/app/(public)/privacy/page.tsx`)입니다. SDK는 `@sentry/nextjs` 11.4이고 파일 구성은 공식 안내(App Router·Turbopack)를 따릅니다.

| 파일 | 역할 |
| --- | --- |
| `src/lib/monitoring.ts` | 공통 값: `NEXT_PUBLIC_SENTRY_DSN`(비면 서버·브라우저 모두 초기화하지 않음), 환경(`NODE_ENV`가 `production`이면 `production`, 아니면 `development`), traces 0.1, 로그 수준 `CONSOLE_LOG_LEVELS`(`warn`·`error`), 서버 `dataCollection`, `scrubEvent`·`scrubSpan`·`scrubLog`·`scrubBreadcrumb` |
| `src/instrumentation.ts` | `register`가 런타임별 설정(`src/sentry.server.config.ts`, Edge는 `src/sentry.edge.config.ts`, 지금 Edge 코드는 없음)을 불러오고, `onRequestError = Sentry.captureRequestError`로 Server Component·route handler 오류를 보냄. 서버·Edge 설정은 `consoleLoggingIntegration`, `beforeSendLog: scrubLog`, `beforeBreadcrumb: scrubBreadcrumb`를 둠 |
| `src/instrumentation-client.ts` | 브라우저 초기화. `tracePropagationTargets`는 같은 출처 BFF(`/^\/api\/backend\//`)만, 기본 통합의 브라우저 세션(`BrowserSession`) 켬, `replayIntegration`(아래 리플레이), `consoleLoggingIntegration`, `beforeSendLog: scrubLog`, `beforeBreadcrumb: scrubBreadcrumb`. 프로파일링 없음. `onRouterTransitionStart`로 화면 이동 측정 |
| `src/components/FeedbackButton.tsx` | 관리 화면(`/me/landings/[publicId]/…` 레이아웃, `/me` 오류 안내)·`/admin/*`(`AdminShell`) 오른쪽 아래에 떠 있는 `의견 보내기` 버튼(화면 틀 맨 끝, 1023px 이하는 이름 있는 아이콘 버튼). 처음 그려질 때 `feedbackIntegration`을 `Sentry.addIntegration`으로 붙이고 `attachTo`로 버튼에 연결 |
| `src/app/global-error.tsx`, `src/app/error.tsx` | 오류 경계. 브라우저에서 난 오류만 `captureException`(`digest`가 있는 서버 오류는 `onRequestError`가 이미 보냄) |
| `src/components/MonitoringUser.tsx`, `src/app/me/landings/[publicId]/layout.tsx` | 관리 화면 레이아웃이 세션으로 받은 `GET /api/me`의 내부 ID(UUID)를 서버 요청 스코프(`Sentry.setUser`)와 브라우저(`MonitoringUser`)에 붙임. 이메일은 넣지 않음 |
| `next.config.ts` | `withSentryConfig`(소스맵, release, `errorHandler`, `telemetry: false`). `tunnelRoute`는 쓰지 않음 |

- 사용자 정보: 브라우저 이벤트는 SDK 기본(`dataCollection.userInfo` 기본값)이라 Sentry가 브라우저의 접속 IP를 기록합니다(`tunnelRoute`를 쓰지 않는 이유. 대신 광고 차단기가 `*.ingest.us.sentry.io` 요청을 막으면 그 브라우저 이벤트·세션·리플레이·로그·의견은 사라짐). 웹 서버는 신뢰할 프록시 판정 기준이 없어 헤더 기반 IP 추론을 끕니다(`userInfo: false`). 로그인 사용자 ID는 관리 화면(`/me/landings/…`, `/me`가 이리로 보냄)에서만 붙습니다: `/admin`은 서버가 사용자 ID를 조회하지 않아 그 문서를 직접 열면 ID가 없고, 관리 화면에서 화면 이동하면 브라우저 ID가 남습니다(로그아웃은 문서를 새로 불러와 지워짐). API 이벤트에는 항상 붙습니다(같은 trace).
- 브라우저 세션(Release Health): `browserSessionIntegration` 기본값(`lifecycle: 'page'`)으로 문서를 불러올 때마다 세션 하나를 시작하고(화면 이동은 같은 세션) 끝·오류 여부를 보냅니다. 0042에서 껐던 것을 0052에서 다시 켰습니다.
- 리플레이: `replaysSessionSampleRate: 0`·`replaysOnErrorSampleRate: 1.0`이라 일반 세션은 보내지 않고, 메모리에 최근 화면 변화를 두었다가 오류가 나면 그 직전부터 보냅니다. SDK는 의견 창을 열 때도(`openFeedbackWidget`) 버퍼를 보내고 의견에 그 리플레이를 붙입니다(`includeReplay`). `maskAllText`·`maskAllInputs`·`blockAllMedia`를 명시해 글자·입력값·이미지·영상을 가리고, `networkDetailAllowUrls`를 두지 않아 요청·응답 본문과 헤더는 보내지 않습니다(주소·상태·크기·시간만). 무료 요금제 한도는 월 50건이고 넘으면 그 달 나머지는 버려집니다.
- 로그: `consoleLoggingIntegration({ levels: ['warn', 'error'] })`로 서버(Node·Edge)와 브라우저의 `console.warn`·`console.error`를 Sentry Logs로 보냅니다. `scrubLog`가 속성(중첩 객체 포함)에서 키에 `cookie`·`authorization`·`token`·`secret`·`password`·`email`·`x-crelink-internal`이 들어간 것과 `user.email`·`user.name`을 지우고, 본문과 문자열 값의 이메일 모양 글자를 `[email]`로 바꿉니다. `user.id`(내부 UUID)는 오류 이벤트와 같이 남습니다. 단위 테스트 `src/lib/monitoring.spec.ts`(`pnpm --filter @crelink/web test`, Node 내장 `node:test`).
- breadcrumb: 콘솔 문구(`category: 'console'`의 `message`·`data.arguments`)·요청 주소 같은 breadcrumb는 오류 이벤트의 breadcrumbs와 리플레이 기록에 들어가므로 서버·Edge·브라우저 모두 `beforeBreadcrumb: scrubBreadcrumb`로 `scrubLog`와 같은 기준(이메일 모양 글자 `[email]`, 민감한 키 삭제, 배열·중첩 포함)을 적용합니다. SDK는 `beforeBreadcrumb` 결과를 리플레이에 넘기므로 한 곳에서 둘 다 막힙니다.
- 의견(User Feedback): 로그인한 관리 화면(`/me/landings/[publicId]/…`, `/me` 오류 안내, `/admin/*`)에만 오른쪽 아래에 떠 있는 `의견 보내기`(`.feedback-fab`)를 두고 공개 화면(`/`·`/p`·`/privacy`·`/docs`·`/notice`)에는 두지 않습니다. `autoInject: false`, `showName`·`showEmail: false`, `useSentryUser`를 비워 숨은 이름·이메일 값도 보내지 않고, 화면 문구는 모두 한국어, Sentry 표시(`showBranding`)는 끕니다. 화면 캡처(`enableScreenshot: true`)는 사용자가 직접 첨부할 때만 브라우저 화면 공유 권한으로 찍어 첨부 파일로 보냅니다(가리지 않은 화면이라 가리기 도구 제공). 창은 `body`에 붙는 `#sentry-feedback` shadow DOM에 그려지고 색·글꼴·모서리는 `src/styles.css`의 같은 선택자가 디자인 토큰으로 정합니다. 외부 스크립트(Sentry CDN)를 불러오지 않고 번들에 넣되, 버튼을 쓰는 화면 묶음에만 들어갑니다. DSN이 없는 빌드에서는 버튼을 그리지 않습니다.
- 번들 크기(첫 로드 JS, `next build` 산출물의 `rootMainFiles`와 그 화면 `entryJSFiles` 합계, gzip, 가짜 DSN으로 빌드, 2026-10-08): `/privacy` 193.2KB → 231.3KB, `/p/[publicId]` 197.7KB → 235.8KB(리플레이·로그 통합, 공개 화면 +38.1KB), `/me` 204.6KB → 261.0KB, `/admin` 199.4KB → 255.7KB(의견 통합 +약 18.5KB 더). `next.config.ts`의 `compiler.define`으로 SDK 디버그 문장(`__SENTRY_DEBUG__`)과 리플레이의 iframe·shadow DOM 녹화 코드(`__RRWEB_EXCLUDE_IFRAME__`·`__RRWEB_EXCLUDE_SHADOW_DOM__`)를 빼 화면마다 약 3.5KB 줄였습니다(그래서 의견 창(shadow DOM) 안은 리플레이에 담기지 않음). `withSentryConfig`의 `bundleSizeOptimizations`·`webpack.treeshake`는 Turbopack 빌드에 적용되지 않아 쓰지 않고, 압축 worker 제외는 worker를 따로 호스팅해야 해 쓰지 않습니다. Next 16 `next build`는 화면별 크기를 출력하지 않아 산출물에서 직접 셌습니다.
- Uptime 대상: Sentry Uptime 모니터는 `https://links.shaul.kr/api/backend/api/health`(edge Caddy → 웹 → BFF `GET api/health` 허용 → API `GET /api/health`)를 부릅니다. 웹·BFF·API 전체 경로가 살아 있으면 200입니다. `/api/backend/health`는 BFF 허용 목록에 없어 404 `route_not_allowed`입니다.
- 보내지 않는 것: 서버는 쿠키(`cl_session` 원문 포함)·`Authorization`·`X-Crelink-Internal`·`Set-Cookie` 헤더와 요청 본문을 보내지 않고, 쿼리 `code`·`state`·`pass`는 `[Filtered]`입니다. BFF가 API로 보내는 요청 span에서도 같은 헤더를 지웁니다(`scrubSpan`).
- 분산 추적: 브라우저 → BFF(`sentry-trace`·`baggage`) → API(서버 SDK가 자동으로 붙임)로 이어집니다. 외부 출처 요청에는 붙이지 않습니다.
- 그 밖에 서버 SDK 기본으로 보내는 것: 서버 프로세스 세션·요청 집계(Release Health), 버린 이벤트 수.
- 끄기: `NEXT_PUBLIC_SENTRY_DSN`을 비우고 다시 빌드하면 오류·성능·세션·리플레이·로그·의견 모두 보내지 않고 `의견 보내기` 버튼도 사라집니다.
- 소스맵: `next build` 환경에 `SENTRY_AUTH_TOKEN`(Dockerfile의 BuildKit secret `sentry_auth_token`)이 있을 때만 브라우저 소스맵을 만들어 `SENTRY_ORG`·`SENTRY_PROJECT`·release `SENTRY_RELEASE`로 올리고(`widenClientFileUpload`) 올린 뒤 지웁니다. 없으면 브라우저 소스맵을 만들지 않고(`sourcemaps.disable`) 업로드도 건너뛰며 빌드는 성공합니다. 플러그인 기본값은 업로드 실패를 로그만 남기고 계속하므로 `errorHandler`로 빌드를 실패시킵니다(가짜 토큰 실측: 기본값이면 `Failed to create release: 404` 로그 뒤 빌드 성공, `errorHandler` 뒤 빌드 실패). Dockerfile은 토큰이 있는데 `SENTRY_ORG`·`SENTRY_PROJECT`·`SENTRY_RELEASE`가 비면 빌드를 멈춥니다. 서버 번들 소스맵(`.next/server`)은 Next 기본으로 생기며 공개 경로가 아닙니다.
- 종료: Next 서버의 SIGTERM 처리(위 [종료 동작](#종료-동작sigterm))는 Sentry 전송을 기다리지 않으므로 종료 직전 보내던 서버 이벤트는 잃을 수 있습니다.
- 로컬에서 전송 확인: 가짜 수신 서버를 띄우고 `apps/web/.env.local`에 `NEXT_PUBLIC_SENTRY_DSN=http://public@127.0.0.1:<포트>/2`를 넣은 뒤 `make web-restart`(또는 그 값으로 `next build`). 결과는 [0042 진행 기록](../../docs/work/orchestrator/0042-sentry-monitoring.md#진행-기록)과 [0052 진행 기록](../../docs/work/orchestrator/0052-sentry-free-features.md#진행-기록).
