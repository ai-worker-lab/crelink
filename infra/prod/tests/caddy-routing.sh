#!/usr/bin/env bash
# edge Caddy + crelink.caddy 공개 정책 로컬 시험(Docker만 필요, 원격·DNS 불필요). 저장소 루트에서: infra/prod/tests/caddy-routing.sh
# - 저장소의 edge/compose.yaml·edge/Caddyfile·crelink.caddy를 임시 폴더에 복사해 그대로 쓰고, 다른 점은 아래뿐입니다.
#   호스트 포트(127.0.0.1의 빈 포트), 사이트 주소 CRELINK_DOMAIN=go.localhost(Caddy가 내부 CA로 인증서 발급, ACME 없음),
#   네트워크 이름, 업스트림 crelink-api를 요청을 그대로 돌려주는 echo 스텁으로 대체.
# - aichat.caddy는 실제 도메인 인증서 발급을 시도하므로 띄우지 않고 caddy adapt로 전체 설정 문법만 확인합니다.
# - 끝나면(실패해도) 컨테이너·네트워크·볼륨·임시 폴더를 지웁니다. 이미지(caddy, node:22-alpine)는 남깁니다.
# 종료 코드: 0 모든 기대 일치, 1 불일치 있음.
set -euo pipefail

prod="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_id="crelink-caddytest-$$"
work="$(mktemp -d)"
stub="$run_id-stub"
token="$(openssl rand -hex 32)"
host=go.localhost

export CRELINK_DOMAIN="$host" CRELINK_INTERNAL_TOKEN="$token"
export EDGE_NETWORK="$run_id-edge" AICHAT_NETWORK="$run_id-aichat"

edge() { docker compose --progress quiet -p "$run_id" -f "$work/edge/compose.yaml" -f "$work/edge/override.yaml" "$@"; }

