# 운영 환경

운영 스택(caddy·api·web)과 배포·롤백 스크립트입니다. 모든 배포 대상(지금 `home-server`)이 이 폴더를 그대로 씁니다. 설계 기준은 [운영 배포·CD 기술 설계](../../docs/specs/crelink-prod-deploy.md)와 [ADR 0010](../../docs/adr/0010-prod-deployment-topology.md), 사람이 따라 하는 절차는 [prod 런북](../docs/prod-runbook.md)입니다. 대상별 적용 상태는 운영 work item 진행 기록에 남깁니다.

## 파일

CD 워크플로(`.github/workflows/deploy.yml`)는 이 폴더에서 `tests/`·`README.md`·`*.example`·`.env`를 뺀 묶음을 서버 `/opt/crelink/releases/<SHA>/`에 풀고 그 안의 `deploy.sh`를 실행합니다(릴리스).

| 파일 | 내용 |
| --- | --- |
| `compose.yaml` | Compose project `crelink-prod`: `caddy`(호스트 `127.0.0.1:${CRELINK_HTTP_PORT:-18080}`만), `api`(`${API_IMAGE}`, 볼륨 uploads(`FILE_STORAGE=disk`일 때만 사용, S3 전환·이전 뒤 제거)·geoip(ro)·`./certs`(ro), `env_file` = 복호화한 `/run/crelink/app.env`), `web`(`${WEB_IMAGE}`, `API_INTERNAL_URL=http://api:3000`), 도구 프로필 `geoip-writer`. 헬스체크는 각 이미지의 `HEALTHCHECK` |
| `Caddyfile` | 공개 정책: `go.shaul.kr`은 `GET /{slug}`·`GET /c/{id}`만 api, 나머지 404. `links.shaul.kr`은 전부 web(본문 6MB). `CF-Connecting-IP`(사설 대역에서 온 것만)를 방문자 IP로 `X-Forwarded-For`에 넣음 |
| `targets.json` | 배포 대상 목록(`name`·`host`(Tailscale MagicDNS)·`platform`·`enabled`). 워크플로가 대상 matrix와 이미지 플랫폼을 여기서 정함 |
| `secrets/<대상>.sops.env` | 대상별 앱 설정·비밀값(SOPS + age 암호문, 비밀이 아닌 키는 평문). 규칙은 루트 `.sops.yaml` |
| `certs/supabase-ca.crt` | Supabase 루트 CA(공개 인증서) |
| `images.env.example` | 서버 `state/images.env` 형식(`API_IMAGE`·`WEB_IMAGE`). compose 문법 확인용 |
| `ssh-entry.sh` | `deploy` 사용자의 SSH forced command(`deploy`·`rollback`·`status`). `bootstrap.sh`가 `/usr/local/lib/crelink/`에 설치하며 워크플로로는 바뀌지 않음 |
| `deploy.sh` | `releases/<SHA>/deploy.sh <릴리스 SHA> <API SHA\|-> <웹 SHA\|->`: 복호화·문법 확인 → 이미지 pull → `releases.log` → `current`·`images.env` 교체 → `up --wait` → 실패 시 직전 릴리스로 복구 → 성공 시 최근 5개 외 릴리스 정리 |
| `rollback.sh` | `rollback.sh [릴리스 SHA]`: 기본은 `releases.log`에서 지금 릴리스를 배포한 마지막 `deploy` 줄의 이전 릴리스. 그 릴리스의 설정·비밀값·이미지 전체로 되돌림 |
| `geoip.sh` | `geoip.sh [--restart]`: DB-IP City Lite(`scripts/geoip.mjs`와 같은 월 후보 규칙)를 `geoip` 볼륨에 넣음 |
| `lib.sh` | 공용 함수(단독 실행 안 함). 서버 배치·환경변수 설명은 머리말 |
| `bootstrap.sh` | 서버 초기 설정(한 번, root, Ubuntu amd64·arm64): 패키지·sops·Docker, `deploy` 사용자·forced command, `/opt/crelink`, `/run/crelink` tmpfiles, `/etc/crelink`(대상 이름·age 키), 선택 cloudflared. 방화벽은 건드리지 않음 |
| `tests/` | 로컬 Docker 시험(아래). 서버에 보내지 않음 |

`deploy.sh`·`rollback.sh` 종료 코드: 0 성공(마지막 줄 `<릴리스> <API 이미지> <웹 이미지>`), 1 실패(직전 상태로 복구했거나 아무것도 바꾸지 않음), 2 복구도 실패.

## 문법 확인

```bash
CRELINK_APP_ENV=/dev/null docker compose -f infra/prod/compose.yaml --env-file infra/prod/images.env.example config --quiet
bash -n infra/prod/*.sh infra/prod/tests/*.sh && shellcheck -x infra/prod/*.sh infra/prod/tests/*.sh
```

`--env-file` 없이 `config`를 실행하면 `API_IMAGE`·`WEB_IMAGE`가 비어 일부러 실패합니다. `CRELINK_APP_ENV`를 주지 않으면 서버의 `/run/crelink/app.env`를 찾습니다.

## 로컬 시험

필요 도구: `caddy-routing.sh`는 Docker·curl, `deploy-rollback.sh`는 Docker·sops·age(+curl·openssl). 원격 서버·DNS·실제 키·레지스트리 자격 증명은 쓰지 않으며, 끝나면(실패해도) 만든 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. 실행 중인 `make up` 인스턴스와 `infra/local` Compose는 건드리지 않습니다.

| 명령(저장소 루트) | 확인하는 것 |
| --- | --- |
| `infra/prod/tests/caddy-routing.sh` | 실제 `caddy` 이미지에 저장소 `Caddyfile`을 붙이고 api·web 자리를 스텁으로 바꿔 curl로 공개 정책(단축·클릭·404·웹 전달·본문 한도)과 방문자 IP(사설 대역 `CF-Connecting-IP` 신뢰, 그 밖은 무시)를 확인 |
| `infra/prod/tests/deploy-rollback.sh` | htpasswd 인증 로컬 레지스트리의 더미 이미지와 임시 age 키로 암호화한 시험용 비밀값으로 `ssh-entry.sh`를 직접 실행(sshd 불필요)해 `deploy.sh`·`rollback.sh`를 시뮬레이션: 허용 안 된 명령 거부, 첫 배포 SHA 필수, web만 교체, 헬스 실패 시 `restore`, 없는 이미지·복호화 불가 시 무변경, 연속 rollback이 한 단계씩, `rollback <SHA>`, 토큰이 있을 때만 로그인 후 로그아웃, 오래된 릴리스 정리, 평문 비밀값 미잔류, `releases.log` 형식 |

두 스크립트 모두 확인마다 `ok   - …` 또는 `FAIL - …`(기대·실제) 줄을 출력하고 끝에 `통과 N, 실패 M`을 보이며, 불일치가 있으면 종료 코드 1입니다. 세부 시나리오는 각 스크립트 머리말이 원본입니다.

## 경계

운영 환경은 local/dev와 DB·계정·비밀값을 공유하지 않습니다. 이 폴더에 평문 비밀값을 두지 않고 암호문(`secrets/`)만 둡니다. 관리 원칙은 [환경과 비밀값 관리](../../docs/development/environment-secrets.md), 작업 규칙은 [인프라 AGENTS.md](../AGENTS.md)를 따릅니다.
