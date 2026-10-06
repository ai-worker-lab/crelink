# 운영 배포 무중단화 방식 비교 (Caddy 재시도·docker-rollout·Blue/Green·Kamal·Swarm)

- 확인일: 2026-10-07 (외부 문서·릴리스 확인과 로컬 Docker 실험)
- 조사 질문: 배포 대상 서버 1대의 Compose 스택(`crelink-prod`: caddy·api·web, Cloudflare Tunnel → `127.0.0.1:18080`)에서 배포·롤백 중 나는 약 30~40초 502를 어떤 방식으로 없앨지
- 관련: [ADR 0011 운영 배포 무중단 방식](../adr/0011-zero-downtime-deploy.md)(제안), [에픽 0031 운영 무중단 배포](../work/epics/0031-zero-downtime-deploy.md), [운영 배포·CD 기술 설계](../specs/crelink-prod-deploy.md)

외부 프로젝트·서비스 정보는 확인일 기준이며 바뀔 수 있습니다. 이 문서는 후보 비교이고 선택은 ADR이 기준입니다. 표기: 근거는 각 줄의 링크나 저장소 경로, **[실측]**은 아래 "로컬 실험", **[추정]**은 검증하지 않은 판단입니다.

대상 버전(확인일 기준 운영 서버): Docker 29, Compose v5.5.1, `caddy:2.11.7-alpine`, API NestJS 11, 웹 Next.js 15.5 standalone.

## 요구 조건

