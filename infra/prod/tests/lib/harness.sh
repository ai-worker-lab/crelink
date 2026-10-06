# shellcheck shell=bash disable=SC2034 # 변수는 이 파일을 source하는 시험 스크립트가 씁니다.
# infra/prod/tests/*.sh가 source하는 공용 시험 도구. 단독 실행하지 않습니다.
# - 임시 폴더(work)를 서버의 /opt/crelink·/etc/crelink·/run/crelink(CRELINK_ROOT·CRELINK_ETC·CRELINK_RUN_DIR)로 쓰고 임시 age 키쌍을 만듭니다.
# - Compose project·네트워크·볼륨 이름은 run_id로 격리합니다(CRELINK_PROJECT_PREFIX·CRELINK_EDGE_NETWORK·CRELINK_GEOIP_VOLUME·CRELINK_LEGACY_PROJECT).
#   운영과 다른 값은 이것과 CRELINK_HTTP_PORT(빈 포트), CRELINK_SHORT_HOST=go.localhost·CRELINK_WEB_HOST=links.localhost뿐입니다.
# - macOS에서는 GNU mv -T 대신 같은 뜻의 BSD mv -h를 쓰는 mv 심을 PATH 앞에 둡니다.
# - 끝나면(실패해도) 이 run_id의 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. 시험 스크립트가 test_cleanup 함수를 두면 먼저 부릅니다.
# 더미 api·web 이미지(dummy_build): node:22-alpine HTTP 서버, SIGTERM에 server.close()(진행 중 요청을 마치고 종료, 0032·0033의 실제 앱과 같은 동작).
#   /healthz        HEALTHY=1이면 200, 아니면 503(이미지 HEALTHCHECK 1초 간격)
#   모든 응답 헤더  x-dummy: "<역할> <버전> <app.env의 APP_LABEL>", x-host: 컨테이너 호스트 이름(= 컨테이너 ID 앞 12자, 색 판별용)
#   ?ms=<밀리초>    그만큼 늦게 응답(긴 요청)
#   api             /api/health/ready 200, 단축(/{slug})·클릭(/c/{id}) GET 302, 그 밖 200 "<역할> <버전>"
#   web             /api/backend/<경로>는 API_INTERNAL_URL/<경로>로 넘기고 api의 x-dummy·x-host를 x-api·x-api-host로 돌려줌
#                   (web→api가 같은 색 안에서만 일어나는지 확인), 그 밖 200 "<역할> <버전>"

harness_prod="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
harness_repo="$(cd "$harness_prod/../.." && pwd)"

harness_init() { # harness_init <run_id>
	run_id="$1"
	work="$(cd "$(mktemp -d)" && pwd -P)"
	target=deploytest
	# 사용자 docker 설정과 분리합니다. 데몬 주소·CLI 플러그인은 현재 컨텍스트에서 가져옵니다.
	# config.json에 auths 항목이 하나도 없으면 docker CLI가 OS 기본 자격 증명 저장소(macOS 키체인)를 쓰므로, 자리표시 항목을 두어 파일에만 기록되게 합니다.
	DOCKER_HOST="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
	export DOCKER_HOST
	export DOCKER_CONFIG="$work/docker-config" # 서버 역할(deploy.sh가 로그인·로그아웃)
	docker_config "$DOCKER_CONFIG"

	export CRELINK_ROOT="$work/opt/crelink" CRELINK_ETC="$work/etc/crelink" CRELINK_RUN_DIR="$work/run/crelink"
	export CRELINK_IMAGE_PREFIX="${CRELINK_IMAGE_PREFIX:-$run_id.invalid/crelink}" CRELINK_KEEP_RELEASES=20 CRELINK_WAIT_SECONDS=60
	export CRELINK_PROJECT_PREFIX="$run_id" CRELINK_EDGE_NETWORK="$run_id-edge" CRELINK_LEGACY_PROJECT="$run_id-prod"
	# blue/green 이전 compose가 만드는 <project>_geoip와 같은 이름(운영 crelink-prod_geoip와 같은 규칙)
	export CRELINK_GEOIP_VOLUME="$run_id-prod_geoip"
	export CRELINK_SHORT_HOST=go.localhost CRELINK_WEB_HOST=links.localhost
	CRELINK_HTTP_PORT="$(free_port)"
	export CRELINK_HTTP_PORT
	export COPYFILE_DISABLE=1 # macOS tar가 ._* 파일을 넣지 않게
	unset SOPS_AGE_KEY SOPS_AGE_KEY_FILE SOPS_AGE_KEY_CMD GHCR_PULL_USER GHCR_PULL_TOKEN API_IMAGE WEB_IMAGE COMPOSE_PROJECT_NAME CRELINK_COLOR

	mkdir -p "$work/bin"
	if [[ "$(uname -s)" == Darwin ]]; then
		cat >"$work/bin/mv" <<'EOF'
#!/bin/sh
# 시험 전용 심: lib.sh의 GNU "mv -T"(대상 심볼릭 링크를 따라가지 않음)를 BSD의 같은 옵션 -h로 바꿉니다.
if [ "$1" = -T ]; then
	shift
	exec /bin/mv -h "$@"
fi
exec /bin/mv "$@"
EOF
		chmod 755 "$work/bin/mv"
	fi
	export PATH="$work/bin:$PATH"

	mkdir -p "$CRELINK_ROOT/releases" "$CRELINK_ETC" "$work/bundles"
	echo "$target" >"$CRELINK_ETC/target"
	age-keygen -o "$CRELINK_ETC/age.key" 2>/dev/null
	server_pub="$(age-keygen -y "$CRELINK_ETC/age.key")"
	marker="crelink-test-secret-$(openssl rand -hex 16)"

	failures=0
	passes=0
	LAST_OUT="$work/out.log"
	trap harness_cleanup EXIT
}

