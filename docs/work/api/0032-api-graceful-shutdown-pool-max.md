# 0032 API graceful shutdown과 DB pool 상한 환경변수

- 단계: 티켓
- 역할: api
- 상위: 0031
- 상태: 완료
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

API는 SIGTERM을 받으면 바로 죽습니다(`apps/api/src/main.ts`에 `enableShutdownHooks()` 없음, Node 기본 동작). 배포·롤백으로 컨테이너가 멈출 때 진행 중 요청(특히 업로드 POST)이 502로 끊기고 `onModuleDestroy`(pg pool 종료, 보존 작업 interval 정리)도 실행되지 않습니다. 로컬 모형 실험에서 핸들러가 없으면 동시 POST 20건 중 5건이 502, graceful이면 20/20 200이었습니다([조사](../../references/zero-downtime-deploy.md#로컬-실험-실측)).

또 무중단 전환(ADR 0011)에서는 구·신 API가 잠시 함께 돌아 DB 연결이 최대 2배가 됩니다. pool `max: 15` 고정이고 운영 `DATABASE_URL`은 Supavisor 세션 모드(클라이언트 수 = Supabase 대시보드 Pool Size 상한)라, 겹치는 동안 30개가 Pool Size를 넘으면 새 인스턴스의 readiness가 `max clients reached`로 실패할 수 있습니다. 상한을 운영에서 정할 수 있게 환경변수로 뺍니다.

## 수용 기준

- [x] `main.ts`가 `app.enableShutdownHooks()`를 켠다. SIGTERM을 받으면 새 연결을 받지 않고, 진행 중 요청을 끝낸 뒤 `onModuleDestroy`(pool `end`, `RetentionService`의 clearInterval)를 거쳐 종료 코드 0으로 끝난다. — 동작은 충족, 수단은 변경: `enableShutdownHooks()` 대신 `src/shutdown.ts`의 `enableGracefulShutdown`(이유는 진행 기록 2026-10-07 "범위 변경").
- [x] 진행 중 요청 보존을 실제 이미지로 확인한다: 로컬에서 API 컨테이너(`init: true`, compose와 같은 조건)에 5초 이상 걸리는 요청(예: `curl --limit-rate`로 천천히 보내는 인증된 업로드, 또는 동등한 방법)을 보내는 중 `docker stop -t 30` → 그 요청은 2xx로 끝나고, 종료 로그에 pool 종료가 보이며, 컨테이너가 grace 안에 스스로 끝난다(137 아님). 확인 방법과 결과를 진행 기록에 남긴다.
- [x] `DATABASE_POOL_MAX`(선택, 양의 정수, 기본 15)가 `new Pool({ max })`에 들어간다. 정수가 아니거나 1 미만이면 기동을 거부하고 오류 메시지에 키 이름만 넣는다. 설정 해석을 테스트로 확인한다.
- [x] `apps/api/docs/README.md` 환경변수 표에 `DATABASE_POOL_MAX`와 운영값 산정 기준을 적는다: `2 × DATABASE_POOL_MAX ≤ Supabase Pool Size − 여유(관리 접속·migration 도구용, 최소 2)`. 예: Pool Size 15면 6, 20이면 9. 맞출 수 없으면 Pool Size(또는 compute)를 올린다는 것과 세션 모드에서 Pool Size가 클라이언트 상한이라는 근거를 링크한다.
- [x] `apps/api/.env.example`(해당 키 설명), `apps/api/CHANGELOGS.md`, `pnpm verify` 통과.

## 범위

- 포함: `apps/api/src/main.ts`, `apps/api/src/database.ts`(pool 옵션), 설정 해석 위치(`apps/api/src/config.service.ts` 등 기존 패턴), 테스트, `apps/api/docs/README.md`, `apps/api/.env.example`, `apps/api/CHANGELOGS.md`.
- 제외: 운영값 설정과 compose `stop_grace_period`(0034, `infra/prod/`), 운영 Supabase Pool Size 확인·변경(사용자, 0034에서 기록), 헬스 경로 변경(지금 `/api/health/ready` 유지).

## 위험·복구

- 종료가 진행 중 요청을 기다리므로 오래 걸리는 요청이 있으면 컨테이너 정지가 grace(compose 기본 10초, 0034 이후 30초)만큼 늦어질 수 있습니다. grace를 넘으면 지금처럼 SIGKILL로 끝나므로 지금보다 나빠지지 않습니다.
- `DATABASE_POOL_MAX`를 낮추면 피크 동시 쿼리가 대기할 수 있습니다. 기본값이 지금과 같은 15라 이 티켓만으로는 운영 동작이 바뀌지 않고, 운영값은 0034에서 정합니다.
- 되돌리기: 해당 커밋을 되돌려 재배포(DB·데이터 변경 없음).

## 연결

- 에픽: [0031 운영 무중단 배포](../epics/0031-zero-downtime-deploy.md)
- 결정: [ADR 0011](../../adr/0011-zero-downtime-deploy.md) 결정 1(0단계)
- 조사: [두 버전이 동시에 도는 동안의 조건](../../references/zero-downtime-deploy.md#두-버전이-동시에-도는-동안의-조건)
- 코드: `apps/api/src/main.ts`, `apps/api/src/database.ts`, `apps/api/src/retention/retention.service.ts`, `apps/api/Dockerfile`
- 외부: [NestJS application shutdown](https://docs.nestjs.com/fundamentals/lifecycle-events#application-shutdown), [Node `server.close`](https://nodejs.org/api/http.html#serverclosecallback), [node-postgres Pool](https://node-postgres.com/apis/pool), [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI)

## 진행 기록

- 2026-10-07: 생성(에픽 0031 계획). 선행 없음, 0033과 병렬 가능. 이 티켓이 끝나야 0034가 운영값을 넣을 수 있음.
- 2026-10-07: 착수(브랜치 `work/0032-api-graceful-shutdown-pool-max`). 에픽 0031 0단계로 사용자 요청에 따라 바로 진행.
- 2026-10-07: 범위 변경(수단). Nest 11.2.7 `NestApplicationContext.close`(=`enableShutdownHooks`의 신호 처리)는 destroy hook → beforeShutdown hook → `dispose`(HTTP 서버 close) 순서라 `onModuleDestroy`(pool `end`)가 HTTP 서버를 닫기 **전에** 돌고, 끝에 `process.kill(pid, signal)`로 자신을 다시 죽입니다(종료 코드 0이 아님). 일회성 시험(느린 업로드 중 `app.close()`)에서 업로드가 **500 `internal_error`**(닫힌 pool 사용)로 끝나 확인함. 그래서 `enableShutdownHooks()`를 쓰지 않고 `src/shutdown.ts`의 `enableGracefulShutdown`이 HTTP 서버를 먼저 닫아(진행 중 요청 완료) 그 뒤 `app.close()`를 부르고 `process.exit(0)`. 또 Node 22 `server.close()`는 idle keep-alive 연결만 닫고 진행 중이던 keep-alive 연결은 응답 뒤 `keepAliveTimeout`(5초)까지 남아(실측: 1초 요청 뒤 종료가 7.0초) 종료 중 응답에 `Connection: close`를 넣고 응답이 끝나면 idle 연결을 닫음(같은 실험 1.0초). 수용 기준의 목표 동작(새 연결 거부 → 진행 중 요청 완료 → `onModuleDestroy` → 종료 코드 0)은 그대로.
- 2026-10-07: 구현. `src/shutdown.ts`(위 순서, 종료 중 재신호 무시, 오류면 종료 코드 1), `main.ts`가 `listen` 전에 호출. `Database.onModuleDestroy`는 pool 종료를 `PostgreSQL pool을 닫았습니다.`로 로그하고 두 번 불려도 `end`를 다시 부르지 않음. `DATABASE_POOL_MAX`는 `parseDatabasePoolMax`(`src/config.service.ts`)가 해석해 `Database`의 `new Pool({ max })`에 넣음(비면 15, `^\d+$`·안전 정수·1 이상이 아니면 `DATABASE_POOL_MAX는 1 이상의 정수여야 합니다(기본 15).`로 기동 거부). 문서 `apps/api/docs/README.md`(환경변수 표, "DB 연결 수", "종료"), `apps/api/.env.example`, `apps/api/AGENTS.md` 안내 목록, `apps/api/CHANGELOGS.md`.
- 2026-10-07: 시험. `src/config.service.spec.ts` `DATABASE_POOL_MAX`(빈 값 15, `6`·` 1 `, 거부 `0`·`-1`·`1.5`·`six`·`1e2`·`6 connections`·`99999999999999999999`, 오류 문구에 값 없음). `test/shutdown.e2e-spec.ts`: `DATABASE_POOL_MAX=3`이면 `pool.options.max` 3, `0`이면 앱 생성 거부 / 로그인 → idle keep-alive 연결 1개 → 느린 multipart 업로드(본문 일부만 보냄) 중 `process.emit('SIGTERM')` → idle 연결이 닫힘, 새 `fetch`는 연결 거부, `onModuleDestroy` 아직 안 불림 → 본문 마저 보냄 → **201**·`Connection: close` → 응답 뒤 1초 안에 exit(0), `Database.onModuleDestroy` 1회·`pool.ending`, `clearInterval(retention timer)` 호출. `pnpm verify` 8단계 통과(API 12 suites 83 tests). `pnpm work:scope 0032` 통과.
- 2026-10-07: 컨테이너 실측(macOS arm64, Docker Desktop). `docker buildx build -f apps/api/Dockerfile --load`로 이 브랜치 이미지와 기준 이미지(main `3c9ed95`)를 빌드. 각 회차: 워크트리 로컬 PostgreSQL에 새 DB → `docker run -d --init`(compose `init: true`와 같음, `NODE_ENV=production` 운영 필수 키 + `FILE_STORAGE=disk`) → `/api/health/ready` 200 → `users`·`sessions` 행을 직접 넣어 `cl_session` 쿠키 준비 → 256KiB PNG를 `curl --limit-rate 32k -F file=@…`로 N건 동시에 업로드(각 약 8초, 0.2초 간격 시작) → 첫 업로드 시작 약 3~4초 뒤 `docker stop -t 30`. 스크립트는 일회용이라 저장소에 두지 않음.
  - 이 브랜치: 3회(5·10·10건) **25/25 `201`**(각 8.0초), `docker stop` 5.91·5.94·5.94초(진행 중 업로드가 끝날 때까지), 종료 코드 **0**, OOM 아님. 종료 로그: `[Shutdown] SIGTERM 수신: … 진행 중 요청 5건을 마친 뒤 종료합니다.` → (6초 뒤) `[Shutdown] HTTP 서버를 닫았습니다(진행 중 요청 완료).` → `[Database] PostgreSQL pool을 닫았습니다.` → `[Shutdown] 종료합니다.`
  - 기준(main `3c9ed95`): 5건 **0/5**(curl `000`, 응답 없이 연결 끊김), `docker stop` 0.16초, 종료 코드 **143**, 종료 로그 없음.
  - 운영 compose의 `FILE_STORAGE: s3`가 아니라 disk로 실측함. 업로드의 느린 구간은 클라이언트 본문 수신이라 종료 순서 검증에는 차이가 없다고 판단 [추정]. Caddy 뒤 keep-alive 동작은 e2e(`Connection: close`, idle 연결 종료)로 확인했고 실제 Caddy와는 0034·0035에서 확인.
- 2026-10-07: 후속(이 티켓 범위 밖, 통합 담당에 전달). `.sops.yaml` `unencrypted_regex`와 `docs/specs/crelink-prod-deploy.md` 평문 키 목록에 `DATABASE_POOL_MAX` 추가(0034). `docs/references/zero-downtime-deploy.md` "API graceful shutdown" 행과 ADR 0011의 "`app.enableShutdownHooks()`" 표현은 위 범위 변경과 맞게 고칠 필요가 있음.
- 2026-10-07: 운영 반영(통합 담당, PR #13 → 자동 배포 릴리스 `433dc88`). 운영 api `DATABASE_POOL_MAX=6`. 이후 롤백 측정에서 이 이미지의 정지는 오류 없이 끝났고 공백은 caddy 재생성·기동 순서 몫(티켓 0034 진행 기록). 위 후속 항목(정규식·평문 키 목록·ADR·조사 문서 표현)은 통합 브랜치에서 반영함.
