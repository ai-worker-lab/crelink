# 0035 운영 Blue/Green 전환: 고정 edge Caddy와 색상별 앱 스택

- 단계: 티켓
- 역할: infra
- 상위: 0031
- 선행: 0033, 0034
- 상태: 분류 대기
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

배포·롤백·GeoIP 재시작의 502를 없앱니다. 지금은 Caddyfile bind 원본이 릴리스 폴더 경로라 배포마다 caddy를 다시 만들고(`admin off`라 reload 불가), api·web은 서비스당 1개를 멈춘 뒤 새로 띄웁니다. [ADR 0011](../../adr/0011-zero-downtime-deploy.md) 결정 2~4대로 Caddy를 배포와 무관한 edge 스택으로 떼고, api·web을 색(blue·green) 단위로 비활성 색에 먼저 올린 뒤 Caddy reload로 전환합니다. 로컬 모형 실험에서 reload는 0.16초였고 진행 중이던 5초 요청은 옛 업스트림에서 200으로 끝났습니다([조사](../../references/zero-downtime-deploy.md#로컬-실험-실측)).

## 수용 기준

### edge 스택

- [ ] `infra/prod/edge/compose.yaml`(신규): `name: crelink-edge`, caddy 하나(지금의 이미지 `caddy:2.11.7-alpine`·`read_only`·`cap_drop`·`no-new-privileges`·`127.0.0.1:${CRELINK_HTTP_PORT:-18080}:80`·`:2020/healthz` 헬스 유지), 설정은 고정 **폴더** bind `/opt/crelink/edge/conf:/etc/caddy:ro`(파일 하나 bind는 `mv` 교체 때 옛 inode가 보임), 외부 네트워크 `crelink-edge`.
- [ ] `infra/prod/Caddyfile`: `admin`을 컨테이너 안에서만(`localhost:2019` 또는 tmpfs unix 소켓) 열고, `grace_period 30s`, 맨 위 `import upstreams.caddy`, 세 `reverse_proxy`를 블록형(`import api_upstream`·`import web_upstream`, 기존 `header_up` 유지, 안전망 `lb_try_duration 10s`)으로 바꾼다. 공개 정책(`go` 호스트는 `GET /{slug}`·`/c/{id}`만, `links` 전부 web, 본문 6MB, `CF-Connecting-IP` 처리)은 그대로다.
- [ ] `infra/prod/bootstrap.sh`: `docker network create crelink-edge`(멱등), `/opt/crelink/edge/conf`(deploy 소유) 생성. 다시 실행해도 같은 결과.

### 색상별 앱 스택

- [ ] `infra/prod/compose.yaml`에서 caddy 서비스와 `name:`을 빼고, api·web을 `default` + `crelink-edge` 네트워크에 붙여 별칭 `api-${CRELINK_COLOR:?}`·`web-${CRELINK_COLOR:?}`만 쓴다. web `API_INTERNAL_URL: http://api-${CRELINK_COLOR}:3000`. Caddy·web 어디서도 색 없는 `api`·`web` 이름을 쓰지 않는다(두 색이 같은 네트워크에 있어 양쪽으로 풀림).
- [ ] `volumes.geoip`를 `external: true`, `name: crelink-prod_geoip`로 두어 기존 GeoIP 데이터를 두 색이 같이 쓴다(bootstrap이나 cutover가 없으면 만듦).
- [ ] 0034의 `stop_grace_period`·`start_interval`·`DATABASE_POOL_MAX`는 유지한다.

### 전환 흐름 (`lib.sh`, `deploy.sh`, `rollback.sh`, `geoip.sh`)

- [ ] `bring_up`·전환 함수가 다음 순서를 지킨다. ① `state/active-color`에서 활성 색, 반대 색을 다음 색으로 ② 복호화 후 `docker compose -p crelink-<다음 색> up -d --wait --wait-timeout 120` ③ 실패면 그 색만 `down`하고 반환 1(**활성 색·`current`·`images.env`·트래픽 불변**, 지금의 "직전 릴리스 재기동" 복구가 필요 없음) ④ edge 컨테이너 안에서 `http://api-<다음 색>:3000/api/health/ready`·`http://web-<다음 색>:3000/privacy` 확인 ⑤ 릴리스의 Caddyfile과 새 `upstreams.caddy`를 `conf/*.next`에 쓰고 edge 안에서 `caddy validate` → `mv` → `caddy reload`, 실패하면 이전 파일로 되돌리고 반환 1 ⑥ `state/active-color`·`current`·`images.env`·`releases.log` 갱신 ⑦ `sleep ${CRELINK_DRAIN_SECONDS:-20}` 뒤 이전 색 `stop -t 30`(컨테이너 유지) ⑧ app.env 삭제.
- [ ] `deploy.sh`·`rollback.sh`·`ssh-entry.sh`의 외부 인터페이스(인자, 종료 코드 0/1/2, 마지막 줄 `<릴리스> <API 이미지> <웹 이미지>`), `releases.log` 형식, `verify.sh`는 바뀌지 않는다. `ssh-entry.sh status`는 활성 색을 함께 보여 준다(바꾸면 서버에서 `bootstrap.sh` 재실행 필요를 런북에 적음).
- [ ] `rollback.sh`는 이전 릴리스를 같은 함수로 비활성 색에 올린다(무중단). blue/green 이전 형식의 릴리스(compose에 caddy가 있거나 `name: crelink-prod`)로는 롤백을 거부하고 아무것도 바꾸지 않은 채 종료 1, 런북의 cutover 되돌리기 절차를 안내한다.
- [ ] `geoip.sh --restart`는 컨테이너 재시작 대신 지금 릴리스를 반대 색으로 다시 올린다(공백 없음).
- [ ] edge가 준비되지 않은 서버(네트워크·`/opt/crelink/edge` 또는 활성 색 상태 없음)에서 `deploy.sh`는 아무것도 바꾸지 않고 종료 1, 런북 cutover 절을 안내한다. cutover 자체를 자동으로 하지 않는다.

### 시험

- [ ] `infra/prod/tests/zero-downtime.sh`(신규): 로컬 Docker에 edge + 두 색을 띄우고 더미 또는 실제 이미지로 초당 20건 이상 부하(GET 웹·POST API, 5초 이상 걸리는 요청 포함)를 흘리며 배포 2회·롤백 2회를 해 **2xx·3xx가 아닌 응답과 연결 오류 0건**, 긴 요청 완료, 끝난 뒤 구 색 stopped를 단언한다. 끝나면 컨테이너·네트워크·볼륨·임시 폴더를 지운다.
- [ ] `infra/prod/tests/deploy-rollback.sh`를 색 전환에 맞게 고친다: 헬스 실패 배포는 활성 색·`current`·트래픽 불변 + 종료 1, 롤백은 색 전환, blue/green 이전 릴리스로의 롤백 거부, `releases.log` 형식 유지.
- [ ] `infra/prod/tests/caddy-routing.sh`가 업스트림 스니펫을 포함한 새 Caddyfile로 기존 공개 정책 단언을 모두 통과한다.
- [ ] `config --quiet`(edge·앱 compose 각각, `CRELINK_COLOR` 지정), `bash -n`·`shellcheck`, `infra/prod/tests/*.sh` 통과.

### 문서

- [ ] `infra/docs/prod-runbook.md`: 값 표(project·컨테이너 이름·`state/active-color`·edge 폴더), 활성 색 확인, 수동 전환·되돌리기, edge 설정 갱신·Caddy 이미지 업그레이드(edge 재생성 1~2초 공백, 트래픽 적은 시각), **cutover 절**(0036이 실행: 사전 pull·`crelink-blue` 선기동·`crelink-prod` caddy 정지·edge 기동·`crelink-prod` api·web `down`(볼륨 유지)·`active-color=blue`, 되돌리기 = edge 정지 후 옛 `crelink-prod` 릴리스로 `up`), 장애 대응(11) 갱신.
- [ ] `infra/prod/README.md`(파일 목록·문법 확인 명령), `infra/CHANGELOGS.md`. 설계 문서 `docs/specs/crelink-prod-deploy.md`의 구성·서버 배치·"릴리스·배포·롤백"·이식 규칙 7 갱신과 ADR 0011 상태 변경은 `docs/` 소유라 0036에 인계한다(진행 기록).

## 범위

- 포함: `infra/prod/{compose.yaml,Caddyfile,edge/compose.yaml,lib.sh,deploy.sh,rollback.sh,geoip.sh,bootstrap.sh,ssh-entry.sh,README.md}`, `infra/prod/tests/*.sh`, `infra/docs/prod-runbook.md`, `infra/CHANGELOGS.md`.
- 제외: 운영 서버 적용·cutover·부하 검증(0036), 앱 코드(0032·0033), `.github/workflows/`(인터페이스가 같아 변경 없음 예상. 필요하면 0036에 인계), `docs/specs/`·`docs/adr/` 갱신(0036).

## 위험·복구

- **main 병합 = 서버 실행**: 이 티켓이 병합되면 다음 자동 배포가 새 스크립트를 실행합니다. edge가 준비되지 않은 서버에서는 아무것도 바꾸지 않고 실패하게 해(수용 기준) 운영 중인 `crelink-prod`를 건드리지 않습니다. 워크플로의 `자동 롤백` 단계는 운영 주소 검사가 실패했을 때만 돌므로(`.github/workflows/deploy.yml`) 배포 단계 실패로는 실행되지 않고 job만 실패합니다. 그래도 병합과 cutover는 0036에서 같은 운영 창에 둡니다.
- **별칭 혼선**: 색 없는 `api`·`web` 이름을 쓰면 요청이 구·신 색으로 섞입니다. 시험에서 Caddy·web이 색 별칭만 쓰는지 단언합니다.
- **DB 연결 2배**: 겹치는 30~60초 동안 연결이 `2 × DATABASE_POOL_MAX`입니다(0034에서 맞춤). 넘으면 새 색이 readiness 실패 → 배포 실패(트래픽 영향 없음).
- **메모리 2배 구간**: 같은 구간 Node 프로세스 2벌. 구 색은 기본 `stop`이고 상시 켜 두지 않습니다(사용자 결정 전).
- **이전 형식 릴리스**: blue/green 이전 릴리스로의 롤백은 포트·project 충돌이 나므로 스크립트가 거부하고, 되돌리기는 런북 cutover 되돌리기 절차로만 합니다.
- 되돌리기(cutover 전): 이 커밋을 되돌려 병합. cutover 뒤: 런북 cutover 되돌리기.

## 연결

- 에픽: [0031 운영 무중단 배포](../epics/0031-zero-downtime-deploy.md)
- 결정: [ADR 0011](../../adr/0011-zero-downtime-deploy.md) 결정 2~5, 바탕 [ADR 0010](../../adr/0010-prod-deployment-topology.md)
- 조사: [C. Blue/Green + 고정 edge Caddy](../../references/zero-downtime-deploy.md#c-bluegreen색상별-compose-project--고정-edge-caddy), [로컬 실험](../../references/zero-downtime-deploy.md#로컬-실험-실측)
- 설계·절차: [운영 배포 설계](../../specs/crelink-prod-deploy.md), [prod 런북](../../../infra/docs/prod-runbook.md)
- 외부: [Caddy admin API `/load`(zero downtime, 실패 시 옛 설정 유지)](https://caddyserver.com/docs/api#post-load), [`grace_period`](https://caddyserver.com/docs/caddyfile/options#grace-period), [`import`](https://caddyserver.com/docs/caddyfile/directives/import), [reverse_proxy `lb_try_duration`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [moby#15793](https://github.com/moby/moby/issues/15793)

## 진행 기록

- 2026-10-07: 생성(에픽 0031 계획). 선행 0033(웹 종료 동작), 0034(0단계 compose·pool 운영값). 조사의 추정 작업량: edge·색상화·스크립트 2일, 시험 0.5~1일, 문서 0.5일. 확인 필요[추정]: Compose가 서비스 이름을 외부 네트워크에도 별칭으로 붙이는지(색 별칭만 쓰는 규칙으로 회피).