docker_config() { # docker_config <폴더>
	mkdir -p "$1"
	echo '{"auths":{"crelink-test.invalid":{}}}' >"$1/config.json"
	if [[ -d "$HOME/.docker/cli-plugins" ]]; then ln -s "$HOME/.docker/cli-plugins" "$1/cli-plugins"; fi
}

harness_cleanup() {
	local p label
	if declare -F test_cleanup >/dev/null; then test_cleanup || true; fi
	docker ps -aq --filter "label=crelink-test=$run_id" | xargs docker rm -f >/dev/null 2>&1 || true
	for p in blue green edge prod; do
		label="label=com.docker.compose.project=$run_id-$p"
		docker ps -aq --filter "$label" | xargs docker rm -f >/dev/null 2>&1 || true
		docker network ls -q --filter "$label" | xargs docker network rm >/dev/null 2>&1 || true
		docker volume ls -q --filter "$label" | xargs docker volume rm >/dev/null 2>&1 || true
	done
	docker network rm "$CRELINK_EDGE_NETWORK" >/dev/null 2>&1 || true
	docker volume rm "$CRELINK_GEOIP_VOLUME" >/dev/null 2>&1 || true
	docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$CRELINK_IMAGE_PREFIX-" | xargs docker rmi >/dev/null 2>&1 || true
	rm -rf "$work"
}

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

sha() { # sha <2자>: 20번 반복한 40자 SHA
	local s="" _
	for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do s+="$1"; done
	printf '%s' "$s"
}

result() { # result <설명> <기대> <실제>
	if [[ "$2" == "$3" ]]; then
		passes=$((passes + 1))
		printf 'ok   - %s\n' "$1"
	else
		failures=$((failures + 1))
		printf 'FAIL - %s\n       기대 [%s]\n       실제 [%s]\n' "$1" "$2" "$3"
		if [[ -s "$LAST_OUT" ]]; then tail -n 40 "$LAST_OUT" | sed 's/^/       | /'; fi
	fi
}
has() { grep -q -F -- "$1" "$LAST_OUT" && echo 있음 || echo 없음; }
harness_finish() {
	echo
	echo "통과 $passes, 실패 $failures${1:+ ($1)}"
	if ((failures > 0)); then
		exit 1
	fi
	echo "모든 확인이 기대와 일치했습니다."
}

