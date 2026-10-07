#!/usr/bin/env bash
# 무중단 배포 로컬 시험(ADR 0011 결정 5의 로컬 기준). Docker·sops·age·curl만 필요. 저장소 루트에서:
#   infra/prod/tests/zero-downtime.sh
# - edge + 두 색을 띄우고(새 서버처럼 cutover.sh로 시작) 부하를 흘리며 배포 2회·롤백 2회·geoip.sh --restart 1회(모두 ssh-entry.sh·서버 스크립트 그대로)를
#   한 뒤 다음을 확인합니다.
#   · 2xx·3xx가 아닌 응답과 연결 오류 0건(부하 전체), p99 지연이 평시(전환 없이 같은 부하) + 1초 이내
#   · 6초 걸리는 긴 요청(web BFF → api)이 전환 중에도 모두 200으로 완료
#   · web → api 호출이 늘 같은 색 안에서만 일어남(두 색이 함께 떠 있는 drain 구간 포함, 응답의 컨테이너 호스트 이름으로 판별)
#   · 전환 뒤 옛 색은 stopped(컨테이너 유지), 활성 색만 실행, releases.log 형식·순서
# - 부하(load.js, node:24-alpine 컨테이너, crelink-edge 네트워크에서 edge Caddy:80으로 직접): keep-alive 연결을 계속 다시 쓰는 클라이언트
#   (cloudflared처럼)로 초당 약 22.5건. GET links /(웹) 80ms마다, GET go /abcd(api 302) 200ms마다, POST links /api/backend/echo(web→api)
#   200ms마다, POST links /api/backend/slow?ms=6000(web→api 6초) 2초마다. 응답 하나마다 한 줄을 남깁니다.
# - 더미 이미지(graceful 종료)는 tests/lib/harness.sh. drain은 CRELINK_DRAIN_SECONDS=8(긴 요청 6초보다 길게, 운영 기본 20초).
# - geoip.sh의 DB-IP 내려받기만 curl 심으로 가짜 파일을 돌려줍니다(다른 curl 호출은 그대로).
# 끝나면(실패해도) 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. 측정 수치는 마지막에 "수치" 줄로 출력합니다.
# 종료 코드: 0 모든 확인이 기대와 일치, 1 불일치 있음.
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib/harness.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
real_curl="$(command -v curl)"
harness_init "crelink-zdtest-$$"
export CRELINK_DRAIN_SECONDS=8
c1="$(sha c1)" c2="$(sha c2)" c3="$(sha c3)"
names() { sed -e "s|$CRELINK_IMAGE_PREFIX-||g" -e "s|$c1|c1|g" -e "s|$c2|c2|g" -e "s|$c3|c3|g"; }
load_name="$run_id-load"
edge_host="$run_id-edge-caddy-1"
hosts_map="$work/hosts.map" # "<컨테이너 ID 앞 12자> <색>"
record_hosts() {
	local c
	for c in blue green; do
		docker ps -a --filter "label=com.docker.compose.project=$run_id-$c" --format "{{.ID}} $c" >>"$hosts_map"
	done
}

cat >"$work/bin/curl" <<EOF
#!/bin/sh
# 시험 전용 심: geoip.sh의 DB-IP 내려받기(https://download.db-ip.com/...)만 가짜 gzip 파일과 200으로 대신합니다. 그 밖은 진짜 curl.
fake="" out="" prev=""
for a in "\$@"; do
	case "\$a" in https://download.db-ip.com/*) fake=1 ;; esac
	if [ "\$prev" = -o ]; then out="\$a"; fi
	prev="\$a"
done
if [ -n "\$fake" ]; then
	printf 'fake-mmdb\n' | gzip -c >"\$out"
	printf 200
	exit 0
fi
exec "$real_curl" "\$@"
EOF
chmod 755 "$work/bin/curl"

