# ADR 0010: 운영(prod) 배포 구성과 CD

- 날짜: 2026-10-06
- 상태: 제안 (사용자가 배포 대상·접속·비밀값·공개 경로를 선택했고, 이 문서 자체의 `승인`은 사용자 확인 후. 검토한 대안 "Kamal 2"의 "무중단 배포가 필요해질 때 후보" 부분은 [ADR 0011](0011-zero-downtime-deploy.md)(제안)이 대체: 무중단은 고정 edge Caddy + Blue/Green)
- 범위: 운영 서버 배치, 공개 경로, CI→서버 접속, 운영 비밀값, GitHub Actions CD (`infra/prod/`, `.github/workflows/deploy.yml`·`rollback.yml`, `.sops.yaml`, `apps/*/Dockerfile`)

## 배경

- MVP는 localhost에서만 동작했습니다. 운영 DB는 Supabase PostgreSQL, 도메인은 `shaul.kr` 아래 임시 `links.shaul.kr`(웹)·`go.shaul.kr`(단축)로 정했고, 배포는 main 병합 시 자동 + 수동 롤백입니다.
- 처음 제안(같은 날)은 웹을 Vercel, API를 OCI ARM 서버(서버 공용 edge Caddy 뒤)에 두고 웹→API 구간을 인터넷 너머 내부 토큰 헤더로 막는 구성이었습니다. 저장소 쪽 준비 중 사용자가 1차 운영 대상을 집 서버 `home-server` 1대(Ubuntu 24.04 x86_64, Tailscale·Cloudflare Tunnel 사용 중)로 바꾸고, 나중에 OCI(ARM)·AWS로 옮기거나 추가할 수 있게 하기로 결정했습니다(2026-10-06).
- 저장소는 GitHub Free 조직의 비공개 저장소입니다. 브랜치 보호·rulesets·environment secrets·deployment branches를 쓸 수 없어 push 권한이 있으면(AI 에이전트 포함) 모든 저장소 secret을 워크플로에서 읽을 수 있습니다.
- 서버에는 인바운드 포트를 열지 않습니다. 관리 접속은 Tailscale, 공개는 Cloudflare Tunnel(아웃바운드 연결)입니다.

## 결정

