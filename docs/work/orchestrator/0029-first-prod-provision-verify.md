# 0029 최초 prod 프로비저닝과 실서비스 검증

- 단계: 티켓
- 역할: orchestrator
- 상위: 0024
- 선행: 0028
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

배포 대상 서버(`home-server`)를 준비하고 최초 배포를 실행해 운영 주소에서 end-to-end로 동작함을 확인합니다. 에픽 0024의 여러 역할 변경을 묶는 통합 티켓이기도 합니다(통합 브랜치 `work/0029-first-prod-provision-verify`).

## 수용 기준

- [x] 서버 준비: `bootstrap.sh`(`TARGET_NAME=home-server`, `deploy` 사용자·docker 그룹·forced command, `/etc/crelink/target`·`age.key`), 서버 age 공개키가 `.sops.yaml` 수신자, Tailscale SSH 꺼짐(`RunSSH: false`).
- [x] Cloudflare Tunnel `my-home-server`에 공개 호스트 `go.shaul.kr`·`links.shaul.kr` → `http://localhost:18080`(proxied CNAME).
- [x] 최초 배포가 `ssh-entry.sh` 경로로 성공하고 caddy·api·web이 healthy, 운영 주소 검사 6개가 기대대로, GeoIP가 로드된다.
- [x] GitHub: 쓰지 않는 secrets(`OCI_*`) 삭제, `DEPLOY_SSH_KEY` 등록. 로컬 평문 비밀값 파일 삭제.
- [x] Tailscale 관리 화면: `tagOwners` `tag:ci`, grant `tag:ci` → `home-server` tcp:22, workload identity federation 자격 증명(Subject `repo:ai-worker-lab@271170671/crelink@1406726921:ref:refs/heads/main`, GitHub 불변 subject 형식), GitHub variables `TS_OIDC_CLIENT_ID`·`TS_OIDC_AUDIENCE`(사용자 작업).
- [x] `https://links.shaul.kr`에서 구글 로그인, 링크 관리, 랜딩, 단축 URL 클릭 기록(IP가 방문자 IP)을 확인한다.
- [x] `deploy.yml` 자동 배포 1회(GHCR 이미지), 의도적 헬스 실패의 자동 복구 1회, `rollback.yml` 수동 롤백 1회를 실제로 실행해 결과를 기록한다. (의도적 헬스 실패는 Blue/Green 전환 뒤 0036에서 운영 실행: 새 색만 내리고 활성 색·트래픽 불변, 종료 1)

## 범위

- 포함: 운영 실행·검증 기록, 에픽 0024 티켓들의 통합 브랜치·PR(`orchestrator` 소유 범위).
- 제외: 새 기능.

## 위험·복구

