# 운영 환경

운영 스택(고정 edge Caddy + 색(blue·green)별 api·web, [ADR 0011](../../docs/adr/0011-zero-downtime-deploy.md))과 배포·롤백 스크립트입니다. 모든 배포 대상(지금 `home-server`)이 이 폴더를 그대로 씁니다. 설계 기준은 [운영 배포·CD 기술 설계](../../docs/specs/crelink-prod-deploy.md)와 [ADR 0010](../../docs/adr/0010-prod-deployment-topology.md), 사람이 따라 하는 절차는 [prod 런북](../docs/prod-runbook.md)입니다. 대상별 적용 상태는 운영 work item 진행 기록에 남깁니다.

## 파일

CD 워크플로(`.github/workflows/deploy.yml`)는 이 폴더에서 `tests/`·`README.md`·`*.example`·`.env`를 뺀 묶음을 서버 `/opt/crelink/releases/<SHA>/`에 풀고 그 안의 `deploy.sh`를 실행합니다(릴리스).

| 파일 | 내용 |
| --- | --- |
| `compose.yaml` | 앱 스택 한 벌(한 색): `api`(`${API_IMAGE}`, `FILE_STORAGE=s3` 고정(업로드는 S3, 볼륨 없음), 볼륨 geoip(ro)·`./certs`(ro), `env_file` = 복호화한 `/run/crelink/app.env`), `web`(`${WEB_IMAGE}`, `API_INTERNAL_URL=http://api-${CRELINK_COLOR}:3000`), 도구 프로필 `geoip-writer`. `name:`이 없고 `lib.sh`가 `-p crelink-<색>`·`CRELINK_COLOR`로 띄움. 호스트 포트 없음. api·web은 `default` + 외부 네트워크 `crelink-edge`(색 별칭 `api-<색>`·`web-<색>`만 씀), 볼륨 geoip는 외부 `crelink-prod_geoip`(두 색 공유). 헬스체크는 각 이미지의 `HEALTHCHECK`를 물려받고 `start_period`(이미지와 같은 값)·`start_interval: 1s`만 덧씀. api·web `stop_grace_period: 30s` |
| `edge/compose.yaml` | edge 스택 `crelink-edge`: `caddy`(`caddy:2.11.7-alpine`, 호스트 `127.0.0.1:${CRELINK_HTTP_PORT:-18080}`만, 읽기 전용, 설정은 폴더 bind `/opt/crelink/edge/conf:/etc/caddy:ro`, 네트워크 `crelink-edge`). 배포와 무관하게 계속 떠 있고 서버에서는 `cutover.sh`가 `/opt/crelink/edge/compose.yaml`로 복사한 것을 씀 |
| `Caddyfile` | 공개 정책: `go.shaul.kr`은 `GET /{slug}`·`GET /c/{id}`만 api, 나머지 404. `links.shaul.kr`은 전부 web(본문 6MB). `CF-Connecting-IP`(사설 대역에서 온 것만)를 방문자 IP로 `X-Forwarded-For`에 넣음. 업스트림은 같은 폴더 `upstreams.caddy`의 스니펫(`api_upstream`·`web_upstream`, 활성 색, `lib.sh`가 씀)이고 `lb_try_duration 10s`, 업스트림 keep-alive 4초(Node 5초보다 짧게). 관리 API는 컨테이너 안 `localhost:2019`만, `grace_period 30s` |
| `targets.json` | 배포 대상 목록(`name`·`host`(Tailscale MagicDNS)·`platform`·`enabled`). 워크플로가 대상 matrix와 이미지 플랫폼을 여기서 정함 |
| `secrets/<대상>.sops.env` | 대상별 앱 설정·비밀값(SOPS + age 암호문, 비밀이 아닌 키는 평문). 규칙은 루트 `.sops.yaml` |
| `certs/supabase-ca.crt` | Supabase 루트 CA(공개 인증서) |
| `images.env.example` | 서버 `state/images.env` 형식(`API_IMAGE`·`WEB_IMAGE`). compose 문법 확인용 |
| `ssh-entry.sh` | `deploy` 사용자의 SSH forced command(`deploy`·`rollback`·`status`·`verify`). `bootstrap.sh`가 `/usr/local/lib/crelink/`에 설치하며 워크플로로는 바뀌지 않음 |
| `verify.sh` | 운영 주소 검사(서버에서 Cloudflare를 거쳐 공개 주소 6개). 주소는 릴리스 암호문의 평문 `WEB_URL`·`SHORT_LINK_BASE_URL`. 워크플로가 `ssh deploy@<host> verify`로 부름 |
| `measure-gap.sh` | 배포 공백 측정(bash·curl): 스택 입구에 Host별 요청을 일정 간격으로 보내 실패(5xx·응답 없음) 수와 최장 연속 실패 구간을 출력. 서버에서는 `/opt/crelink/current/measure-gap.sh`, 로컬에서는 `-- <명령>`으로 배포 명령을 감쌈. 사용법은 머리말, 절차는 런북 "6-1. 배포 공백 측정" |
| `deploy.sh` | `releases/<SHA>/deploy.sh <릴리스 SHA> <API SHA\|-> <웹 SHA\|->`: 복호화·문법 확인 → 이미지 pull → edge 준비 확인(없으면 무변경 종료 1) → `lib.sh switch_color`(비활성 색 `up --wait` → edge 안 헬스 → Caddy 업스트림 교체·validate·reload → 상태·`releases.log` → drain 뒤 옛 색 정지) → 성공 시 최근 5개 외 릴리스 정리. 새 색이 실패하면 그 색만 내리고 무변경 종료 1 |
| `rollback.sh` | `rollback.sh [릴리스 SHA]`: 기본은 `releases.log`에서 지금 릴리스를 배포한 마지막 `deploy` 줄의 이전 릴리스. 그 릴리스의 설정·비밀값·이미지 전체를 같은 `switch_color`로 반대 색에 올림(무중단). blue/green 이전 형식 릴리스는 거부 |
| `cutover.sh` | blue/green 이전 단일 스택(`crelink-prod`)에서 edge + `crelink-blue`로 한 번 옮기기와 되돌리기(`--revert`). 사전 점검·`--dry-run`·멱등·자동 원복. 새 서버의 첫 기동에도 씀. 서버에서 운영자가 직접 실행(런북 14) |
| `geoip.sh` | `geoip.sh [--restart]`: DB-IP City Lite(`scripts/geoip.mjs`와 같은 월 후보 규칙)를 `geoip` 볼륨에 넣음. `--restart`는 지금 릴리스를 반대 색으로 다시 올려 전환(무중단) |
| `lib.sh` | 공용 함수(단독 실행 안 함). 서버 배치·상태 파일(`state/active-color`)·환경변수·전환 순서는 머리말 |
| `bootstrap.sh` | 서버 초기 설정(한 번, root, Ubuntu amd64·arm64): 패키지·sops·Docker, `deploy` 사용자·forced command, `/opt/crelink`(edge 폴더 포함), 네트워크 `crelink-edge`·볼륨 `crelink-prod_geoip`, `/run/crelink` tmpfiles, `/etc/crelink`(대상 이름·age 키), 선택 cloudflared. 방화벽은 건드리지 않음 |
| `tests/` | 로컬 Docker 시험(아래). 서버에 보내지 않음 |

