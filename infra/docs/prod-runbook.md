# 크리링 운영(prod) 런북

운영 서버 준비·최초 배포·운영 절차를 한 곳에 모은 문서입니다. 설계 기준은 [운영 배포·CD 기술 설계](../../docs/specs/crelink-prod-deploy.md)와 [ADR 0010](../../docs/adr/0010-prod-deployment-topology.md), 실행 가능한 원본은 [`infra/prod/`](../prod/README.md)와 `.github/workflows/deploy.yml`·`rollback.yml`입니다. 이 문서와 원본이 다르면 원본이 맞고 이 문서를 같은 변경에서 고칩니다.

- 현재 상태(2026-10-06): 저장소 쪽 코드 준비 완료. OCI 서버(`oci-server`, Ubuntu 26.04 ARM, Docker 29·Compose 2.40)는 있고 80·443을 다른 프로젝트(ai-character-chat)의 Caddy가 쓰고 있습니다. edge 전환·Supabase·Vercel·DNS·GitHub secrets·최초 배포는 아직 하지 않았습니다.
- 외부 서비스 사실은 공식 문서에서 2026-10-06에 확인했고 출처는 [마지막 절](#출처)에 있습니다. 확인하지 못한 것은 `[확인 못 함]`으로 표시합니다.
- `<...>`는 실행하는 사람이 채우는 값입니다. 비밀값을 이 문서·저장소·채팅·작업 로그에 붙여 넣지 않습니다.

## 구성 요약

```text
방문자 ─https─▶ links.shaul.kr (Vercel, Next.js) ── 서버 측 호출 + X-Crelink-Internal ──┐
인스타 링크 ─https─▶ go.shaul.kr ─┐                                                     │
                                 ▼                                                     ▼
OCI 서버: edge Caddy(/opt/edge, project edge, 80·443) ──▶ crelink-api:3000 (/opt/crelink, project crelink-prod) ──TLS──▶ Supabase 세션 풀러
                    └──▶ aichat-api.shaul.kr → ai-character-chat-backend-api-1:3000 (다른 프로젝트)
```

## 값 한눈에 보기

| 항목 | 값 | 어디서 쓰나 |
| --- | --- | --- |
| 웹 주소 | `https://links.shaul.kr` | API `.env` `WEB_URL`, Vercel 도메인, Google 리디렉션 URI `https://links.shaul.kr/auth/google/callback` |
| API·단축 주소 | `https://go.shaul.kr` | API `.env` `SHORT_LINK_BASE_URL`, edge `.env` `CRELINK_DOMAIN`, Vercel `API_INTERNAL_URL` |
| 서버 폴더 | `/opt/crelink`(deploy 소유 755, 비밀값은 `.env` 600), `/opt/edge`(root 소유 755) | `bootstrap.sh`가 만듦 |
| 서버 사용자 | 관리: `ubuntu`(sudo), 배포: `deploy`(docker 그룹, sudo 없음) | GitHub secret `OCI_USER=deploy` |
| 크리링 서버 비밀값 | `/opt/crelink/.env`(600) — 키 목록 [`infra/prod/.env.example`](../prod/.env.example) | API 컨테이너 |
| edge 비밀값 | `/opt/edge/.env`(600) — 키 목록 [`infra/prod/edge/.env.example`](../prod/edge/.env.example) | edge Caddy(`CRELINK_DOMAIN`·`CRELINK_INTERNAL_TOKEN`) |
| 내부 토큰 | `openssl rand -hex 32`로 만든 64자. edge `CRELINK_INTERNAL_TOKEN` = Vercel `API_INTERNAL_TOKEN` | Caddy `/api/*` 통과 조건 |
| Supabase CA | `/opt/crelink/certs/supabase-ca.crt`(644) → 컨테이너 `/etc/crelink/certs/supabase-ca.crt` | `DATABASE_SSL=verify-full`, `DATABASE_SSL_CA_PATH` |
| 이미지 | `ghcr.io/ai-worker-lab/crelink-api:<커밋 SHA>` | `deploy.sh`가 `.env` `API_IMAGE`를 바꿈 |
| 배포 기록 | `/opt/crelink/releases.log`(탭 구분: 시각·동작·이전·새 이미지) | `rollback.sh` 인자 없을 때 |
| GitHub secrets | `OCI_HOST`, `OCI_USER`, `OCI_SSH_KEY`, `OCI_KNOWN_HOSTS`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | 워크플로. GHCR pull은 job의 `GITHUB_TOKEN`(`packages: read`)을 stdin으로 넘기므로 서버·secrets에 GHCR 장기 토큰이 없습니다 |

## 1. OCI 인스턴스·네트워크

이미 있는 `oci-server`를 씁니다. 새로 만들 때만 1-1을 따릅니다.

1-1. 새 인스턴스(필요할 때만): Compute > Instances > Create, 이미지 Canonical Ubuntu(ARM), Shape `VM.Standard.A1.Flex`. Always Free 한도는 문서상 테넌시 전체 2 OCPU·12 GB 메모리(월 1,500 OCPU 시간·9,000 GB 시간)이고, 7일 동안 CPU·네트워크·메모리 사용률이 모두 낮으면 유휴로 회수될 수 있습니다. 공인 IP는 인스턴스와 별개로 남는 **예약 공인 IP**(Networking > IP Management)를 붙입니다. 임시 IP를 예약 IP로 바꿀 수는 없으므로 임시 IP를 지우고 예약 IP를 붙입니다.

1-2. 보안 목록(VCN > 서브넷 > Security List > Add Ingress Rules), 소스 `0.0.0.0/0`:

| 프로토콜 | 포트 | 용도 |
| --- | --- | --- |
| TCP | 22 | SSH(키 인증만). 가능하면 소스를 관리자 IP로 좁힙니다. GitHub Actions 러너 IP는 고정이 아니라 22를 넓게 열어 둡니다 |
| TCP | 80 | ACME HTTP 챌린지, http→https 리디렉션 |
| TCP | 443 | HTTPS |
| UDP | 443 | HTTP/3(선택. 닫혀 있으면 브라우저가 TCP로 내려감) |

1-3. 서버 방화벽: OCI Ubuntu 이미지는 SSH만 허용하는 iptables 규칙(`/etc/iptables/rules.v4`)으로 시작하고, Oracle은 **UFW 사용을 금지**합니다(부팅 실패 가능). `bootstrap.sh`는 방화벽을 건드리지 않습니다. 현재 서버는 aichat Caddy가 80·443을 이미 서비스하므로 열려 있습니다. 새 서버라면 Oracle 안내대로 iptables에 넣고 저장합니다.

```bash
sudo iptables -L INPUT --line-numbers          # REJECT 줄 번호 확인. 그 앞에 넣습니다(예시는 6번째 자리)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Docker가 publish한 포트는 ufw 같은 호스트 방화벽 규칙을 우회합니다. 크리링 API는 호스트 포트를 publish하지 않고, 외부에 열리는 컨테이너 포트는 edge Caddy의 80·443뿐입니다. OCI 기본 iptables의 FORWARD 규칙과 Docker 규칙이 어떻게 맞물리는지는 `[확인 못 함]`이며, 현재 서버에서 aichat Caddy가 동작하는 것이 실측 근거입니다.

## 2. 서버 부트스트랩

로컬 checkout에서 실행합니다. `bootstrap.sh`는 다시 실행해도 같은 결과입니다(Docker가 이미 있으면 설치를 건너뜀).

```bash
# 2-1. 배포 전용 SSH 키(로컬, 비밀번호 없음). 이 키는 GitHub secret에만 넣고 다른 용도로 쓰지 않습니다.
ssh-keygen -t ed25519 -N '' -C crelink-deploy -f ~/.ssh/crelink_deploy

# 2-2. 부트스트랩: deploy 사용자·docker 그룹·authorized_keys, /opt/crelink·/opt/edge·/opt/edge/sites/crelink.caddy, rsync·curl·gzip
scp infra/prod/bootstrap.sh ubuntu@<서버 IP>:/tmp/
ssh ubuntu@<서버 IP> "sudo DEPLOY_SSH_PUBKEY='$(cat ~/.ssh/crelink_deploy.pub)' bash /tmp/bootstrap.sh"

# 2-3. known_hosts: 서버에서 본 호스트 키 지문과 로컬 ssh-keyscan 결과의 지문이 같은지 비교합니다(검증 없이 쓰면 MITM에 취약).
ssh ubuntu@<서버 IP> 'for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf "$f"; done'
ssh-keyscan -t ed25519,ecdsa,rsa <서버 IP> 2>/dev/null > /tmp/crelink_known_hosts
ssh-keygen -lf /tmp/crelink_known_hosts         # 위 지문과 같아야 합니다

# 2-4. 배포 키로 접속·docker 권한 확인
ssh -i ~/.ssh/crelink_deploy -o UserKnownHostsFile=/tmp/crelink_known_hosts deploy@<서버 IP> 'docker version --format {{.Server.Version}} && ls -ld /opt/crelink /opt/edge/sites/crelink.caddy'
```

`deploy`는 docker 그룹이라 사실상 root와 같은 권한입니다(Docker 공식 문서). 배포 전용 키만 등록하고 키를 정기 교체합니다([7-4](#7-4-키비밀값-교체)).

## 3. edge Caddy 전환 (aichat Caddy → 공용 edge)

80·443을 쓰는 ai-character-chat의 Caddy를 서버 공용 edge Caddy로 바꿉니다. edge가 없으면 크리링 `deploy.sh`는 아무것도 바꾸지 않고 실패합니다. aichat 사이트 설정은 [`edge/sites/aichat.caddy`](../prod/edge/sites/aichat.caddy)에 그대로 옮겨 두었습니다.

```bash
# 3-1. 기존 Caddy 확인(관리자). 이름·Compose 폴더·서비스·설정 파일을 적어 둡니다.
docker ps --filter publish=443 --format '{{.Names}}  {{.Label "com.docker.compose.project.working_dir"}}  {{.Label "com.docker.compose.service"}}'
docker inspect <aichat caddy 컨테이너> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
cat <위에서 본 Caddyfile 경로>           # edge/sites/aichat.caddy와 같은 내용인지 확인
docker network inspect ai-character-chat-backend_backend --format '{{.Name}}'   # edge가 참가할 네트워크

# 3-2. edge 파일 배치(로컬 checkout → 서버). .env와 sites/crelink.caddy는 덮어쓰지 않습니다(--delete 없음).
rsync -az --exclude .env.example infra/prod/edge/ ubuntu@<서버 IP>:/tmp/edge/
ssh ubuntu@<서버 IP>
sudo rsync -a /tmp/edge/ /opt/edge/ && sudo chown -R root:root /opt/edge && sudo chown deploy:deploy /opt/edge/sites/crelink.caddy
sudo install -m 600 /dev/null /opt/edge/.env && sudo nano /opt/edge/.env   # edge/.env.example의 두 키. 토큰: openssl rand -hex 32

# 3-3. 전환 전 검사(포트는 아직 기존 Caddy가 씀. run은 포트를 publish하지 않음)
cd /opt/edge
sudo docker compose config --quiet
sudo docker compose pull
sudo docker compose run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# 3-4. 전환(수 초 중단 + 인증서 발급 시간). edge 볼륨은 새로 만들어 인증서를 다시 받습니다.
docker stop <aichat caddy 컨테이너>
sudo docker compose up -d
sudo docker compose logs -f caddy          # "certificate obtained successfully" 확인 후 Ctrl-C

# 3-5. 확인
curl -sS -o /dev/null -w '%{http_code}\n' https://aichat-api.shaul.kr/
echo | openssl s_client -connect aichat-api.shaul.kr:443 -servername aichat-api.shaul.kr 2>/dev/null | openssl x509 -noout -issuer -dates
```

- 인증서 재발급: Let's Encrypt는 같은 이름 집합에 7일 동안 최대 5장까지 발급합니다. 전환을 여러 번 되풀이하지 않습니다. 재발급을 피하려면 3-4에서 `sudo docker compose create` → `docker run --rm -v <기존 caddy data 볼륨>:/from:ro -v edge_data:/to alpine:3.22 cp -a /from/. /to/` → `docker stop <aichat caddy>` → `sudo docker compose start` 순서로 기존 인증서를 옮길 수 있습니다.
- 기존 컨테이너는 `docker stop`이라 `restart: unless-stopped`여도 재부팅 뒤 다시 뜨지 않습니다. 하지만 ai-character-chat 쪽에서 `docker compose up`을 다시 실행하면 그 Caddy가 80·443을 잡으려다 실패합니다. 그 프로젝트의 Compose에서 Caddy 서비스를 빼는 일은 그 저장소에서 합니다.
- 전환 롤백: `cd /opt/edge && sudo docker compose down`(볼륨은 남김, `-v` 금지) → `docker start <aichat caddy 컨테이너>`.
- 사이트 추가·수정: `/opt/edge/sites/<이름>.caddy`를 고친 뒤 `cd /opt/edge && sudo docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`. `/opt/edge/.env` 값을 바꾸면 reload가 아니라 `sudo docker compose up -d`(컨테이너 재생성, 모든 사이트 수 초 중단)가 필요합니다.

## 4. 외부 서비스 준비

### 4-1. DNS (`shaul.kr` 영역)

| 이름 | 유형 | 값 | 프록시 |
| --- | --- | --- | --- |
| `go` | A | 서버 예약 공인 IP | 켬(주황 구름) |
| `links` | CNAME | Vercel 프로젝트 Settings > Domains에 표시되는 **프로젝트별** 값(예전의 공용 `cname.vercel-dns.com`이 아님) | 끔 권장(아래) |

- Cloudflare 프록시를 씁니다(사용자 결정 2026-10-06). SSL/TLS 모드는 **Full (strict)**로 둡니다(원본 Caddy·Vercel 모두 유효한 인증서가 있음). Flexible을 쓰면 원본으로 HTTP가 가서 Caddy의 HTTPS 리디렉트와 반복됩니다.
- 방문자 IP: edge Caddy(`edge/Caddyfile`)는 Cloudflare 대역에서 온 요청만 `CF-Connecting-IP`를 믿습니다. 대역 목록(<https://www.cloudflare.com/ips-v4>, <https://www.cloudflare.com/ips-v6>)이 바뀌면 `trusted_proxies` 줄을 갱신하고 reload합니다.
- 인증서: Caddy가 Let's Encrypt HTTP 검증으로 받습니다(같은 서버의 `aichat-api.shaul.kr`도 프록시 켠 상태로 발급·유지 중). 발급이 실패하면 Cloudflare의 **Always Use HTTPS**가 `/.well-known/acme-challenge/` 요청을 막는지 확인하고, 막으면 첫 발급 동안 그 레코드만 DNS only로 바꿨다가 되돌립니다.
- Vercel은 앞단 리버스 프록시(Cloudflare 프록시 포함)를 권장하지 않습니다. 방문자 IP·Vercel 방화벽·캐시가 가려지기 때문입니다([Reverse Proxy Servers and Vercel](https://vercel.com/docs/security/reverse-proxy), [Should I use Cloudflare in front of Vercel?](https://vercel.com/kb/guide/cloudflare-with-vercel), 확인일 2026-10-06). 그래서 `links`는 **DNS only를 권장**하고, 프록시를 켜려면 Vercel KB의 설정(SSL Full (strict), 캐시 우회)을 따릅니다. `go`(OCI)는 프록시를 켭니다.
- 배포 후 검사(`deploy.yml`의 운영 주소 검사)는 GitHub 러너에서 Cloudflare를 거쳐 요청합니다. Bot Fight Mode 등이 러너를 막으면 검사가 실패하니 해당 기능을 끄거나 예외를 둡니다.

확인: `dig +short go.shaul.kr`(Cloudflare IP가 나오면 정상).

### 4-2. Supabase

1. prod 전용 프로젝트를 만듭니다(리전은 서버와 가까운 곳). DB 비밀번호는 비밀번호 관리자에 보관합니다.
2. 프로젝트 상단 **Connect** → **Session pooler** 연결 문자열을 복사합니다. 형식 `postgresql://postgres.<프로젝트 ref>:<비밀번호>@aws-<N>-<리전>.pooler.supabase.com:5432/postgres`. 호스트는 리전 이름으로 조합할 수 없으니 화면 값을 그대로 씁니다. 세션 풀러는 IPv4로 접속되고(직접 연결 `db.<ref>.supabase.co`는 IPv6 전용, IPv4는 유료 애드온) session-level advisory lock을 지원합니다. **6543(트랜잭션 모드)은 쓰지 않습니다**(migration advisory lock·prepared statement 미지원).
3. Database Settings > SSL Configuration: **Enforce SSL on incoming connections**를 켜고(적용 시 DB가 잠깐 재시작), **Download Certificate**로 CA 파일을 받아 서버에 둡니다.

   ```bash
   scp -i ~/.ssh/crelink_deploy <받은 파일>.crt deploy@<서버 IP>:/opt/crelink/certs/supabase-ca.crt
   ssh -i ~/.ssh/crelink_deploy deploy@<서버 IP> chmod 644 /opt/crelink/certs/supabase-ca.crt
   ```

4. 플랜: Free는 7일 동안 활동이 적으면 일시정지되고(1년 안에 대시보드에서 재개) 자동 백업이 없습니다. 출시 전 **Pro로 전환**합니다(일일 백업 7일 보관, PITR은 별도 애드온). Pro 전환 전까지는 [7-3](#7-3-백업복구)의 `pg_dump` 백업을 정기적으로 합니다.

### 4-3. Google OAuth

Google Auth Platform > Clients(<https://console.developers.google.com/auth/clients>)에서 웹 애플리케이션 클라이언트의 **승인된 리디렉션 URI**에 `https://links.shaul.kr/auth/google/callback`을 추가합니다(정확히 같아야 하며 반영에 5분~몇 시간). 크리링은 이름·이메일·프로필 범위만 쓰므로 Testing 상태에서도 테스트 사용자 제한·7일 만료가 적용되지 않는 예외에 해당하지만, 운영 공개 전 Publishing status를 **In production**으로 바꿉니다. 클라이언트 ID·비밀번호는 `/opt/crelink/.env`의 `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`에 넣습니다.

### 4-4. Vercel

웹 빌드 설정과 환경변수 표의 원본은 [apps/web/README.md "Vercel 배포"](../../apps/web/README.md#vercel-배포)입니다. 여기서는 순서만 적습니다.

1. Git 연동 없이 프로젝트를 만듭니다: 저장소 루트에서 `pnpm dlx vercel@62 link`(팀·프로젝트 선택) → 생성된 `.vercel/project.json`의 `orgId`·`projectId`가 GitHub secret `VERCEL_ORG_ID`·`VERCEL_PROJECT_ID`입니다. `.vercel/`은 커밋하지 않습니다. 대시보드에서 Git을 연결했다면 Settings > Git > **Disconnect**로 끊습니다(CI와 이중 배포 방지). 저장소가 GitHub 조직(`ai-worker-lab`) 소유이고 Vercel이 개인 Hobby 계정이어도 됩니다. Hobby가 막는 것은 **Git 연동 배포**(커밋 작성자가 Hobby 팀 소유자여야 함, 비공개 저장소 협업 불가)이고, CI가 토큰으로 `vercel deploy --prebuilt`하는 방식에는 저장소 소유자 조건이 없습니다([Troubleshoot project collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration), 확인일 2026-10-06). 그래서 Git을 연결하지 않습니다.
2. Settings > Build and Deployment > **Root Directory** = `apps/web`.
3. Settings > Environment Variables(**Production**만): `API_INTERNAL_URL=https://go.shaul.kr`, `API_INTERNAL_TOKEN=<edge CRELINK_INTERNAL_TOKEN과 같은 값>`(Sensitive 켬). 환경변수 변경은 다음 배포부터 적용됩니다.
4. Settings > Domains에 `links.shaul.kr` 추가 → 표시되는 CNAME을 DNS에 넣습니다.
5. 계정 Settings > Tokens에서 `VERCEL_TOKEN`을 만듭니다(만료일 지정).
6. Hobby 플랜은 **비상업적 개인 용도만** 허용합니다. 결제·판매 광고 등 수익 활동 전에 Pro로 바꿉니다. Hobby의 `vercel rollback`은 직전 운영 배포로만 되돌릴 수 있습니다.

### 4-5. GitHub Actions secrets

저장소 Settings > Secrets and variables > Actions > **New repository secret**(또는 `gh secret set <이름> < 파일`).

| secret | 값 만드는 법 |
| --- | --- |
| `OCI_HOST` | 서버 예약 공인 IP(또는 DNS 이름) |
| `OCI_USER` | `deploy` |
| `OCI_SSH_KEY` | `gh secret set OCI_SSH_KEY < ~/.ssh/crelink_deploy`(2-1의 개인키 전체) |
| `OCI_KNOWN_HOSTS` | `gh secret set OCI_KNOWN_HOSTS < /tmp/crelink_known_hosts`(2-3에서 지문을 확인한 파일) |
| `VERCEL_TOKEN` | 4-4의 5 |
| `VERCEL_ORG_ID`·`VERCEL_PROJECT_ID` | 4-4의 1(`.vercel/project.json`) |

GHCR: 워크플로가 `GITHUB_TOKEN`(`packages: write`)으로 이미지를 올리면 패키지가 이 저장소에 연결되고(기본 private) 같은 저장소 job의 `GITHUB_TOKEN`(`packages: read`)으로 받을 수 있습니다. 같은 이름의 패키지를 CLI로 먼저 올려 두면 연결되지 않아 워크플로가 push하지 못하니 손으로 push하지 않습니다.

## 5. 최초 배포

순서대로 하고 각 단계의 확인이 통과해야 다음으로 갑니다.

1. [1](#1-oci-인스턴스네트워크)~[4](#4-외부-서비스-준비) 완료: 부트스트랩, edge 전환, DNS(`dig +short go.shaul.kr`이 서버 IP), Supabase(세션 풀러 문자열·CA 파일), Google 리디렉션 URI, Vercel 프로젝트·환경변수, GitHub secrets.
2. 서버 `.env`(로컬 checkout에서):

   ```bash
   scp -i ~/.ssh/crelink_deploy infra/prod/.env.example deploy@<서버 IP>:/opt/crelink/.env
   ssh -i ~/.ssh/crelink_deploy deploy@<서버 IP>
   chmod 600 /opt/crelink/.env && nano /opt/crelink/.env   # DATABASE_URL, GOOGLE_*, OPERATOR_EMAILS 채움. API_IMAGE는 그대로 둠
   ```

3. GitHub Actions에서 **Deploy** 워크플로를 `workflow_dispatch`로 실행합니다(이후에는 main CI 성공 시 자동). 워크플로가 `infra/prod/`를 `/opt/crelink/`로 rsync하고 `deploy.sh <SHA>`를 실행합니다. 첫 배포가 헬스 실패하면 되돌릴 이전 이미지가 없어 API가 실패 상태로 남습니다 → 서버에서 `cd /opt/crelink && docker compose logs --tail 100 api`로 원인(대개 `.env`·DB 접속)을 고치고 다시 실행합니다.
4. GeoIP(선택, 없으면 방문 기록의 국가·도시만 비어 있음):

   ```bash
   cd /opt/crelink && ./geoip.sh --restart
   crontab -e   # 매월 3일 04:17 UTC 갱신: 17 4 3 * * cd /opt/crelink && ./geoip.sh --restart >> /opt/crelink/geoip.log 2>&1
   ```

5. 확인(로컬에서):

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://links.shaul.kr/                       # 200
   curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://go.shaul.kr/zzzz        # 302 → https://links.shaul.kr/notice?reason=link_not_found
   curl -sS -o /dev/null -w '%{http_code}\n' https://go.shaul.kr/api/health                 # 404(토큰 없이 닫힘)
   ```

   그다음 구글 로그인, 단축 주소 생성·방문, 링크 클릭 기록의 IP가 내 공인 IP인지(Caddy 주소가 아닌지) 확인합니다.

## 6. 일상 배포·롤백

- 배포: main에 병합 → CI 성공 → Deploy 워크플로가 API(`deploy.sh`) → 웹(Vercel) 순서로 배포합니다. `deploy.sh`는 헬스(이미지 HEALTHCHECK `/api/health/ready`)가 60초 안에 healthy가 아니면 이전 이미지로 스스로 되돌리고 실패(종료 1)합니다. 이미지 교체 중 수 초 동안 단축 주소가 502일 수 있습니다(컨테이너 1개).
- 롤백(권장): GitHub Actions **Rollback** 워크플로(`target` api|web|both, `api_tag` 비우면 직전).
- 서버에서 직접(Actions를 쓸 수 없을 때, 이미지가 서버에 남아 있으면 토큰 없이 동작):

  ```bash
  cd /opt/crelink
  ./rollback.sh                 # releases.log에서 현재 이미지를 배포한 deploy 줄의 이전 이미지로
  ./rollback.sh <커밋 SHA>       # 지정 태그로
  column -t -s $'\t' releases.log | tail
  ```

- 종료 코드(`deploy.sh`·`rollback.sh`): 0 성공(마지막 줄 = 배포된 이미지), 1 실패(이전 이미지로 복구했거나 아무것도 바꾸지 않음), 2 실패 후 복구도 실패(즉시 [8](#8-장애-대응-체크리스트)).
- DB migration은 API 기동 시 실행되므로 롤백된 이전 코드가 새 스키마에서 동작해야 합니다. 컬럼·테이블 삭제는 쓰는 코드를 먼저 배포한 다음 배포에서 합니다(expand/contract).
- 오래된 이미지 정리(디스크): 롤백 후보(최근 몇 개)는 남기고 지웁니다. `docker images ghcr.io/ai-worker-lab/crelink-api` → `docker rmi ghcr.io/ai-worker-lab/crelink-api:<오래된 SHA>`.

## 7. 운영 작업

### 7-1. 서버 상태 보기

```bash
cd /opt/crelink && docker compose ps && docker compose logs --tail 100 api
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q api)"
cd /opt/edge && sudo docker compose ps && sudo docker compose logs --tail 100 caddy
```

### 7-2. 내부 토큰

edge Caddy는 `/api/*` 요청의 `X-Crelink-Internal`이 `CRELINK_INTERNAL_TOKEN`과 같을 때만 API로 넘기고(토큰이 비어 있으면 모두 거부), 넘길 때 이 헤더를 지웁니다. 비교는 Caddy CEL 문자열 `==`이며 **상수 시간 비교가 아닙니다**. Caddy에는 임의 헤더를 상수 시간으로 비교하는 matcher가 없습니다(`basic_auth`는 Authorization 헤더·bcrypt 전용). 64자 무작위 토큰을 인터넷 너머에서 응답 시간 차이로 한 글자씩 알아내는 것은 현실적이지 않다고 보고 받아들이며, 의심되면 [7-4](#7-4-키비밀값-교체)대로 바로 교체합니다. Caddy 접근 로그를 켤 때는 이 헤더를 로그 필터로 지웁니다.

### 7-3. 백업·복구

| 대상 | 방법 |
| --- | --- |
| DB | Pro: Supabase 일일 백업(7일)·대시보드 복원. Free 기간과 추가 보관용: 아래 `pg_dump` |
| 업로드 이미지 | 서버 볼륨 `crelink-prod_uploads`. 아래 tar를 서버 밖으로 복사 |
| `/opt/crelink/.env`·`/opt/edge/.env` | 서버 밖 비밀번호 관리자에 같은 값 보관 |
| edge 인증서(`edge_data`) | 백업하지 않음(잃으면 다시 발급, 7일 5장 제한 유의) |

```bash
# DB(로컬에서, Supabase Postgres 메이저와 같은 pg_dump. 서버 메이저 버전은 대시보드에서 확인)
docker run --rm -e PGURL='<세션 풀러 연결 문자열>?sslmode=require' -v "$PWD:/out" postgres:17-alpine \
  sh -c 'pg_dump "$PGURL" -Fc -f /out/crelink-$(date -u +%Y%m%d).dump'
# 복원(새 프로젝트 등 대상 DB에): pg_restore --no-owner --no-privileges -d '<대상 연결 문자열>' crelink-YYYYMMDD.dump

# 업로드(서버에서 deploy로)
mkdir -p /opt/crelink/backups
docker run --rm -v crelink-prod_uploads:/data:ro -v /opt/crelink/backups:/backup alpine:3.22 \
  tar czf "/backup/uploads-$(date -u +%Y%m%d).tgz" -C /data .
# 로컬로: rsync -az -e 'ssh -i ~/.ssh/crelink_deploy' deploy@<서버 IP>:/opt/crelink/backups/ ./crelink-backups/
# 복원: docker run --rm -v crelink-prod_uploads:/data -v /opt/crelink/backups:/backup:ro alpine:3.22 \
#   sh -c 'tar xzf /backup/uploads-YYYYMMDD.tgz -C /data && chown -R 1000:1000 /data'
```

`pg_dump`의 Supabase 메이저 버전 일치와 세션 풀러 경유 덤프의 제약은 `[확인 못 함]`입니다. 처음 백업할 때 복원까지 한 번 시험합니다.

### 7-4. 키·비밀값 교체

| 대상 | 절차 |
| --- | --- |
| 배포 SSH 키 | 새 키 `ssh-keygen -t ed25519 -N '' -C crelink-deploy -f ~/.ssh/crelink_deploy_new` → 공개키를 `/home/deploy/.ssh/authorized_keys`에 추가 → `gh secret set OCI_SSH_KEY < ~/.ssh/crelink_deploy_new` → Deploy 워크플로 실행으로 확인 → 옛 공개키 줄 삭제 |
| 내부 토큰 | 새 값 `openssl rand -hex 32` → Vercel `API_INTERNAL_TOKEN`(Production) 수정 → `/opt/edge/.env` 수정 후 `cd /opt/edge && sudo docker compose up -d` → 즉시 웹 재배포(Deploy 워크플로 수동 실행). Caddy가 한 값만 받으므로 edge 반영부터 웹 재배포 완료까지 웹→API 호출이 실패합니다. 사용이 적은 시간에 합니다 |
| Google 클라이언트 비밀번호 | 콘솔에서 새 비밀번호 추가 → `/opt/crelink/.env` 수정 → `cd /opt/crelink && docker compose up -d api`(환경변수 반영은 재생성) → 로그인 확인 → 옛 비밀번호 삭제 |
| DB 비밀번호 | Supabase에서 재설정 → `.env` `DATABASE_URL` 수정 → `docker compose up -d api` → 헬스 확인 |
| `VERCEL_TOKEN` | 새 토큰 만들기 → secret 교체 → 옛 토큰 삭제 |
| GHCR | 장기 토큰 없음(job마다 `GITHUB_TOKEN`). 교체할 것 없음 |

`.env`를 바꾼 뒤 `docker compose up -d api`가 헬스 실패하면 `.env`를 되돌리고 다시 `up -d`합니다(`deploy.sh`의 자동 복구는 이미지 교체에만 적용).

### 7-5. 도메인 변경(정식 도메인)

`SHORT_LINK_BASE_URL`(서버 `.env`), `CRELINK_DOMAIN`(edge `.env`, `up -d`), Vercel `API_INTERNAL_URL`, DNS를 함께 바꿉니다. 이미 인스타그램에 걸린 옛 단축 주소가 계속 동작해야 하므로 옛 도메인 사이트를 edge에 남기는 방법은 그때 정합니다.

## 8. 장애 대응 체크리스트

1. 무엇이 안 되나: `curl -sS -o /dev/null -w '%{http_code}\n' https://go.shaul.kr/zzzz`(302가 정상), `https://links.shaul.kr/`, `https://aichat-api.shaul.kr/`(edge 전체 문제인지 구분).
2. 최근 배포·롤백: Actions 실행 기록, 서버 `tail /opt/crelink/releases.log`. 직후라면 [6](#6-일상-배포롤백)대로 롤백부터.
3. 컨테이너: [7-1](#7-1-서버-상태-보기)의 상태·헬스·로그. API가 unhealthy면 로그에서 DB 접속·환경변수 오류를 봅니다.
4. DB: Supabase 대시보드(일시정지·장애·연결 수), `.env`의 세션 풀러 문자열·CA 파일.
5. TLS: edge 로그의 인증서 발급 오류, `dig +short go.shaul.kr`, 보안 목록·iptables 80·443.
6. 서버 자원: `df -h`, `docker system df`, `free -h`, `uptime`. 디스크가 차면 오래된 이미지부터 지웁니다([6](#6-일상-배포롤백)).
7. 웹만 안 되면: Vercel 배포 상태, `API_INTERNAL_URL`·`API_INTERNAL_TOKEN`, Vercel Rollback.
8. 복구 뒤 원인·조치를 운영 work item에 기록합니다.

## 로컬 시험

원격 없이 Docker로 이 구성의 동작을 확인합니다([infra/prod/README.md](../prod/README.md#로컬-시험)).

## 출처

모두 2026-10-06 확인.

| 사실 | 출처 |
| --- | --- |
| OCI Ubuntu 기본 iptables(SSH만 허용)·UFW 금지·`rules.v4` | <https://docs.oracle.com/en-us/iaas/Content/Compute/References/images.htm>, <https://docs.oracle.com/en-us/iaas/Content/Compute/known-issues.htm> |
| iptables로 80 열기·`netfilter-persistent save`(443·UDP는 같은 방식으로 추론) | <https://docs.oracle.com/en-us/iaas/Content/developer/wp-on-ubuntu/01-summary.htm> |
| 보안 목록 인그레스 규칙 | <https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm> |
| 예약 공인 IP | <https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingpublicIPs.htm> |
| Always Free A1 한도·유휴 회수 | <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm> |
| Docker 공식 apt 설치(`docker.sources`, 패키지·충돌 패키지) | <https://docs.docker.com/engine/install/ubuntu/> |
| publish 포트의 방화벽 우회 | <https://docs.docker.com/engine/network/packet-filtering-firewalls/#docker-and-ufw> |
| docker 그룹 = root 권한 | <https://docs.docker.com/engine/install/linux-postinstall/> |
| Compose `env_file.required`, `!override` | <https://docs.docker.com/reference/compose-file/services/#env_file>, <https://docs.docker.com/reference/compose-file/merge/> |
| Supabase 세션 풀러·IPv4·트랜잭션 모드 제약·Connect | <https://supabase.com/docs/guides/database/connecting-to-postgres> |
| Supabase SSL 강제·CA 다운로드 | <https://supabase.com/docs/guides/platform/ssl-enforcement> |
| Supabase Free 일시정지 | <https://supabase.com/docs/guides/platform/free-project-pausing> |
| Supabase 백업·PITR | <https://supabase.com/docs/guides/platform/backups> |
| Vercel Hobby 상업적 사용 금지 | <https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage> |
| Vercel Root Directory | <https://vercel.com/docs/monorepos> |
| Vercel Git 자동 배포 끄기·연결 해제 | <https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled>, <https://vercel.com/docs/project-configuration/git-settings> |
| Vercel CLI 배포·`VERCEL_ORG_ID`·`VERCEL_PROJECT_ID` | <https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel> |
| Vercel 도메인 CNAME(프로젝트별 값) | <https://vercel.com/docs/domains/working-with-domains/add-a-domain> |
| Vercel 환경변수·Sensitive | <https://vercel.com/docs/environment-variables>, <https://vercel.com/docs/environment-variables/sensitive-environment-variables> |
| Vercel rollback(Hobby는 직전만) | <https://vercel.com/docs/cli/rollback>, <https://vercel.com/docs/instant-rollback> |
| GitHub Actions secrets | <https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets> |
| GHCR 인증·기본 private·저장소 연결 | <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry> |
| Google OAuth 클라이언트·리디렉션 URI·반영 시간 | <https://support.google.com/cloud/answer/15549257>, <https://developers.google.com/identity/protocols/oauth2/web-server> |
| Google Publishing status·테스트 제한 예외 | <https://support.google.com/cloud/answer/15549945> |
| Caddy 자동 HTTPS 조건·data 디렉터리 | <https://caddyserver.com/docs/automatic-https>, <https://caddyserver.com/docs/conventions#data-directory> |
| Caddy `X-Forwarded-*` 기본 동작(신뢰하지 않는 값은 무시) | <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults> |
| Caddy 공식 이미지(`/data` 유지, HTTP/3 UDP 443, `caddy reload`) | <https://hub.docker.com/_/caddy> |
| Let's Encrypt 같은 이름 집합 7일 5장 | <https://letsencrypt.org/docs/rate-limits/> |
| DB-IP City Lite(CC BY 4.0, 매월 갱신, 파일 이름) | <https://db-ip.com/db/download/ip-to-city-lite> |
| ssh-keyscan 결과를 검증 없이 쓰면 MITM 위험 | <https://man.openbsd.org/ssh-keyscan.1> |

`[확인 못 함]`: OCI 기본 iptables FORWARD 규칙과 Docker 규칙의 상호작용, OCI 콘솔에서 호스트 키 지문을 확인하는 공식 절차(2-3은 관리자 SSH로 확인), `pg_dump`의 Supabase 버전·풀러 제약.
