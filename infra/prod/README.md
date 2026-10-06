# 운영 환경

**현재 상태: 코드 준비 완료, 원격 자원 미생성(2026-10-06).** 서버 구성·배포 스크립트·런북은 이 폴더와 [prod 런북](../docs/prod-runbook.md)에 있고 로컬 Docker로만 시험했습니다. OCI 서버는 있지만 edge 전환, Supabase·Vercel 프로젝트, DNS, GitHub secrets, 최초 배포는 아직 하지 않았습니다. 설계 기준은 [운영 배포·CD 기술 설계](../../docs/specs/crelink-prod-deploy.md)와 [ADR 0010](../../docs/adr/0010-prod-deployment-topology.md)입니다.

## 파일

| 파일 | 서버 위치 | 내용 |
| --- | --- | --- |
| `compose.yaml` | `/opt/crelink` | API 컨테이너만(project `crelink-prod`). 호스트 포트 없음, 외부 네트워크 `edge`에 별칭 `crelink-api`로 참가, 볼륨 `uploads`(`/data/uploads`)·`geoip`(`/data/geoip`, 읽기 전용), Supabase CA `./certs`. 헬스체크는 이미지(`apps/api/Dockerfile`)의 `HEALTHCHECK` |
| `crelink.caddy` | `/opt/edge/sites/crelink.caddy`(deploy.sh가 복사) | 단축·API 호스트 공개 정책: `GET /{slug}`(3~30자)·`GET /c/{id}`(10자) 공개, `/api/*`는 `X-Crelink-Internal` 일치 시만(헤더는 업스트림에 안 보냄), 나머지 404 |
| `.env.example` | `/opt/crelink/.env`(600) | API·배포 키 목록. 실제 값 없음 |
| `deploy.sh` | `/opt/crelink` | `./deploy.sh <SHA>`: 레지스트리 로그인(토큰 stdin) → pull → `releases.log` 기록 → `API_IMAGE` 교체 → 헬스 60초 → 성공 시 edge 사이트 갱신·reload, 실패 시 이전 이미지 복구 → 로그아웃 |
| `rollback.sh` | `/opt/crelink` | `./rollback.sh [SHA]`: 인자가 없으면 `releases.log`에서 현재 이미지를 배포한 deploy 줄의 이전 이미지 |
| `geoip.sh` | `/opt/crelink` | `./geoip.sh [--restart]`: DB-IP City Lite(`scripts/geoip.mjs`와 같은 월 후보 규칙)를 `geoip` 볼륨에 넣음 |
| `lib.sh` | `/opt/crelink` | 위 세 스크립트의 공용 함수(단독 실행 안 함). 환경변수 설명은 머리말 |
| `bootstrap.sh` | 한 번 실행 | Ubuntu ARM 초기 설정: Docker(없을 때만 공식 저장소), `deploy` 사용자, `/opt/crelink`·`/opt/edge`. 방화벽은 건드리지 않음 |
| `edge/` | `/opt/edge`(손으로 배치) | 서버 공용 edge Caddy(project `edge`, 80·443): `compose.yaml`, `Caddyfile`(`sites/*.caddy` import), `sites/aichat.caddy`(다른 프로젝트), `.env.example` |
| `tests/` | 서버에 두지 않음 | 로컬 Docker 시험 스크립트(아래) |

CD 워크플로(`.github/workflows/deploy.yml`)는 `edge/`·`tests/`·`.env`·`releases.log`·`*.example`·`README.md`를 빼고 이 폴더를 `/opt/crelink/`로 rsync한 뒤 `deploy.sh`를 실행합니다. 종료 코드는 0 성공(마지막 줄 = 배포된 이미지), 1 실패(이전 이미지로 복구했거나 아무것도 바꾸지 않음), 2 복구도 실패입니다.

## 문법 확인

```bash
docker compose -f infra/prod/compose.yaml --env-file infra/prod/.env.example config --quiet
docker compose -f infra/prod/edge/compose.yaml --env-file infra/prod/edge/.env.example config --quiet
bash -n infra/prod/*.sh infra/prod/tests/*.sh && shellcheck -x infra/prod/*.sh infra/prod/tests/*.sh
```

`--env-file` 없이 `config`를 실행하면 `API_IMAGE`·`CRELINK_INTERNAL_TOKEN`이 비어 있어 일부러 실패합니다(서버에서 `.env` 없이 뜨지 않게 하는 장치).

## 로컬 시험

Docker만 있으면 됩니다. 원격 서버·DNS·레지스트리 자격 증명은 쓰지 않으며, 끝나면(실패해도) 만든 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. 실행 중인 `make up` 인스턴스와 `infra/local` Compose는 건드리지 않습니다.

| 명령(저장소 루트) | 확인하는 것 |
| --- | --- |
| `infra/prod/tests/caddy-routing.sh` | 저장소의 edge `compose.yaml`·`Caddyfile`·`crelink.caddy`를 그대로 띄우고(사이트 주소 `go.localhost`로 Caddy 내부 CA 인증서, 빈 포트) 업스트림을 echo 스텁으로 바꿔 curl로 공개 정책·토큰·`X-Forwarded-For`·http→https를 확인. aichat 사이트는 `caddy adapt`로 문법만 확인 |
| `infra/prod/tests/deploy-rollback.sh` | 로컬 레지스트리와 헬스체크 더미 이미지(통과·실패)로 `deploy.sh`·`rollback.sh`의 정상·실패 복구·입력 오류·pull 실패·edge 없음·인자 없는 롤백을 시뮬레이션. 로그인은 임시 `DOCKER_CONFIG`에서 하고 출력에 토큰이 없는지 확인 |

두 스크립트 모두 표로 결과를 출력하고 기대와 다르면 종료 코드 1입니다. 필요한 이미지(`caddy:2.11-alpine`, `node:22-alpine`, `registry:3`)는 처음에 내려받고 지우지 않습니다.

## 경계

운영 환경은 local/dev와 DB·계정·비밀값을 공유하지 않습니다. 이 폴더에는 실제 비밀값을 두지 않고 서버의 `.env`에만 둡니다. 관리 원칙은 [환경과 비밀값 관리](../../docs/development/environment-secrets.md), 작업 규칙은 [인프라 AGENTS.md](../AGENTS.md)를 따릅니다.