# ---- 더미 이미지 ----
dummy_build() { # dummy_build <api|web> <태그> <버전 이름> <헬스 1|0>
	local dir="$work/dummy"
	if [[ ! -f "$dir/Dockerfile" ]]; then
		mkdir -p "$dir"
		cat >"$dir/server.js" <<'EOF'
const http = require('http');
const { ROLE, VERSION, HEALTHY, API_INTERNAL_URL } = process.env;
const id = `${ROLE} ${VERSION} ${process.env.APP_LABEL || '-'}`;
const agent = new http.Agent({ keepAlive: true });
const server = http.createServer((q, s) => {
  const url = new URL(q.url, 'http://dummy');
  if (url.pathname === '/healthz') { s.statusCode = HEALTHY === '1' ? 200 : 503; return s.end(); }
  q.resume();
  q.on('end', () => {
    const respond = () => {
      s.setHeader('x-dummy', id);
      s.setHeader('x-host', require('os').hostname());
      if (ROLE === 'web' && url.pathname.startsWith('/api/backend/')) {
        const target = new URL(url.pathname.slice('/api/backend'.length) + url.search, API_INTERNAL_URL);
        const r = http.request(target, { method: q.method, agent }, (a) => {
          a.resume();
          a.on('end', () => {
            s.statusCode = a.statusCode;
            s.setHeader('x-api', a.headers['x-dummy'] || '-');
            s.setHeader('x-api-host', a.headers['x-host'] || '-');
            s.end(`${ROLE} ${VERSION}\n`);
          });
        });
        r.on('error', (e) => { s.statusCode = 502; s.end(`web→api 실패 ${e.message}\n`); });
        return r.end();
      }
      if (ROLE === 'api' && q.method === 'GET' && /^\/(c\/)?[A-Za-z0-9-]+$/.test(url.pathname) && url.pathname !== '/privacy') {
        s.statusCode = 302;
        s.setHeader('location', 'https://example.com/');
        return s.end();
      }
      s.end(`${ROLE} ${VERSION}\n`);
    };
    // 긴 요청은 응답하는 쪽(api, 또는 web 자신)만 늦춥니다. web BFF는 api에 그대로 넘겨 api가 늦게 응답합니다.
    const ms = ROLE === 'web' && url.pathname.startsWith('/api/backend/') ? 0 : Number(url.searchParams.get('ms') || 0);
    if (ms > 0) setTimeout(respond, ms); else respond();
  });
});
server.listen(Number(process.env.PORT || 3000));
// 0032·0033과 같은 종료: 새 연결을 받지 않고 진행 중 요청을 마친 뒤 끝냅니다(Node 22는 idle keep-alive 연결도 닫음).
process.on('SIGTERM', () => server.close(() => process.exit(0)));
EOF
		cat >"$dir/Dockerfile" <<'EOF'
FROM node:22-alpine
ARG ROLE
ARG VERSION
ARG HEALTHY
ENV ROLE=$ROLE VERSION=$VERSION HEALTHY=$HEALTHY
COPY server.js /server.js
USER node
EXPOSE 3000
HEALTHCHECK --interval=1s --timeout=2s --start-period=3s --retries=2 CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "/server.js"]
EOF
	fi
	docker build -q --build-arg "ROLE=$1" --build-arg "VERSION=$3" --build-arg "HEALTHY=$4" -t "$CRELINK_IMAGE_PREFIX-$1:$2" "$dir" >/dev/null
}

# ---- 릴리스 묶음 ----
# bundle <이름> <APP_LABEL> <age 수신자> [<infra/prod 원본 폴더>]: 워크플로와 같은 tar(제외 규칙 동일)를 풀어 시험용 secrets/<대상>.sops.env를
# 넣고 다시 묶습니다($work/bundles/<이름>.tgz, 풀어 둔 것은 $work/stage/<이름>).
bundle() {
	local stage="$work/stage/$1" src="${4:-$harness_prod}"
	mkdir -p "$stage"
	tar -czf - -C "$src" --exclude ./tests --exclude ./README.md --exclude '*.example' --exclude ./.env . | tar -xzf - -C "$stage"
	(umask 077 && printf 'PORT=3000\nAPP_LABEL=%s\nAPP_SECRET=%s\n' "$2" "$marker" >"$work/plain.env")
	(cd "$work" && sops encrypt --age "$3" --input-type dotenv --output-type dotenv plain.env) >"$stage/secrets/$target.sops.env"
	rm -f "$work/plain.env"
	tar -czf "$work/bundles/$1.tgz" -C "$stage" .
}
# legacy_source <git ref>: 그 커밋의 infra/prod(blue/green 이전 형식)를 $work/legacy-src에 풀고 경로를 출력합니다.
legacy_source() {
	local out="$work/legacy-src"
	rm -rf "$out"
	mkdir -p "$out"
	git -C "$harness_repo" archive "$1" infra/prod | tar -xf - -C "$out" --strip-components 2
	printf '%s' "$out"
}
# install_release <묶음 이름> <SHA>: ssh-entry.sh처럼 묶음을 releases/<SHA>에 풉니다(blue/green 이전 릴리스를 직접 놓을 때).
install_release() {
	mkdir -p "$CRELINK_ROOT/releases/$2"
	tar -xzf "$work/bundles/$1.tgz" -C "$CRELINK_ROOT/releases/$2"
	chmod 755 "$CRELINK_ROOT/releases/$2"
}