- 배포·롤백·GeoIP 갱신 중 방문자에게 5xx·연결 오류가 없어야 합니다(단축 주소 `go.shaul.kr`은 인스타그램 등에 걸려 있어 공백이 곧 이동 실패).
- 진행 중인 요청(5초 이상 걸리는 업로드 포함)이 끊기지 않아야 합니다.
- 지금의 배포 계약을 유지합니다: 릴리스 = 커밋 SHA의 `infra/prod` + 이미지 SHA, 서버 복호화(SOPS), forced command(`ssh-entry.sh`), 헬스 실패 시 자동 복구, `releases.log`, 수동·자동 롤백([설계](../specs/crelink-prod-deploy.md#릴리스배포롤백)).
- 이식성: OCI·AWS VM에서도 같은 파일·절차로 동작해야 합니다([이식 규칙](../specs/crelink-prod-deploy.md#이식-규칙)).
- 새 외부 의존과 운영 부담은 적을수록 좋습니다(운영자 1명).

## 지금 502가 나는 이유 (저장소 확인)

| 원인 | 근거 | 영향 |
| --- | --- | --- |
| Caddy가 배포마다 다시 만들어짐 | `infra/prod/compose.yaml`의 `./Caddyfile` bind 원본이 릴리스 폴더(`/opt/crelink/releases/<SHA>`) 기준 절대 경로라 설정 해시가 바뀜. `infra/prod/Caddyfile`이 `admin off`라 reload도 불가([admin 옵션](https://caddyserver.com/docs/caddyfile/options#admin): "config changes will be impossible") | 18080 리스너가 잠깐 사라지면 cloudflared가 502를 냄. 재시도 설정(`lb_try_duration`)이 있어도 Caddy 자체가 내려가 있으면 소용없음 |
| api·web을 멈춘 뒤 새로 띄움 | Compose 재생성은 기존 컨테이너를 멈춘 뒤 새 컨테이너를 띄움. 의존 서비스를 함께 멈추는 것은 `depends_on.restart: true`일 때뿐([compose v5 `reconcile.go`](https://github.com/docker/compose/blob/main/pkg/compose/reconcile.go), [compose-spec depends_on](https://github.com/compose-spec/compose-spec/blob/main/05-services.md#depends_on)). 이 저장소는 `restart: true`를 쓰지 않음 | api 공백(부팅 + migration 확인 + 첫 헬스 통과), web 공백, caddy 재생성이 이어져 합계 30~40초(운영 관측과 맞는 분해 [추정]) |
| 헬스 판정이 늦음 | 이미지 `HEALTHCHECK --interval=10s --start-period=30s`(api)·`20s`(web), `start_interval` 없음(`apps/api/Dockerfile`, `apps/web/Dockerfile`) | 앱이 준비된 뒤에도 최대 약 10초 더 기다림. `start_interval`은 Compose v2.20.2·Engine 25 이상([compose-spec healthcheck](https://github.com/compose-spec/compose-spec/blob/main/05-services.md#healthcheck)) |
| API가 SIGTERM에 바로 죽음 | `apps/api/src/main.ts`에 `enableShutdownHooks()` 없음. Nest는 opt-in해야 SIGTERM에 `app.close()`를 함([Nest lifecycle](https://docs.nestjs.com/fundamentals/lifecycle-events#application-shutdown)). `init: true`(tini)가 SIGTERM을 넘기고 핸들러가 없으면 Node 기본 동작이 즉시 종료 | 진행 중 요청이 끊김. `RetentionService.onModuleDestroy`(clearInterval)·`Database.onModuleDestroy`(pool.end)도 실행되지 않음 |
| web→api 호출은 Caddy를 거치지 않음 | `infra/prod/compose.yaml` web `API_INTERNAL_URL: http://api:3000`, `apps/web/src/lib/api/server.ts` | api 공백 동안 SSR·BFF 요청은 Caddy 재시도로도 보호받지 못함 |

## 로컬 실험 [실측]

2026-10-07, macOS Docker 29.8.1·Compose v5.5.1, `caddy:2.11.7-alpine`, 백엔드는 `node:22-alpine` HTTP 서버(`/slow`는 5초 뒤 응답). 실험 파일은 끝나고 지웠고 저장소에 남기지 않았습니다(에픽의 `tests/zero-downtime.sh`가 같은 실험을 시험으로 만듦).

| # | 설정 | 행위 | 결과 |
| --- | --- | --- | --- |
| 1 | Caddyfile이 `import upstreams.caddy`, 폴더 bind, `admin localhost:2019`, `grace_period 30s` | `/slow` 진행 중 `upstreams.caddy`를 blue→green으로 바꾸고 `docker compose exec caddy caddy reload` | reload 0.16초. 직후 새 요청은 green, 진행 중이던 요청은 **blue가 200으로 끝까지 응답(5.0초)** |
| 2 | 정적 업스트림 + `lb_try_duration 15s` | 백엔드를 멈추고 3~4초 뒤 다시 띄움 | 공백 중 들어온 GET·**POST 모두 대기 후 200**(3.4~4.4초). 연결 실패는 메서드와 관계없이 재시도됨 |
| 3 | 같은 설정, 앱에 SIGTERM 핸들러 없음 | 진행 중 POST `/slow` 중에 stop | **502**. 연결 뒤 왕복 실패는 기본으로 GET만 재시도(`lb_retry_match`) |
| 4 | 같은 설정, `init: true` + `server.close()` 핸들러 | 진행 중 POST 중에 stop | **200**(진행 중 요청을 끝내고 종료) |
| 5 | `dynamic a app-dyn 3000 { refresh 1s }`, 서비스 2개(scale 2), graceful | POST 300건을 흘리며 한 컨테이너를 stop·rm | **300/300 200** |
| 6 | 5와 같고 동시 POST `/slow` 20건 | graceful과 핸들러 없음 비교 | graceful **20/20 200**, 핸들러 없음 **15×200 + 5×502** |
| 7 | 헬스체크가 항상 실패하는 컨테이너에 같은 별칭 | Caddy 컨테이너에서 `nslookup` | **unhealthy 컨테이너 IP도 Docker DNS 응답에 포함** → DNS 기반인 Caddy는 Docker health를 모름 |

## 두 버전이 동시에 도는 동안의 조건

B·C·D·E는 구·신 API가 수 초에서 수십 초 함께 돕니다. A도 공백을 메우려면 graceful shutdown이 필요합니다.

| 항목 | 저장소 현황 | 판단·조치 |
| --- | --- | --- |
| DB migration | API 기동 시 `Database.onModuleInit` → `runMigrations`(`apps/api/src/database.ts`), 세션 advisory lock으로 한 번만 적용 | 새 버전이 migration을 적용하는 동안 옛 버전이 계속 서비스하므로 **expand/contract 필수**. 롤백 때문에 이미 같은 규칙이 있음([설계 "DB migration 운영 규칙"](../specs/crelink-prod-deploy.md#db-migration-운영-규칙)). 리뷰 체크리스트로 강제 |
| 주기 작업 | `@Cron` 없음. `RetentionService`(기동 시 1회 + 24시간 `setInterval`)만 있고 트랜잭션 advisory lock으로 직렬화·멱등 | 두 인스턴스가 함께 돌아도 안전. `enableShutdownHooks` 뒤에는 `onModuleDestroy`의 clearInterval이 실행됨 |
| 세션·업로드·인메모리 상태 | 세션은 `sessions` 테이블, 업로드는 `FILE_STORAGE: s3`, API에 rate limit·캐시 Map 없음 | 무관 |
| **DB 연결 수** | `new Pool({ max: 15 })`, `DATABASE_URL` = Supavisor **세션 모드**(5432). 세션 모드는 클라이언트 수가 대시보드 "Pool Size"로 제한됨([discussion #22305](https://github.com/orgs/supabase/discussions/22305), [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI), [connection management](https://supabase.com/docs/guides/database/connection-management)) | **위험.** 겹치는 동안 최대 15×2=30개. Pool Size가 15라면(작은 compute 기본값 [추정: 대시보드 확인 필요]) 새 인스턴스의 readiness가 `max clients reached`로 실패할 수 있음. pg Pool idle 연결은 기본 10초 뒤 정리되어([node-postgres Pool](https://node-postgres.com/apis/pool)) 한가할 때는 드러나지 않음. 조치: `max`를 환경변수로 빼고 `2×max ≤ Pool Size − 여유`로 맞추거나 Pool Size를 올림 |
| API graceful shutdown | 없음 | SIGTERM → `server.close()`(새 연결 거부, idle keep-alive 닫기, [Node http](https://nodejs.org/api/http.html#serverclosecallback)) → 진행 중 요청 완료 → `app.close()`(`onModuleDestroy`) 순서가 필요. Nest 11.2의 `enableShutdownHooks()`는 `onModuleDestroy`를 HTTP 서버를 닫기 전에 실행하고 같은 신호로 다시 종료해 이 순서를 지키지 못함(티켓 0032 확인 뒤 정정, 처음 조사는 `enableShutdownHooks()`로 충분하다고 봤음). compose `stop_grace_period: 30s`(기본 10초) |
| 웹 graceful shutdown | Next standalone `server.js` | Next 문서: SIGTERM·SIGINT를 받으면 진행 중 요청과 `after()`를 마치고 종료([Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting)). 티켓 0033 실측(Next 15.5.27): SIGTERM에 새 연결 거부, 진행 중 BFF·SSR 요청 200으로 완료, 종료 코드 0. 자체 상한이 없어 Docker 유예 시간이 상한이므로 `stop_grace_period`를 명시해야 함(Docker Desktop 기본 약 3초에서는 SIGKILL로 끊김) |
| Next 버전 차이(skew) | `deploymentId` 미설정 | 전환 뒤 옛 HTML의 브라우저가 옛 chunk를 요청하면 404. 지금도 배포마다 있는 별개 문제. `deploymentId`(또는 `NEXT_DEPLOYMENT_ID`)에 이미지 SHA를 넣으면 불일치 때 hard navigation([deploymentId](https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId)). Server Actions 미사용(`'use server'` 0건) |
| Cloudflare Tunnel | 호스트 cloudflared → `127.0.0.1:18080` | 18080 리스너가 사라지지 않는 한 그대로. 원본 응답 제한 100초(524)라 Caddy 대기(`lb_try_duration`)는 30초 이하면 충분([524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/)) |

## 후보 비교

### A. Caddy 설정만으로 완화

- 조건: Caddy를 다시 만들지 않아야 합니다. Caddyfile을 고정 경로 **폴더**로 bind하고(파일 하나를 bind하면 `mv` 교체 때 옛 inode가 보임, [moby#15793](https://github.com/moby/moby/issues/15793)) `admin localhost:2019`(컨테이너 netns 안) 또는 unix 소켓으로 바꾼 뒤 `caddy reload`로 반영합니다.
- 설정: `reverse_proxy api:3000 { lb_try_duration 30s; lb_try_interval 250ms }`. 정적 업스트림 이름은 새 연결마다 Docker DNS로 다시 조회되어 재생성된 컨테이너의 새 IP로 붙습니다[실측 2]. `dynamic a`([dynamic upstreams](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#aaaaa))는 컨테이너가 하나면 이득이 없고, dynamic upstream에는 active health check가 돌지 않습니다.
- 도달 수준: Caddy를 거치는 요청은 공백 동안 **대기 후 성공**(실측 2), 진행 중 요청은 graceful이면 성공(실측 3·4). 체감은 오류 0에 가까운 **수 초 지연**[추정]. 다만 **web SSR·BFF → api 직접 호출은 공백 동안 실패**하고, 막으려면 web이 Caddy 내부 사이트를 거치게 해 홉이 하나 늘어납니다.
- 롤백: 지금과 같고 같은 공백이 생김. 새 버전이 헬스에 실패하면 구 컨테이너가 이미 없어 공백이 길어집니다.
- 작업량: 0.5~1일[추정].

### B. docker-rollout + Caddy `dynamic a`

- 동작: `docker compose up -d --scale <svc>=2N --no-recreate` → 새 컨테이너 healthy 대기 → (선택) pre-stop hook → 구 컨테이너 stop·rm. 새 컨테이너가 unhealthy면 새 것만 지우고 `exit 1`([스크립트](https://github.com/wowu/docker-rollout/blob/main/docker-rollout), bash 278줄).
- 유지보수: v0.14(2026-07-12), v0.13(2025-07), v0.12(2025-05, container draining), 별 3.3k, 메인테이너 1인 중심([releases](https://github.com/wowu/docker-rollout/releases)). Compose v5 공식 언급 없음, CLI 변경에 깨진 이력(#59)이 있어 v5.5.1 실측 필요[추정].
- 제약: 굴리는 서비스에 `container_name`·`ports`가 없어야 함(api·web은 만족). README의 draining은 Docker health를 보는 프록시(Traefik)를 전제로 하는데 Caddy는 Docker DNS를 보고 DNS는 unhealthy 컨테이너도 돌려줍니다(실측 7). 그래서 Caddy `dynamic a … { refresh 1s }` + `lb_try_duration` + 앱 graceful로 바꿔야 하며, 이 조합은 실측 5·6에서 오류 0이었습니다. 새 컨테이너는 healthy 전에도 DNS에 올라 요청을 받을 수 있습니다.
- 구조 문제: 서비스별로 굴리므로 **새 api + 옛 web**(또는 반대) 구간이 생기고 web의 `http://api:3000`이 구·신 둘 다로 갑니다. `rollback.sh`·`geoip.sh --restart`·실패 복구도 모두 rollout으로 바꿔야 합니다.
- 롤백: 헬스 실패는 자동 원복, 배포 뒤 롤백은 이전 이미지 재rollout(무중단, 부팅 시간만큼).
- 작업량: 1.5~2.5일[추정].

### C. Blue/Green(색상별 compose project) + 고정 edge Caddy

- 구조: `crelink-edge` 프로젝트(caddy만, `/opt/crelink/edge`, `127.0.0.1:18080`)와 앱 프로젝트 `crelink-blue`·`crelink-green`(같은 `compose.yaml`을 `-p`와 `CRELINK_COLOR`로 구분, 포트 없음). 공용 외부 네트워크 `crelink-edge`에 api·web을 색 별칭(`api-blue`, `web-blue` …)으로 붙이고, Caddy는 `import upstreams.caddy`의 스니펫으로 업스트림을 고릅니다. 전환은 이 파일을 원자적으로 교체한 뒤 `caddy reload`.
- graceful: `caddy reload`(`POST /load`)는 zero downtime이고 새 설정이 실패하면 옛 설정으로 돌아갑니다([admin API](https://caddyserver.com/docs/api#post-load)). 옛 서버는 grace period 동안 진행 중 요청을 마칩니다(기본 무기한, `grace_period 30s` 같은 상한 권장, [grace_period](https://caddyserver.com/docs/caddyfile/options#grace-period)). 실측 1에서 진행 중 요청이 200으로 끝남. WebSocket은 reload 때 닫히지만 크리링은 쓰지 않음.
- 즉시성: 전환은 reload 한 번(0.16초 실측). 구 색을 drain 동안 살려 두면 롤백도 reload 한 번, 멈춘 뒤라면 `up --wait` 뒤 전환(그때도 무중단).
- 주의: Compose는 서비스 이름(`api`)을 모든 네트워크에 별칭으로 붙입니다[추정]. 두 색이 같은 `crelink-edge`에 있으면 `api`가 양쪽으로 풀리므로 Caddy와 web 모두 **색 별칭만** 씁니다(`API_INTERNAL_URL: http://api-${CRELINK_COLOR}:3000`).
- 비용: 새 색 기동부터 구 색 정지까지(헬스 대기 + drain, 약 30~60초) Node 프로세스 2개분 메모리와 DB 연결 2배. 상태가 하나(활성 색) 늘어남. Caddy 이미지 업그레이드는 여전히 edge 재생성(1~2초 공백)이지만 드물고 따로 수행. 첫 전환(cutover) 때 한 번 수 초 공백.
- 작업량: 3.5~4.5일(0단계 포함)[추정].

### D. Kamal 2 (kamal-proxy)와 D′ kamal-proxy 단독

- 방식: kamal-proxy가 새 컨테이너에 헬스체크(기본 `GET /up`, 1초 간격)를 하고 통과하면 새 트래픽을 넘기며, 옛 컨테이너는 drain 뒤 정리([kamal-proxy](https://github.com/basecamp/kamal-proxy), [deploy 플래그](https://github.com/basecamp/kamal-proxy/blob/main/internal/cmd/deploy.go)). 롤백은 남겨 둔 옛 컨테이너로 `kamal rollback`([rollback](https://kamal-deploy.org/docs/commands/rollback/)). 버전 Kamal v2.12.0(2026-06-18), kamal-proxy v0.10.2(2026-10-06).
- 현 구조에 넣으면: kamal-proxy는 경로를 prefix로만 라우팅하므로 정책용 Caddy를 앞에 남겨야 하고(cloudflared → Caddy → kamal-proxy, [proxy 설정](https://kamal-deploy.org/docs/configuration/proxy/)), 설정 하나가 이미지 하나라 api·web을 앱 2개로 둡니다.
- 도입 비용: Kamal은 배포 머신(CI 러너)에서 SSH로 임의의 docker 명령을 실행해 **forced command(`ssh-entry.sh`)와 충돌**하고, 비밀값이 `.kamal/secrets`로 러너를 거쳐 **서버 복호화(SOPS) 설계와 충돌**합니다([ADR 0010](../adr/0010-prod-deployment-topology.md) 검토한 대안). `releases/`·`releases.log`·`rollback.sh`·`verify.sh`도 다시 써야 합니다. 작업량 4~6일 + 보안 설계 재검토[추정].
- D′: Kamal 없이 kamal-proxy만 edge에 두고 deploy.sh가 `kamal-proxy deploy <서비스> --target <새 컨테이너>:3000 --health-check-path /api/health/ready --drain-timeout 30s`를 부르는 방식. 헬스 게이트·drain이 내장되지만 C의 Caddy reload와 하는 일이 같고 컴포넌트만 하나 늘어남. 2.5~3.5일[추정].

### E. Docker Swarm 단일 노드 (`update_config.order: start-first`)

- 방식: 새 task를 먼저 띄우고 겹친 뒤 옛 task를 내림([compose-spec deploy](https://github.com/compose-spec/compose-spec/blob/main/deploy.md#update_config)), `failure_action: rollback`·`docker service rollback`. 서비스 VIP라 Caddy는 `api:3000` 하나만 보면 됨.
- 단점: `stack deploy`는 Compose와 지원 범위가 달라 `depends_on` 긴 문법 오류([docker/cli#3880](https://github.com/docker/cli/issues/3880)) 등 검증이 필요하고, **포트를 127.0.0.1에만 묶을 수 없어**(ingress가 0.0.0.0 공개, [moby#32299](https://github.com/moby/moby/issues/32299)) Caddy가 `CF-Connecting-IP`를 믿는 전제가 깨지므로 Caddy는 swarm 밖에 둬야 합니다. 동기 대기가 약하고, 서비스별 롤링이라 B와 같은 버전 혼재가 생기며, 운영 도구가 바뀝니다([swarm-deploy](https://docs.docker.com/guides/swarm-deploy)). 3~5일[추정].

### 비교 요약

| 방안 | 예상 다운타임 | 변경 범위 | 롤백 | 운영 부담 | 주요 위험 | 이식성 | 작업량[추정] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0단계만(graceful + `start_interval`) | 30~40초 → 십수 초 502[추정] | `main.ts`, compose | 지금과 같음 | 없음 | 502는 남음 | 높음 | 0.5일 |
| A. Caddy 재시도 | 502 ≈ 0, 수 초 지연. web→api SSR 오류는 남음 | Caddyfile, compose, `lib.sh` | 지금과 같음(공백 있음) | 낮음 | 실패 배포 시 공백이 길어짐 | 높음 | 0.5~1일 |
| B. docker-rollout + `dynamic a` | 0(실측 모형) | `lib.sh`, Caddyfile, compose, rollback·geoip·bootstrap | 실패 자동 원복, 사후 롤백은 재rollout | 중간 | 버전 혼재, 외부 스크립트, DNS 기반 | 높음 | 1.5~2.5일 |
| **C. Blue/Green + 고정 Caddy** | **0**, 전환 0.2초 미만 | edge 스택 신규, compose, `lib.sh`, 스크립트, 문서 | **reload 1회** 또는 up + reload | 낮음~중간 | 별칭 혼선, cutover 1회 공백 | 높음 | 3.5~4.5일 |
| D. Kamal 2 | 0 | 배포 체계 전체 | `kamal rollback` | 중간~높음 | forced command·비밀 모델 충돌 | 높음 | 4~6일+ |
| D′. kamal-proxy 단독 | 0 | C와 비슷 + 프록시 1개 | 재deploy | 중간 | 컴포넌트 추가 | 높음 | 2.5~3.5일 |
| E. Swarm start-first | 0[추정] | compose 재작성, 스크립트 전체 | `service rollback` | 중간 | loopback 공개 불가, 기능 차이 | 중간 | 3~5일 |

## 스택 확인

- 확인한 것: 위 로컬 실험 1~7(Caddy reload 중 진행 중 요청 완료, 재시도의 메서드별 동작, graceful 유무 차이, Docker DNS가 unhealthy 컨테이너를 돌려줌). 저장소 코드(`apps/api/src/main.ts`·`database.ts`·`retention/retention.service.ts`, 두 Dockerfile, `infra/prod/compose.yaml`·`Caddyfile`·`lib.sh`)를 읽어 원인과 동시 실행 조건을 확인.
- 확인하지 못한 것(조사 시점): 운영 Supabase Pool Size 값, Compose가 서비스 이름을 외부 네트워크 별칭으로도 붙이는지, docker-rollout의 Compose v5.5.1 동작, Swarm 단일 노드의 healthy 전 VIP 편입 여부. 실제 앱 이미지로 한 실험은 없음(모형 백엔드). 이후 확인: 웹 standalone SIGTERM 동작(티켓 0033, graceful), compose `healthcheck`에 `start_interval`을 줄 때 이미지 `test` 상속(티켓 0034, 상속되나 `start_period`도 함께 줘야 `up`이 받아들임), API 종료 순서(티켓 0032).

## 결론

- 추천: `[AI 제안]` **C. Blue/Green + 고정 edge Caddy**. api·web을 같은 버전 쌍으로 한 번에 전환해 버전 혼재가 없고, 전환·즉시 롤백이 reload 한 번이며 진행 중 요청이 끊기지 않습니다[실측 1]. 새 도구 없이 compose와 Caddy만 써 VM 이식성이 유지되고, 실패한 새 색은 트래픽을 받기 전에 버리므로 복구 경로가 단순해집니다. 그 전에 공통 전제(0단계: API graceful shutdown, healthcheck `start_interval`, DB pool 상한)를 먼저 넣습니다. 0단계는 어느 방안이든 필요하고 단독 배포만으로 공백이 줄어듭니다.
- 차선: B. 구현량은 적지만 서비스별 버전 혼재와 Caddy가 Docker health를 모르는 문제가 있습니다.
- 탈락: A(공백이 지연으로 바뀔 뿐 web→api 직접 호출과 실패 배포 공백이 남음), D(forced command·서버 복호화 설계와 충돌), D′(C와 같은 일에 컴포넌트 추가), E(loopback 공개 불가, 버전 혼재, 운영 도구 변경).
- 미정(사용자 결정 필요): 운영 Supabase Pool Size와 `DATABASE_POOL_MAX` 값(또는 Pool Size 증설), 구 색을 롤백용으로 계속 켜 둘지(서버 메모리), cutover 시각.
- 반영 위치: [ADR 0011](../adr/0011-zero-downtime-deploy.md)(제안), [에픽 0031](../work/epics/0031-zero-downtime-deploy.md).

## 출처

- Caddy: [reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)(`lb_try_duration`·`lb_retry_match`·dynamic upstreams·active/passive health), [global options](https://caddyserver.com/docs/caddyfile/options)(admin, grace_period, shutdown_delay), [admin API /load](https://caddyserver.com/docs/api#post-load), [caddy reload](https://caddyserver.com/docs/command-line#caddy-reload), [import](https://caddyserver.com/docs/caddyfile/directives/import), [v2.11.7 릴리스](https://github.com/caddyserver/caddy/releases/tag/v2.11.7)(2026-10-03)
- Compose: [reconcile.go(v5)](https://github.com/docker/compose/blob/main/pkg/compose/reconcile.go), [v5.5.1](https://github.com/docker/compose/releases/tag/v5.5.1), [compose-spec services](https://github.com/compose-spec/compose-spec/blob/main/05-services.md), [compose-spec deploy](https://github.com/compose-spec/compose-spec/blob/main/deploy.md)
- docker-rollout: [README](https://github.com/wowu/docker-rollout), [container draining](https://docker-rollout.wowu.dev/container-draining), [releases](https://github.com/wowu/docker-rollout/releases)
- Kamal: [kamal-proxy](https://github.com/basecamp/kamal-proxy), [Kamal proxy 설정](https://kamal-deploy.org/docs/configuration/proxy/), [kamal rollback](https://kamal-deploy.org/docs/commands/rollback/), [Kamal releases](https://github.com/basecamp/kamal/releases)
- Swarm: [stack deploy](https://docs.docker.com/reference/cli/docker/stack/deploy/), [docker/cli#3880](https://github.com/docker/cli/issues/3880), [moby#32299](https://github.com/moby/moby/issues/32299), [Swarm 안내](https://docs.docker.com/guides/swarm-deploy)
- 앱: [NestJS lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events), [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Next deploymentId](https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId), [Node http server.close](https://nodejs.org/api/http.html#serverclosecallback), [node-postgres Pool](https://node-postgres.com/apis/pool)
- DB: [Supabase connection management](https://supabase.com/docs/guides/database/connection-management), [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI), [discussion #22305](https://github.com/orgs/supabase/discussions/22305)
- 기타: [moby#15793 파일 bind inode](https://github.com/moby/moby/issues/15793), [Cloudflare 524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/)
