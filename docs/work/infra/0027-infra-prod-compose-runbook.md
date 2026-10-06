# 0027 prod Compose·Caddy·서버 부트스트랩·런북

- 단계: 티켓
- 역할: infra
- 상위: 0024
- 선행: 0025
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

OCI 서버에서 API와 Caddy를 Compose로 운영하는 설정, 배포·롤백 스크립트, 부트스트랩과 사람이 따라 할 런북을 만듭니다.

## 수용 기준

- [x] `infra/prod/compose.yaml`(API 이미지 `${API_IMAGE}` + Caddy + 볼륨 uploads·geoip·caddy 데이터, API 포트는 내부 네트워크만), `infra/prod/Caddyfile`(설계의 공개 정책: 단축 경로 공개, `/api/*`는 `X-Crelink-Internal` 일치 시만, 그 외 404, TLS 자동), `infra/prod/.env.example`. `docker compose config --quiet`가 통과한다. (설계 변경 반영: Caddy는 서버 공용 edge `infra/prod/edge/`, 크리링 정책은 `infra/prod/crelink.caddy`)
- [x] Caddy 라우팅을 로컬 컨테이너로 실행해 curl로 확인한다: 단축 경로 통과, 토큰 없는 `/api/health` 404, 토큰 있는 `/api/health` 200, 그 밖 경로 404, `X-Forwarded-For` 전달.
- [x] `infra/prod/deploy.sh`(인자 SHA: GHCR 로그인·pull·이전 태그 기록·`up -d`·헬스 대기·실패 시 이전 태그 복구)와 `rollback`(이전/지정 태그), `geoip` 갱신. 셸 검사(`shellcheck` 가능하면)와 로컬 Docker로 정상·실패 경로를 시뮬레이션한다.
- [x] `infra/prod/bootstrap.sh`(Ubuntu ARM: Docker 설치, `deploy` 사용자·`/opt/crelink`, 방화벽) 와 런북 `infra/docs/prod-runbook.md`(OCI 인스턴스·보안 목록, DNS, Supabase 프로젝트·세션 풀러·CA, Vercel 프로젝트·환경변수, Google 콘솔 리디렉션 URI, GitHub secrets 목록, 최초 배포, 백업·복구, 롤백, 키 교체)를 적는다. (방화벽: OCI가 UFW를 금지해 스크립트는 건드리지 않고 런북에 iptables 절차)
- [x] `infra/prod/README.md`·`infra/README.md`·`infra/AGENTS.md`(필요 시)·`infra/CHANGELOGS.md` 갱신, 비밀값은 저장소에 없다.

## 범위

- 포함: `infra/**`.
- 제외: API 코드·Dockerfile(0025), 워크플로(0028).

## 위험·복구

원격 자원을 만들지 않습니다. 스크립트는 파괴적 명령을 호출하지 않고 로컬에서만 시험합니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 구현. 서버 80·443을 다른 프로젝트(ai-character-chat) Caddy가 쓰고 있어 사용자 결정으로 서버 공용 edge Caddy 구조로 바꿈.
  - `infra/prod/compose.yaml`: API만(project `crelink-prod` — 주 checkout 로컬 project `crelink`와 겹치지 않게), 호스트 포트 없음, 외부 네트워크 `edge`에 별칭 `crelink-api`, `init: true`, 볼륨 uploads·geoip(ro)·`./certs`(Supabase CA), 이미지 HEALTHCHECK 재사용, json-file 로그 회전, GeoIP 쓰기용 `geoip-writer`(profile tools). `env_file`은 `required: false`(저장소에서 `--env-file .env.example`로 검사하기 위함, 서버는 `${API_IMAGE:?}`가 `.env` 누락을 막음).
  - `infra/prod/crelink.caddy`: `{$CRELINK_DOMAIN:go.shaul.kr}`, `GET ^/[A-Za-z0-9][A-Za-z0-9-]{1,28}[A-Za-z0-9]$`(SLUG_PATTERN·3~30자, API가 소문자화하므로 대문자 허용), `GET ^/c/[a-z0-9]{10}$`, `/api/*`는 CEL `{env.CRELINK_INTERNAL_TOKEN} != "" && {header.X-Crelink-Internal} == {env.CRELINK_INTERNAL_TOKEN}`(상수 시간 비교 아님, 한계는 런북 7-2) + `header_up -X-Crelink-Internal`, 나머지 404. `trusted_proxies` 없음(기본: 클라이언트 `X-Forwarded-*` 무시).
  - `infra/prod/edge/`: `compose.yaml`(project `edge`, `caddy:2.11-alpine`, 80·443·443/udp, 네트워크 `edge` 생성·`ai-character-chat-backend_backend` 참가, 볼륨 data·config), `Caddyfile`(`grace_period 10s` + `import /etc/caddy/sites/*.caddy`), `sites/aichat.caddy`(기존 설정 이관), `.env.example`(`CRELINK_DOMAIN`·`CRELINK_INTERNAL_TOKEN`).
  - 스크립트: `deploy.sh <SHA>`(입력·edge 확인 → `crelink.caddy`를 edge 컨테이너에서 `caddy validate` → 토큰 stdin(`GHCR_PULL_TOKEN_STDIN=1`) 또는 `GHCR_PULL_TOKEN`으로 `docker login --password-stdin` → pull → `releases.log` 기록 → `.env` `API_IMAGE` 원자적 교체 → `up -d` → 이미지 헬스 최대 60초(unhealthy면 즉시 실패) → 실패 시 이전 이미지 복구 → 성공 시 사이트 파일이 바뀐 경우만 `/opt/edge/sites/crelink.caddy` 갱신·reload(실패 시 이전 내용 복구) → `docker logout`, 종료 코드 0/1/2·성공 시 마지막 줄 이미지), `rollback.sh [SHA]`(인자 없으면 현재 이미지를 배포한 마지막 deploy 줄의 이전 값, 이미지가 없을 때만 pull), `geoip.sh [--restart]`(이번 달~두 달 전 후보 URL, gzip 검사, `.partial` 뒤 rename), 공용 `lib.sh`, `bootstrap.sh`(Docker 있으면 건너뜀·없으면 공식 `docker.sources`로 설치, rsync·curl·gzip, `deploy` 사용자·docker 그룹·공개키, `/opt/crelink`·`certs`, `/opt/edge`·`sites`·deploy 소유 `crelink.caddy`, 방화벽 미변경).
  - 문서: `infra/docs/prod-runbook.md`(값 표, OCI 보안 목록·iptables, 부트스트랩·배포 키·known_hosts 지문 확인, edge 전환·전환 롤백, DNS·Supabase·Google·Vercel·GitHub secrets, 최초 배포, 배포·롤백, 내부 토큰, 백업·복구, 키 교체, 장애 대응, 공식 출처와 확인일·확인 못 한 항목), `infra/prod/README.md`, `infra/README.md`, `infra/AGENTS.md`(prod 현황·검증 규칙, edge 영향 승인), `infra/CHANGELOGS.md`.
