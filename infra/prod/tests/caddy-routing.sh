#!/usr/bin/env bash
# 운영 스택 Caddy(infra/prod/Caddyfile) 공개 정책 로컬 시험. Docker만 필요(DNS·Cloudflare 불필요). 저장소 루트에서:
#   infra/prod/tests/caddy-routing.sh
# - 실제 caddy:2.11.7-alpine(compose.yaml과 같은 이미지·읽기 전용·권한 축소)에 저장소 Caddyfile을 그대로 붙입니다. 다른 점은 아래뿐입니다.
#   호스트 CRELINK_SHORT_HOST=go.localhost·CRELINK_WEB_HOST=links.localhost, 호스트 포트(127.0.0.1의 빈 포트),
#   api·web 자리에 요청 메서드·경로·X-Forwarded-For를 응답 헤더(x-echo-*)로 되돌려주는 스텁(같은 네트워크, 별칭 api·web).
# - 방문자 IP: 호스트에서 보낸 요청은 Docker 게이트웨이(사설 대역)에서 오므로 cloudflared처럼 신뢰됩니다. 사설 대역이 아닌 곳에서 오는 요청은
#   203.0.113.0/24(TEST-NET-3) 네트워크의 클라이언트 컨테이너로 흉내 냅니다.
# - 끝나면(실패해도) 컨테이너·네트워크·임시 폴더를 지웁니다. 이미지(caddy, node:22-alpine)는 남깁니다.
# 종료 코드: 0 모든 기대 일치, 1 불일치 있음.
set -euo pipefail

prod="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_id="crelink-caddytest-$$"
work="$(mktemp -d)"
caddy_image=caddy:2.11.7-alpine
node_image=node:22-alpine
short=go.localhost
web=links.localhost
net="$run_id-net"
pubnet="$run_id-pub"
caddy="$run_id-caddy"

# 사용자 docker 설정과 분리합니다. 데몬 주소·CLI 플러그인은 현재 컨텍스트에서 가져옵니다.
DOCKER_HOST="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
export DOCKER_HOST
export DOCKER_CONFIG="$work/docker-config"
mkdir -p "$DOCKER_CONFIG"
echo '{}' >"$DOCKER_CONFIG/config.json"
if [[ -d "$HOME/.docker/cli-plugins" ]]; then ln -s "$HOME/.docker/cli-plugins" "$DOCKER_CONFIG/cli-plugins"; fi

