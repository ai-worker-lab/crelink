#!/usr/bin/env bash
# deploy.sh·rollback.sh 로컬 시뮬레이션(Docker만 필요). 저장소 루트에서: infra/prod/tests/deploy-rollback.sh
# - GHCR 대신 로컬 레지스트리(registry:3, 127.0.0.1 빈 포트)를 띄우고, 헬스체크가 있는 더미 API 이미지 두 종(통과·실패)을 커밋 SHA 모양
#   태그로 올립니다. docker login·logout은 임시 DOCKER_CONFIG에서 하므로 사용자 자격 증명을 건드리지 않습니다.
# - 임시 폴더를 서버 /opt/crelink·/opt/edge처럼 꾸며 저장소의 compose.yaml·crelink.caddy·lib.sh·deploy.sh·rollback.sh·edge/를 그대로 씁니다.
#   다른 점은 lib.sh 머리말의 환경변수(CRELINK_IMAGE_REPO·EDGE_DIR·EDGE_PROJECT·EDGE_NETWORK·COMPOSE_PROJECT_NAME)와 edge 호스트 포트뿐입니다.
# - 끝나면(실패해도) 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. registry:3·caddy·node:22-alpine 이미지는 남깁니다.
# 종료 코드: 0 모든 시나리오가 기대와 일치, 1 불일치 있음.
set -euo pipefail

prod="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_id="crelink-deploytest-$$"
work="$(mktemp -d)"
registry="$run_id-registry"
token="$(openssl rand -hex 32)"
pull_token="test-pull-token-$(openssl rand -hex 8)"
host=go.localhost
good1=1111111aaaaaaa1111111aaaaaaa1111111aaaaa
good2=2222222bbbbbbb2222222bbbbbbb2222222bbbbb
bad=3333333ccccccc3333333ccccccc3333333ccccc
missing=4444444ddddddd4444444ddddddd4444444ddddd

# 사용자 docker 설정과 분리(로그인 기록이 남지 않게). 데몬 주소·CLI 플러그인은 현재 컨텍스트에서 가져옵니다.
DOCKER_HOST="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
export DOCKER_HOST
export DOCKER_CONFIG="$work/docker-config"
mkdir -p "$DOCKER_CONFIG"
echo '{}' >"$DOCKER_CONFIG/config.json"
if [[ -d "$HOME/.docker/cli-plugins" ]]; then ln -s "$HOME/.docker/cli-plugins" "$DOCKER_CONFIG/cli-plugins"; fi

export COMPOSE_PROJECT_NAME="$run_id"
export EDGE_DIR="$work/edge" EDGE_PROJECT="$run_id-edge" EDGE_NETWORK="$run_id-edge" AICHAT_NETWORK="$run_id-aichat"
export CRELINK_DOMAIN="$host" CRELINK_INTERNAL_TOKEN="$token"
server="$work/crelink"

edge() { docker compose --progress quiet -p "$EDGE_PROJECT" -f "$EDGE_DIR/compose.yaml" -f "$EDGE_DIR/override.yaml" "$@"; }

cleanup() {
	(cd "$server" 2>/dev/null && docker compose --progress quiet down -v --remove-orphans >/dev/null 2>&1) || true
	edge down -v --remove-orphans >/dev/null 2>&1 || true
	docker rm -f "$registry" >/dev/null 2>&1 || true
	docker network rm "$AICHAT_NETWORK" >/dev/null 2>&1 || true
	if [[ -n "${CRELINK_IMAGE_REPO:-}" ]]; then
		docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$CRELINK_IMAGE_REPO:" | xargs -r docker rmi >/dev/null 2>&1 || true
	fi
	docker rmi "$run_id-dummy:good" "$run_id-dummy:bad" >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT

echo "== 로컬 레지스트리·더미 이미지"
# Docker Desktop 데몬은 임의 배정 호스트 포트(127.0.0.1::5000)로 push하지 못해 빈 포트를 골라 고정합니다.
reg_port="$(node -e 'const s = require("net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); })')"
docker run -d --name "$registry" -p "127.0.0.1:$reg_port:5000" registry:3 >/dev/null
export CRELINK_IMAGE_REPO="127.0.0.1:$reg_port/crelink-api"
for _ in $(seq 30); do
	curl -fsS -o /dev/null "http://127.0.0.1:$reg_port/v2/" 2>/dev/null && break
	sleep 1
done

