# 인프라 변경 기록

내부 참고용으로 인프라의 모든 변경을 적용 여부와 관계없이 기록합니다. 환경별 적용 시각·결과·복구 정보는 운영 work item이나 배포 플랫폼에 기록합니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](../docs/development/repository-policy.md#변경-기록)을 따릅니다.

## 2026-10-07

- 업로드 S3 전환 준비: `prod/compose.yaml`의 api `uploads` 볼륨에 `FILE_STORAGE` 설명 주석(값은 app.env), 루트 `.sops.yaml` `unencrypted_regex`에 `FILE_STORAGE`·`S3_ENDPOINT`·`S3_REGION`·`S3_BUCKET` 추가(파일 메타데이터에 기록되므로 바꾼 뒤 한 번 다시 암호화). 런북 9를 "업로드 저장소"로 바꿔 SeaweedFS 버킷·identity 발급, 암호문 키 넣기(`sops set --value-stdin`), 전환·볼륨 이전(`amazon/aws-cli` `s3 sync`, 로컬 SeaweedFS로 리허설)·확인(조건부 PUT 412 포함), 되돌리기, 볼륨 정리, `disk` 볼륨 백업을 둠. 대상 추가(10-8)·장애 대응(11-8) 갱신. 근거 `docs/work/orchestrator/0030-uploads-s3-storage.md`.
- 업로드 볼륨 제거: `prod/compose.yaml`에서 api `uploads` 볼륨(마운트·`volumes.uploads`)을 빼고 `api.environment`에 `FILE_STORAGE: s3`를 고정(`env_file`보다 우선, 볼륨 없이 `disk`로 떠 이미지가 컨테이너 안에만 저장되는 일 방지). 운영 볼륨은 파일 0개(통합 담당 확인)라 이전할 것이 없음. 이 변경은 암호문에 `S3_*`가 들어간 같은 릴리스에서만 배포. 서버의 남은 볼륨 삭제·되돌리기는 런북 9-4·9-5. 근거 `docs/work/orchestrator/0030-uploads-s3-storage.md`.
- 운영 주소 검사를 서버로 옮김: `prod/verify.sh`(대상 서버가 Cloudflare를 거쳐 공개 주소 6개 확인, 첫 주소는 최대 60초 대기)와 `prod/ssh-entry.sh`의 `verify` 명령. GitHub 러너에서 부르면 Cloudflare가 데이터센터 IP를 403으로 막아 앱이 정상이어도 실패하고 자동 롤백이 돌았기 때문(2026-10-07 Deploy run 37497401435). `ssh-entry.sh`가 바뀌어 서버에서 `bootstrap.sh`를 다시 실행함. 워크플로 쪽은 `.github/workflows/deploy.yml`의 배포 job 안 `운영 주소 검사`·`자동 롤백` 단계, `rollback.yml`의 검사 단계. 근거 `docs/work/orchestrator/0029-first-prod-provision-verify.md`.

## 2026-10-06

- 운영(prod) 스택 추가: `prod/compose.yaml`(project `crelink-prod`: `caddy`(`caddy:2.11.7-alpine`, 호스트 `127.0.0.1:${CRELINK_HTTP_PORT:-18080}`만, 읽기 전용)·`api`·`web`, 볼륨 uploads·geoip, `./certs`, `env_file` = 복호화한 `/run/crelink/app.env`, 도구 프로필 `geoip-writer`), `prod/Caddyfile`(http, admin off, `go` 호스트는 `GET /{slug}`·`/c/{id}`만 api·나머지 404, `links` 호스트는 전부 web·본문 6MB, 사설 대역의 `CF-Connecting-IP`를 `X-Forwarded-For: {client_ip}`로), `prod/targets.json`(배포 대상 목록), `prod/secrets/home-server.sops.env`(SOPS·age 암호문, 비밀 아닌 키는 평문), `prod/certs/supabase-ca.crt`, `prod/images.env.example`. 공개는 Cloudflare Tunnel → `127.0.0.1:18080`, 서버 인바운드 포트 없음.
- 배포 스크립트(릴리스 = 커밋 SHA의 `infra/prod` 묶음 + API·웹 이미지): `lib.sh`(서버 배치 `/opt/crelink/{releases,current,state}`·`/etc/crelink`·`/run/crelink`), `ssh-entry.sh`(`deploy` 사용자 forced command: `deploy`·`rollback`·`status`), `deploy.sh <릴리스> <api|-> <web|->`(복호화·문법 사전 확인 → pull → `releases.log` → `up --wait` → 실패 시 직전 릴리스 복구 → 최근 5개 외 정리), `rollback.sh [릴리스]`(기본은 지금 릴리스를 배포한 deploy 줄의 이전 릴리스), `geoip.sh [--restart]`, `bootstrap.sh`(Ubuntu amd64·arm64: age·sops 3.13.3(SHA-256)·Docker, `deploy`·forced command, tmpfiles, `/etc/crelink` target·age 키, 선택 cloudflared). 로컬 시험 `prod/tests/caddy-routing.sh`·`deploy-rollback.sh`, 런북 `docs/prod-runbook.md`(서버 준비·Tailscale/GitHub 접속·Tunnel·비밀값 편집·회전·최초 배포·롤백·GeoIP·업로드 백업·대상 추가·장애 대응·Supabase). 인프라 작업 규칙의 prod 현황·검증 규칙 갱신. 처음 설계의 서버 공용 edge Caddy(`prod/edge/`)·`prod/crelink.caddy`·`prod/.env.example`·rsync 배포는 같은 날 대체되어 지움. 근거: `docs/work/infra/0027-infra-prod-compose-runbook.md`, `docs/work/orchestrator/0029-first-prod-provision-verify.md`.

## 2026-10-01

- 슬롯 0 포트 원본을 `local/.env.example` 하나로 모음: `API_PORT`·`WEB_PORT`·`EXPO_PORT`를 추가하고 원본이라는 주석을 달았으며, `local/compose.yaml`의 `POSTGRES_PORT`·`VALKEY_PORT` 기본값을 없애고 값이 없으면 `make`·`--env-file` 경로를 안내하는 `:?` 오류로 바꿈. 인프라 작업 규칙에 포트 원본 기준 추가. 근거: `docs/work/0011-harness-adoption-fixes.md`.
- worktree별 로컬 인스턴스: 루트 `Makefile`이 `.local/instance.env`의 Compose project(주 checkout `crelink` 유지, 연결된 worktree `crelink-<worktree>`)와 PostgreSQL·Valkey 호스트 포트(슬롯 k마다 +100×k)를 쓰고, 연결된 worktree 인스턴스의 컨테이너·볼륨·PM2를 지우는 `make instance-destroy CONFIRM=1`(주 checkout 거부)을 추가. 인프라 작업 규칙에 인스턴스별 project·볼륨 기준 추가. 근거: `docs/work/0001-worktree-local-instances.md`, `docs/adr/0008-worktree-local-instances.md`.
- 로컬 PostgreSQL 17·Valkey 8 Compose 구성(`local/`, 호스트 포트 5452·6399), `dev/`·`prod/` 환경 안내, 인프라 작업 규칙.
