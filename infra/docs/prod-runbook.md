# 크리링 운영(prod) 런북

운영 서버 준비·최초 배포·운영 절차를 한 곳에 모은 문서입니다. 설계(구성·공개 경로·비밀값 표·배포 흐름·보안 한계·이식 규칙)의 원본은 [운영 배포·CD 기술 설계](../../docs/specs/crelink-prod-deploy.md), 결정은 [ADR 0010](../../docs/adr/0010-prod-deployment-topology.md), 실행 가능한 원본은 [`infra/prod/`](../prod/README.md)와 `.github/workflows/deploy.yml`·`rollback.yml`입니다. 이 문서와 원본이 다르면 원본이 맞고 이 문서를 같은 변경에서 고칩니다.

- 대상별 적용 상태(언제 무엇을 실행했는지)는 운영 work item 진행 기록에 남기고 이 문서에는 적지 않습니다.
- **배포 방식: Blue/Green 무중단**([ADR 0011](../../docs/adr/0011-zero-downtime-deploy.md)). 배포·롤백·`geoip.sh --restart`는 비활성 색(blue·green)에 새 릴리스를 올리고 헬스를 통과하면 고정 edge Caddy의 업스트림을 reload로 바꾼 뒤 옛 색을 drain(20초)·정지합니다. 새 색이 실패하면 활성 색과 트래픽은 그대로입니다. 이 방식은 서버에서 [14. blue/green cutover](#14-bluegreen-cutover)를 한 번 한 뒤부터이고, cutover 전 서버(`crelink-prod` 단일 스택)에서는 새 `deploy.sh`가 아무것도 바꾸지 않고 실패합니다. 남는 공백은 cutover 1회(운영 실측 0.5초)와 edge 재생성(Caddy 이미지·포트·마운트 변경, [6-3](#6-3-edge-설정-갱신caddy-이미지-업그레이드), 1~2초[추정])뿐이고, 운영 배포 결과는 [설계 "릴리스·배포·롤백"](../../docs/specs/crelink-prod-deploy.md#릴리스배포롤백)에 있습니다. 공백은 [6-1](#6-1-배포-공백-측정)로 재서 운영 work item에 남깁니다.
- 외부 서비스 사실은 공식 문서에서 2026-10-06에 확인했고 출처는 [마지막 절](#출처)에 있습니다. 확인하지 못한 것은 `[확인 못 함]`으로 표시합니다.
- `<...>`는 실행하는 사람이 채우는 값입니다. 비밀값을 이 문서·저장소·채팅·작업 로그에 붙여 넣지 않습니다.
- 명령의 `home-server`는 운영자의 SSH 별칭이자 Tailscale MagicDNS 이름입니다. 다른 대상이면 그 이름으로 바꿉니다.

## 값 한눈에 보기

| 항목 | 값 |
| --- | --- |
| 대상 목록 | `infra/prod/targets.json`(`name`·`host`(MagicDNS)·`platform`·`enabled`) |
| 서버 사용자 | 운영자 관리 계정(sudo, Tailscale로 접속), 배포 `deploy`(docker 그룹, sudo 없음, 배포 키는 forced command) |
| 서버 경로 | `/opt/crelink/{releases,current,state}`, `state/active-color`(활성 색 `blue`·`green`, 없으면 cutover 전), `/opt/crelink/edge/{compose.yaml,conf/}`(edge 스택, `conf/`는 edge Caddy의 `/etc/caddy` 폴더 bind: `Caddyfile`·`upstreams.caddy`), `/etc/crelink/{target,age.key}`, `/run/crelink`(tmpfs). 설명은 `infra/prod/lib.sh` 머리말과 [설계 "서버 배치"](../../docs/specs/crelink-prod-deploy.md#서버-배치) |
| 컨테이너 | edge: project `crelink-edge`의 `crelink-edge-caddy-1`(`/opt/crelink/edge/compose.yaml`, 배포와 무관하게 계속 실행). 앱: project `crelink-blue`·`crelink-green`의 `crelink-<색>-api-1`·`crelink-<색>-web-1`(활성 색만 실행, 옛 색은 정지 상태로 남음). cutover 전·되돌린 뒤: `crelink-prod`(`crelink-prod-caddy-1`·`-api-1`·`-web-1`) |
| 네트워크·볼륨 | Docker 네트워크 `crelink-edge`(edge와 두 색, 색 별칭 `api-<색>`·`web-<색>`만 씀), GeoIP 볼륨 `crelink-prod_geoip`(두 색이 같이 씀, 이름은 cutover 전 것을 이어 씀). `bootstrap.sh`·`cutover.sh`가 만듦 |
| 스택 입구 | `127.0.0.1:18080`(edge Caddy, 관리 API는 컨테이너 안 `localhost:2019`만). cloudflared가 여기로 보냄 |
| 전환 | 새 색 `up --wait`(최대 120초) → edge 안에서 `api-<색>:3000/api/health/ready`·`web-<색>:3000/privacy` → `conf/upstreams.caddy` 교체·`caddy validate`·`caddy reload` → 상태 기록 → drain `CRELINK_DRAIN_SECONDS`(기본 20초) → 옛 색 `docker stop -t 30`. Caddy `grace_period 30s`, 업스트림 재시도 `lb_try_duration 10s`, 업스트림 keep-alive 4초(Node `keepAliveTimeout` 5초보다 짧게: 닫힌 연결로 보낸 요청의 502와 옛 색 정지 지연 방지) |
| 비밀값 원본 | `infra/prod/secrets/<대상>.sops.env`(SOPS + age, 수신자는 `.sops.yaml`) |
| 운영자 age 키 | macOS 키체인 서비스 `crelink-sops-age`, 계정 `operator` + 운영자 비밀번호 관리자 백업 |
| 업로드 저장소 | `s3`(compose `api.environment`의 `FILE_STORAGE=s3` 고정): SeaweedFS `https://s3.shaul.kr` 버킷 `crelink-uploads`, 접근 키는 암호문 `S3_*`. 볼륨 `crelink-prod_uploads`는 쓰지 않음. [9](#9-업로드-저장소) |
| 정지·헬스(api·web) | compose `stop_grace_period: 30s`(SIGTERM 뒤 진행 중 요청을 마칠 시간, 넘으면 SIGKILL. 기본 10초, Cloudflare 원본 응답 한도 100초(524)보다 짧게), `healthcheck.start_interval: 1s`(기동 중 1초마다 검사해 준비되자마자 healthy)와 Compose가 함께 요구하는 `start_period`(api 30초·web 20초, 이미지와 같은 값). test·interval(10초)·timeout·retries는 이미지 `HEALTHCHECK`(확인: [6](#6-운영-확인)). Docker Engine 25 이상 |
| DB pool 상한 | 암호문 평문 `DATABASE_POOL_MAX=6`(API pg Pool `max`, 비면 15). 산정·확인은 [12](#12-supabase-주의사항) |
| GitHub | variables `TS_OIDC_CLIENT_ID`·`TS_OIDC_AUDIENCE`, secret `DEPLOY_SSH_KEY`. 그 밖의 배포 secret 없음 |

## 1. 서버 준비 (bootstrap)

대상 서버는 Ubuntu(amd64·arm64)이고 Tailscale에 접속되어 있어야 합니다(운영자가 `ssh home-server`로 들어갈 수 있는 상태). `bootstrap.sh`는 다시 실행해도 같은 결과입니다. 하는 일은 스크립트 머리말이 원본입니다(패키지·sops 3.13.3(SHA-256 확인)·Docker, `deploy` 사용자, `ssh-entry.sh` 설치, `/opt/crelink`(edge 폴더 `edge/conf` 포함), tmpfiles, Docker 네트워크 `crelink-edge`·볼륨 `crelink-prod_geoip`(없을 때만), `/etc/crelink`(target·age 키 생성), 토큰을 주면 cloudflared). edge·앱 스택은 띄우지 않습니다(처음 한 번은 [14](#14-bluegreen-cutover)의 `cutover.sh`). 방화벽은 건드리지 않습니다.

```bash
# 1-1. 배포 전용 SSH 키(로컬 임시 폴더, 비밀번호 없음). 개인키는 GitHub secret에만 넣고 지웁니다(2-4).
mkdir -m 700 /tmp/crelink-key && ssh-keygen -t ed25519 -N '' -C crelink-deploy -f /tmp/crelink-key/crelink_deploy

# 1-2. bootstrap.sh는 같은 폴더의 ssh-entry.sh를 설치하므로 둘을 함께 복사합니다.
ssh home-server 'mkdir -p /tmp/crelink-bootstrap'
scp infra/prod/bootstrap.sh infra/prod/ssh-entry.sh home-server:/tmp/crelink-bootstrap/
ssh -t home-server "sudo TARGET_NAME=home-server DEPLOY_SSH_PUBKEY='$(cat /tmp/crelink-key/crelink_deploy.pub)' bash /tmp/crelink-bootstrap/bootstrap.sh"
```

- 마지막 줄에 이 서버의 age 공개키가 나옵니다. `.sops.yaml`에 그 대상 수신자로 들어가 있어야 합니다([4-4](#4-4-새-대상수신자-추가)).
- cloudflared가 아직 없는 새 서버는 Tunnel 토큰을 함께 줍니다. 토큰이 셸 기록에 남지 않게 서버에서 읽어 넘깁니다: `ssh -t <host>` → `read -rs CLOUDFLARED_TOKEN` → `sudo TARGET_NAME=<이름> DEPLOY_SSH_PUBKEY='<공개키>' CLOUDFLARED_TOKEN="$CLOUDFLARED_TOKEN" bash /tmp/crelink-bootstrap/bootstrap.sh`. home-server는 기존 Tunnel `my-home-server`를 쓰므로 주지 않습니다.
- `ssh-entry.sh`를 바꾸면 이 절차로 bootstrap을 다시 실행해야 서버에 반영됩니다(워크플로가 바꿀 수 없음). 0035에서 `status`가 활성 색 줄(`color blue|green|-`)을 함께 보이게 바뀌었으므로 cutover 전에 한 번 다시 실행합니다([14-2](#14-2-사전-준비)). 다른 명령(`deploy`·`rollback`·`verify`)의 동작은 같아 옛 릴리스에서도 그대로 씁니다.
- `deploy`는 docker 그룹이라 서버 root와 같은 권한입니다. home-server에서는 `deploy`가 uid 1000이고 다른 서비스(seaweedfs) 데이터와 컨테이너 `node` 사용자도 uid 1000입니다. docker 그룹이라 위험이 늘지는 않지만 파일 소유자를 볼 때 헷갈리지 않게 유의합니다.

확인:

```bash
ssh -i /tmp/crelink-key/crelink_deploy deploy@home-server status   # "release -"·"color -"(배포 전) 또는 운영 릴리스·활성 색
ssh -i /tmp/crelink-key/crelink_deploy deploy@home-server id       # "허용되지 않은 명령입니다" — 셸이 열리지 않아야 정상
ssh home-server 'tailscale debug prefs | grep RunSSH'              # "RunSSH": false 여야 함(아래)
```

Tailscale SSH(`tailscale up --ssh`)가 켜져 있으면 tailnet에서 오는 22번을 tailscaled가 가져가 OpenSSH의 forced command가 적용되지 않습니다. 배포 대상에서는 Tailscale SSH를 끄고 OpenSSH를 씁니다.

## 2. CI 접속 설정 (Tailscale·GitHub)

배포 job은 GitHub 호스트 러너에서 Tailscale 임시 노드(`tag:ci`)로 tailnet에 들어가 `deploy@<host>`로 SSH합니다. 이 절의 값이 없으면 Deploy 워크플로는 이미지까지만 만들고 배포를 건너뛰며 경고를 남깁니다.

2-1. tailnet 정책(관리 화면 Access controls). `tag:ci`를 만들고 배포 대상 22번만 허용합니다.

```jsonc
{
  "tagOwners": { "tag:ci": ["autogroup:admin"] },
  "hosts": { "home-server": "<home-server의 Tailscale IP 100.x.y.z>" },
  "grants": [
    { "src": ["tag:ci"], "dst": ["home-server"], "ip": ["tcp:22"] }
    // 기존 규칙은 그대로 두되, src "*" 처럼 태그 장치까지 포함하는 규칙이 있으면 "autogroup:member"로 좁힙니다.
  ]
}
```

`src: ["*"]`는 태그 장치도 포함하므로 그런 규칙이 남아 있으면 `tag:ci`가 tailnet 전체에 닿습니다. 저장 뒤 정책 편집기의 미리보기에서 `tag:ci`가 `home-server:22`만 갖는지 확인합니다.

2-2. workload identity federation 자격 증명(관리 화면 Settings > Trust credentials > **Credential** > **OpenID Connect**):

| 항목 | 값 |
| --- | --- |
| Issuer | GitHub(`https://token.actions.githubusercontent.com`) |
| Subject | `repo:ai-worker-lab@271170671/crelink@1406726921:ref:refs/heads/main` — main 브랜치에서 실행된 job만. Deploy(`workflow_run`·main 수동 실행)·Rollback(main만 허용)이 이 형식입니다. 이 저장소는 GitHub의 불변 subject(`use_immutable_subject`)를 써서 조직·저장소 이름 뒤에 숫자 ID가 붙습니다. 접두사 확인: `gh api repos/ai-worker-lab/crelink/actions/oidc/customization/sub`의 `sub_claim_prefix`. 옛 형식 `repo:ai-worker-lab/crelink:…`로 두면 토큰 교환이 403입니다 |
| Scope | `auth_keys` 쓰기, 태그 `tag:ci` |

**Generate credential** 뒤 표시되는 **Client ID**와 **Audience**를 복사합니다(비밀 아님). 토큰 교환이 실패하면 같은 화면의 자격 증명 항목에 마지막 오류가 표시됩니다.

선택: Custom claims로 더 좁힐 수 있습니다(예: 워크플로 파일). 배포·롤백 두 워크플로가 한 Client ID를 쓰므로 두 파일을 함께 허용하는 규칙이 필요하고, 와일드카드 지원 여부는 `[확인 못 함]`입니다. 지금은 Subject 조건만 씁니다.

2-3. GitHub variables(비밀 아님):

```bash
gh variable set TS_OIDC_CLIENT_ID --body '<Client ID>'
gh variable set TS_OIDC_AUDIENCE --body '<Audience>'
```

2-4. GitHub secret과 로컬 개인키 삭제:

```bash
gh secret set DEPLOY_SSH_KEY < /tmp/crelink-key/crelink_deploy
rm -rf /tmp/crelink-key     # 공개키는 서버 /home/deploy/.ssh/authorized_keys에 남아 있어 대상 추가 때 거기서 읽습니다
```

2-5. 쓰지 않는 secret 삭제: 처음 설계의 `OCI_HOST`·`OCI_USER`·`OCI_SSH_KEY`·`OCI_KNOWN_HOSTS`와 `VERCEL_TOKEN`·`VERCEL_ORG_ID`·`VERCEL_PROJECT_ID`(등록했다면). `gh secret list`에 `DEPLOY_SSH_KEY`만 남아야 합니다.

```bash
for s in OCI_HOST OCI_USER OCI_SSH_KEY OCI_KNOWN_HOSTS VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do gh secret delete "$s" 2>/dev/null || true; done
gh secret list && gh variable list
```

## 3. Cloudflare Tunnel 공개 호스트

대상 서버의 원격 관리형 Tunnel(home-server는 `my-home-server`)에 공개 호스트 두 개를 추가합니다. Cloudflare 대시보드 Zero Trust > Networks > Tunnels > 해당 Tunnel > **Published application routes**(이전 화면의 Public Hostname):

| 호스트 | 서비스 |
| --- | --- |
| `go.shaul.kr` | `HTTP` · `localhost:18080` |
| `links.shaul.kr` | `HTTP` · `localhost:18080` |

- 경로를 추가하면 Cloudflare가 `<Tunnel UUID>.cfargotunnel.com`을 가리키는 proxied CNAME을 만듭니다. 같은 이름의 기존 레코드(처음 설계의 `go` A 레코드, `links` CNAME 등)가 있으면 먼저 지웁니다.
- TLS는 Cloudflare 엣지가 맡고 edge Caddy는 http만 받습니다. Caddy는 요청의 Host로 사이트를 고르므로 Host를 바꾸지 않습니다(다른 이름으로 시험할 때만 [10](#10-배포-대상-추가와-tunnel-전환)처럼 HTTP Host Header를 지정).
- `localhost:18080`은 호스트에서 도는 cloudflared(systemd 서비스) 기준입니다. cloudflared를 컨테이너로 돌리는 서버라면 이 주소가 닿지 않으므로 호스트 서비스로 둡니다.
- 배포 후 운영 주소 검사는 배포 대상 서버의 `verify.sh`가 Cloudflare를 거쳐 부릅니다(`ssh deploy@<host> verify`). GitHub 러너에서 부르면 Cloudflare가 데이터센터 IP를 403으로 막기 때문입니다.

확인(배포 전에는 Cloudflare 502가 정상): `curl -sS -o /dev/null -w '%{http_code}\n' https://go.shaul.kr/zzzz`.

## 4. 비밀값 (SOPS·age)

### 4-1. 키 구성

| 수신자(`.sops.yaml`) | 개인키 위치 | 쓰는 곳 |
| --- | --- | --- |
| `operator` | 운영자 macOS 키체인(`crelink-sops-age`/`operator`) + 운영자 비밀번호 관리자 | 운영자의 `sops edit`·`updatekeys` |
| `home-server`(대상마다 하나) | 서버 `/etc/crelink/age.key`(root:deploy 640) | 배포 때 서버가 복호화 |

- 서버 키는 백업하지 않습니다. 잃으면 bootstrap이 새 키를 만들고, 운영자 키로 새 공개키를 수신자에 넣어 다시 암호화합니다([4-4](#4-4-새-대상수신자-추가)).
- 운영자 키는 평문 파일로 두지 않습니다. `SOPS_AGE_KEY_CMD`가 키체인에서 꺼내므로 에이전트가 파일로 읽을 수 없습니다.

### 4-2. 운영자 키 만들기(처음 한 번)

```bash
umask 077 && age-keygen -o /tmp/operator.agekey     # 출력의 "Public key"가 .sops.yaml의 operator 수신자
security add-generic-password -s crelink-sops-age -a operator -w   # 프롬프트에 /tmp/operator.agekey의 AGE-SECRET-KEY-... 줄을 붙여 넣음
# 같은 줄을 비밀번호 관리자에 백업한 뒤
rm -f /tmp/operator.agekey
age-keygen -y <(security find-generic-password -s crelink-sops-age -a operator -w)   # 공개키 다시 보기
```

### 4-3. 값 편집

저장소 루트에서(`.sops.yaml`을 찾음):

```bash
SOPS_AGE_KEY_CMD='security find-generic-password -s crelink-sops-age -a operator -w' sops edit infra/prod/secrets/home-server.sops.env
```

- 키 목록은 [설계 "비밀값과 환경변수"](../../docs/specs/crelink-prod-deploy.md#비밀값과-환경변수)가 원본입니다. 비밀이 아닌 키는 평문으로 남아 diff로 검토할 수 있습니다.
- 커밋 → main 병합 → Deploy가 `infra/prod/` 변경으로 릴리스를 배포합니다. 값은 릴리스와 함께 적용되고 롤백하면 이전 값으로 돌아갑니다.
- 복호화한 내용을 파일·로그·채팅에 남기지 않습니다(`sops decrypt`를 화면에 출력하지 않음).

### 4-4. 새 대상·수신자 추가

1. 새 서버의 bootstrap 출력에서 age 공개키를 얻습니다.
2. `.sops.yaml`에 그 대상 파일의 규칙을 추가합니다: `path_regex: ^infra/prod/secrets/<대상>\.sops\.env$`, 같은 `unencrypted_regex`, 수신자 = `operator` 공개키 + 새 서버 공개키.
3. 새 파일을 만듭니다: 위 4-3 명령의 파일 이름만 `<대상>.sops.env`로 바꿔 실행하고 home-server 파일과 같은 키를 채웁니다.
4. 기존 파일의 수신자를 바꿨다면(운영자 키 교체, 백업 수신자 추가 등) 규칙을 고친 뒤 `SOPS_AGE_KEY_CMD=... sops updatekeys infra/prod/secrets/<파일>`로 다시 암호화합니다.
5. AWS로 가면 KMS 키를 수신자로 추가할 수 있습니다(`.sops.yaml`의 `kms`).

### 4-5. 회전

| 대상 | 절차 |
| --- | --- |
| 앱 비밀값(DB 비밀번호, Google 클라이언트 비밀번호) | 제공자에서 새 값 발급(Google은 새 비밀번호를 추가해 둘 다 유효하게) → 4-3으로 편집 → 병합·배포 → 확인 → 옛 값 폐기 |
| 운영자 age 키 | 새 키를 4-2로 만들고 `.sops.yaml`에 수신자로 추가 → 모든 암호문 `updatekeys` → 옛 수신자 삭제 → 다시 `updatekeys` → 병합. Git 이력의 옛 암호문은 옛 키로 계속 풀리므로, 키가 샜다면 안의 비밀값도 회전합니다 |
| 서버 age 키 | 서버에서 `sudo age-keygen -o /etc/crelink/age.key.new` → 공개키를 수신자에 **추가**하고 `updatekeys`·병합·배포 → 서버에서 새 파일을 `age.key`로 바꾸고 `chown root:deploy`·`chmod 640` → 옛 수신자 삭제·`updatekeys`·병합·배포. 바꾼 뒤에는 그 전 릴리스로 롤백하면 복호화가 실패합니다 |
| `DEPLOY_SSH_KEY` | 1-1로 새 키 → 1-2로 bootstrap을 `DEPLOY_SSH_PUBKEY=<새 공개키>`로 다시 실행(줄 추가) → 2-4로 secret 교체 → `ssh -i <새 키> deploy@<host> status` 확인 → 서버 `/home/deploy/.ssh/authorized_keys`에서 옛 줄 삭제 |
| Tailscale WIF 자격 증명 | Trust credentials에서 새로 만들고 2-3으로 variables 교체 → 옛 자격 증명 삭제 |
| GHCR | 장기 토큰 없음(job마다 `GITHUB_TOKEN`). 교체할 것 없음 |

## 5. 최초 배포

순서대로 하고 각 확인이 통과해야 다음으로 갑니다.

1. 준비 확인: [1](#1-서버-준비-bootstrap)(bootstrap, `RunSSH: false`), [2](#2-ci-접속-설정-tailscalegithub)(정책·자격 증명·variables·secret), [3](#3-cloudflare-tunnel-공개-호스트)(공개 호스트), [4](#4-비밀값-sopsage)(대상 파일이 서버 키로 풀림), [12](#12-supabase-주의사항)(세션 풀러 문자열·CA), Google 콘솔의 승인된 리디렉션 URI `https://links.shaul.kr/auth/google/callback`.
2. 서버 복호화 확인(값은 출력하지 않음): `ssh home-server 'sudo -u deploy env SOPS_AGE_KEY_FILE=/etc/crelink/age.key sops decrypt --input-type dotenv --output-type dotenv /dev/stdin' < infra/prod/secrets/home-server.sops.env | wc -l`이 키 개수를 보이면 통과.
3. GitHub Actions에서 **Deploy**를 main으로 `Run workflow`(`force` 켬). 배포 태그가 아직 없으므로 두 이미지를 만들고 서버에 보냅니다. 새 서버에는 edge가 없어 서버 단계(`deploy.sh`)가 이미지만 받아 두고 "edge가 준비되지 않았습니다"로 실패합니다(아무것도 바꾸지 않음, job 실패).
4. 서버에서 edge와 첫 색을 띄웁니다: `ssh home-server` → `ls -t /opt/crelink/releases | head -n 1`로 방금 풀린 릴리스 SHA를 확인하고 `sudo /opt/crelink/releases/<SHA>/cutover.sh --dry-run <SHA> <API SHA> <웹 SHA>`(셋 다 그 커밋 SHA) → 점검이 모두 `ok`·`info`면 `--dry-run`을 빼고 실행합니다. 옛 스택이 없으므로 공백 단계는 건너뜁니다([14-3](#14-3-cutover-실행)과 같은 스크립트). 헬스 실패면 blue를 내리고 종료 1이므로 [6](#6-운영-확인)의 로그로 원인(대개 비밀값·DB 접속)을 고쳐 다시 실행합니다.
5. 실패한 Deploy 실행을 **Re-run failed jobs**로 다시 돌립니다. 같은 릴리스가 green으로 한 번 더 배포되고(무중단) `운영 주소 검사`와 배포 기록 태그가 이어집니다. 이후에는 main CI 성공 시 자동입니다.
6. GeoIP를 넣습니다([8](#8-geoip)).
7. 확인: 배포 job의 `운영 주소 검사` 단계 결과(운영 주소 6개), 구글 로그인, 단축 주소 생성·방문, 링크 클릭 기록의 IP가 내 공인 IP인지(Caddy·cloudflared 주소가 아닌지).

## 6. 운영 확인

```bash
# 배포 키가 있으면(워크플로와 같은 경로). 둘째 줄이 활성 색(color blue|green, cutover 전이면 -)
ssh -i <배포 키> deploy@home-server status

# 운영자 관리 접속으로
ssh home-server
cat /opt/crelink/state/active-color; readlink /opt/crelink/current && cat /opt/crelink/state/images.env
column -t -s $'\t' /opt/crelink/state/releases.log | tail
grep -o 'to [a-z-]*:3000' /opt/crelink/edge/conf/upstreams.caddy   # edge가 보내는 색(active-color와 같아야 함)
# 컨테이너(활성 색만 Up, 옛 색은 Exited로 남음). 컨테이너의 릴리스는 working_dir 라벨
sudo docker ps -a --filter label=com.docker.compose.project --format '{{.Names}}\t{{.Status}}\t{{.Label "com.docker.compose.project.working_dir"}}' | grep crelink-
c=$(cat /opt/crelink/state/active-color)
sudo docker logs --tail 100 crelink-$c-api-1        # web도 같은 방식, edge는 crelink-edge-caddy-1
sudo docker inspect --format '{{json .State.Health}}' crelink-$c-api-1
# 헬스체크 설정: Test·Interval·Timeout·Retries는 이미지 HEALTHCHECK, StartPeriod·StartInterval은 compose 값이어야 함
sudo docker inspect --format '{{json .Config.Healthcheck}} StopTimeout={{.Config.StopTimeout}}' crelink-$c-api-1
# edge 안에서 활성 색 내부 헬스(배포 스크립트와 같은 검사)
sudo docker exec crelink-edge-caddy-1 wget -q -O /dev/null http://api-$c:3000/api/health/ready && echo api ok
sudo docker exec crelink-edge-caddy-1 wget -q -O /dev/null http://web-$c:3000/privacy && echo web ok
# Cloudflare를 빼고 edge만 확인(302면 정상)
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: go.shaul.kr' http://127.0.0.1:18080/zzzz
```

- `releases.log` 열: UTC 시각, 동작(`deploy`·`rollback`·`restore`), 이전 릴리스, 새 릴리스, API 이미지, 웹 이미지. 전환에 성공했을 때만 씁니다(cutover는 `deploy <옛> <새>`, 되돌리기는 `rollback <새> <옛>`, `geoip.sh --restart`는 쓰지 않음). `restore`는 blue/green 이전 스크립트가 남긴 자동 복구 줄입니다.
- `docker compose` 명령을 직접 쓰려면 릴리스 폴더에서 `CRELINK_COLOR=<색> CRELINK_APP_ENV=/dev/null docker compose -p crelink-<색> -f compose.yaml --env-file /opt/crelink/state/images.env …`처럼 색과 project를 반드시 줍니다(`-p`가 없으면 폴더 이름 project로 떠 운영과 섞임). 컨테이너를 다시 만드는 작업은 하지 말고 배포·롤백 스크립트를 씁니다.

### 6-1. 배포 공백 측정

배포·롤백 1회의 공백(502·연결 실패 구간)을 서버에서 잽니다. 도구는 릴리스에 들어 있는 `measure-gap.sh`(bash·curl만 씀)이고, Cloudflare·Tunnel을 빼고 스택 입구 `127.0.0.1:18080`에 Host 헤더별로 일정 간격 요청을 보냅니다. 운영자 계정으로 실행하며 sudo·docker 권한은 필요 없습니다.

```bash
# 터미널 1: 180초 동안 대상마다 초당 5회(0.2초 간격). 기본 대상 go.shaul.kr/zzzz(api, 302)·links.shaul.kr/privacy(web, 200)
ssh home-server /opt/crelink/current/measure-gap.sh -d 180
# 터미널 2: 측정이 시작되면 배포 1회(main 병합 자동 배포, 또는 Actions Deploy를 force로 실행해 서버 단계가 180초 안에 들어가게)
# 끝을 직접 정하려면 -d를 빼고 ssh -t로 띄운 뒤 Ctrl-C(-t 없이 끊으면 원격이 요약 없이 종료됨)
ssh -t home-server /opt/crelink/current/measure-gap.sh
```

- 출력(끝날 때): 대상마다 `요청 N, 실패 M(502×a 000×b), 실패 구간 k개, 최장 공백 X초(+T초부터), 성공 응답 최장 Y초`, 마지막 줄 `전체: 실패 …, 최장 공백 …초`. 종료 코드 0이면 실패 없음, 1이면 실패 있음.
- 성공은 응답 코드 1xx~4xx, 실패는 5xx와 응답 없음(`000`: 연결 거부·요청 제한 시간 30초 초과). `000`은 18080 리스너가 없던 구간(cutover·edge 재생성, cloudflared가 502로 바꿔 보냄), `502`는 edge는 떠 있고 업스트림 색에 10초(`lb_try_duration`) 동안 닿지 못한 구간입니다. Blue/Green 배포·롤백·`geoip.sh --restart`에서는 둘 다 0이어야 합니다. 공백 = 첫 실패 요청을 보낸 시각부터 다음 성공 요청을 보낸 시각까지라 간격(0.2초)만큼 오차가 있습니다. `성공 응답 최장`은 edge 재시도처럼 실패 대신 늦게 성공한 요청을 봅니다.
- 옵션(`-r` 초당 횟수, `-m` 요청 제한 시간, `-u` 기준 URL, 대상 `<Host>[/경로]` 여러 개, `-- <명령>` 감싸기)은 `infra/prod/measure-gap.sh` 머리말이 원본입니다. 배포로 `current`가 바뀌어도 이미 읽은 스크립트는 그대로 돌고, 옛 릴리스 폴더는 최근 5개 안에 남습니다.
- 결과(날짜·릴리스 SHA·대상별 최장 공백·실패 코드)는 운영 work item 진행 기록에 남깁니다.

### 6-2. 활성 색 확인과 수동 전환

활성 색의 원본은 `state/active-color`이고 edge의 `conf/upstreams.caddy`, `current`(그 색의 릴리스), `state/images.env`가 늘 함께 맞아야 합니다. 평소에는 스크립트만 이 넷을 바꿉니다. 옛 색으로 되돌리는 것도 보통은 [7](#7-롤백)의 롤백(직전 릴리스를 옛 색이 아닌 비활성 색에 올림, 무중단)입니다.

스크립트가 중간에 멈춰(예: 종료 2) 넷이 어긋났거나, 멈춰 있는 옛 색으로 즉시 돌려야 할 때만 손으로 전환합니다. 서버에서 `deploy` 사용자로:

```bash
ssh home-server
sudo -u deploy -i
cd /opt/crelink
c=green                                   # 보낼 색
ids=$(docker ps -aq --filter label=com.docker.compose.project=crelink-$c)
docker start $ids                         # 멈춰 있던 그 색 켜기(컨테이너가 없으면 수동 전환 불가 → 롤백으로 새로 올림)
docker ps --filter label=com.docker.compose.project=crelink-$c --format '{{.Names}} {{.Status}}'   # 둘 다 (healthy)까지 기다림
docker exec crelink-edge-caddy-1 wget -q -O /dev/null http://api-$c:3000/api/health/ready && \
  docker exec crelink-edge-caddy-1 wget -q -O /dev/null http://web-$c:3000/privacy && echo ok
printf '(api_upstream) {\n\tto api-%s:3000\n}\n(web_upstream) {\n\tto web-%s:3000\n}\n' $c $c > edge/conf/upstreams.caddy.tmp
mv edge/conf/upstreams.caddy.tmp edge/conf/upstreams.caddy
docker exec crelink-edge-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && \
  docker exec crelink-edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
# 상태를 edge와 맞춤: 그 색이 돌리는 릴리스(working_dir 라벨의 폴더 이름)
r=$(basename "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' crelink-$c-api-1)")
echo $c > state/active-color.tmp && mv state/active-color.tmp state/active-color
ln -sfn releases/$r current.tmp && mv -T current.tmp current
cp releases/$r/.images.env state/images.env
# 20초쯤 뒤 옛 색 정지(컨테이너 유지)
sleep 20; docker stop -t 30 $(docker ps -q --filter label=com.docker.compose.project=crelink-$( [ $c = blue ] && echo green || echo blue ))
```

- 수동 전환은 `releases.log`에 쓰지 않습니다. 운영 work item에 시각·색·릴리스를 남깁니다.
- `caddy reload`가 실패하면 Caddy는 옛 설정을 그대로 씁니다. 그때는 `upstreams.caddy`를 원래 색으로 되돌려 파일과 실행 중 설정을 맞춥니다.

### 6-3. edge 설정 갱신·Caddy 이미지 업그레이드

- **공개 정책(`infra/prod/Caddyfile`) 변경**: 보통의 배포로 반영됩니다. 배포·롤백마다 `lib.sh`가 릴리스의 `Caddyfile`을 `edge/conf/`로 바꾸고 reload합니다(무중단, 롤백하면 옛 정책으로 돌아감). `validate`를 통과하지 못하면 배포가 아무것도 바꾸지 않고 실패합니다.
- **edge compose(`infra/prod/edge/compose.yaml`) 변경**(Caddy 이미지, 포트, 마운트, 환경변수): reload로 반영되지 않아 edge 컨테이너를 다시 만들어야 하고 그동안 **1~2초 공백**이 납니다[추정. 로컬 cutover 리허설의 caddy 교체 공백은 0.3~1.4초 실측]. 트래픽이 적은 시각에 합니다. 그 변경을 담은 릴리스를 먼저 배포한 뒤(앱은 무중단, edge는 그대로) 서버에서:

  ```bash
  ssh home-server
  sudo -u deploy -i
  r=$(basename "$(readlink /opt/crelink/current)")
  diff /opt/crelink/edge/compose.yaml /opt/crelink/releases/$r/edge/compose.yaml          # 바뀌는 것 확인
  docker pull $(sed -n 's/^    image: *//p' /opt/crelink/releases/$r/edge/compose.yaml)   # 공백을 줄이려 먼저 받음
  cp /opt/crelink/releases/$r/edge/compose.yaml /opt/crelink/edge/compose.yaml
  docker compose -p crelink-edge -f /opt/crelink/edge/compose.yaml up -d --wait          # 여기서 재생성(공백)
  curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: go.shaul.kr' http://127.0.0.1:18080/zzzz   # 302
  ```

  되돌리기는 옛 릴리스의 `edge/compose.yaml`로 같은 명령입니다. 다른 터미널에서 [6-1](#6-1-배포-공백-측정)로 공백을 잽니다.
- edge가 멈췄거나 지워졌을 때는 `docker compose -p crelink-edge -f /opt/crelink/edge/compose.yaml up -d --wait`로 다시 띄웁니다(설정은 `edge/conf/`에 남아 있음).

## 7. 롤백

- **자동(서버)**: 새 색이 헬스(`up --wait`·edge 안 내부 헬스)나 Caddy `validate`·`reload`에 실패하면 `deploy.sh`·`rollback.sh`·`geoip.sh --restart`가 그 색만 내리고 실패(종료 1)합니다. 트래픽은 전환 전 색에 계속 있고 활성 색·`current`·`images.env`·`releases.log`는 바뀌지 않습니다(옛 방식의 "직전 릴리스 재기동"이 필요 없음).
- **자동(워크플로)**: 배포 뒤 운영 주소 검사(`verify`)가 실패하면 같은 배포 job의 `자동 롤백` 단계가 그 대상을 직전 릴리스로 되돌리고 job을 실패로 끝냅니다.
- **수동(권장)**: GitHub Actions **Rollback**을 main에서 실행합니다. `target`(기본 `home-server`), `release`(비우면 지금 릴리스를 배포한 마지막 `deploy` 줄의 이전 릴리스, 지정하면 그 SHA). 설정·비밀값·이미지가 함께 돌아갑니다.
- **서버에서 직접**(Actions를 쓸 수 없을 때, 이미지가 서버에 남아 있으면 토큰 없이 동작). 롤백도 배포와 같은 무중단 전환(비활성 색에 올린 뒤 reload)입니다:

  ```bash
  ssh home-server
  sudo -u deploy /opt/crelink/current/rollback.sh            # 지금 릴리스를 배포한 deploy 줄의 이전 릴리스로(연달아 실행하면 배포 이력을 한 단계씩)
  sudo -u deploy /opt/crelink/current/rollback.sh <릴리스 SHA>
  ls -t /opt/crelink/releases                                # 되돌릴 수 있는 릴리스(최근 5개 + 운영 중)
  ```

- blue/green 이전 형식의 릴리스(compose에 `caddy`가 있거나 `name: crelink-prod`, 예: cutover 직전 운영 릴리스)로는 롤백하지 않고 아무것도 바꾸지 않은 채 종료 1입니다. cutover 직후 인자 없는 롤백의 기본 대상이 이 릴리스이므로 거부됩니다. 그 릴리스로 돌아가야 하면 [14-5](#14-5-되돌리기)의 `cutover.sh --revert`를 씁니다.

- 종료 코드: 0 성공(마지막 줄 = `<릴리스> <API 이미지> <웹 이미지>`), 1 실패(아무것도 바꾸지 않음), 2 edge 설정을 되돌리지 못함(즉시 [11](#11-장애-대응)).
- 서버에 남지 않은 오래된 릴리스로 가려면 main에서 해당 변경을 되돌리는 커밋을 병합해 새로 배포합니다.
- 롤백 뒤 최신 커밋으로 다시 올리기: Deploy를 main에서 `force` 켜고 실행하거나(배포 기록 태그가 이미 최신이라 `force` 없이는 "변경 없음"으로 건너뜀), Rollback을 `release=<최신 SHA>`로 실행합니다.
- DB migration은 롤백되지 않습니다. 이전 코드가 새 스키마에서 동작하도록 expand/contract를 지킵니다([설계](../../docs/specs/crelink-prod-deploy.md#db-migration-운영-규칙)).

## 8. GeoIP

```bash
ssh home-server
sudo -u deploy /opt/crelink/current/geoip.sh --restart     # DB-IP City Lite를 geoip 볼륨에 넣고 지금 릴리스를 반대 색으로 다시 올려 전환(무중단)
sudo crontab -u deploy -e   # 매월 3일 04:17 UTC: 17 4 3 * * /opt/crelink/current/geoip.sh --restart >> /opt/crelink/state/geoip.log 2>&1
```

`--restart`를 빼면 다음 배포부터 새 파일을 읽습니다. `--restart`는 배포와 같은 전환이라 약 30~60초 걸리고 `releases.log`에는 쓰지 않습니다(활성 색만 바뀜). edge가 준비되지 않은 서버(cutover 전)에서는 아무것도 하지 않고 실패합니다. 파일이 없으면 방문 기록의 국가·도시만 비어 있습니다. `geoip` 볼륨(`crelink-prod_geoip`)은 릴리스·색이 바뀌어도 유지됩니다.

## 9. 업로드 저장소

업로드 이미지는 API 설정 `FILE_STORAGE`로 고른 저장소에 있습니다([API 문서 "이미지 저장소"](../../apps/api/docs/README.md#이미지-저장소)). 운영은 `s3`(SeaweedFS `https://s3.shaul.kr`, 버킷 `crelink-uploads`)이고 지금 compose가 `api.environment`로 고정합니다(볼륨 없음). 그보다 앞선 릴리스는 암호문의 평문 키 `FILE_STORAGE`(없으면 `disk`)를 따르고, `disk`면 서버 볼륨 `crelink-prod_uploads`(api `/data/uploads`, 소유 uid 1000)입니다. 실제 저장소는 api 기동 로그(`s3`면 `[S3FileStorage] 파일 저장소 s3 확인: …`)로 봅니다. 키(DB `files.storage_key`)는 UUID라 두 저장소 사이에서 그대로 옮길 수 있습니다.

| 항목 | 값 |
| --- | --- |
| SeaweedFS 스택 | home-server `/opt/seaweedfs`(Compose project `seaweedfs`). 설정·운영·백업 원본은 [home-seaweedfs README](https://github.com/shaul1991/home-seaweedfs#readme) |
| 경로 | api 컨테이너 → `https://s3.shaul.kr`(Cloudflare, 캐시 우회 규칙) → Tunnel → 서버 Caddy → `127.0.0.1:8333`. 같은 서버여도 공개 주소를 써서 다른 대상에서도 같은 설정이 됩니다 |
| 접근 키 | 서버 `/opt/seaweedfs/config/s3.json`의 identity `crelink`(버킷 `crelink-uploads` 범위 `Read`·`Write`·`List`·`Tagging`만, 버킷 생성 불가). 저장소에는 암호문(`S3_ACCESS_KEY_ID`·`S3_SECRET_ACCESS_KEY`)으로만 둡니다 |
| 헬스 | 저장소 장애는 readiness·배포 헬스에 넣지 않습니다(단축 이동을 막지 않게). 업로드·이미지 조회 500과 api 로그 `파일 저장소 s3 확인 실패`로 드러납니다 |
| 백업 | SeaweedFS 데이터 디렉터리(`/mnt/storage/seaweedfs`) 백업이 업로드 백업입니다(home-seaweedfs README "운영"의 정지 → tar → 시작). `disk`인 동안은 아래 9-6 |

### 9-1. 버킷·접근 키 발급(한 번)

```bash
ssh home-server
cd /opt/seaweedfs
sudo docker compose exec master weed shell   # 프롬프트에서: s3.bucket.create -name crelink-uploads   (확인: s3.bucket.list), exit
openssl rand -hex 10; openssl rand -hex 20   # access·secret 키. 화면 밖으로 옮기지 않고 바로 s3.json에 넣습니다
sudo -e config/s3.json                       # identities에 아래 항목 추가(소유 1000:1000, 권한 400 유지)
sudo docker compose restart s3 && scripts/check.sh
```

```json
{ "name": "crelink", "credentials": [{ "accessKey": "<access>", "secretKey": "<secret>" }],
  "actions": ["Read:crelink-uploads", "Write:crelink-uploads", "List:crelink-uploads", "Tagging:crelink-uploads"] }
```

접근 키를 바꾸면 새 identity(또는 credentials 항목)를 먼저 추가하고 9-2로 암호문을 바꿔 배포한 뒤 옛 항목을 지웁니다.

### 9-2. 암호문에 키 넣기

저장소 루트에서 운영자 키로 합니다. 비밀이 아닌 `FILE_STORAGE`·`S3_ENDPOINT`·`S3_REGION`·`S3_BUCKET`은 `.sops.yaml`의 `unencrypted_regex`에 있어 평문입니다. 이 정규식은 암호화할 때 파일 메타데이터(`sops_unencrypted_regex`)에 기록되고 `sops edit`·`sops set`은 그 기록을 따르므로, 정규식을 바꾼 뒤 처음 한 번은 먼저 다시 암호화합니다(sops 3.13.3에서 확인).

```bash
export SOPS_AGE_KEY_CMD='security find-generic-password -s crelink-sops-age -a operator -w'
f=infra/prod/secrets/home-server.sops.env
# 정규식을 바꾼 뒤 처음 한 번: 같은 수신자로 다시 암호화(평문은 파이프에만 있음). 모든 암호 값이 새로 바뀝니다.
grep -q '^sops_unencrypted_regex=.*S3_BUCKET' "$f" || {
  sops decrypt "$f" | sops encrypt --input-type dotenv --output-type dotenv --filename-override "$f" /dev/stdin > "$f.new" && mv "$f.new" "$f"; }
# 접근 키: 서버 s3.json에서 바로 암호문으로(화면·셸 기록·프로세스 목록에 남지 않음)
for pair in S3_ACCESS_KEY_ID:accessKey S3_SECRET_ACCESS_KEY:secretKey; do
  ssh home-server "sudo python3 -c 'import json,sys; print(json.dumps(next(i for i in json.load(open(\"/opt/seaweedfs/config/s3.json\"))[\"identities\"] if i[\"name\"]==\"crelink\")[\"credentials\"][0][sys.argv[1]]))' ${pair#*:}" \
    | sops set --value-stdin "$f" "[\"${pair%%:*}\"]"
done
sops set "$f" '["S3_ENDPOINT"]' '"https://s3.shaul.kr"'
sops set "$f" '["S3_REGION"]' '"us-east-1"'
sops set "$f" '["S3_BUCKET"]' '"crelink-uploads"'
sops set "$f" '["FILE_STORAGE"]' '"s3"'      # 전환 스위치. 9-3 순서대로
grep -E '^(FILE_STORAGE|S3_)' "$f" | cut -c1-40   # 평문 4개, S3_ACCESS_KEY_ID·S3_SECRET_ACCESS_KEY는 ENC[...]
```

`UPLOAD_DIR`은 되돌리기(9-4)용으로 남겨 둡니다(`s3`면 쓰지 않음). 서버 복호화 확인은 [5](#5-최초-배포)의 2번 명령입니다.

### 9-3. 전환(디스크 → S3)과 볼륨 이전(한 번)

볼륨 파일을 버킷으로 복사한 뒤 `FILE_STORAGE=s3` 릴리스를 배포하고, 그 사이에 볼륨에 올라온 파일을 한 번 더 복사합니다. key가 UUID이고 내용이 바뀌지 않아 `aws s3 sync`를 여러 번 해도 안전합니다. 아래 `s3` 함수의 sync·`--dryrun`·`ls --summarize`·조건부 `put-object`·역방향 sync는 2026-10-07 로컬 SeaweedFS 4.47(운영과 같은 버킷 범위 identity)과 `amazon/aws-cli` 2.37.9로 리허설했습니다(`sudo`·`ssh`·공개 주소 제외).

```bash
ssh home-server
# 접근 키를 화면에 내지 않고 이 셸 변수로만 읽습니다(9-2와 같은 식).
key() { sudo python3 -c 'import json,sys; print(next(i for i in json.load(open("/opt/seaweedfs/config/s3.json"))["identities"] if i["name"]=="crelink")["credentials"][0][sys.argv[1]])' "$1"; }
AWS_ACCESS_KEY_ID=$(key accessKey) AWS_SECRET_ACCESS_KEY=$(key secretKey); export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
# 볼륨(/data, 기본 읽기 전용)과 조건부 PUT 확인용 작은 파일(/probe)을 붙인 aws-cli. 되돌리기(9-4)는 MODE=rw로 볼륨을 쓰기 가능하게 붙입니다.
s3() { sudo --preserve-env=AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
  -e AWS_DEFAULT_REGION=us-east-1 -v "crelink-prod_uploads:/data:${MODE:-ro}" -v /etc/hostname:/probe:ro \
  amazon/aws-cli --endpoint-url https://s3.shaul.kr "$@"; }
sudo docker run --rm -v crelink-prod_uploads:/data:ro alpine:3.22 sh -c 'find /data -type f | wc -l'   # 볼륨 파일 수
s3 s3 sync /data s3://crelink-uploads --no-progress                                                  # 1차 복사
```

1. 볼륨이 비어 있지 않으면 먼저 9-6으로 백업합니다.
2. 위 1차 복사.
3. 9-2의 `FILE_STORAGE=s3`를 넣은 커밋을 main에 병합해 배포합니다(Deploy). `sudo docker logs crelink-$(cat /opt/crelink/state/active-color)-api-1 2>&1 | grep S3FileStorage`(cutover 전 서버는 `crelink-prod-api-1`)가 `접근 가능`이어야 합니다.
4. 곧바로 `s3 s3 sync /data s3://crelink-uploads --no-progress`를 다시 실행합니다(1차 복사와 배포 사이에 볼륨에 올라온 파일).
5. 확인:
   - `s3 s3 sync /data s3://crelink-uploads --dryrun`이 아무것도 출력하지 않고, `s3 s3 ls s3://crelink-uploads --recursive --summarize`의 `Total Objects`가 볼륨 파일 수 이상입니다(전환 뒤 새 업로드는 버킷에만 있음).
   - 옛 이미지 하나(`select id from files order by created_at limit 1`)가 `https://links.shaul.kr/api/backend/api/files/<id>`에서 200이고, 웹에서 새 이미지를 올리면 그 id가 `s3 s3 ls s3://crelink-uploads/<id>`에 보입니다.
   - 운영 경로(Cloudflare 경유)의 조건부 PUT: `k=zz-check-$(date -u +%Y%m%d%H%M)` 후 `s3 s3api put-object --bucket crelink-uploads --key "$k" --body /probe --if-none-match '*'`를 두 번 실행해 두 번째가 `PreconditionFailed`(412)인지 보고 `s3 s3api delete-object --bucket crelink-uploads --key "$k"`로 지웁니다. 412가 아니라 성공하면 경로가 조건부 헤더를 지우는 것이므로 전환을 되돌리고(9-4) 원인을 봅니다.
6. `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY` 후 나옵니다. 실행 시각·파일 수·결과를 운영 work item에 기록합니다.

### 9-4. 되돌리기(S3 → 디스크)

1. `uploads` 볼륨이 있고 `FILE_STORAGE=s3`가 아닌 compose·암호문으로 되돌리는 커밋을 병합해 배포합니다(지금 compose는 `s3`를 고정하므로 암호문만 `disk`로 바꾸는 것으로는 되돌아가지 않습니다). 그런 옛 릴리스는 모두 blue/green 이전 형식이라 cutover 뒤에는 Rollback이 거부합니다. 새 compose에 볼륨을 다시 넣을 때는 두 색이 같이 쓰도록 `geoip`처럼 `external: true`, `name: crelink-prod_uploads`로 둡니다.
2. 전환 뒤 버킷에만 올라온 파일을 볼륨으로 복사합니다: 9-3의 `key`·`s3` 함수를 준비하고 `MODE=rw s3 s3 sync s3://crelink-uploads /data --no-progress` 후 `sudo docker run --rm -v crelink-prod_uploads:/data alpine:3.22 chown -R 1000:1000 /data`(볼륨을 지웠다면 이 명령이 빈 볼륨을 새로 만듭니다).
3. 확인은 9-3의 5번(이미지 200·새 업로드가 볼륨에 생김)과 같습니다.

### 9-5. 전환 뒤 볼륨 정리

compose에서는 `uploads` 볼륨을 뺐고 `FILE_STORAGE=s3`를 고정했습니다(볼륨 없이 `disk`로 뜨면 이미지가 컨테이너 안에만 저장되어 다음 배포에 사라지므로). 9-3 확인이 끝나고 볼륨이 동기화 이후 바뀌지 않았으면 서버에 남은 볼륨을 지웁니다: 볼륨 파일이 있었다면 9-6 백업을 먼저 하고 `sudo docker volume rm crelink-prod_uploads`. 볼륨이 있던 릴리스로 롤백하면 빈 볼륨이 새로 생기므로 9-4의 2번으로 버킷에서 복사합니다.

### 9-6. 볼륨 백업·복구(`disk`인 동안)

```bash
ssh home-server
sudo install -d -m 700 /var/backups/crelink
sudo docker run --rm -v crelink-prod_uploads:/data:ro -v /var/backups/crelink:/backup alpine:3.22 \
  tar czf "/backup/uploads-$(date -u +%Y%m%d).tgz" -C /data .
# 로컬로 가져오기: scp home-server:/var/backups/crelink/uploads-<날짜>.tgz ./   (root 소유라 필요하면 sudo로 권한 조정)
# 복구(같은 이름 볼륨에):
sudo docker run --rm -v crelink-prod_uploads:/data -v /var/backups/crelink:/backup:ro alpine:3.22 \
  sh -c 'tar xzf /backup/uploads-YYYYMMDD.tgz -C /data && chown -R 1000:1000 /data'
```

DB 백업은 [12](#12-supabase-주의사항)입니다.

## 10. 배포 대상 추가와 Tunnel 전환

같은 저장소·같은 절차로 대상을 더하고, 공개 호스트를 새 대상 Tunnel로 옮겨 전환합니다. 원칙은 [설계 "이식 규칙"](../../docs/specs/crelink-prod-deploy.md#이식-규칙)입니다.

1. 서버: Ubuntu(amd64 또는 arm64, 예: OCI `VM.Standard.A1.Flex`, AWS Graviton)를 만들고 Tailscale에 접속시킵니다(Tailscale SSH는 끔). 공인 인바운드는 열지 않습니다(OCI 보안 목록·AWS 보안 그룹에 80·443을 넣지 않음, Tailscale 접속 후 공인 22도 닫음).
2. Tunnel: Cloudflare에서 이 서버용 원격 관리형 Tunnel을 만들고 토큰을 복사합니다.
3. bootstrap: [1](#1-서버-준비-bootstrap)처럼 실행하되 `TARGET_NAME=<새 이름>`, `DEPLOY_SSH_PUBKEY`는 기존 서버 `/home/deploy/.ssh/authorized_keys`의 키(지금 `DEPLOY_SSH_KEY`의 공개키), `CLOUDFLARED_TOKEN`을 줍니다.
4. 비밀값: [4-4](#4-4-새-대상수신자-추가)로 `.sops.yaml` 규칙과 `infra/prod/secrets/<새 이름>.sops.env`를 만듭니다.
5. tailnet 정책: `hosts`에 새 서버를 넣고 `tag:ci` grant의 `dst`에 추가합니다(tcp:22만).
6. `infra/prod/targets.json`에 `{ "name": "<새 이름>", "host": "<MagicDNS 이름>", "platform": "linux/arm64"(또는 amd64), "enabled": false }`를 넣어 병합합니다. 준비가 끝나면 `enabled: true`로 바꿔 병합하면 Deploy가 플랫폼 합집합으로 이미지를 만들고 대상마다 차례로 배포합니다(arm64는 QEMU라 웹 빌드가 느려질 수 있음). 새 대상은 edge가 없어 첫 배포의 서버 단계가 이미지만 받고 실패하므로 [5](#5-최초-배포)의 4~5(`cutover.sh`로 edge·blue 기동 → 실패한 job 다시 실행)를 그 서버에서 합니다.
7. 검증: 새 Tunnel에 임시 공개 호스트(예: `go-oci.shaul.kr` → `HTTP localhost:18080`, Additional application settings > HTTP Settings > **HTTP Host Header** = `go.shaul.kr`)를 두고 단축 302를 확인합니다. 웹도 같은 방식(`links.shaul.kr`).
8. 업로드: `FILE_STORAGE=s3`면 새 대상 암호문에 같은 `FILE_STORAGE`·`S3_*` 키를 넣으면 되고 복사할 것이 없습니다(새 서버에서 `https://s3.shaul.kr`로 나가는 HTTPS 확인). `disk`면 전환 직전에 [9-6](#9-6-볼륨-백업복구disk인-동안)으로 옛 서버 볼륨을 백업해 새 서버 볼륨에 복구하고, 복사 뒤 전환까지 옛 서버에 올라온 업로드는 새 서버에 없으므로 전환 창을 짧게 두며 두 대상을 동시에 공개하지 않습니다(업로드가 갈라짐).
9. 전환: 옛 Tunnel에서 `go.shaul.kr`·`links.shaul.kr` 경로를 지우고 새 Tunnel에 같은 경로(`HTTP localhost:18080`)를 추가합니다(CNAME이 새 Tunnel UUID로 바뀜). 되돌리기는 반대로 합니다. 임시 호스트는 지웁니다.
10. 옛 대상은 하루 정도 그대로 둔 뒤 `targets.json`에서 `enabled: false`로 바꾸거나 빼고, tailnet 정책의 grant에서 뺍니다.

## 11. 장애 대응

1. 무엇이 안 되나: `curl -sS -o /dev/null -w '%{http_code}\n' https://go.shaul.kr/zzzz`(302 정상), `https://links.shaul.kr/`. 서버에서 [6](#6-운영-확인)의 `127.0.0.1:18080` 확인으로 Cloudflare·Tunnel 문제인지 스택 문제인지 나눕니다.
2. Tunnel: Cloudflare 대시보드의 Tunnel 상태(Healthy), 서버 `systemctl status cloudflared`·`journalctl -u cloudflared -n 100`.
3. 최근 배포·롤백: Actions 실행 기록과 `releases.log`. 배포 직후라면 [7](#7-롤백)대로 롤백부터 합니다. "edge가 준비되지 않았습니다"로 실패했다면 cutover 전 서버이거나 edge가 멈춘 것입니다: `cat /opt/crelink/state/active-color`가 없으면 [14](#14-bluegreen-cutover), 있으면 아래 5.
4. 컨테이너: [6](#6-운영-확인)의 상태·헬스·로그(활성 색 `crelink-<색>-*`). api가 unhealthy면 DB 접속·환경변수 오류(겹치는 동안 연결 2배라 `max clients reached`면 [12](#12-supabase-주의사항)의 Pool Size 식), web이 unhealthy면 `/privacy` 응답을 봅니다. 실패한 새 색은 스크립트가 내리므로 로그는 배포 출력(`헬스 실패(<색>). 최근 로그`)에 있습니다.
5. edge: `sudo docker ps -a --filter label=com.docker.compose.project=crelink-edge`. 멈췄거나 없으면 `sudo -u deploy docker compose -p crelink-edge -f /opt/crelink/edge/compose.yaml up -d --wait`([6-3](#6-3-edge-설정-갱신caddy-이미지-업그레이드)). 떠 있는데 502면 `upstreams.caddy`의 색이 실행 중인 색인지 보고([6-2](#6-2-활성-색-확인과-수동-전환)) `sudo docker logs --tail 50 crelink-edge-caddy-1`을 봅니다.
6. 종료 2(edge 설정을 되돌리지 못함): `upstreams.caddy`·`Caddyfile`과 실행 중 설정이 어긋났을 수 있습니다. `sudo docker exec crelink-edge-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`로 파일을 확인하고, 트래픽이 가는 색과 `active-color`를 [6-2](#6-2-활성-색-확인과-수동-전환)로 맞춘 뒤 `rollback.sh <SHA>`(`.images.env`가 있는 릴리스, `current`가 없으면 `/opt/crelink/releases/<SHA>/rollback.sh`)로 다시 전환합니다.
7. "복호화 실패": `/etc/crelink/age.key` 공개키(`sudo age-keygen -y /etc/crelink/age.key`)가 그 릴리스 암호문의 수신자인지 확인하고, 아니면 [4-4](#4-4-새-대상수신자-추가)의 `updatekeys` 후 다시 배포합니다.
8. DB: Supabase 대시보드(일시정지·장애·연결 수), 세션 풀러 문자열(5432), `infra/prod/certs/supabase-ca.crt`.
9. 이미지 업로드·조회만 500: api 로그의 `S3FileStorage`·오류 줄, home-server SeaweedFS 상태([home-seaweedfs README](https://github.com/shaul1991/home-seaweedfs#readme) "운영": `docker compose ps`·`logs s3`·`scripts/check.sh`), Cloudflare 캐시 우회 규칙. 저장소가 오래 멈추면 [9-4](#9-4-되돌리기s3--디스크)로 디스크로 되돌릴 수 있지만 그동안 버킷에만 있는 이미지는 보이지 않습니다.
10. CI가 서버에 못 붙음: Tailscale 단계 오류면 Trust credentials의 오류 표시·Subject·태그, SSH 단계면 tailnet 정책(`tag:ci` → 22)·`RunSSH`·`DEPLOY_SSH_KEY`·`authorized_keys`를 봅니다.
11. 서버 자원: `df -h`, `sudo docker system df`, `free -h`, `uptime`. 전환 중 30~60초는 앱이 2벌(메모리·DB 연결 2배)입니다. 이미지를 지울 때는 남은 릴리스의 `.images.env`(`cat /opt/crelink/releases/*/.images.env`)에 없는 `ghcr.io/ai-worker-lab/crelink-*` 태그만 `sudo docker rmi`로 지웁니다(정지된 옛 색 컨테이너가 쓰는 이미지는 그 색이 다음 배포로 다시 만들어질 때까지 지워지지 않음).
12. 복구 뒤 원인·조치를 운영 work item에 기록합니다.

## 12. Supabase 주의사항

- `DATABASE_URL`은 Supavisor **세션 모드**(`aws-<N>-<리전>.pooler.supabase.com:5432`, 사용자 `postgres.<프로젝트 ref>`) 연결 문자열을 대시보드 **Connect** > Session pooler에서 그대로 복사합니다. **6543(트랜잭션 모드)은 쓰지 않습니다**(migration 세션 advisory lock·prepared statement 미지원, [API 문서](../../apps/api/docs/README.md#환경변수)). 세션 풀러는 IPv4로 접속됩니다(직접 연결은 IPv6 전용).
- TLS 파라미터는 URL에 넣지 않고 `DATABASE_SSL=verify-full`·`DATABASE_SSL_CA_PATH`로 정합니다. CA는 Database Settings > SSL Configuration의 **Download Certificate** 파일을 `infra/prod/certs/supabase-ca.crt`로 커밋합니다(공개 인증서). Supabase가 CA를 바꾸면 이 파일을 바꿔 배포합니다. **Enforce SSL on incoming connections**를 켭니다.
- **API DB pool 상한 `DATABASE_POOL_MAX`**(암호문 평문 키, API pg Pool `max`, 비면 15). 세션 모드에서는 대시보드 Database Settings > Connection pooling의 **Pool Size**가 Supavisor가 Postgres에 여는 연결 상한이고 API 연결 하나가 그 하나를 계속 차지합니다. 무중단 전환(0035)에서는 구·신 API가 잠시 함께 돌아 연결이 최대 `2 × DATABASE_POOL_MAX`이므로 식 `2 × DATABASE_POOL_MAX ≤ Pool Size − 2`(관리 접속·migration 도구 여유, [ADR 0011](../../docs/adr/0011-zero-downtime-deploy.md))로 정합니다.
  - 운영값 6(2026-10-07): 운영 DB `max_connections` 60(Nano·Micro compute의 기본값), Pool Size 15(대시보드 확인, 2026-10-07)로 `2 × 6 = 12 ≤ 15 − 2`. Pool Size가 바뀌면 같은 식으로 다시 정합니다(예: 20이면 9). Pool Size는 `max_connections`의 40~80%까지 올릴 수 있지만 Supabase 서비스(Auth·Storage·PostgREST 등)도 같은 `max_connections`를 씁니다. 대시보드 첫 화면의 `연결 수/60`은 DB 전체 연결(`max_connections`)이고 Pool Size가 아닙니다.
  - 바꾸기: 저장소 루트에서 [9-2](#9-2-암호문에-키-넣기)의 `SOPS_AGE_KEY_CMD`·`f`를 정한 뒤 `sops set "$f" '["DATABASE_POOL_MAX"]' '"6"'`(평문 키라 diff에 보임) → 병합·배포. 키를 정규식에 넣은 뒤 처음 한 번은 9-2처럼 먼저 다시 암호화합니다(`grep -q '^sops_unencrypted_regex=.*DATABASE_POOL_MAX' "$f"`로 확인). 값이 너무 낮으면 피크 때 쿼리가 pool에서 기다려 API 지연이 늘므로, 그때는 Pool Size(필요하면 compute)를 올리고 값을 함께 올립니다.
  - 확인: SQL Editor에서 `show max_connections;`와 `select usename, application_name, state, count(*) from pg_stat_activity group by 1, 2, 3 order by 4 desc;`(Supabase 문서의 실시간 확인 방법). Supavisor 세션 모드 연결이 어느 행(`usename`·`application_name`)으로 보이는지와 클라이언트가 끊은 뒤 Supavisor가 Postgres 연결을 얼마나 유지하는지는 `[확인 못 함]`이라, 배포 전·배포 중·배포 뒤에 같은 쿼리로 비교해 API 몫이 6(겹치는 동안 12)을 넘지 않는지 봅니다. 대시보드 Observability > Database Connections·Shared Pooler (Supavisor) Client Connections 보고서도 같은 수를 보입니다(실시간 아님).
- Free 플랜은 7일 동안 활동이 적으면 일시정지되고 자동 백업이 없습니다. 출시 전 Pro로 전환합니다(일일 백업 7일 보관, PITR은 별도 애드온). 그 전까지는 아래 `pg_dump`를 정기적으로 합니다.

```bash
# 로컬에서. Supabase Postgres 메이저와 같은 pg_dump(대시보드에서 버전 확인).
docker run --rm -e PGURL='<세션 풀러 연결 문자열>?sslmode=require' -v "$PWD:/out" postgres:17-alpine \
  sh -c 'pg_dump "$PGURL" -Fc -f /out/crelink-$(date -u +%Y%m%d).dump'
# 복원(대상 DB에): pg_restore --no-owner --no-privileges -d '<대상 연결 문자열>' crelink-YYYYMMDD.dump
```

`pg_dump`의 Supabase 메이저 버전 일치와 세션 풀러 경유 덤프의 제약은 `[확인 못 함]`입니다. 처음 백업할 때 복원까지 한 번 시험합니다.

## 13. 처음 설계에서 남은 것 정리(한 번)

- GitHub secrets: [2-5](#2-ci-접속-설정-tailscalegithub).
- Cloudflare DNS: 처음 설계의 `go` A 레코드·`links` CNAME은 [3](#3-cloudflare-tunnel-공개-호스트)에서 Tunnel CNAME으로 바뀝니다.
- OCI 서버: 서버 공용 edge Caddy(`/opt/edge`)는 다른 프로젝트(aichat)가 계속 쓰므로 그대로 둡니다. 크리링 흔적(`/opt/edge/sites/crelink.caddy`, `/opt/crelink`, `deploy` 사용자와 그 `authorized_keys`)은 지워도 되지만, edge 설정 reload는 그 서버의 모든 사이트에 영향을 주므로 영향을 설명하고 승인받은 뒤 합니다.
- 로컬 평문 비밀값 파일(`apps/api/.env.prod`, `infra/prod/.env`)은 암호문으로 옮긴 뒤 지웁니다.

## 14. blue/green cutover

blue/green 이전 단일 스택(project `crelink-prod`: caddy·api·web, 18080을 스택 안 caddy가 쥠)에서 edge(`crelink-edge`) + 색 스택(`crelink-blue`)으로 **서버마다 한 번** 옮깁니다. 실행 원본은 릴리스의 `cutover.sh`(머리말에 단계·종료 코드)이고, 사전 점검·`--dry-run`·다시 실행해도 같은 결과(멈춘 단계부터 이어 감)·자동 원복을 갖습니다. 공백은 옛 caddy를 멈추고 edge가 18080을 잡을 때까지 한 번이며(옛 caddy 정지 유예 5초 `CRELINK_CUTOVER_STOP_SECONDS`) 로컬 리허설(`infra/prod/tests/cutover-rehearsal.sh`, 옛 구조는 운영 릴리스 `433dc88`의 `infra/prod`)에서 0.3~0.5초, 되돌리기는 1.3~1.4초였습니다(대상마다 0.1초 간격 측정, 운영 기동 시간과 다를 수 있음).

### 14-1. 순서와 병합·자동 배포의 관계

0035가 main에 병합되면 Deploy가 새 스크립트를 서버에서 실행합니다. cutover 전 서버에서는 새 `deploy.sh`가 릴리스 폴더를 풀고 이미지를 받은 뒤 "edge가 준비되지 않았습니다"로 **아무것도 바꾸지 않고 종료 1**이고 job이 실패합니다(`자동 롤백`은 운영 주소 검사가 실패했을 때만 돌아 실행되지 않음, 배포 기록 태그도 그대로). 운영 중인 `crelink-prod`는 그대로 서비스합니다. 그래서 병합과 cutover를 같은 운영 창(트래픽이 적은 시각)에 둡니다.

1. (창 열기 전) 이 절과 [14-5](#14-5-되돌리기)를 읽고 터미널 두 개를 준비합니다.
2. 0035를 main에 병합합니다. 앱 변경이 없으면 Deploy는 이미지를 새로 만들지 않고 지금 운영 이미지 SHA를 넘깁니다. 서버 단계 실패(위)를 확인합니다: Actions 로그 끝 `edge가 준비되지 않았습니다 … 14. blue/green cutover`.
3. 병합한 main으로 bootstrap을 다시 실행합니다([14-2](#14-2-사전-준비)).
4. `cutover.sh --dry-run` → `cutover.sh`([14-3](#14-3-cutover-실행)), 다른 터미널에서 공백 측정.
5. 확인([14-4](#14-4-확인)). 실패한 Deploy 실행을 **Re-run failed jobs**로 다시 돌려 cutover 뒤 첫 배포(같은 릴리스를 green으로, 무중단)·운영 주소 검사·배포 기록 태그를 마칩니다. 이 배포를 [6-1](#6-1-배포-공백-측정)로 재서 실패 0인지 봅니다.
6. 문제가 있으면 [14-5](#14-5-되돌리기). 결과(시각·릴리스·공백·되돌리기 여부)를 운영 work item(0036)에 남깁니다.

cutover를 하지 않고 창을 닫아야 하면 0035 병합 커밋을 되돌리는 커밋을 병합합니다(서버는 아직 `crelink-prod`라 옛 스크립트로 정상 배포됨).

### 14-2. 사전 준비

```bash
# 로컬(저장소 루트, 병합한 main): ssh-entry.sh(status에 색 줄)·bootstrap.sh(네트워크·볼륨·edge 폴더) 반영
git switch main && git pull --ff-only
ssh home-server 'mkdir -p /tmp/crelink-bootstrap'
scp infra/prod/bootstrap.sh infra/prod/ssh-entry.sh home-server:/tmp/crelink-bootstrap/
ssh -t home-server 'sudo TARGET_NAME=home-server bash /tmp/crelink-bootstrap/bootstrap.sh'   # DEPLOY_SSH_PUBKEY 없이: authorized_keys 그대로
git rev-parse HEAD                                       # 병합 SHA(40자) = 아래 R

# 서버
ssh home-server
R=<병합 SHA 40자>
ls -ld /opt/crelink/releases/$R                          # 병합 배포가 풀어 둔 릴리스(없으면 Deploy 서버 단계가 묶음을 받기 전에 실패한 것)
readlink /opt/crelink/current; cat /opt/crelink/state/images.env   # 옛 운영 릴리스 L(433dc88…)·이미지. cutover는 이 이미지를 그대로 씀
cat /opt/crelink/releases/$(basename "$(readlink /opt/crelink/current)")/.images.env   # 되돌리기에 필요한 옛 릴리스 성공 기록
sudo docker network ls | grep crelink-edge; sudo docker volume ls | grep crelink-prod_geoip; ls -ld /opt/crelink/edge/conf
free -m                                                  # 전환 동안 앱 2벌(옛 crelink-prod + blue)
```

- DB 연결: 겹치는 동안 옛 api + blue api로 `2 × DATABASE_POOL_MAX`(12)입니다([12](#12-supabase-주의사항)).
- 이미지: 앱 변경 없는 병합이면 `state/images.env`의 이미지가 서버에 있어 레지스트리가 필요 없습니다. 다른 이미지로 cutover하려면 병합 배포가 받아 둔 이미지 SHA를 `cutover.sh <R> <API SHA> <웹 SHA>`로 줍니다(서버에 없으면 점검이 FAIL).

### 14-3. cutover 실행

```bash
# 터미널 1: 공백 측정(대상마다 0.1초 간격). 끝나면 Ctrl-C로 요약
ssh -t home-server /opt/crelink/releases/<R>/measure-gap.sh -r 10

# 터미널 2
ssh home-server
R=<병합 SHA 40자>
sudo /opt/crelink/releases/$R/cutover.sh --dry-run $R    # 점검 줄이 모두 ok·info여야 함(FAIL이면 종료 1, 아무것도 바꾸지 않음)
sudo /opt/crelink/releases/$R/cutover.sh $R              # root면 deploy로 다시 실행됨. 1~2분
```

- 진행: `단계 ②`(네트워크·볼륨·edge 폴더) → `③`(edge 설정 validate) → `④`(`crelink-blue` up --wait, 옛 스택은 계속 서비스) → `⑤`(edge 만들기 → 옛 caddy 정지 → edge 시작, **여기만 공백**) → `⑥`(상태 기록) → `⑦`(옛 `crelink-prod` 컨테이너·네트워크 삭제, 볼륨 유지) → `cutover 완료`.
- ④ 이전 실패: blue만 내리고 종료 1, 옛 스택 그대로. ⑤ 실패(edge가 18080을 서비스하지 못함): edge를 멈추고 옛 caddy를 다시 켠 뒤 blue를 내리고 종료 1. 원복도 실패하면 종료 2 → [14-6](#14-6-종료-2와-수동-복구).
- 중간에 끊겼으면 같은 명령을 다시 실행합니다(끝난 단계는 건너뜀). 이미 끝났으면 "이미 cutover됨"으로 종료 0.

### 14-4. 확인

```bash
ssh home-server
sudo -u deploy /opt/crelink/current/verify.sh            # 운영 주소 6개 ok (Actions의 운영 주소 검사와 같음)
cat /opt/crelink/state/active-color                      # blue
column -t -s $'\t' /opt/crelink/state/releases.log | tail -n 2   # 마지막 줄: deploy <L> <R> <같은 이미지>
sudo docker ps -a --format '{{.Names}}\t{{.Status}}' | grep crelink-   # crelink-edge-caddy-1·crelink-blue-api-1·crelink-blue-web-1 Up, crelink-prod-* 없음
sudo docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' crelink-blue-web-1 | grep API_INTERNAL_URL   # http://api-blue:3000
sudo docker port crelink-edge-caddy-1                     # 80/tcp -> 127.0.0.1:18080 하나
sudo docker exec crelink-blue-api-1 ls -l /data/geoip     # 옛 볼륨의 GeoIP 파일이 그대로 보임
```

그다음 14-1의 5(실패한 Deploy 다시 실행 → green, 무중단 확인)를 합니다. 웹 로그인·단축 이동·클릭 기록 IP도 [5](#5-최초-배포) 7처럼 봅니다.

### 14-5. 되돌리기

edge·blue에 문제가 있어 옛 `crelink-prod`로 돌아갈 때입니다. 옛 릴리스 폴더와 성공 기록(`.images.env`)·이미지가 서버에 남아 있어야 합니다(최근 5개 규칙이라 cutover 뒤 네 번째 배포쯤 정리되므로, 그 전에 되돌릴지 정합니다. 정리된 뒤에는 이 절차를 쓸 수 없고 수동 복구(14-6)만 남음).

```bash
ssh -t home-server /opt/crelink/releases/<R>/measure-gap.sh -r 10     # 터미널 1(선택)
ssh home-server
sudo /opt/crelink/current/cutover.sh --revert --dry-run  # 대상: releases.log에서 가장 최근의 옛 형식 릴리스(=L). 다르면 --revert <L SHA>
sudo /opt/crelink/current/cutover.sh --revert
```

- 순서: 옛 릴리스 api·web을 `crelink-prod`로 `up --wait`(edge가 계속 서비스) → 옛 caddy를 만들고 → edge 정지 → 옛 caddy 시작(공백) → 18080 확인 → `active-color` 삭제·`current`=L·`images.env`·`releases.log`(`rollback <R> <L>`) → 두 색 정지(컨테이너·edge 설정·네트워크·볼륨은 남김).
- 되돌린 뒤에는 새 `deploy.sh`가 다시 거부합니다(edge 없음). 0035를 계속 쓸 거면 원인을 고친 뒤 14-3을 다시 하고(같은 명령, 남은 컨테이너를 다시 씀), 그만둘 거면 0035 병합을 되돌리는 커밋을 main에 병합합니다(옛 스크립트가 `crelink-prod`에 배포). 반대 순서(되돌리기 전에 병합 되돌림)는 옛 `deploy.sh`가 edge가 쥔 18080과 부딪히므로 하지 않습니다.
- 다시 실행해도 됩니다(이미 되돌렸으면 "이미 되돌림"으로 종료 0).

### 14-6. 종료 2와 수동 복구

스크립트가 원복까지 실패했거나 쓸 수 없을 때 18080을 다시 서비스시키는 최소 명령입니다(`deploy` 사용자 셸: `sudo -u deploy -i`).

```bash
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep crelink-   # 누가 18080을 쥐었나
# 옛 caddy가 남아 있으면(cutover ⑤ 실패) 그것부터
docker start crelink-prod-caddy-1 && curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: go.shaul.kr' http://127.0.0.1:18080/zzzz
# edge로 가려면(blue가 Up일 때)
docker compose -p crelink-edge -f /opt/crelink/edge/compose.yaml up -d --wait
# 옛 스택을 처음부터(옛 릴리스 L, 컨테이너가 지워진 뒤)
L=<옛 릴리스 SHA>; cd /opt/crelink/releases/$L
(umask 077 && SOPS_AGE_KEY_FILE=/etc/crelink/age.key sops decrypt --input-type dotenv --output-type dotenv secrets/home-server.sops.env >/run/crelink/app.env)
docker compose -p crelink-prod -f compose.yaml --env-file .images.env up -d --wait api web
docker stop -t 5 crelink-edge-caddy-1; docker compose -p crelink-prod -f compose.yaml --env-file .images.env up -d --wait
rm -f /run/crelink/app.env
# 상태를 옛 구조에 맞춤
rm -f /opt/crelink/state/active-color; ln -sfn releases/$L /opt/crelink/current.tmp && mv -T /opt/crelink/current.tmp /opt/crelink/current
cp .images.env /opt/crelink/state/images.env
```

복구 뒤 [11](#11-장애-대응) 12처럼 기록합니다.

## 로컬 시험

원격 없이 Docker로 이 구성을 확인하는 방법은 [infra/prod/README.md](../prod/README.md#로컬-시험)에 있습니다.

## 출처

모두 2026-10-06 확인.

| 사실 | 출처 |
| --- | --- |
| Tailscale workload identity federation(Trust credentials, Subject, Client ID·Audience, GitHub Action `oauth-client-id`·`audience`·`tags`, `id-token: write`) | <https://tailscale.com/docs/features/workload-identity-federation> |
| Tailscale GitHub Action(ephemeral 노드, `ping`) | <https://github.com/tailscale/github-action> |
| Tailscale SSH가 tailnet의 22번을 가져감 | <https://tailscale.com/docs/features/tailscale-ssh> |
| tailnet 정책 grants·tagOwners·hosts | <https://tailscale.com/kb/1324/grants>, <https://tailscale.com/kb/1337/policy-syntax> |
| Tailscale Personal 비상업 조건 | <https://tailscale.com/pricing> |
| GitHub OIDC `sub` 형식 | <https://docs.github.com/en/actions/reference/security/oidc> |
| GitHub Free 비공개 저장소의 environments 제약 | <https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments> |
| Cloudflare Tunnel 공개 경로·CNAME 자동 생성 | <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/> |
| SOPS(`sops edit`·`updatekeys`·`SOPS_AGE_KEY_CMD`·dotenv) | <https://github.com/getsops/sops> |
| OpenSSH `authorized_keys`의 `restrict`·`command=` | <https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT> |
| docker 그룹 = root 권한 | <https://docs.docker.com/engine/install/linux-postinstall/> |
| Docker 공식 apt 설치 | <https://docs.docker.com/engine/install/ubuntu/> |
| Compose `up --wait` | <https://docs.docker.com/reference/cli/docker/compose/up/> |
| Caddy `trusted_proxies`·`client_ip_headers` | <https://caddyserver.com/docs/caddyfile/options#trusted-proxies> |
| Supabase 세션 풀러·IPv4·트랜잭션 모드 제약 | <https://supabase.com/docs/guides/database/connecting-to-postgres> |
| Supabase SSL 강제·CA 다운로드 | <https://supabase.com/docs/guides/platform/ssl-enforcement> |
| Supabase Free 일시정지·백업 | <https://supabase.com/docs/guides/platform/free-project-pausing>, <https://supabase.com/docs/guides/platform/backups> |
| DB-IP City Lite(CC BY 4.0, 매월 갱신) | <https://db-ip.com/db/download/ip-to-city-lite> |
| GHCR 인증·저장소 연결 | <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry> |
| S3 조건부 쓰기(`If-None-Match: *` → 412), aws-cli `put-object --if-none-match`(2026-10-07) | <https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html>, <https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html> |
| Cloudflare R2 PutObject의 `If-None-Match` 지원(2026-10-07) | <https://developers.cloudflare.com/r2/api/s3/api/> |
| SeaweedFS 스택 운영(접근 키·버킷·백업)(2026-10-07) | <https://github.com/shaul1991/home-seaweedfs#readme> |
| Compose `stop_grace_period`(기본 10초)·`healthcheck.start_interval`(`start_period` 안에서만 쓰임, Compose v2.20.2·Engine 25 이상)(2026-10-07) | <https://github.com/compose-spec/compose-spec/blob/main/05-services.md>, <https://docs.docker.com/reference/dockerfile/#healthcheck> |
| Cloudflare 원본 응답 한도 100초(524)(2026-10-07) | <https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/> |
| Supabase Pool Size·클라이언트/백엔드 연결·`pg_stat_activity` 확인, compute별 `max_connections`(Nano 60)·Pool Size 비율 권장(2026-10-07) | <https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits>, <https://supabase.com/docs/guides/platform/compute-and-disk>, <https://supabase.com/docs/guides/database/connection-management> |
| Caddy `caddy reload`(admin `/load`, 실패하면 옛 설정 유지)·`admin`·`grace_period`·`import`·reverse_proxy `lb_try_duration`(2026-10-07, 동작은 0035 로컬 시험으로 확인) | <https://caddyserver.com/docs/command-line#caddy-reload>, <https://caddyserver.com/docs/api#post-load>, <https://caddyserver.com/docs/caddyfile/options>, <https://caddyserver.com/docs/caddyfile/directives/import>, <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy> |
| 파일 하나 bind는 교체(rename) 뒤 옛 inode를 봄(그래서 edge 설정은 폴더 bind)(2026-10-07) | <https://github.com/moby/moby/issues/15793> |

`[확인 못 함]`: Tailscale WIF Custom claims의 와일드카드, `pg_dump`의 Supabase 버전·풀러 제약, `pg_stat_activity`에 보이는 Supavisor 연결의 구분.