cat >"$work/load.js" <<'EOF'
// 부하: keep-alive 에이전트(연결 재사용)로 일정 간격 요청. SIGTERM을 받으면 새 요청을 멈추고 진행 중 요청을 기다린 뒤 DONE을 출력합니다.
// 출력 한 줄: R <시작 ms> <종류> <상태> <걸린 ms> <ok|오류 코드> <web 호스트> <api 호스트>
const http = require('http');
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const base = process.env.TARGET;
const t0 = Date.now();
let inflight = 0;
let n = 0;
function send(kind, method, host, path, body) {
  const start = Date.now();
  let finished = false;
  inflight++;
  const done = (status, h, err) => {
    if (finished) return;
    finished = true;
    inflight--;
    console.log(`R ${start - t0} ${kind} ${status} ${Date.now() - start} ${err || 'ok'} ${h['x-host'] || '-'} ${h['x-api-host'] || '-'}`);
  };
  const headers = { host };
  if (body) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(body); }
  const req = http.request(base + path, { method, agent, headers, timeout: 30000 }, (res) => {
    res.resume();
    res.on('end', () => done(res.statusCode, res.headers));
    res.on('error', (e) => done(0, {}, e.code || 'res-error'));
  });
  req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })));
  req.on('error', (e) => done(0, {}, e.code || 'error'));
  req.end(body);
}
const timers = [
  setInterval(() => send('web', 'GET', 'links.localhost', `/?n=${n++}`), 80),
  setInterval(() => send('go', 'GET', 'go.localhost', '/abcd'), 200),
  setInterval(() => send('bff', 'POST', 'links.localhost', '/api/backend/echo', JSON.stringify({ n: n++ })), 200),
  setInterval(() => send('slow', 'POST', 'links.localhost', '/api/backend/slow?ms=6000', '{}'), 2000),
];
process.on('SIGTERM', () => {
  timers.forEach(clearInterval);
  const wait = () => (inflight === 0 ? (console.log(`DONE ${Date.now() - t0}`), process.exit(0)) : setTimeout(wait, 100));
  wait();
});
EOF
load_start() {
	docker run -d --name "$load_name" --label "crelink-test=$run_id" --network "$CRELINK_EDGE_NETWORK" -e "TARGET=http://$edge_host:80" \
		-v "$work/load.js:/load.js:ro" node:24-alpine node /load.js >/dev/null
}
load_stop() { # load_stop <결과 파일>
	docker stop -t 40 "$load_name" >/dev/null
	docker logs "$load_name" >"$1" 2>&1
	docker rm "$load_name" >/dev/null
}
# 부하 결과 요약
bad_count() { awk '$1 == "R" && ($4 !~ /^[23][0-9][0-9]$/ || $6 != "ok")' "$1" | wc -l | tr -d ' '; }
bad_sample() { awk '$1 == "R" && ($4 !~ /^[23][0-9][0-9]$/ || $6 != "ok")' "$1" | head -n 5 | tr '\n' ';'; }
total() { grep -c '^R ' "$1" || true; }
p99() { # 긴 요청(slow)을 뺀 응답 시간 p99(ms)
	awk '$1 == "R" && $3 != "slow" { print $5 }' "$1" | sort -n | awk '{ a[NR] = $1 } END { i = int(NR * 0.99); if (i < NR * 0.99) i++; if (i < 1) i = 1; print a[i] + 0 }'
}
duration_s() { sed -n 's/^DONE \([0-9]*\)$/\1/p' "$1" | awk '{ printf "%.1f", $1 / 1000 }'; }
# web·api 호스트 이름을 색으로 바꿔 "같은 색 / 다른 색 / 알 수 없음" 개수
pairs() {
	awk 'NR == FNR { color[$1] = $2; next } $1 == "R" && ($3 == "bff" || $3 == "slow") && $6 == "ok" {
		w = color[$7]; a = color[$8]
		if (w == "" || a == "") unknown++; else if (w == a) same++; else diff++
	} END { printf "same %d diff %d unknown %d", same, diff, unknown }' "$hosts_map" "$1"
}

echo "== 준비: 더미 이미지(api·web c1·c2·c3), 릴리스 묶음, edge + blue(cutover.sh, 새 서버)"
for v in c1 c2 c3; do
	dummy_build api "${!v}" "$v" 1
	dummy_build web "${!v}" "$v" 1
