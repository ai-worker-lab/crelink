# 0026 웹 운영 컨테이너 이미지와 서버 측 API 헤더

- 단계: 티켓
- 역할: web
- 상위: 0024
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

웹을 배포 대상 서버의 Compose 스택에서 컨테이너로 운영할 수 있게 이미지를 만들고, 웹이 API로 보내는 서버 측 요청의 헤더를 한 곳에서 만듭니다(내부 토큰 헤더는 선택 기능으로 남고 운영은 내부 네트워크라 쓰지 않음).

## 수용 기준

- [x] 서버 컴포넌트 호출(`src/lib/api/server.ts`)과 BFF(`src/app/api/backend/[...path]/route.ts`)가 환경변수 `API_INTERNAL_TOKEN`이 있으면 모든 API 요청에 `X-Crelink-Internal` 헤더를 붙인다(없으면 붙이지 않음, 로컬 동작 불변). 토큰이 브라우저 번들·응답에 새지 않음을 확인한다.
- [x] `apps/web/Dockerfile`(Next.js `output: 'standalone'`, `node:22-slim`, `node` 사용자, `HEALTHCHECK` `/privacy`)이 저장소 루트 컨텍스트로 빌드되고, 운영 스택에서 `API_INTERNAL_URL=http://api:3000`(토큰 없음)으로 healthy가 되며 BFF·서버 컴포넌트가 API를 부른다. CI `이미지 빌드 web`이 통과한다.
- [x] `apps/web/vercel.json` 삭제, `apps/web/.env.example`·`apps/web/README.md`(운영 컨테이너 이미지 절)·`apps/web/CHANGELOGS.md` 갱신, `pnpm verify`·`pnpm e2e` 통과.

## 범위

- 포함: `apps/web/**`.
- 제외: 루트 워크플로(0028), 서버 설정.

## 위험·복구

토큰 헤더는 환경변수가 있을 때만 붙습니다. 로컬·e2e 동작은 그대로입니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 구현.
  - 헤더: `src/lib/api/server.ts`에 `apiRequestHeaders(init)`를 두고 `serverApi`·BFF·`/auth/google`·`/auth/google/callback`이 모두 이것으로 헤더를 만듦(`API_INTERNAL_URL`을 쓰는 서버 코드 전부). 토큰은 `process.env.API_INTERNAL_TOKEN`(서버 전용, `server-only` 모듈)에서 읽고 값이 있을 때만 `X-Crelink-Internal`을 붙임. 오류·로그·응답에는 쓰지 않음.
  - Vercel: `apps/web/vercel.json`(`framework: nextjs`, `installCommand: pnpm install --frozen-lockfile`, `buildCommand: design-tokens check → shared build → web build`), `package.json` `engines.node: 22.x`(`.nvmrc` 22와 같은 메이저). 프로젝트 설정·환경변수 표와 Vercel·pnpm 공식 문서 인용은 `apps/web/README.md`의 `Vercel 배포`.
  - 운영 주소 점검: `API_INTERNAL_URL`은 `URL`/문자열 결합만 하고 localhost 가정 없음(`auth-redirect.ts`는 상대 경로 302). `/privacy` 등 화면에 크리링 도메인 하드코딩 없음(외부 고지 링크 `https://db-ip.com`만). API 쿠키는 `Domain` 없는 host-only라 BFF 전달 뒤 웹 호스트에 붙고, 이미지 URL은 API가 `WEB_URL/api/backend/...`로 만듦. 발견: BFF가 Vercel Function 본문 한도 4.5MB를 지나는데 이미지 한도가 5MB → 통합 담당이 `CRELINK_LIMITS.imageMaxBytes`를 4MB로 낮추기로 함. 웹 문구(`5MB` 두 곳)는 상수에서 계산하는 `IMAGE_MAX_LABEL`로 바꿈.
