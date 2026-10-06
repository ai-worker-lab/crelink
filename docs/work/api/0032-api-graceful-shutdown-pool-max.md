# 0032 API graceful shutdown과 DB pool 상한 환경변수

- 단계: 티켓
- 역할: api
- 상위: 0031
- 상태: 분류 대기
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

API는 SIGTERM을 받으면 바로 죽습니다(`apps/api/src/main.ts`에 `enableShutdownHooks()` 없음, Node 기본 동작). 배포·롤백으로 컨테이너가 멈출 때 진행 중 요청(특히 업로드 POST)이 502로 끊기고 `onModuleDestroy`(pg pool 종료, 보존 작업 interval 정리)도 실행되지 않습니다. 로컬 모형 실험에서 핸들러가 없으면 동시 POST 20건 중 5건이 502, graceful이면 20/20 200이었습니다([조사](../../references/zero-downtime-deploy.md#로컬-실험-실측)).

또 무중단 전환(ADR 0011)에서는 구·신 API가 잠시 함께 돌아 DB 연결이 최대 2배가 됩니다. pool `max: 15` 고정이고 운영 `DATABASE_URL`은 Supavisor 세션 모드(클라이언트 수 = Supabase 대시보드 Pool Size 상한)라, 겹치는 동안 30개가 Pool Size를 넘으면 새 인스턴스의 readiness가 `max clients reached`로 실패할 수 있습니다. 상한을 운영에서 정할 수 있게 환경변수로 뺍니다.

## 수용 기준

- [ ] `main.ts`가 `app.enableShutdownHooks()`를 켠다. SIGTERM을 받으면 새 연결을 받지 않고, 진행 중 요청을 끝낸 뒤 `onModuleDestroy`(pool `end`, `RetentionService`의 clearInterval)를 거쳐 종료 코드 0으로 끝난다.
- [ ] 진행 중 요청 보존을 실제 이미지로 확인한다: 로컬에서 API 컨테이너(`init: true`, compose와 같은 조건)에 5초 이상 걸리는 요청(예: `curl --limit-rate`로 천천히 보내는 인증된 업로드, 또는 동등한 방법)을 보내는 중 `docker stop -t 30` → 그 요청은 2xx로 끝나고, 종료 로그에 pool 종료가 보이며, 컨테이너가 grace 안에 스스로 끝난다(137 아님). 확인 방법과 결과를 진행 기록에 남긴다.
- [ ] `DATABASE_POOL_MAX`(선택, 양의 정수, 기본 15)가 `new Pool({ max })`에 들어간다. 정수가 아니거나 1 미만이면 기동을 거부하고 오류 메시지에 키 이름만 넣는다. 설정 해석을 테스트로 확인한다.
- [ ] `apps/api/docs/README.md` 환경변수 표에 `DATABASE_POOL_MAX`와 운영값 산정 기준을 적는다: `2 × DATABASE_POOL_MAX ≤ Supabase Pool Size − 여유(관리 접속·migration 도구용, 최소 2)`. 예: Pool Size 15면 6, 20이면 9. 맞출 수 없으면 Pool Size(또는 compute)를 올린다는 것과 세션 모드에서 Pool Size가 클라이언트 상한이라는 근거를 링크한다.
- [ ] `apps/api/.env.example`(해당 키 설명), `apps/api/CHANGELOGS.md`, `pnpm verify` 통과.

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