# ---- 상태 도우미 ----
color_of() { tr -d '[:space:]' 2>/dev/null <"$CRELINK_ROOT/state/active-color" || echo -; }
current() { if [[ -L "$CRELINK_ROOT/current" ]]; then basename "$(readlink "$CRELINK_ROOT/current")"; else echo -; fi; }
image_of() { sed -n "s/^$1=//p" "$CRELINK_ROOT/state/images.env" 2>/dev/null | tail -n 1; }
log_lines() { if [[ -f "$CRELINK_ROOT/state/releases.log" ]]; then wc -l <"$CRELINK_ROOT/state/releases.log" | tr -d ' '; else echo 0; fi; }
project_ids() { # project_ids <blue|green|edge|prod> [all]: 컨테이너 ID(정렬, 공백 구분)
	docker ps -q --no-trunc ${2:+-a} --filter "label=com.docker.compose.project=$run_id-$1" | sort | tr '\n' ' ' | sed 's/ $//'
}
project_states() { # project_states <blue|green|edge|prod>: "서비스:상태" 목록(멈춘 것 포함)
	docker ps -a --filter "label=com.docker.compose.project=$run_id-$1" --format '{{.Label "com.docker.compose.service"}}:{{.State}}' | sort | tr '\n' ' ' | sed 's/ $//'
}
conf_sum() { cat "$CRELINK_ROOT/edge/conf/Caddyfile" "$CRELINK_ROOT/edge/conf/upstreams.caddy" 2>/dev/null | cksum | tr -s ' ' | cut -d ' ' -f 1; }
# 운영 상태 전체(실패한 명령이 아무것도 바꾸지 않았는지 비교용)
snapshot() {
	printf 'current %s | color %s | api %s | web %s | log %s | blue %s | green %s | edge %s | prod %s | conf %s' \
		"$(current)" "$(color_of)" "$(image_of API_IMAGE)" "$(image_of WEB_IMAGE)" "$(log_lines)" \
		"$(project_ids blue)" "$(project_ids green)" "$(project_ids edge)" "$(project_ids prod)" "$(conf_sum)"
}
# 127.0.0.1:포트로 "<api 상태> <api x-dummy> / <web 본문>"(edge 또는 옛 caddy 경유)
probe() {
	local base="http://127.0.0.1:$CRELINK_HTTP_PORT" a w
	a="$(curl -s --max-time 5 -o /dev/null -w '%{http_code} %header{x-dummy}' -H "Host: $CRELINK_SHORT_HOST" "$base/abcd" || true)"
	w="$(curl -s --max-time 5 -H "Host: $CRELINK_WEB_HOST" "$base/" || true)"
	printf '%s / %s' "$a" "$w"
}
# measure-gap.sh 출력에서 "<실패 수> <최장 공백 초>"
gap_of() { sed -n 's/^전체: 실패 \([0-9]*\), 최장 공백 \([0-9.]*\)초$/\1 \2/p' "$1" | tail -n 1; }

# ---- 실행 도우미(출력은 $LAST_OUT, 종료 코드는 CODE) ----
run() { # run <명령...>
	CODE=0
	"$@" >"$LAST_OUT" 2>&1 || CODE=$?
}
# ssh_entry <SSH_ORIGINAL_COMMAND> [묶음 이름]: forced command를 sshd 없이 실행합니다(stdin 첫 줄 빈 줄 = 토큰 없음, 이어서 묶음).
ssh_entry() {
	{
		printf '\n'
		if [[ -n "${2:-}" ]]; then cat "$work/bundles/$2.tgz"; fi
	} >"$work/stdin"
	CODE=0
	SSH_ORIGINAL_COMMAND="$1" "$harness_prod/ssh-entry.sh" <"$work/stdin" >"$LAST_OUT" 2>&1 || CODE=$?
}
# measured <결과 파일> <명령...>: measure-gap.sh(대상마다 초당 10회, 기본 대상 go /zzzz·links /privacy)로 감싸 실행합니다.
# 명령 출력은 $LAST_OUT, 측정 결과는 <결과 파일>, 명령 종료 코드는 CODE, "<실패 수> <최장 공백 초>"는 GAP.
measured() {
	local out="$1"
	shift
	# shellcheck disable=SC2016 # 안쪽 bash가 펼침
	"$harness_prod/measure-gap.sh" -r 10 -t 2 -m 10 -- bash -c '"$@" >"$0" 2>&1' "$LAST_OUT" "$@" >"$out" 2>&1 || true
	CODE="$(sed -n 's/^감싼 명령 종료 코드: //p' "$out")"
	GAP="$(gap_of "$out")"
}