mkdir -p "$work/dummy"
cat >"$work/dummy/server.js" <<'EOF'
// 더미 API: HEALTHY=1이면 /api/health/ready가 200, 아니면 503. 그 밖의 경로는 요청을 JSON으로 돌려줍니다.
require('http').createServer((q, s) => {
  if (q.url === '/api/health/ready') { s.statusCode = process.env.HEALTHY === '1' ? 200 : 503; return s.end(process.env.HEALTHY); }
  s.setHeader('content-type', 'application/json');
  s.end(JSON.stringify({ image: process.env.DUMMY_NAME, url: q.url, xff: q.headers['x-forwarded-for'] ?? null }));
}).listen(Number(process.env.PORT));
EOF
cat >"$work/dummy/Dockerfile" <<'EOF'
FROM node:22-alpine
ARG HEALTHY
ENV HEALTHY=$HEALTHY
COPY server.js /server.js
HEALTHCHECK --interval=2s --timeout=2s --start-period=4s --retries=3 CMD wget -q -O /dev/null "http://127.0.0.1:$PORT/api/health/ready" || exit 1
CMD ["node", "/server.js"]
EOF
docker build -q --build-arg HEALTHY=1 -t "$run_id-dummy:good" "$work/dummy" >/dev/null
docker build -q --build-arg HEALTHY=0 -t "$run_id-dummy:bad" "$work/dummy" >/dev/null
for pair in "good:$good1" "good:$good2" "bad:$bad"; do
	docker tag "$run_id-dummy:${pair%%:*}" "$CRELINK_IMAGE_REPO:${pair#*:}"
	docker push -q "$CRELINK_IMAGE_REPO:${pair#*:}" >/dev/null
	docker rmi "$CRELINK_IMAGE_REPO:${pair#*:}" >/dev/null
done
echo "레지스트리 $CRELINK_IMAGE_REPO: $good1, $good2(통과), $bad(헬스 실패)"

echo "== 임시 서버 폴더(/opt/crelink, /opt/edge 역할)"
mkdir -p "$server/certs" "$EDGE_DIR/sites"
cp "$prod/compose.yaml" "$prod/crelink.caddy" "$prod/lib.sh" "$prod/deploy.sh" "$prod/rollback.sh" "$server/"
cp "$prod/edge/compose.yaml" "$prod/edge/Caddyfile" "$EDGE_DIR/"
: >"$EDGE_DIR/sites/crelink.caddy" # bootstrap.sh가 만드는 빈 사이트 파일
cat >"$EDGE_DIR/override.yaml" <<'EOF'
services:
  caddy:
    ports: !override
      - '127.0.0.1::80'
      - '127.0.0.1::443'
EOF
(
	umask 077
	sed -e 's|^PORT=.*|PORT=3000|' -e 's|^DATABASE_SSL=.*|DATABASE_SSL=disable|' -e 's|^DATABASE_SSL_CA_PATH=.*|DATABASE_SSL_CA_PATH=|' \
		"$prod/.env.example" >"$server/.env"
	echo "DUMMY_NAME=crelink-dummy" >>"$server/.env"
)
docker network create "$AICHAT_NETWORK" >/dev/null
edge up -d
https_port="$(edge port caddy 443 | cut -d: -f2)"
CURL=(curl -sS -k --max-time 10 --resolve "$host:$https_port:127.0.0.1")

failures=0
results="$work/results.md"
printf '| 시나리오 | 기대 | 실제 | 결과 |\n| --- | --- | --- | --- |\n' >"$results"
record() {
	local label="$1" want="$2" got="$3" ok=일치
	[[ "$want" == "$got" ]] || {
		ok=불일치
		failures=$((failures + 1))
	}
	printf '| %s | %s | %s | %s |\n' "$label" "$want" "$got" "$ok" >>"$results"
}
current_image() { sed -n 's/^API_IMAGE=//p' "$server/.env"; }
api_state() {
	local id
	id="$(cd "$server" && docker compose ps -q api)"
	[[ -n "$id" ]] || {
		echo none
		return
	}
	docker inspect -f '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id"
}
# run <설명> <명령...>: 종료 코드·마지막 줄을 남기고 출력에 토큰이 없는지 확인합니다.
run() {
	local label="$1" out="$work/out.log" code=0
	shift
	echo "-- $label: $*"
	(cd "$server" && "$@") >"$out" 2>&1 || code=$?
	sed 's/^/   /' "$out"
	LAST_CODE="$code"
	LAST_LINE="$(tail -n 1 "$out")"
	if grep -q -e "$pull_token" -e "$token" "$out"; then
		record "$label: 출력에 토큰 없음" 없음 있음
	fi
}
deploy_with_stdin_token() { printf '%s\n' "$pull_token" | GHCR_PULL_USER=tester GHCR_PULL_TOKEN_STDIN=1 ./deploy.sh "$@"; }
rollback_with_stdin_token() { printf '%s\n' "$pull_token" | GHCR_PULL_USER=tester GHCR_PULL_TOKEN_STDIN=1 ./rollback.sh "$@"; }

# 1. 이전 이미지가 없는 첫 배포가 헬스 실패 → 되돌릴 대상 없음, 종료 1
run '첫 배포(헬스 실패, 이전 없음)' deploy_with_stdin_token "$bad"
record '1. 첫 배포가 헬스 실패' '종료 1' "종료 $LAST_CODE"