done
bundle c1 r1 "$server_pub"
bundle c2 r2 "$server_pub"
bundle c3 r3 "$server_pub"
ssh_entry "deploy $c1 $c1 $c1" c1
result '새 서버 첫 deploy는 edge가 없어 거부(종료 1)' '1 있음' "$CODE $(has 'edge가 준비되지 않았습니다')"
run "$CRELINK_ROOT/releases/$c1/cutover.sh" "$c1" "$c1" "$c1"
result 'cutover.sh(새 서버: 옛 스택 없음) 종료' 0 "$CODE"
result '활성 색·응답' 'blue 302 api c1 r1 / web c1' "$(color_of) $(probe)"
record_hosts

echo "== 평시 부하(전환 없음, 10초)"
load_start
sleep 10
load_stop "$work/load-base.txt"
base_p99="$(p99 "$work/load-base.txt")"
result '평시: 2xx·3xx가 아닌 응답·연결 오류 0' 0 "$(bad_count "$work/load-base.txt")"
echo "   평시 요청 $(total "$work/load-base.txt")건 / $(duration_s "$work/load-base.txt")초, p99 ${base_p99}ms"

echo "== 부하 중 배포 2회·롤백 2회·geoip.sh --restart"
load_start
sleep 3
steps=""
stop_codes="" # 전환마다 옛 색 컨테이너의 종료 코드(0이면 SIGTERM에 스스로 끝남, 137이면 30초 뒤 SIGKILL)
step_run() { # step_run <설명> <기대 "종료 색"> <명령...>
	local label="$1" want="$2" t0 t1 old
	shift 2
	t0="$(date +%s)"
	"$@"
	t1="$(date +%s)"
	record_hosts
	steps+="$label $((t1 - t0))s; "
	result "$label: 종료·활성 색" "$want" "$CODE $(color_of)"
	old="$(if [[ "$(color_of)" == blue ]]; then echo green; else echo blue; fi)"
	stop_codes+="$(docker ps -a --filter "label=com.docker.compose.project=$run_id-$old" --format '{{.Label "com.docker.compose.service"}}:{{.Status}}' |
		sed -n 's/^\([a-z]*\):Exited (\([0-9]*\)).*/\1=\2/p' | sort | tr '\n' ' ')"
}
step_run "deploy c2" '0 green' ssh_entry "deploy $c2 $c2 $c2" c2
result 'deploy c2: 마지막 줄' 'c2 api:c2 web:c2' "$(tail -n 1 "$LAST_OUT" | names)"
step_run "deploy c3" '0 blue' ssh_entry "deploy $c3 $c3 $c3" c3
step_run "rollback #1" '0 green' ssh_entry rollback
result 'rollback #1: 마지막 줄(직전 릴리스 c2)' 'c2 api:c2 web:c2' "$(tail -n 1 "$LAST_OUT" | names)"
step_run "rollback #2" '0 blue' ssh_entry rollback
result 'rollback #2: 마지막 줄(c1)' 'c1 api:c1 web:c1' "$(tail -n 1 "$LAST_OUT" | names)"
step_run "geoip.sh --restart" '0 green' run "$CRELINK_ROOT/current/geoip.sh" --restart
result 'geoip --restart: 같은 릴리스를 반대 색으로' '있음 c1' "$(has '재기동 완료') $(current | names)"
sleep 3
load_stop "$work/load.txt"