cleanup() {
	docker ps -aq --filter "label=crelink-test=$run_id" | xargs docker rm -f >/dev/null 2>&1 || true
	docker network rm "$net" "$pubnet" >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT

free_port() { # 127.0.0.1에서 아무도 듣지 않는 포트
	local p
	for _ in $(seq 50); do
		p=$((20000 + RANDOM % 40000))
		if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then
			echo "$p"
			return 0
		fi
	done
	return 1
}

failures=0
passes=0
result() { # result <설명> <기대> <실제>
	if [[ "$2" == "$3" ]]; then
		passes=$((passes + 1))
		printf 'ok   - %s\n' "$1"
	else
		failures=$((failures + 1))
		printf 'FAIL - %s: 기대 [%s], 실제 [%s]\n' "$1" "$2" "$3"
	fi
}

echo "== 준비"
docker network create --label "crelink-test=$run_id" "$net" >/dev/null
docker network create --label "crelink-test=$run_id" --subnet 203.0.113.0/24 "$pubnet" >/dev/null
# 업스트림 스텁: 받은 요청(메서드·경로·X-Forwarded-For·본문 길이)을 응답 헤더로, 요청 헤더 전체를 본문(JSON)으로 돌려줍니다.
stub_js='
const role = process.env.ROLE;
require("http").createServer((q, s) => {
  let n = 0;
  q.on("data", (c) => { n += c.length; });
  q.on("error", () => {});
  q.on("end", () => {
    s.setHeader("x-echo-role", role);
    s.setHeader("x-echo-method", q.method);
    s.setHeader("x-echo-url", q.url);
    s.setHeader("x-echo-xff", q.headers["x-forwarded-for"] ?? "-");
    s.setHeader("x-echo-len", String(n));
    s.setHeader("content-type", "application/json");
    s.end(JSON.stringify(q.headers));
  });
}).listen(3000);'
for role in api web; do
	docker run -d --label "crelink-test=$run_id" --name "$run_id-$role" --network "$net" --network-alias "$role" \
		-e "ROLE=$role" "$node_image" node -e "$stub_js" >/dev/null
done

port="$(free_port)"
# compose.yaml의 caddy 서비스와 같은 실행 조건(읽기 전용, tmpfs, cap_drop all + NET_BIND_SERVICE, no-new-privileges).
docker run -d --label "crelink-test=$run_id" --name "$caddy" --network "$net" -p "127.0.0.1:$port:80" \
	-e "CRELINK_SHORT_HOST=$short" -e "CRELINK_WEB_HOST=$web" \
	-v "$prod/Caddyfile:/etc/caddy/Caddyfile:ro" \
	--read-only --tmpfs /data --tmpfs /config --cap-drop all --cap-add NET_BIND_SERVICE \
	--security-opt no-new-privileges:true "$caddy_image" >/dev/null
docker network connect "$pubnet" "$caddy"

CURL=(curl -sS --max-time 15 --resolve "$short:$port:127.0.0.1" --resolve "$web:$port:127.0.0.1")
go="http://$short:$port"
links="http://$web:$port"
# req <curl 인자...>: "<상태> <업스트림 역할> <업스트림이 받은 메서드> <업스트림이 받은 경로>"(Caddy가 직접 응답하면 상태만)
req() {
	local out
	out="$("${CURL[@]}" -o /dev/null -w '%{http_code} %header{x-echo-role} %header{x-echo-method} %header{x-echo-url}' "$@" 2>/dev/null || echo ERR)"
	printf '%s' "${out%"${out##*[![:space:]]}"}"
}
check() { # check <설명> <기대> <curl 인자...>
	local label="$1" want="$2"
	shift 2
	result "$label" "$want" "$(req "$@")"
}
for _ in $(seq 30); do
	[[ "$(req "$go/abc")" == '200 api GET /abc' ]] && break
	sleep 1
done

echo "== 설정·헬스"
result 'caddy validate(저장소 Caddyfile)' 0 "$(docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && echo 0 || echo 1)"
result '헬스 :2020/healthz(컨테이너 안)' ok "$(docker exec "$caddy" wget -q -O - http://127.0.0.1:2020/healthz 2>/dev/null || echo 실패)"
result '호스트 포트는 127.0.0.1:<포트>→80 하나' "80/tcp -> 127.0.0.1:$port" "$(docker port "$caddy" | tr '\n' ' ' | sed 's/ *$//')"

echo "== 단축 호스트($short): GET 단축·클릭만 api"
check 'GET /abc (3자)' '200 api GET /abc' "$go/abc"
check 'GET /myslug' '200 api GET /myslug' "$go/myslug"
check 'GET /My-Slug-2 (대문자 허용)' '200 api GET /My-Slug-2' "$go/My-Slug-2"
check 'GET /a23456789012345678901234567890 (30자)' '200 api GET /a23456789012345678901234567890' "$go/a23456789012345678901234567890"
check 'GET /myslug?utm=ig (쿼리 유지)' '200 api GET /myslug?utm=ig' "$go/myslug?utm=ig"
check 'GET /c/abcde12345 (클릭)' '200 api GET /c/abcde12345' "$go/c/abcde12345"
check 'GET /' 404 "$go/"
check 'GET /ab (2자)' 404 "$go/ab"
check 'GET /a234567890123456789012345678901 (31자)' 404 "$go/a234567890123456789012345678901"
check 'GET /-abc (앞 하이픈)' 404 "$go/-abc"
check 'GET /abc- (뒤 하이픈)' 404 "$go/abc-"
check 'GET /my_slug (밑줄)' 404 "$go/my_slug"
check 'GET /myslug/ (끝 슬래시)' 404 "$go/myslug/"
check 'GET /myslug/extra' 404 "$go/myslug/extra"
check 'GET /c/ABCDE12345 (대문자 id)' 404 "$go/c/ABCDE12345"
check 'GET /c/abcde1234 (9자)' 404 "$go/c/abcde1234"
check 'GET /c/abcde123456 (11자)' 404 "$go/c/abcde123456"
check 'GET /api/health' 404 "$go/api/health"
check 'GET /api/links' 404 "$go/api/links"
check 'POST /api/me/files' 404 -X POST "$go/api/me/files"
check 'GET /c/../api/health (path-as-is)' 404 --path-as-is "$go/c/../api/health"
check 'GET /%61pi/health (인코딩)' 404 "$go/%61pi/health"
check 'POST /myslug' 404 -X POST -d x "$go/myslug"
check 'POST /c/abcde12345' 404 -X POST -d x "$go/c/abcde12345"
check 'HEAD /myslug' 404 -I "$go/myslug"

echo "== 웹 호스트($web): 전체 web"
check 'GET /' '200 web GET /' "$links/"
check 'GET /dashboard/links?x=1' '200 web GET /dashboard/links?x=1' "$links/dashboard/links?x=1"
check 'POST /api/backend/me/links' '200 web POST /api/backend/me/links' -X POST -d '{}' "$links/api/backend/me/links"
check 'GET /c/abcde12345 (웹 호스트도 web)' '200 web GET /c/abcde12345' "$links/c/abcde12345"
head -c 5000000 /dev/zero >"$work/5mb"
head -c 7340032 /dev/zero >"$work/7mib"
check 'POST 본문 5MB' '200 web POST /upload' --data-binary "@$work/5mb" "$links/upload"
result 'POST 본문 5MB 업스트림 수신 길이' 5000000 "$("${CURL[@]}" -o /dev/null -w '%header{x-echo-len}' --data-binary "@$work/5mb" "$links/upload")"
check 'POST 본문 7MiB(Content-Length)' 413 --data-binary "@$work/7mib" "$links/upload"
check 'POST 본문 7MiB(chunked)' 413 -H 'Transfer-Encoding: chunked' --data-binary "@$work/7mib" "$links/upload"

echo "== 방문자 IP(X-Forwarded-For)"
xff() { "${CURL[@]}" -o /dev/null -w '%header{x-echo-xff}' "$@"; }
result 'go: 사설 대역 + CF-Connecting-IP → XFF = CF 값 하나(클라이언트 XFF 버림)' 203.0.113.9 \
	"$(xff -H 'X-Forwarded-For: 6.6.6.6, 7.7.7.7' -H 'CF-Connecting-IP: 203.0.113.9' "$go/abc")"
result 'links: 사설 대역 + CF-Connecting-IP → XFF = CF 값 하나' 198.51.100.7 \
	"$(xff -H 'X-Forwarded-For: 6.6.6.6' -H 'CF-Connecting-IP: 198.51.100.7' "$links/")"
host_xff="$(xff -H 'X-Forwarded-For: 6.6.6.6, 7.7.7.7' "$go/abc")"
result 'go: CF-Connecting-IP 없음 → XFF = 접속 주소 하나(사설 게이트웨이)' 'ok' \
	"$([[ "$host_xff" =~ ^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)[0-9.]+$ ]] && echo ok || echo "$host_xff")"
# 클라이언트 컨테이너: Caddy에 직접 요청해 "<상태> <업스트림 XFF> <자기 주소>"를 출력합니다.
client_js='
const [host, path, cf] = process.argv.slice(1);
const headers = { host, "x-forwarded-for": "6.6.6.6" };
if (cf) headers["cf-connecting-ip"] = cf;
const r = require("http").request({ host: process.env.CADDY, port: 80, path, headers }, (res) => {
  console.log(res.statusCode, res.headers["x-echo-xff"] ?? "-", r.socket.localAddress);
  res.resume();
});
r.on("error", (e) => { console.log("error", e.message); process.exit(1); });
r.end();'
client() { # client <네트워크> <Host> <경로> [CF-Connecting-IP]
	local network="$1"
	shift
	docker run --rm --label "crelink-test=$run_id" --network "$network" -e "CADDY=$caddy" "$node_image" node -e "$client_js" "$@" 2>&1 || true
}
read -r code got self <<<"$(client "$net" "$short" /abc)"
result 'go: 내부 사설 주소, CF-Connecting-IP 없음 → XFF = 접속 주소' "200 $self" "$code $got"
read -r code got self <<<"$(client "$pubnet" "$short" /abc 8.8.8.8)"
result 'go: 사설 대역이 아닌 곳(203.0.113.0/24) + CF-Connecting-IP → CF 무시, XFF = 접속 주소' "200 $self" "$code $got"
read -r code got self <<<"$(client "$pubnet" "$web" / 8.8.8.8)"
result 'links: 사설 대역이 아닌 곳 + CF-Connecting-IP → CF 무시, XFF = 접속 주소' "200 $self" "$code $got"

echo
echo "통과 $passes, 실패 $failures"
if ((failures > 0)); then
	exit 1
fi
echo "모든 요청이 기대와 일치했습니다."