# 2. 정상 배포
run '배포 good1' deploy_with_stdin_token "$good1"
record '2. 배포 good1 종료 코드·마지막 줄' "종료 0, $CRELINK_IMAGE_REPO:$good1" "종료 $LAST_CODE, $LAST_LINE"
record '2. 배포 good1 컨테이너' "$CRELINK_IMAGE_REPO:$good1 healthy" "$(api_state)"
record '2. edge 사이트 파일 설치' '같음' "$(cmp -s "$prod/crelink.caddy" "$EDGE_DIR/sites/crelink.caddy" && echo 같음 || echo 다름)"
# 사이트가 막 추가되어 Caddy가 내부 CA 인증서를 만드는 몇 초 동안은 TLS 연결이 실패할 수 있어 잠시 재시도합니다.
for _ in $(seq 15); do
	"${CURL[@]}" -o /dev/null "https://$host:$https_port/zzzz" 2>/dev/null && break
	sleep 1
done
record '2. edge 경유 GET /api/health/ready(토큰)' 200 "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -H "X-Crelink-Internal: $token" "https://$host:$https_port/api/health/ready")"
record '2. edge 경유 GET /api/health/ready(토큰 없음)' 404 "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "https://$host:$https_port/api/health/ready")"
record '2. edge 경유 GET /myslug' '"url":"/myslug"' "$("${CURL[@]}" "https://$host:$https_port/myslug" | grep -o '"url":"[^"]*"')"
record '2. 배포 뒤 레지스트리 자격 증명 남음' '없음' "$(grep -q '"auths"' "$DOCKER_CONFIG/config.json" && grep -q "127.0.0.1:$reg_port" "$DOCKER_CONFIG/config.json" && echo 있음 || echo 없음)"

# 3. 두 번째 정상 배포(사이트 파일은 그대로)
run '배포 good2' deploy_with_stdin_token "$good2"
record '3. 배포 good2' "종료 0, $CRELINK_IMAGE_REPO:$good2" "종료 $LAST_CODE, $LAST_LINE"
record '3. 사이트 파일 변경 없음 로그' '있음' "$(grep -q 'crelink.caddy 변경 없음' "$work/out.log" && echo 있음 || echo 없음)"

# 4. 헬스 실패 이미지 배포 → 이전 이미지(good2)로 복구, 종료 1
run '배포 bad' deploy_with_stdin_token "$bad"
record '4. 배포 bad 종료 코드' '종료 1' "종료 $LAST_CODE"
record '4. 복구 후 .env API_IMAGE' "$CRELINK_IMAGE_REPO:$good2" "$(current_image)"
record '4. 복구 후 컨테이너' "$CRELINK_IMAGE_REPO:$good2 healthy" "$(api_state)"

# 5. 입력 오류·pull 실패는 아무것도 바꾸지 않음
run '잘못된 SHA' deploy_with_stdin_token 'not-a-sha'
record '5. 잘못된 SHA' "종료 1, $CRELINK_IMAGE_REPO:$good2" "종료 $LAST_CODE, $(current_image)"
run '레지스트리에 없는 SHA' deploy_with_stdin_token "$missing"
record '5. pull 실패' "종료 1, $CRELINK_IMAGE_REPO:$good2" "종료 $LAST_CODE, $(current_image)"
run 'edge 없음' env EDGE_PROJECT=no-such-edge ./deploy.sh "$good1"
record '5. edge Caddy 없음' "종료 1, $CRELINK_IMAGE_REPO:$good2" "종료 $LAST_CODE, $(current_image)"

# 6. 인자 없는 롤백: good2를 배포한 deploy 줄의 이전 값(good1)
run '롤백(인자 없음)' rollback_with_stdin_token
record '6. 롤백(인자 없음)' "종료 0, $CRELINK_IMAGE_REPO:$good1" "종료 $LAST_CODE, $LAST_LINE"
record '6. 롤백 뒤 컨테이너' "$CRELINK_IMAGE_REPO:$good1 healthy" "$(api_state)"

# 7. 지정 롤백(서버에 이미지가 있으면 pull 없이)
run '롤백 good2 지정' rollback_with_stdin_token "$good2"
record '7. 롤백 good2 지정' "종료 0, $CRELINK_IMAGE_REPO:$good2" "종료 $LAST_CODE, $LAST_LINE"

# 8. 서버에 없는 이미지로 롤백 → 로그인·pull 후 전환(good1 이미지를 지워 둠)
docker rmi "$CRELINK_IMAGE_REPO:$good1" >/dev/null
run '롤백 good1 지정(이미지 없음 → pull)' rollback_with_stdin_token "$good1"
record '8. 롤백 good1(pull)' "종료 0, $CRELINK_IMAGE_REPO:$good1" "종료 $LAST_CODE, $LAST_LINE"

# 9. 헬스 실패 이미지로 롤백 → 이전(good1) 복구, 종료 1
run '롤백 bad 지정' rollback_with_stdin_token "$bad"
record '9. 롤백 bad' "종료 1, $CRELINK_IMAGE_REPO:$good1" "종료 $LAST_CODE, $(current_image)"

echo
echo "== releases.log"
sed 's/^/   /' "$server/releases.log"
echo
cat "$results"
echo
if ((failures > 0)); then
	echo "불일치 ${failures}건"
	exit 1
fi
echo "모든 시나리오가 기대와 일치했습니다."