1. **배치**: 웹(Next.js)·API(NestJS)를 배포 대상 서버 1대의 Docker Compose 스택(`infra/prod/compose.yaml`, project `crelink-prod`)에 함께 둡니다. 1차 대상은 `home-server`이고 대상 목록 원본은 `infra/prod/targets.json`입니다. DB는 외부 Supabase(세션 풀러, TLS `verify-full`)입니다.
2. **공개 경로**(모든 대상 동일): 방문자 → Cloudflare(TLS) → 서버의 `cloudflared`(원격 관리형 Tunnel) → `127.0.0.1:18080` → 스택 안 Caddy(`infra/prod/Caddyfile`, http) → `api:3000`·`web:3000`. `go.shaul.kr`은 단축(`GET /{slug}`)·클릭(`GET /c/{id}`)만 API로 보내고 나머지(`/api/*` 포함)는 404, `links.shaul.kr`은 전부 웹입니다. 웹의 서버 측 API 호출은 내부 네트워크 `http://api:3000`으로 가므로 공개 API 경로와 내부 토큰이 없습니다.
3. **이미지**: GitHub Actions가 `ghcr.io/ai-worker-lab/crelink-api:<SHA>`·`crelink-web:<SHA>`를 만들어 GHCR에 올립니다. 플랫폼은 `targets.json`의 사용 대상 플랫폼 합집합이고(지금 `linux/amd64`), 두 이미지 모두 arm64로도 만들 수 있게 유지합니다.
4. **CI/CD 도구**: GitHub Actions를 유지합니다. 배포 job은 GitHub 호스트 러너에서 `tailscale/github-action`(workload identity federation, 태그 `tag:ci`)으로 tailnet에 잠시 들어가 OpenSSH로 서버 `deploy` 사용자에 접속합니다. Tailscale 쪽에서 OIDC `sub`를 main 브랜치로 제한하고 ACL은 `tag:ci → 배포 대상:22`만 허용합니다. `deploy`의 배포 키는 `authorized_keys`의 forced command(`/usr/local/lib/crelink/ssh-entry.sh`)로 `deploy`·`rollback`·`status`만 실행합니다.
5. **비밀값**: SOPS + age. 원본은 저장소의 대상별 암호문 `infra/prod/secrets/<대상>.sops.env`(비밀이 아닌 키는 평문)이고, 수신자는 운영자 키와 대상 서버 키입니다(`.sops.yaml`). 서버가 배포 때 자기 키로 복호화해 tmpfs(`/run/crelink`)에 compose 실행 동안만 둡니다. CI에는 앱 비밀값이 없습니다(Tailscale 설정값 2개와 배포 SSH 키만).
6. **배포 단위와 롤백**: 릴리스 = 커밋 SHA의 `infra/prod` 묶음(compose·Caddyfile·인증서·암호문·스크립트) + API·웹 이미지. 서버 `deploy.sh`가 `docker compose up --wait`로 헬스를 기다리고 실패하면 직전 릴리스로 스스로 복구하며, 배포 후 운영 주소 검사가 실패하면 워크플로가 `rollback.sh`로 되돌립니다. 수동 롤백은 `rollback.yml`입니다.
7. **이식 규칙**을 지킵니다: 대상마다 다른 것은 `targets.json` 항목, 암호문 파일, Tunnel 공개 호스트뿐이고 서버 수작업 파일을 두지 않습니다. 규칙 원문은 [운영 배포 설계](../specs/crelink-prod-deploy.md#이식-규칙)입니다.

## 검토한 대안

- **웹 Vercel + API OCI(처음 제안)**: 웹 운영 부담이 적지만 계정 3곳, 웹→API 인터넷 구간과 내부 토큰 관리, Vercel Hobby 비상업 조건, Function 본문 4.5MB 한도가 따라옵니다. 단일 서버로 바꾸며 탈락했습니다. 웹을 다시 Vercel로 옮기는 것은 나중에 검토할 수 있는 선택지로 남깁니다(그때는 웹→API 공개 경로와 인증을 다시 설계해야 합니다).
- **서버 공용 edge Caddy(80·443 공개, ACME)**: OCI 서버에서 다른 프로젝트와 80·443을 나눠 쓰려던 구조입니다. 인바운드 포트와 호스트별 Caddy 설정이 대상마다 달라져 Tunnel + 스택 안 Caddy로 대체했습니다. home-server의 호스트 Caddy(다른 서비스 담당)와도 독립입니다.
- **Jenkins(서버 자체 호스팅)**: 권장 사양(RAM 4GB+)과 플러그인·업데이트 운영 부담, 서버에 GitHub 자격 증명을 두는 문제가 있고 기존 Actions CI와 중복됩니다. 탈락.
- **Woodpecker·Gitea/Forgejo Actions 등 자체 호스팅 CI**: 저장소 미러나 별도 서버가 필요하고 GitHub PR 체크 연동이 약해집니다. 탈락.
- **Coolify·Dokploy·CapRover류 PaaS**: 자체 프록시가 80·443을 잡아 호스트 Caddy와 충돌하고, Compose 다중 서비스의 헬스 실패 자동 롤백을 지금 설계보다 잘 하지 못합니다. 탈락. 배포 화면·로그 UI가 필요해지면 Komodo를 실행·관측 레이어로만 붙이는 것을 검토합니다.
- **Watchtower류 풀 방식**: 서버에 GHCR 장기 토큰(classic PAT)이 필요하고 헬스 실패 롤백이 없습니다. 탈락.
- **서버 self-hosted runner**: 러너 등록 정보가 서버에 남고, Free 플랜에서는 배포 job을 main으로 제한할 수 없어 아무 브랜치의 워크플로가 서버에서 실행될 수 있습니다. 예비안으로만 둡니다.
- **Cloudflare Access 경유 SSH**: 서비스 토큰이 GitHub secret에 정적으로 남고 main 제한이 없습니다. 탈락.
- **Kamal 2**: 무중단 전환·롤백이 강점이지만 설정 1개가 이미지 1개 단위이고 kamal-proxy가 80·443을 잡으며 비밀값이 CI 러너를 거칩니다. 무중단 배포가 필요해질 때 Tailscale 접속 위에 얹는 후보로 둡니다.
- **관리형 컨테이너(ECS·OCI Container Instances 등)**: compose·롤백·비밀값·로그를 플랫폼 방식으로 다시 써야 하고 IaC가 사실상 필수입니다. 업로드를 S3로 옮긴 뒤 비용·운영 이유가 생기면 검토합니다.
- **Infisical Cloud Free(서버가 pull)**: 웹 UI 편집은 편하지만 Free에 감사 로그·버전 관리가 없고 서버에 장기 client secret이 남습니다. 서버가 여러 대가 되어 동기화가 부담되면 다시 검토합니다.
- **GitHub secrets 단독·Doppler·Bitwarden·1Password·Vault/OpenBao**: push 권한 = 비밀 읽기(GitHub secrets), OIDC·감사 로그 부재(Doppler·Bitwarden Free), 비용(1Password), 운영 부담(Vault/OpenBao)으로 탈락. 1Password를 쓰게 되면 운영자 age 키 보관처로 씁니다.
- **암호문을 별도 운영 저장소에 두기**: 에이전트가 push할 수 없는 저장소에 compose·암호문을 두면 비밀 바꿔치기·탈취 경로가 줄어들지만 저장소가 둘이 되고 배포 단위가 갈라집니다. 지금은 같은 저장소에 두고 한계를 설계 문서에 적습니다.

## 결과와 트레이드오프

- 운영 계정은 Cloudflare·Tailscale·Supabase·GitHub이고 서버는 1대입니다. 서버 장애·집 회선 장애가 곧 서비스 장애입니다(단일 장애점).
- push 권한이 있으면 main에 들어간 `infra/prod/compose.yaml`이 서버에서 그대로 실행되므로, 복호화된 앱 비밀값을 읽는 컨테이너를 넣을 수 있습니다. CI에 비밀값이 없어도 "main에 병합할 수 있는 사람 = 운영 비밀 접근 가능"이라는 경계는 남습니다.
- `deploy` 사용자는 docker 그룹이라 서버 root와 같은 권한입니다. forced command가 배포 키로 할 수 있는 일을 배포·롤백·상태로 줄입니다.
- Tailscale Personal 무료 플랜은 비상업 조건입니다. 상업 운영 전 Standard 등으로 바꿉니다.
- 업로드 이미지는 서버 볼륨에 있어 대상 이전 때 볼륨 복사가 필요합니다. S3 호환 저장소로 옮기는 후속 작업이 있습니다.
- 무료 Supabase는 자동 일시정지·백업 제한이 있어 출시 전 유료 전환이나 백업 절차 확정이 필요합니다.
- 배포 승인자가 없어 안전장치는 CI·헬스체크·자동 롤백에 있습니다. 운영 중 DB migration은 expand/contract(호환되는 변경 먼저, 제거는 다음 배포)로 씁니다.
- 대상이 2대 이상이 되거나 관리형으로 옮기면 OpenTofu로 Cloudflare·Tailscale·서버 자원을 관리하는 것을 검토합니다.