echo "== 결과"
bad="$(bad_count "$work/load.txt")"
deploy_p99="$(p99 "$work/load.txt")"
n_total="$(total "$work/load.txt")"
secs="$(duration_s "$work/load.txt")"
# 보낸 속도: 마지막 요청을 보낸 시각까지(끝에 진행 중 요청을 기다린 시간은 뺌)
rate="$(awk '$1 == "R" && $2 > last { last = $2 } $1 == "R" { n++ } END { printf "%.1f", n / (last / 1000) }' "$work/load.txt")"
slow_all="$(awk '$1 == "R" && $3 == "slow"' "$work/load.txt" | wc -l | tr -d ' ')"
slow_ok="$(awk '$1 == "R" && $3 == "slow" && $4 == 200 && $5 >= 6000' "$work/load.txt" | wc -l | tr -d ' ')"
result "부하 초당 20건 이상(${rate}건/s)" ok "$(awk -v r="$rate" 'BEGIN { print (r >= 20) ? "ok" : r }')"
result '2xx·3xx가 아닌 응답·연결 오류 0' 0 "$bad"
if [[ "$bad" != 0 ]]; then echo "       예: $(bad_sample "$work/load.txt")"; fi
slow_enough=적음
if ((slow_all >= 20)); then slow_enough=ok; fi
result "긴 요청(6초) 모두 200 완료(${slow_ok}/${slow_all})" "ok $slow_all" "$slow_enough $slow_ok"
result "p99(긴 요청 제외) ≤ 평시 + 1000ms(평시 ${base_p99}ms)" ok "$(awk -v d="$deploy_p99" -v b="$base_p99" 'BEGIN { print (d <= b + 1000) ? "ok" : d "ms" }')"
pair_counts="$(pairs "$work/load.txt")"
result "web→api는 같은 색 안에서만($pair_counts)" 'diff 0 unknown 0' "${pair_counts#same * }"
result '두 색 web의 API 주소는 각자 색 별칭' 'blue:http://api-blue:3000 green:http://api-green:3000' "$(for c in blue green; do
	printf '%s:%s ' "$c" "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(docker ps -aq --filter "label=com.docker.compose.project=$run_id-$c" --filter label=com.docker.compose.service=web)" | sed -n 's/^API_INTERNAL_URL=//p')"
done | sed 's/ $//')"
result '끝난 뒤 활성 색 green만 실행, 옛 색 blue는 stopped(컨테이너 유지)' 'green | api:running web:running | api:exited web:exited' \
	"$(color_of) | $(project_states green) | $(project_states blue)"
result '전환마다 옛 색 api·web은 SIGTERM에 스스로 끝남(종료 코드 0, SIGKILL 없음)' \
	'api=0 web=0 api=0 web=0 api=0 web=0 api=0 web=0 api=0 web=0 ' "$stop_codes"
result 'edge는 한 번도 다시 만들어지지 않음(컨테이너 1개, 재시작 0)' '1 0' \
	"$(docker ps -aq --filter "label=com.docker.compose.project=$run_id-edge" | wc -l | tr -d ' ') $(docker inspect -f '{{.RestartCount}}' "$edge_host")"
result 'geoip --restart 뒤 새 색 api가 새 GeoIP 파일을 읽음' fake-mmdb \
	"$(docker exec "$(docker ps -q --filter "label=com.docker.compose.project=$run_id-green" --filter label=com.docker.compose.service=api)" cat /data/geoip/dbip-city-lite.mmdb 2>&1)"
log_file="$CRELINK_ROOT/state/releases.log"
tab="$(printf '\t')"
sha_re='[0-9a-f]{7,40}'
result 'releases.log 모든 줄 형식' '' "$(grep -v -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z${tab}(deploy|rollback|restore)${tab}(-|$sha_re)${tab}$sha_re${tab}$CRELINK_IMAGE_PREFIX-api:$sha_re${tab}$CRELINK_IMAGE_PREFIX-web:$sha_re\$" "$log_file" || true)"
result 'releases.log 순서(geoip 재기동은 기록 없음)' 'deploy - c1;deploy c1 c2;deploy c2 c3;rollback c3 c2;rollback c2 c1' \
	"$(cut -f 2-4 "$log_file" | names | tr '\t' ' ' | tr '\n' ';' | sed 's/;$//')"
result '평문 비밀값이 서버 폴더에 남지 않음' '' "$(grep -rl -F "$marker" "$CRELINK_ROOT" "$CRELINK_ETC" "$CRELINK_RUN_DIR" 2>/dev/null | names || true)"

echo
echo "수치: 요청 ${n_total}건/${secs}초(${rate}건/s), 2xx·3xx 아님·연결 오류 ${bad}건, p99 ${deploy_p99}ms(평시 ${base_p99}ms), 긴 요청 ${slow_ok}/${slow_all}, web→api ${pair_counts}, 옛 색 종료 코드 ${stop_codes}, 단계 소요: ${steps}"
harness_finish "무중단 배포"
