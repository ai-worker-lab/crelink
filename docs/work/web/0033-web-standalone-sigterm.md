# 0033 웹 standalone 서버의 SIGTERM 동작 확인과 처리

- 단계: 티켓
- 역할: web
- 상위: 0031
- 상태: 검증
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

무중단 전환(ADR 0011)에서는 트래픽을 새 색으로 옮긴 뒤 구 색 웹 컨테이너를 `docker stop`합니다. 이때 웹이 진행 중 요청(SSR, BFF `/api/backend/*` 프록시, OAuth 콜백)을 끊으면 전환 직전 요청이 실패합니다. Next 문서는 SIGTERM·SIGINT를 받으면 진행 중 요청과 `after()`를 마치고 종료한다고 하지만, 운영 이미지의 standalone `server.js`(`apps/web/Dockerfile`, `CMD ["node", "apps/web/server.js"]`, compose `init: true`)에서 실제로 그런지는 확인하지 않았습니다([조사](../../references/zero-downtime-deploy.md#두-버전이-동시에-도는-동안의-조건)).

선택 항목으로, 전환 뒤 옛 HTML을 가진 브라우저가 옛 chunk를 요청해 404가 나는 버전 차이(지금도 배포마다 있음)를 `deploymentId`로 줄입니다.

## 수용 기준

- [x] 실측: 운영과 같은 조건(웹 이미지, `init: true`, `read_only`)으로 웹 컨테이너를 띄우고 `API_INTERNAL_URL`을 5초 뒤 응답하는 임시 모형 API로 둔 뒤, BFF 경로(`/api/backend/api/health`) 요청이 진행 중일 때 `docker stop -t 30` → 그 요청의 결과(2xx 여부), 정지 중 새 연결 처리, 컨테이너 종료 코드·걸린 시간을 진행 기록에 남긴다. 임시 파일은 저장소에 남기지 않는다.
- [x] 진행 중 요청이 끊기면(2xx가 아니거나 즉시 종료) Next [self-hosting 문서](https://nextjs.org/docs/app/guides/self-hosting)의 수동 신호 처리(`NEXT_MANUAL_SIG_HANDLE`) 또는 동등한 방법으로 고치고 같은 실측으로 2xx를 확인한다. 이미 2xx면 코드 변경 없이 근거만 남긴다.
- [ ] (선택) `apps/web/next.config.ts`에 `deploymentId: process.env.NEXT_DEPLOYMENT_ID`를 넣고 `apps/web/Dockerfile`이 빌드 인자로 받게 한다. 값이 없으면 지금과 같게 동작한다. 빌드 인자에 커밋 SHA를 넣는 워크플로 변경(`.github/workflows/`)은 orchestrator 몫이라 진행 기록에 인계한다.
- [x] 결과와 종료 동작을 `apps/web/docs/`(또는 `apps/web/README.md`의 운영 이미지 설명)에 적고 `apps/web/CHANGELOGS.md`, `pnpm verify` 통과.

## 범위

- 포함: `apps/web/**`(필요하면 서버 진입 래퍼, `next.config.ts`, `Dockerfile`, 문서·변경 기록).
- 제외: compose `stop_grace_period`(0034), 서버 측 API 주소를 색 별칭으로 바꾸는 compose 변경(0035), 워크플로 빌드 인자(orchestrator).

## 위험·복구

- 신호 처리를 직접 넣으면 종료가 늦어지거나 프로세스가 끝나지 않을 수 있습니다. 상한(grace 30초 안)과 강제 종료 경로를 둡니다. 되돌리기: 커밋을 되돌려 재배포(데이터 영향 없음).
- `deploymentId`는 값이 바뀔 때 열린 탭이 전체 새로고침(hard navigation)을 합니다. 작성 중인 폼 입력이 사라질 수 있어 선택 항목으로 둡니다.

## 연결

- 에픽: [0031 운영 무중단 배포](../epics/0031-zero-downtime-deploy.md)
- 결정: [ADR 0011](../../adr/0011-zero-downtime-deploy.md) 결정 1(0단계)
- 코드: `apps/web/Dockerfile`, `apps/web/next.config.ts`, `apps/web/src/app/api/backend/[...path]/route.ts`, `apps/web/src/lib/api/server.ts`
- 외부: [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [deploymentId](https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId)

## 진행 기록

- 2026-10-07: 생성(에픽 0031 계획). 선행 없음, 0032와 병렬 가능. 0035가 이 결과를 기다림.
- 2026-10-07: 착수(브랜치 `work/0033-web-standalone-sigterm`).
- 2026-10-07: 실측. 결론: 이미 2xx라 코드 변경 없음(수용 기준 2의 "근거만 남김"). (선택) `deploymentId`는 사용자 미결정이라 하지 않고 후속으로 남김(아래 인계).
  - 조건: 로컬 macOS arm64, Docker Desktop 29.8.1(엔진 29.8.1, Compose 5.5.1). 이 브랜치의 `apps/web/Dockerfile`로 빌드한 이미지(Next 15.5.27, Node 22.23.3)를 `docker run --init --read-only --tmpfs /tmp --security-opt no-new-privileges:true -e API_INTERNAL_URL=http://<모형>:3000`으로 실행(PID 1 `docker-init`, `HostConfig.Init=true`, `ReadonlyRootfs=true` 확인). 모형 API는 모든 요청에 5초 뒤 응답(`/api/health`는 200, 그 밖은 404 JSON)하는 `node:22-slim` 컨테이너. 클라이언트는 같은 Docker 네트워크의 node 컨테이너로, 시작과 함께 BFF `GET /api/backend/api/health` 3건과 SSR `GET /p/mock-landing`(서버 컴포넌트가 API를 부름) 1건을 보내고 0.5초마다 새 연결로 `/privacy`를 찔러 봄. 클라이언트 시작 약 1.6~1.9초 뒤 호스트에서 `docker stop`. 임시 스크립트는 `/tmp`에만 두고 지움.
  - `docker stop -t 30`: 진행 중 4건 모두 200(BFF 본문 37B 전부, SSR 8463B 전부, 5.05초). 정지 중 새 연결은 SIGTERM 직후부터 `ECONNREFUSED`(listen 소켓 닫힘), 컨테이너가 끝난 뒤에는 `ENOTFOUND`(네트워크 DNS에서 빠짐). `docker stop` 3.69초, 종료 코드 0.
  - `docker stop -t 10`: 위와 같음(4건 200, 3.71초, 종료 코드 0).
  - `docker stop`(`-t` 없음): 3.15초에 종료 코드 137, 진행 중 4건 모두 `ECONNRESET`. 이 Docker Desktop의 엔진 기본 정지 대기는 약 3초였음(SIGTERM을 무시하는 컨테이너로 `docker stop` 3.14초, Engine API `POST /containers/{id}/stop` 3.10초, `docker compose stop` 3.14초). Docker 문서상 Linux `dockerd --default-stop-timeout` 기본은 10초라 서버 값은 다를 수 있으나, 어느 쪽이든 Compose `stop_grace_period`로 명시해야 함(0034).
  - grace 초과: 모형 API 지연 15초, `docker stop -t 10` → 10.13초에 SIGKILL(종료 코드 137), 진행 중 4건 `ECONNRESET`. Next에는 자체 종료 상한이 없고 상한·강제 종료는 Docker grace가 맡음.
  - keep-alive 클라이언트(프록시처럼 연결 재사용): 진행 중 요청은 200이지만 응답이 `Connection: keep-alive`로 나감. SIGTERM 때 쉬던 keep-alive 연결은 곧바로 닫힘(재사용 시도가 새 연결 `ECONNREFUSED`로 넘어감). 진행 중이던 연결은 응답 뒤에도 열려 있어 `docker stop -t 30`이 9.68초(마지막 응답 + Node keep-alive 제한 5초)에 종료 코드 0. 그 연결로 1초마다 `/privacy`를 계속 보내면 모두 200으로 처리되고 클라이언트가 멈출 때까지(23.97초) 종료하지 않음(0.2초 간격도 같음, 7.91초).
  - 근거 코드: 이미지 안 `node_modules/next/dist/server/lib/start-server.js`의 `cleanup` — `NEXT_MANUAL_SIG_HANDLE`이 없으면 SIGINT·SIGTERM에 `server.close()`(새 연결 거부, Node 22는 쉬는 연결도 닫음) → 진행 중 요청 완료 대기 → `nextServer.close()` → `process.exit(0)`. 웹 코드는 `after()`를 쓰지 않음.
  - 문서: `apps/web/README.md` "종료 동작(SIGTERM)", `apps/web/CHANGELOGS.md`.
  - 0035 인계: 정지 중 새 연결은 거부되므로 edge(Caddy)는 구 색을 멈추기 전에 새 색으로 보내기를 마쳐야 함. 또 진행 중이던 keep-alive 연결로 새 요청이 계속 오면 구 웹이 grace까지 남고 grace에서 끊기므로, 전환 뒤 Caddy가 구 upstream 연결로 더 보내지 않는지(설정 reload 때 옛 transport 연결 정리 여부)를 0035 실측에서 확인할 것 [추정: reload가 옛 handler의 쉬는 연결을 닫음].
  - 후속(사용자 결정 필요): `deploymentId`(`next.config.ts` `deploymentId: process.env.NEXT_DEPLOYMENT_ID`, Dockerfile 빌드 인자, 워크플로가 커밋 SHA 전달은 orchestrator). 값이 바뀌면 열린 탭이 전체 새로고침해 작성 중 입력을 잃을 수 있어 도입 여부를 사용자가 정한 뒤 별도 work item으로 진행.