- 2026-10-06: 검증(로컬 Docker 29.8.1, Compose v5.5.1, macOS arm64).
  - `docker compose -f infra/prod/compose.yaml --env-file infra/prod/.env.example config --quiet`, 같은 방식의 `infra/prod/edge/compose.yaml` 통과. `--env-file` 없이 실행하면 `API_IMAGE` 누락으로 의도대로 실패.
  - `bash -n`(모든 `infra/prod/*.sh`·`tests/*.sh`) 통과, `shellcheck -x`(0.11.0) 경고 없음.
  - `infra/prod/tests/caddy-routing.sh`: 저장소 edge 설정 그대로(사이트 `go.localhost`, Caddy 내부 CA, 빈 포트)·echo 스텁 업스트림으로 34개 요청이 모두 기대와 일치. 단축 경로 3·30자·대문자·쿼리 통과, 2·31자·앞뒤 하이픈·밑줄·끝 슬래시·하위 경로·대문자 id·9/11자 id 404, `/api/health` 토큰 없음·틀림·빈 값·앞부분만 404, 올바른 토큰 200(업스트림에 토큰 헤더 없음), `/c/../api/health`(`--path-as-is`)·`/%61pi/health` 404, POST·HEAD `/myslug` 404, 위조 `X-Forwarded-For: 6.6.6.6, 7.7.7.7` → 업스트림 `172.26.0.1`(Caddy가 본 접속 주소 하나), http → 308 https. aichat 포함 전체 edge 설정 `caddy adapt` 통과.
  - `infra/prod/tests/deploy-rollback.sh`(로컬 registry:3·헬스 통과/실패 더미 이미지, 임시 `DOCKER_CONFIG`): 22개 확인 모두 일치. 첫 배포 헬스 실패(이전 없음) 종료 1, 정상 배포 종료 0·마지막 줄 이미지·healthy·edge 사이트 설치·edge 경유 토큰 200/무토큰 404·배포 뒤 자격 증명 없음, 두 번째 배포 사이트 변경 없음, 실패 이미지 배포 종료 1·이전 이미지 복구 healthy, 잘못된 SHA·pull 실패·edge 없음 종료 1·`.env` 그대로, 인자 없는 롤백 → 직전 배포 이전 이미지 종료 0, 지정 롤백(로컬 이미지)·이미지 없을 때 pull 롤백 종료 0, 실패 이미지로 롤백 종료 1·복구, 모든 출력에 토큰 없음.
  - 0025 실제 이미지(`apps/api/Dockerfile`, 로컬 빌드)로 임시 시험(저장소에 남기지 않음, 로컬 PostgreSQL에 임시 DB `crelink_prodtest`를 만들었다 삭제): `deploy.sh` 종료 0·healthy(user node), edge 경유 `/api/health/ready`(토큰) 200 `{"status":"ready"}`, `/api/health`(무토큰) 404, `/zzzz` 302 → `{WEB_URL}/notice?reason=link_not_found`. 헬스 실패 이미지 배포 → 종료 1·실제 이미지로 복구 healthy. `geoip.sh --restart` → DB-IP 2026-10 파일(126,998,165바이트)을 geoip 볼륨에 저장·API 재시작 healthy, 종료 0.
  - 시험 컨테이너·네트워크·볼륨·더미 이미지·임시 DB·임시 파일 정리 확인. 실행 중인 `make up`(웹 5193·API 3020)과 `infra/local` Compose(`crelink-postgres-1` 등)는 건드리지 않음(임시 DB만 만들고 삭제).
  - 로컬에서 못 한 것: 실제 서버 적용(edge 전환·`bootstrap.sh` 실행 — `bash -n`·shellcheck만), 실제 도메인 ACME 인증서 발급, GHCR 실제 로그인·pull, Supabase TLS(`verify-full`) 접속, OCI 보안 목록·iptables. 0029에서 실행.
- 2026-10-06: 통합 확인(브랜치 `work/0024-prod-deploy`). 이미지 한도를 4MB로 맞춤(shared·API 메시지·테스트·문서). `pnpm verify` 8단계 통과(API 테스트 포함), `make api-restart` 뒤 `pnpm e2e` 6 passed, `pnpm smoke` 5 passed, `infra/prod/tests/caddy-routing.sh` 전 요청 일치. 상태 `완료`. 실서버 적용은 0029.
