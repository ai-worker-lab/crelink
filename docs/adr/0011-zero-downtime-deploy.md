# ADR 0011: 운영 배포 무중단 방식(고정 edge Caddy + Blue/Green 앱 스택)

- 날짜: 2026-10-07
- 상태: 제안 (계획 단계. 구현·운영 검증 전이며 `승인`은 사용자 확인 후)
- 범위: 운영 배포·롤백·GeoIP 재시작의 전환 방식(`infra/prod/`의 compose·Caddyfile·`lib.sh`·`deploy.sh`·`rollback.sh`·`geoip.sh`·`bootstrap.sh`·시험), API·웹의 종료 동작(`apps/api/src/main.ts`·`database.ts`, `apps/web` standalone 서버)
- 관계: [ADR 0010](0010-prod-deployment-topology.md)의 배치·공개 경로·CI 접속·비밀값·릴리스 단위는 그대로 두고, 검토한 대안 "Kamal 2"의 "무중단 배포가 필요해질 때 … 후보로 둡니다"를 이 결정이 대체합니다.

## 배경

- 운영은 배포 대상 서버 1대(`home-server`)의 Compose project `crelink-prod`(caddy·api·web)이고 Cloudflare Tunnel이 `127.0.0.1:18080`으로 보냅니다([운영 배포 설계](../specs/crelink-prod-deploy.md)). 배포·롤백은 새 릴리스 폴더에서 `docker compose up -d --wait`를 실행합니다.
- 운영에서 배포 때마다 약 30~40초 502가 납니다(사용자 관측). 단축 주소는 인스타그램 등에 걸려 있어 공백이 곧 이동 실패이고, main 병합마다 자동 배포되므로 실서비스에서 치명적입니다.
- 원인(저장소 확인, 세부는 [조사 문서](../references/zero-downtime-deploy.md#지금-502가-나는-이유-저장소-확인)):
  1. **Caddy 재생성**: Caddyfile bind 원본이 릴리스 폴더 경로라 배포마다 설정 해시가 바뀌어 caddy 컨테이너를 다시 만들고, `admin off`라 reload로 바꿀 수도 없습니다. 18080이 잠깐 사라지면 cloudflared가 502를 냅니다.
  2. **api·web 정지 후 시작**: Compose 재생성은 기존 컨테이너를 멈춘 뒤 새 것을 띄우고, 서비스당 컨테이너가 1개라 부팅·migration 확인·첫 헬스 통과까지 비어 있습니다. web→api 호출(`http://api:3000`)은 Caddy를 거치지 않아 재시도로도 보호되지 않습니다.
  3. **늦은 헬스 판정**: 이미지 HEALTHCHECK `--interval=10s`(start-period api 30초·web 20초)이고 `start_interval`이 없어 준비된 뒤에도 최대 약 10초 더 기다립니다.
  4. **API 즉시 종료**: `main.ts`에 `enableShutdownHooks()`가 없어 SIGTERM에 진행 중 요청이 끊기고 `onModuleDestroy`(pool 종료·주기 작업 정리)가 돌지 않습니다.
- 로컬 실험(2026-10-07, Docker 29.8.1·Compose v5.5.1·`caddy:2.11.7-alpine`·모형 Node 백엔드): Caddy `import`한 업스트림 파일을 바꾸고 `caddy reload`하면 0.16초에 끝나고 진행 중이던 5초 요청은 옛 업스트림에서 200으로 끝났습니다. SIGTERM 핸들러가 없는 백엔드는 정지 중 진행 중 POST가 502(동시 20건 중 5건), `server.close()` graceful이면 20/20 200이었습니다. Docker DNS는 unhealthy 컨테이너 IP도 돌려줘 DNS 기반 Caddy는 Docker health를 모릅니다.
- 구·신 API가 동시에 돌 때: migration은 세션 advisory lock으로 한 번만 적용되고, 유일한 주기 작업(보존 작업)은 트랜잭션 advisory lock으로 직렬화·멱등이라 안전합니다. 세션은 DB, 업로드는 S3라 인메모리 상태가 없습니다. 위험은 DB 연결 수입니다: pool `max: 15`이고 `DATABASE_URL`은 Supavisor 세션 모드(클라이언트 수 = 대시보드 Pool Size 상한)라 겹치는 동안 최대 30개가 됩니다.

## 결정

1. **0단계(선행, 단독 배포)**: 어느 전환 방식이든 필요한 공통 전제를 먼저 넣습니다.
   - API `app.enableShutdownHooks()`로 SIGTERM 때 새 연결을 거부하고 진행 중 요청을 마친 뒤 pool을 닫습니다.
   - 웹 standalone 서버의 SIGTERM 동작을 실측하고, 진행 중 요청을 끊으면 Next 문서의 수동 신호 처리로 고칩니다.
   - compose api·web에 `stop_grace_period: 30s`와 healthcheck `start_interval: 1s`.
   - API pool 상한을 환경변수 `DATABASE_POOL_MAX`(기본 15)로 빼고 운영값은 `2 × DATABASE_POOL_MAX ≤ Supabase Pool Size − 여유(관리 접속·migration 도구용, 최소 2)`로 정합니다. 맞출 수 없으면 Pool Size를 올립니다.
2. **고정 edge Caddy**: Caddy를 앱 스택에서 떼어 `crelink-edge` project(고정 폴더 `/opt/crelink/edge`, `127.0.0.1:18080`)로 두고 배포 때 다시 만들지 않습니다. admin은 컨테이너 안(`localhost:2019` 또는 unix 소켓)에서만 열고 `grace_period 30s`를 둡니다. 설정은 폴더 bind의 파일을 원자적으로 바꾼 뒤 `caddy validate` → `caddy reload`로 반영합니다.
3. **Blue/Green 앱 스택**: api·web은 같은 `compose.yaml`을 색별 project(`crelink-blue`·`crelink-green`, `CRELINK_COLOR`)로 띄우고, 공용 외부 네트워크 `crelink-edge`에 **색 별칭만**(`api-<색>`, `web-<색>`) 노출합니다. web의 서버 측 API 주소도 같은 색 별칭(`http://api-<색>:3000`)이라 api·web이 항상 같은 버전 쌍으로 묶입니다.
4. **전환 흐름**: 비활성 색에 새 릴리스를 `up --wait` → edge에서 새 색 내부 헬스 확인 → Caddy 업스트림 파일 교체·reload(전환) → 활성 색 상태·`current`·`releases.log` 갱신 → drain(기본 20초) 뒤 구 색 `stop`(컨테이너는 남김). 새 색이 헬스에 실패하면 그 색만 내리고 실패로 끝나며 **활성 색과 트래픽은 바뀌지 않습니다**. 롤백·`geoip.sh --restart`도 같은 함수로 반대 색에 올립니다. `deploy.sh`·`rollback.sh`·`ssh-entry.sh`의 외부 인터페이스(인자·종료 코드·마지막 줄)와 `releases.log`·`verify.sh`는 유지합니다.
5. **검증 기준**: 로컬 시험과 운영 검증에서 부하를 흘리며 배포·롤백을 각 2회 했을 때 5xx·연결 오류 0건, p99 지연이 평시 + 1초 이내, 배포 직전에 시작한 5초 이상 요청 완료, 실패 배포 시 활성 색 불변이어야 합니다.

## 검토한 대안

비교 표와 근거는 [조사 문서](../references/zero-downtime-deploy.md#후보-비교)에 있습니다.

- **A. Caddy 재시도만(`lb_try_duration`, Caddy 재생성 제거)**: 0.5~1일로 싸고 Caddy를 거치는 요청은 공백 동안 대기 후 성공합니다(실측). 그러나 공백이 수 초 지연으로 바뀔 뿐이고, web→api 직접 호출은 공백 동안 실패하며(막으려면 web이 Caddy를 거치게 해 홉 추가), 새 버전이 헬스에 실패하면 구 컨테이너가 이미 없어 공백이 길어집니다. 롤백도 같은 공백이 남습니다. 기각. 다만 edge Caddy의 `lb_try_duration 10s`는 C에서 안전망으로 씁니다.
- **B. docker-rollout + Caddy `dynamic a`**: 1.5~2.5일, 실측 모형에서 오류 0. 하지만 서비스별로 굴려 새 api + 옛 web(또는 반대) 구간이 생기고 rollout 중 `http://api:3000`이 구·신 양쪽으로 갑니다. Caddy는 Docker health를 몰라 DNS refresh·재시도에 기대야 하고, 외부 bash 스크립트(1인 유지, Compose v5 미언급, CLI 변경에 깨진 이력)에 배포가 묶입니다. 차선으로 기각.
- **D. Kamal 2**: 무중단·롤백이 내장이지만 CI 러너가 SSH로 임의 docker 명령을 실행해 forced command와 충돌하고, 비밀값이 러너를 거쳐 서버 복호화(ADR 0010 결정 5)와 충돌하며, 릴리스·롤백·검사 체계를 다시 써야 합니다(4~6일 + 보안 재설계). kamal-proxy는 prefix 라우팅만 해 정책용 Caddy도 남아야 합니다. 기각.
- **D′. kamal-proxy 단독(edge에 두고 deploy.sh가 `kamal-proxy deploy` 호출)**: 헬스 게이트·drain이 내장되지만 C의 Caddy reload와 하는 일이 같고 프록시 컴포넌트·학습 대상만 늘어납니다. 기각.
- **E. Docker Swarm 단일 노드(`start-first`)**: 롤링·자동 롤백이 내장이지만 published 포트를 127.0.0.1에만 묶을 수 없어(`CF-Connecting-IP` 신뢰 전제가 깨짐) Caddy를 swarm 밖에 둬야 하고, `stack deploy`가 Compose 기능 일부를 지원하지 않으며, 서비스별 롤링이라 B와 같은 버전 혼재가 있고 운영 도구가 바뀝니다(3~5일). 기각.
- **0단계만**: 공백이 십수 초로 줄 것으로 보지만[추정] 502가 남습니다. 단독 결정이 아니라 C의 선행 단계로 둡니다.

## 결과와 트레이드오프

- **리소스 2배 구간**: 새 색 기동부터 구 색 정지까지(헬스 대기 + drain, 약 30~60초) Node 프로세스 2벌의 메모리가 필요합니다. 구 색을 롤백 대기용으로 계속 켜 두면 상시 2배이므로 기본은 drain 뒤 `stop`(컨테이너 유지)이고, 켜 둘지는 서버 메모리를 보고 따로 정합니다.
- **DB 연결**: 겹치는 동안 연결이 최대 `2 × DATABASE_POOL_MAX`입니다. Supabase Pool Size를 넘으면 새 색의 readiness가 실패해 배포가 실패로 끝납니다(트래픽 영향은 없음). Pool Size나 compute를 바꿀 때 이 식을 다시 확인합니다.
- **상태 1개 추가**: 서버에 활성 색(`state/active-color`)이 생깁니다. 활성 색·`current`·`releases.log`가 어긋나지 않게 갱신 순서를 스크립트가 지키고, 운영자는 런북의 색 확인·수동 전환 절차를 씁니다. Compose project가 `crelink-prod`에서 `crelink-edge`·`crelink-blue`·`crelink-green`으로 바뀌어 컨테이너 이름·로그 명령이 바뀝니다(GeoIP 볼륨은 기존 이름을 외부 볼륨으로 이어 씀).
- **두 버전 동시 실행 제약**: 전환 직전까지 구 색이 새 스키마 위에서 서비스하므로 DB 변경은 **expand/contract**(호환 변경 먼저, 제거는 다음 배포)가 필수입니다. 롤백 때문에 이미 있던 규칙([설계 "DB migration 운영 규칙"](../specs/crelink-prod-deploy.md#db-migration-운영-규칙))이 배포마다 실제로 적용되는 조건이 됩니다. 웹은 전환 뒤 옛 HTML의 브라우저가 옛 chunk를 요청할 수 있어(지금도 있는 문제) `deploymentId`를 선택 항목으로 둡니다.
- **cutover 1회 공백**: `crelink-prod`(스택 안 Caddy)에서 `crelink-edge` + 색 스택으로 처음 옮길 때 18080을 쥔 Caddy를 바꾸는 수 초 공백이 한 번 생깁니다[추정]. 트래픽이 적은 시각에 알리고 하며, 되돌리기 절차(옛 `crelink-prod` 재기동)를 먼저 준비합니다.
- **남는 공백**: Caddy 이미지 업그레이드와 edge 설정 중 reload로 반영할 수 없는 변경(포트·마운트)은 edge 재생성(1~2초)이 필요하므로 드물게 따로 수행합니다. 서버·회선 장애(단일 장애점)는 이 결정의 범위 밖입니다.
- **이식성 유지**: compose와 Caddy만 쓰므로 OCI·AWS VM에서도 `bootstrap.sh`(네트워크·edge 폴더 준비)만 같으면 같은 절차입니다.