운영 데이터·DNS·계정 작업입니다. 파괴적 명령 없이 단계별로 사용자 확인을 받습니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 서버 준비(사용자 승인). 기존 `oci-server`(193.122.104.153, Ubuntu 26.04 ARM)를 씀. 배포 전용 사용자 `deploy`·ed25519 키 생성, 호스트 키를 기존 신뢰 지문과 대조해 GitHub secrets `OCI_HOST`·`OCI_USER`·`OCI_SSH_KEY`·`OCI_KNOWN_HOSTS` 등록(로컬 키 사본 삭제). `bootstrap.sh` 실행(Docker 기존 설치 유지). Supabase CA(`Supabase Root 2021 CA`, 2031-04-26 만료)를 `/opt/crelink/certs/supabase-ca.crt`에 둠. 서버에서 `verify-full`로 Supabase 세션 풀러 접속 확인(PostgreSQL 17.11, TLSv1.3). `/opt/crelink/.env`(사용자 `apps/api/.env.prod`의 DB·구글 값 + 운영 주소)·`/opt/edge/.env`(내부 토큰 새로 생성) 작성, 값은 출력하지 않음.
- 2026-10-06: edge 전환. `/opt/edge` 배치·`caddy validate` 통과 → 기존 aichat Caddy 인증서 볼륨을 `edge_data`로 복사 → aichat Caddy 중지 → `edge-caddy-1` 기동(80·443). `aichat-api.shaul.kr`은 edge를 거쳐 aichat API로 전달되며, 응답 503은 aichat API 자체 헬스 응답(호스트 `127.0.0.1:3000`에서도 503)이라 전환과 무관. 확인 중 aichat Caddy 재시작 명령을 한 번 잘못 실행했으나 포트 충돌로 시작되지 않았고 edge에는 영향 없음(현재 `Exited`).
- 2026-10-06: PR #1 CI: check 3종·smoke·`API 이미지 빌드`(amd64 러너에서 arm64 교차 빌드 3분 20초) 통과. `work scope`는 에픽 브랜치(역할 없음)라 실패(여러 역할 변경을 한 브랜치에 묶은 결과).
- 2026-10-06: 사용자 결정: Cloudflare 프록시 사용, 서비스는 비상업적(Vercel Hobby, 저장소는 GitHub 조직·Vercel은 개인 계정), Google 콘솔에 운영 리디렉션 URI·클라이언트 값 입력 완료(서버 `.env`의 OAuth·DB 값이 현재 `apps/api/.env.prod`와 같은지 해시로 확인). edge Caddy를 Cloudflare 대역 신뢰 설정으로 바꿔 서버에 적용(reload, 기존 사이트 응답 변화 없음). 로컬 Caddy 시험 통과(위조 XFF 무시, 신뢰 프록시의 CF-Connecting-IP 사용).
- 2026-10-06(당시 기준) 남은 사용자 준비물: Cloudflare DNS(`go` A → 193.122.104.153 프록시 켬, `links` → Vercel CNAME DNS only 권장, SSL/TLS Full (strict)), Vercel 프로젝트·토큰(`VERCEL_TOKEN`·`VERCEL_ORG_ID`·`VERCEL_PROJECT_ID`). 아래 호스팅 전환으로 대체됨.
- 2026-10-06: 범위 변경(사용자 결정, 에픽 0024 호스팅 전환). 운영 대상을 `home-server` 단일 서버(웹·API 스택, Cloudflare Tunnel, Tailscale OIDC SSH, SOPS/age)로 바꿈. OCI 서버의 edge Caddy는 aichat이 계속 쓰고 크리링은 OCI에 배포하지 않음. 목적·수용 기준을 home-server 기준 체크리스트로 고침(이전 기준: OCI·Vercel·DNS 준비, 서버 부트스트랩·Vercel 최초 배포).
- 2026-10-06: work scope 처리. 에픽 브랜치 `work/0024-prod-deploy`는 에픽에 `역할`이 없어 `pnpm work:scope`가 실패하므로, 통합 PR을 이 티켓(`orchestrator`) 브랜치 `work/0029-first-prod-provision-verify`로 옮기기로 함(브랜치·PR 교체는 통합 담당). 규칙은 `docs/work/README.md` "착수와 점유".
- 2026-10-06: home-server 준비·최초 배포(통합 담당). `bootstrap.sh` 완료(`deploy` uid 1000·docker 그룹, 다른 서비스 seaweedfs 데이터도 uid 1000이라 겹치지만 docker 그룹이라 추가 위험 없음), `RunSSH: false`(OpenSSH가 tailnet 22번을 받음), tailscale 1.102.4. Cloudflare Tunnel `my-home-server`에 `go`·`links` → `http://localhost:18080` 공개 호스트와 proxied CNAME 추가. 서버에서 이미지를 직접 빌드해 `ssh-entry.sh` 경로로 첫 배포 성공: 릴리스 `8a5f271`, caddy·api·web healthy, 운영 주소 6개 기대대로, GeoIP 로드. 로컬 평문 `apps/api/.env.prod`·`infra/prod/.env` 삭제, GitHub secrets `OCI_*` 삭제, `DEPLOY_SSH_KEY` 등록. 남은 것: Tailscale 관리 화면 설정(`tagOwners`·grant·workload identity)과 GitHub variables(사용자 작업 대기), 워크플로 경로 배포·롤백 실행, 실서비스 로그인·클릭 확인.
- 2026-10-07: 사용자가 Tailscale workload identity 자격 증명을 만들어 Client ID·Audience 전달(비밀 아님) → GitHub variables `TS_OIDC_CLIENT_ID`·`TS_OIDC_AUDIENCE` 등록. Deploy 수동 실행(run 37496907108): plan·이미지 api/web 성공, 배포 job의 Tailscale 토큰 교환 403. 원인: 이 저장소는 GitHub OIDC 불변 subject(`use_immutable_subject: true`, 접두사 `repo:ai-worker-lab@271170671/crelink@1406726921`)라 실제 `sub`가 `repo:ai-worker-lab@271170671/crelink@1406726921:ref:refs/heads/main`인데 자격 증명 Subject를 옛 형식으로 안내했음. 런북 2-2·설계 문서의 Subject를 고침. 사용자가 자격 증명 Subject를 고친 뒤 다시 실행.
- 2026-10-07: 사용자가 Subject를 고친 뒤 Deploy 수동 실행(run 37497401435): Tailscale 접속·배포 성공(릴리스 `b25695e`, 이미지는 GHCR에서 pull), 러너의 운영 주소 검사 6개가 모두 403 → `rollback-on-failure`가 직전 릴리스 `d098c73`으로 되돌림(워크플로 자동 롤백이 실제로 동작함을 확인). 같은 커밋 push로 자동 실행된 Deploy(run 37497630745)도 같은 이유로 배포 → 롤백. 403은 Cloudflare가 GitHub 러너(데이터센터 IP)의 요청을 막은 것이고 같은 시각 운영자 PC·서버에서는 정상 응답. 운영 주소 검사를 서버의 `verify.sh`(`ssh deploy@<host> verify`)로 옮기고 배포 job 안에서 검사·자동 롤백을 하도록 `deploy.yml`·`rollback.yml`을 고침. `ssh-entry.sh`에 `verify`가 생겨 서버에서 `bootstrap.sh` 재실행. 참고: 배포마다 caddy·api·web을 다시 만들어 약 30~40초 운영 주소가 502(무중단 배포는 후속).
- 2026-10-07: 첫 완전 자동 배포 성공. `021f81e` push → CI 성공 → Deploy(run 37499084332, `workflow_run`): 이미지 api·web(GHCR) → Tailscale → `deploy` → 서버 `verify` 6개 ok → 태그 `deploy/prod`·`deploy/prod-api`·`deploy/prod-web` = `021f81e`.
- 2026-10-07: 수동 롤백(Rollback run 37499349862, `target=home-server`): 서버 `rollback`이 `021f81e` → `d098c73`으로 성공, 이어진 `verify` 단계는 `d098c73` 릴리스 폴더에 `verify.sh`가 없어 실패(그 커밋 뒤에 추가된 파일). 서버의 이전 릴리스 폴더 2개에 `verify.sh`를 복사해 채우고 `verify` 6개 ok 확인. 다음 Deploy(`force`, run 37499575245)로 `021f81e` 복구, 운영 정상. 롤백 뒤 같은 커밋으로 돌아가는 방법을 런북 7에 추가.
- 2026-10-07: 실서비스 확인(사용자 휴대폰 iOS Chrome + 운영자 Mac, 릴리스 `4fbab57`). 구글 로그인(세션 생성, 역할 operator), 프로필 이미지 업로드(S3 SeaweedFS, `GET /api/backend/api/files/{id}` 200·크기 일치), 단축 주소 변경(`gk6rh10` → `shaul1991`, 옛 주소 90일 유지), 링크 추가(`https://naver.com/`). 클릭 기록: 휴대폰 이동통신 IP `106.101.130.115`·KR·mobile·iOS·Chrome·유입 `links.shaul.kr`(서버 IP 아님). 방문 기록: 운영자 Mac `curl https://go.shaul.kr/shaul1991` → IP `220.117.253.198`(Mac 공인 IP)·KR. API 오류 로그 0. 의도적 헬스 실패 자동 복구는 0036 운영 실행으로 확인. 발견: 휴대폰이 카카오톡에서 랜딩 주소 `links.shaul.kr/p/{id}`로 바로 들어와 방문이 기록되지 않음(설계상 단축 주소에서만 기록) → 0038에서 처리. 완료.