cleanup() {
	docker rm -f "$stub" >/dev/null 2>&1 || true
	edge down -v --remove-orphans >/dev/null 2>&1 || true
	docker network rm "$AICHAT_NETWORK" >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT

mkdir -p "$work/edge/sites"
cp "$prod/edge/compose.yaml" "$prod/edge/Caddyfile" "$work/edge/"
cp "$prod/crelink.caddy" "$work/edge/sites/"
cat >"$work/edge/override.yaml" <<'EOF'
services:
  caddy:
    ports: !override
      - '127.0.0.1::80'
      - '127.0.0.1::443'
EOF

echo "== 전체 edge 설정 문법(caddy adapt, aichat.caddy 포함)"
docker run --rm --network none -e CRELINK_DOMAIN -e CRELINK_INTERNAL_TOKEN \
	-v "$prod/edge/Caddyfile:/etc/caddy/Caddyfile:ro" \
	-v "$prod/edge/sites/aichat.caddy:/etc/caddy/sites/aichat.caddy:ro" \
	-v "$prod/crelink.caddy:/etc/caddy/sites/crelink.caddy:ro" \
	caddy:2.11-alpine caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
echo "adapt 통과"

docker network create "$AICHAT_NETWORK" >/dev/null
edge up -d --quiet-pull
# 요청 메서드·경로·헤더를 JSON으로 돌려주는 업스트림 스텁(별칭 crelink-api:3000).
docker run -d --name "$stub" --network "$EDGE_NETWORK" --network-alias crelink-api node:22-alpine node -e '
require("http").createServer((q, s) => {
  s.setHeader("content-type", "application/json");
  s.end(JSON.stringify({ method: q.method, url: q.url, xff: q.headers["x-forwarded-for"] ?? null,
    internal: q.headers["x-crelink-internal"] ?? null, remote: q.socket.remoteAddress }));
}).listen(3000);' >/dev/null

https_port="$(edge port caddy 443 | cut -d: -f2)"
http_port="$(edge port caddy 80 | cut -d: -f2)"
base="https://$host:$https_port"
CURL=(curl -sS -k --max-time 10 --resolve "$host:$https_port:127.0.0.1")

for _ in $(seq 30); do
	if "${CURL[@]}" -o /dev/null "$base/zzzz" 2>/dev/null && docker exec "$stub" true 2>/dev/null; then break; fi
	sleep 1
done

failures=0
body="$work/body"
printf '\n| 요청 | 기대 | 실제 | 결과 |\n| --- | --- | --- | --- |\n'
# check <설명> <기대 상태> <업스트림이 받아야 할 경로 또는 -> <curl 인자...>
check() {
	local label="$1" want="$2" want_url="$3" code expected actual ok=일치
	shift 3
	: >"$body"
	code="$("${CURL[@]}" -o "$body" -w '%{http_code}' "$@" || echo ERR)"
	expected="$want"
	actual="$code"
	if [[ "$want_url" != - ]]; then
		local got_url
		got_url="$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).url)}catch{process.stdout.write("(스텁 응답 아님)")}' "$body")"
		expected="$want, 업스트림 $want_url"
		actual="$code, 업스트림 $got_url"
		[[ "$code" == "$want" && "$got_url" == "$want_url" ]] || ok=불일치
	else
		[[ "$code" == "$want" ]] || ok=불일치
		# 404여도 업스트림이 돌려준 것이면 정책 위반입니다(스텁 응답에는 "url"이 있음).
		if grep -q '"url"' "$body"; then
			ok=불일치
			actual="$actual(업스트림 도달)"
		fi
	fi
	[[ "$ok" == 일치 ]] || failures=$((failures + 1))
	printf '| %s | %s | %s | %s |\n' "$label" "$expected" "$actual" "$ok"
}

check 'GET /myslug' 200 /myslug "$base/myslug"
check 'GET /abc (3자)' 200 /abc "$base/abc"
check 'GET /My-Slug-2 (대문자, API가 소문자화)' 200 /My-Slug-2 "$base/My-Slug-2"
check 'GET /a23456789012345678901234567890 (30자)' 200 /a23456789012345678901234567890 "$base/a23456789012345678901234567890"
check 'GET /myslug?utm=ig (쿼리)' 200 '/myslug?utm=ig' "$base/myslug?utm=ig"
check 'GET /c/abcde12345' 200 /c/abcde12345 "$base/c/abcde12345"
check 'GET /api/health (토큰 없음)' 404 - "$base/api/health"
check 'GET /api/health (틀린 토큰)' 404 - -H 'X-Crelink-Internal: wrong' "$base/api/health"
check 'GET /api/health (빈 토큰 헤더)' 404 - -H 'X-Crelink-Internal;' "$base/api/health"
check 'GET /api/health (토큰 앞부분만)' 404 - -H "X-Crelink-Internal: ${token:0:32}" "$base/api/health"
check 'GET /api/health (올바른 토큰)' 200 /api/health -H "X-Crelink-Internal: $token" "$base/api/health"
check 'GET /api/health/ready (올바른 토큰)' 200 /api/health/ready -H "X-Crelink-Internal: $token" "$base/api/health/ready"
check 'POST /api/me/files (올바른 토큰)' 200 /api/me/files -X POST -H "X-Crelink-Internal: $token" "$base/api/me/files"
check 'GET /' 404 - "$base/"
check 'GET /ab (2자)' 404 - "$base/ab"
check 'GET /a234567890123456789012345678901 (31자)' 404 - "$base/a234567890123456789012345678901"
check 'GET /-abc (앞 하이픈)' 404 - "$base/-abc"
check 'GET /abc- (뒤 하이픈)' 404 - "$base/abc-"
check 'GET /my_slug (밑줄)' 404 - "$base/my_slug"
check 'GET /myslug/ (끝 슬래시)' 404 - "$base/myslug/"
check 'GET /myslug/extra' 404 - "$base/myslug/extra"
check 'GET /c/ABCDE12345 (대문자 id)' 404 - "$base/c/ABCDE12345"
check 'GET /c/abcde1234 (9자)' 404 - "$base/c/abcde1234"
check 'GET /c/abcde123456 (11자)' 404 - "$base/c/abcde123456"
check 'GET /files/abc/def/long/path (/api 아님)' 404 - "$base/files/abc/def/long/path"
check 'GET /apix/health' 404 - "$base/apix/health"
check 'GET /api/files/x (토큰 없음)' 404 - "$base/api/files/x"
check 'GET /c/../api/health (path-as-is, 토큰 없음)' 404 - --path-as-is "$base/c/../api/health"
check 'GET /%61pi/health (인코딩, 토큰 없음)' 404 - "$base/%61pi/health"
check 'POST /myslug' 404 - -X POST "$base/myslug"
check 'HEAD /myslug' 404 - -I "$base/myslug"

# X-Forwarded-For(Cloudflare 밖 접속): 위조 XFF·CF-Connecting-IP는 버려지고 접속 주소 하나만 남아야 합니다.
"${CURL[@]}" -o "$body" -H 'X-Forwarded-For: 6.6.6.6, 7.7.7.7' -H 'CF-Connecting-IP: 8.8.8.8' "$base/myslug"
xff="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).xff))' "$body")"
if [[ "$xff" != *6.6.6.6* && "$xff" != *7.7.7.7* && "$xff" != *8.8.8.8* && "$xff" != *,* && -n "$xff" && "$xff" != null ]]; then ok=일치; else
	ok=불일치
	failures=$((failures + 1))
fi
printf '| %s | %s | %s | %s |\n' 'GET /myslug + 위조 XFF·CF-Connecting-IP (신뢰 프록시 아님)' '업스트림 XFF = 접속 주소 하나' "XFF=$xff" "$ok"

# X-Forwarded-For(Cloudflare 경유 흉내): 신뢰 프록시 목록을 이 시험 접속 대역으로 바꾼 설정으로 같은 요청을 보내면
# CF-Connecting-IP가 방문자 주소가 되어야 합니다. 실제 Cloudflare 대역은 로컬에서 만들 수 없어 목록만 바꿉니다.
sed -E 's#trusted_proxies static .*#trusted_proxies static private_ranges#' "$prod/edge/Caddyfile" >"$work/edge/Caddyfile"
edge exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1
sleep 1
"${CURL[@]}" -o "$body" -H 'X-Forwarded-For: 6.6.6.6' -H 'CF-Connecting-IP: 203.0.113.9' "$base/myslug"
xff="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).xff))' "$body")"
if [[ "$xff" == 203.0.113.9 ]]; then ok=일치; else
	ok=불일치
	failures=$((failures + 1))
fi
printf '| %s | %s | %s | %s |\n' 'GET /myslug + CF-Connecting-IP: 203.0.113.9 (신뢰 프록시)' '업스트림 XFF = 203.0.113.9' "XFF=$xff" "$ok"

"${CURL[@]}" -o "$body" -H "X-Crelink-Internal: $token" "$base/api/health"
internal="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).internal))' "$body")"
if [[ "$internal" == null ]]; then ok=일치; else
	ok=불일치
	failures=$((failures + 1))
fi
printf '| %s | %s | %s | %s |\n' 'GET /api/health (올바른 토큰) 업스트림 헤더' 'X-Crelink-Internal 제거됨' "internal=$internal" "$ok"

redirect="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' -H "Host: $host" "http://127.0.0.1:$http_port/myslug")"
if [[ "$redirect" == "308 https://$host/myslug" ]]; then ok=일치; else
	ok=불일치
	failures=$((failures + 1))
fi
printf '| %s | %s | %s | %s |\n' 'http:// GET /myslug' "308 → https://$host/myslug" "$redirect" "$ok"

echo
if ((failures > 0)); then
	echo "불일치 ${failures}건"
	exit 1
fi
echo "모든 요청이 기대와 일치했습니다."
