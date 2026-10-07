# crelink 웹

Next.js App Router와 TypeScript 기반 크리링(CreLink) 웹 클라이언트입니다. 서버 컴포넌트는 서버 전용 `API_INTERNAL_URL`로 Nest API를 직접 읽고(`src/lib/api/server.ts`, 로그인 화면은 요청의 `cl_session` 쿠키를 함께 보냄), 브라우저 요청은 same-origin BFF(`/api/backend`)를 거쳐 Nest API로 전달합니다. 웹이 API로 보내는 서버 측 요청(서버 컴포넌트·BFF·구글 로그인 route handler)은 모두 `apiRequestHeaders()`(`src/lib/api/server.ts`)로 헤더를 만들고, 서버 전용 `API_INTERNAL_TOKEN`이 있을 때만 `X-Crelink-Internal` 헤더를 붙입니다. 운영은 내부 네트워크로 API를 부르므로 이 값을 두지 않습니다([운영 컨테이너 이미지](#운영-컨테이너-이미지)). 화면·API 계약의 기준은 [크리링 MVP 기술 설계](../../docs/specs/crelink-mvp.md)와 [`packages/shared/src/crelink.ts`](../../packages/shared/src/crelink.ts)입니다.

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 소개, 로그인 전 `구글로 시작하기`, 로그인 후 `/me`·랜딩 관리 화면(운영자는 `/admin`) 링크 |
| `/auth/google`, `/auth/google/callback` | 구글 로그인 route handler. API의 `cl_oauth_state`·`cl_session` `Set-Cookie`를 그대로 붙여 302 |
| `/me` | 크리에이터 편집(단축 URL 복사·주소 변경, 프로필, SNS, 포트폴리오)과 외부 링크 요약·관리 화면 진입점. 공유용 주소는 단축 URL만 보여 주고 랜딩은 미리보기 링크(새 창)만 둠. 401이면 `/` |
| `/me/landings/[publicId]` | 랜딩 관리 화면(PRD R18). 기본 편집 모드: 랜딩과 같은 배치에서 외부 링크 추가·수정·삭제(하단 시트), 끌어서 순서 변경(마우스·터치·키보드), 숨기기 스위치, 한도·차단 표시. `?mode=view` 보기 모드: 공개 랜딩과 같은 `Landing`으로 방문자 화면(숨긴·차단 링크 제외, 링크는 클릭 기록 없이 저장된 URL로). 내 랜딩이 아니면 찾을 수 없음 안내, 401이면 `/` |
| `/p/[publicId]` | 공개 랜딩(SSR, `src/components/landing/Landing.tsx`). 404·410 안내. 외부 진입은 단축 주소를 거침(PRD R7): `Sec-Fetch-Site: same-origin`(서비스 화면에서 연 경우)이거나 API가 단축 주소 302의 통과 표시 `?pass=`를 받아들이면(`passAccepted`) 그리고 주소창의 `pass`를 지우며(`PassCleanup`), 그 밖은 API가 준 `shortUrl`로 307. 이 리디렉트가 HTTP 307이 되도록 불러오는 중 화면(`loading.tsx`)은 루트가 아니라 `/me`·`/admin`에만 둠 |
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

## 운영 컨테이너 이미지

운영 웹은 배포 대상 서버에서 `infra/prod/compose.yaml`의 `web` 서비스로 색(blue·green)별 스택(project `crelink-blue`·`crelink-green`)에 `ghcr.io/ai-worker-lab/crelink-web:<SHA>` 이미지로 실행하고, 배포와 무관하게 떠 있는 edge Caddy(project `crelink-edge`)가 `https://links.shaul.kr`의 요청을 전부 활성 색 웹(`web-<색>:3000`)으로 넘깁니다. 배포·롤백은 비활성 색에 새 웹·API를 올린 뒤 edge를 reload로 전환하고 옛 색을 SIGTERM으로 멈춥니다(아래 종료 동작). 배포 구성은 [운영 배포 설계](../../docs/specs/crelink-prod-deploy.md), 이미지 빌드·배포는 `.github/workflows/deploy.yml`입니다.

```bash
# 저장소 루트에서(빌드 컨텍스트 = 루트, 허용 목록은 루트 .dockerignore)
docker build -f apps/web/Dockerfile -t crelink-web:local .
```

- [`Dockerfile`](Dockerfile): 빌드 단계(`node:22-slim`)에서 루트 `packageManager`의 pnpm으로 `pnpm install --frozen-lockfile --filter @crelink/web...` → `@crelink/shared` 빌드 → 웹 빌드. 디자인 토큰 생성물은 커밋된 것을 쓰고 원본과의 일치 검사는 CI(`pnpm typecheck`)가 맡습니다.
- `next.config.ts`의 `output: 'standalone'`으로 `.next/standalone`(`server.js`와 추적된 의존성)만 런타임 단계(`node:22-slim`)에 옮기고 `.next/static`·`public`을 합칩니다. 실행은 `node` 사용자, `CMD node apps/web/server.js`, `PORT=3000`·`HOSTNAME=0.0.0.0`, `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`.
- `HEALTHCHECK`: 내장 `fetch`로 `/privacy`(API를 부르지 않는 정적 화면)를 확인합니다. Compose는 이 정의를 재사용하고 루트 파일 시스템을 읽기 전용(`/tmp`만 tmpfs)으로 둡니다.
- 이미지는 amd64·arm64 모두 만들 수 있습니다(대상 플랫폼은 `infra/prod/targets.json`). 크기는 약 432MB(2026-10-07, Next 16.4.0, `docker image inspect` 기준).

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