`deploy.sh`·`rollback.sh` 종료 코드: 0 성공(마지막 줄 `<릴리스> <API 이미지> <웹 이미지>`), 1 실패(아무것도 바꾸지 않음: 활성 색·`current`·`images.env`·트래픽 그대로), 2 edge 설정을 되돌리지 못함.

## 문법 확인

```bash
for c in blue green; do CRELINK_COLOR=$c CRELINK_APP_ENV=/dev/null docker compose -f infra/prod/compose.yaml --env-file infra/prod/images.env.example config --quiet; done
docker compose -f infra/prod/edge/compose.yaml config --quiet
bash -n infra/prod/*.sh infra/prod/tests/*.sh infra/prod/tests/lib/*.sh && shellcheck -x infra/prod/*.sh infra/prod/tests/*.sh infra/prod/tests/lib/*.sh
```

앱 compose는 `--env-file` 없이 실행하면 `API_IMAGE`·`WEB_IMAGE`가, `CRELINK_COLOR`가 없으면 색 별칭이 비어 일부러 실패합니다. `CRELINK_APP_ENV`를 주지 않으면 서버의 `/run/crelink/app.env`를 찾습니다. 외부 네트워크·볼륨이 없어도 `config`는 통과합니다(`up`에서 실패).

`config`는 `healthcheck.start_interval`에 `start_period`가 함께 있어야 한다는 Compose 검사를 하지 않습니다(`up`에서야 실패). 헬스체크를 바꾸면 실제 기동까지 하는 `tests/deploy-rollback.sh`를 돌립니다.

## 로컬 시험