- 2026-10-06: 검증.
  - `pnpm --filter @crelink/web typecheck` 통과. `eslint`(변경 파일)·`prettier --check apps/web` 통과.
  - 빌드: `apps/web`에서 깨끗한 `.next`로 `vercel.json`의 빌드 명령 순서(`pnpm --filter @crelink/design-tokens check && pnpm --filter @crelink/shared build && pnpm --filter @crelink/web build`) 통과. 임의 토큰(`API_INTERNAL_TOKEN`)과 `API_INTERNAL_URL=https://go.example.invalid`로 빌드해 `.next` 전체(정적·서버)에서 토큰 값 0건, `.next/static`에서 `API_INTERNAL_TOKEN`·`X-Crelink-Internal` 문자열 0건(변수 이름은 서버 번들에만 있고 실행 시점에 읽음). 설치 명령(`pnpm install --frozen-lockfile`)은 다른 작업이 같은 `node_modules`를 쓰고 있어 다시 실행하지 않음.
  - 헤더 부착(임시 echo 서버, 저장소에 남기지 않음): 빌드 산출물을 `next start`로 띄워 서버 컴포넌트(`/p/abc` → `GET /api/public/landings/abc`), BFF(`GET api/health`, `POST api/auth/logout`), OAuth(`/auth/google` → `GET /api/auth/google/start`, `/auth/google/callback` → `POST /api/auth/google/callback`) 다섯 요청을 확인. 토큰 있음 + https 외부 주소(자체 서명 인증서, `NODE_EXTRA_CA_CERTS`): 다섯 요청 모두 헤더 값 일치, 응답·HTML·웹 서버 로그에 토큰 없음. 토큰 없음 + http: 다섯 요청 모두 헤더 없음, 응답 동일. 연결 불가 https 주소 + 토큰: BFF 502 `upstream_unavailable`, OAuth `/notice?reason=oauth_failed`, 응답·로그에 토큰 없음.
  - 확인 못 함: 실제 Vercel 프로젝트(계정 없음)에서의 `vercel pull`·`vercel build`·배포, Root Directory·소스 외부 파일 포함 설정, Vercel이 고르는 pnpm 버전, 운영 Caddy와의 연동(0029). `pnpm verify`·`pnpm e2e`는 다른 영역 작업과 같은 작업 트리라 통합 담당이 마지막에 실행.
- 2026-10-06: 통합 확인(브랜치 `work/0024-prod-deploy`). 이미지 한도를 4MB로 맞춤(shared·API 메시지·테스트·문서). `pnpm verify` 8단계 통과(API 테스트 포함), `make api-restart` 뒤 `pnpm e2e` 6 passed, `pnpm smoke` 5 passed, `infra/prod/tests/caddy-routing.sh` 전 요청 일치. 상태 `완료`. 실서버 적용은 0029.
- 2026-10-06: 범위 변경(에픽 0024 호스팅 전환). 웹을 Vercel이 아니라 배포 대상 서버의 Compose 스택에서 운영하기로 해 제목·목적·수용 기준을 바꿈. 이전 기준 "`apps/web/vercel.json`과 Vercel 프로젝트 설정 문서"(완료했던 항목)는 대체되어 삭제하고, 웹 컨테이너 이미지와 문서 정리를 새 기준으로 둠. 헤더 공용화(첫 기준)는 그대로 유효. 통합 담당이 `apps/web/Dockerfile`·`next.config.ts` `output: 'standalone'`·루트 `.dockerignore`(웹 허용)를 추가했고, 문서: README `Vercel 배포` 절 → `운영 컨테이너 이미지` 절, `.env.example` 주석, `vercel.json` 삭제(`git rm`). 운영 스택에서 웹 healthy·운영 주소 검사 통과는 0029 진행 기록. 남은 확인(CI `이미지 빌드 web`, 최종 `pnpm verify`·`pnpm e2e`)은 통합 확인에서 하고 `완료`로 바꿈. 파일 이름(브랜치 slug)은 이력 경로를 지키려고 그대로 둠.
- 2026-10-07: 완료(에픽 0024 마감). 웹 이미지가 운영 `home-server`에서 healthy로 서비스 중이고(0029, 이후 Blue/Green에서는 web→api가 같은 색 별칭 `http://api-<색>:3000`, 0035), CI `이미지 빌드 web`은 매 PR 통과(PR #16~#21), `apps/web/vercel.json` 없음, `pnpm verify`·`pnpm e2e` 통과(0038). Node 런타임은 이후 0039에서 LTS 기준으로 올림.