필요 도구: `caddy-routing.sh`는 Docker·curl, 나머지는 Docker·sops·age·curl·openssl(`deploy-rollback.sh`·`cutover-rehearsal.sh`는 git도, 옛 형식 릴리스를 `git archive 433dc88`로 꺼냄). 원격 서버·DNS·실제 키·레지스트리 자격 증명은 쓰지 않으며, 끝나면(실패해도) 만든 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. project·네트워크·볼륨 이름은 실행마다 격리하므로 실행 중인 `make up` 인스턴스와 `infra/local` Compose는 건드리지 않습니다. 공용 도구(서버 폴더 흉내·더미 api·web 이미지·릴리스 묶음·상태 비교)는 `tests/lib/harness.sh`입니다.

| 명령(저장소 루트) | 확인하는 것 |
| --- | --- |
| `infra/prod/tests/caddy-routing.sh` | 실제 `caddy` 이미지에 서버와 같은 설정 폴더(저장소 `Caddyfile` + `upstreams.caddy`)를 붙이고 색 별칭 스텁으로 curl: 공개 정책(단축·클릭·404·웹 전달·본문 한도), 방문자 IP(사설 대역 `CF-Connecting-IP` 신뢰, 그 밖은 무시), 관리 API가 컨테이너 안에서만 열림, 색 없는 업스트림 이름 없음, `upstreams.caddy` 교체 + `caddy reload`로 blue→green 전환(컨테이너 재시작 없음) |
| `infra/prod/tests/deploy-rollback.sh` | htpasswd 인증 로컬 레지스트리의 더미 이미지와 임시 age 키로 암호화한 시험용 비밀값으로 `ssh-entry.sh`를 직접 실행(sshd 불필요): 허용 안 된 명령 거부, 첫 배포 SHA 필수, edge 없는 서버의 deploy 무변경 거부 → `cutover.sh`로 edge·blue, api·web 헬스체크가 이미지 `HEALTHCHECK`를 물려받고 compose `start_period`·`start_interval`·`stop_grace_period`가 적용됨, web만 교체(green), 헬스 실패 시 활성 색·`current`·트래픽 불변 + 실패한 색만 내림, 없는 이미지·복호화 불가 시 무변경, 연속 rollback이 한 단계씩 색을 바꿈, `rollback <SHA>`, blue/green 이전 릴리스로의 롤백 거부, 토큰이 있을 때만 로그인 후 로그아웃, 오래된 릴리스 정리, 평문 비밀값 미잔류, `status`의 색, `releases.log` 형식·순서 |
| `infra/prod/tests/zero-downtime.sh` | edge + 두 색에 keep-alive 부하(초당 약 22건: GET 웹·GET 단축·POST BFF(web→api)·6초 긴 요청)를 흘리며 배포 2회·롤백 2회·`geoip.sh --restart`: 2xx·3xx가 아닌 응답·연결 오류 0, 긴 요청 모두 완료, p99 ≤ 평시 + 1초, web→api가 같은 색 안에서만, 끝난 뒤 옛 색 stopped·edge 재생성 없음 |
| `infra/prod/tests/cutover-rehearsal.sh` | 운영 릴리스 `433dc88`의 옛 구조(`crelink-prod`)를 그 커밋의 `deploy.sh`로 띄운 뒤 `measure-gap.sh`로 재면서 cutover(`--dry-run` 무변경 → 실행 → 멱등) → 옛 형식 롤백 거부 → cutover 뒤 첫 배포 무중단 → 되돌리기(`--revert`) → 다시 cutover. 공백·상태(GeoIP 볼륨 이어 씀, 옛 스택 삭제·복귀)를 확인하고 수치를 출력 |

모든 시험 스크립트는 확인마다 `ok   - …` 또는 `FAIL - …`(기대·실제) 줄을 출력하고 끝에 `통과 N, 실패 M`을 보이며, 불일치가 있으면 종료 코드 1입니다. 세부 시나리오는 각 스크립트 머리말이 원본입니다. `tests/`는 릴리스 묶음에서 빠지므로(워크플로 제외 규칙) 서버에는 가지 않습니다.

## 경계

운영 환경은 local/dev와 DB·계정·비밀값을 공유하지 않습니다. 이 폴더에 평문 비밀값을 두지 않고 암호문(`secrets/`)만 둡니다. 관리 원칙은 [환경과 비밀값 관리](../../docs/development/environment-secrets.md), 작업 규칙은 [인프라 AGENTS.md](../AGENTS.md)를 따릅니다.
