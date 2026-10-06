#!/usr/bin/env bash
# 운영 배포·롤백(ssh-entry.sh → deploy.sh·rollback.sh) 로컬 시뮬레이션. Docker·sops·age(+ curl·openssl)만 필요(sshd 불필요). 저장소 루트에서:
#   infra/prod/tests/deploy-rollback.sh
# - 임시 폴더를 서버의 /opt/crelink·/etc/crelink·/run/crelink(CRELINK_ROOT·CRELINK_ETC·CRELINK_RUN_DIR)로 씁니다.
#   임시 age 키쌍을 만들어 시험용 secrets/<대상>.sops.env를 그 키로 암호화합니다(저장소 .sops.yaml·실제 키는 쓰지 않음).
# - GHCR 대신 htpasswd 인증 로컬 레지스트리(registry:3, 127.0.0.1 빈 포트)에 더미 api·web 이미지(HEALTHCHECK 통과·실패 변형)를
#   CRELINK_IMAGE_PREFIX-api|web:<SHA>로 올립니다. 서버 쪽 docker login·logout은 임시 DOCKER_CONFIG에서만 일어납니다.
# - 워크플로(deploy.yml)와 같은 제외 규칙으로 저장소 infra/prod를 tar.gz로 묶고, 그 안의 secrets만 시험용으로 바꿔
#   ssh-entry.sh를 SSH_ORIGINAL_COMMAND + stdin(첫 줄 "<사용자> <토큰>" + 묶음)으로 직접 실행합니다.
# - 운영과 다른 값: COMPOSE_PROJECT_NAME(격리), CRELINK_HTTP_PORT(빈 포트), CRELINK_SHORT_HOST=go.localhost·CRELINK_WEB_HOST=links.localhost,
#   CRELINK_KEEP_RELEASES·CRELINK_WAIT_SECONDS. macOS에서는 GNU mv -T 대신 같은 뜻의 BSD mv -h를 쓰는 mv 심을 PATH 앞에 둡니다.
# - 끝나면(실패해도) 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. registry:3·caddy·node:22-alpine(htpasswd가 없으면 httpd:2-alpine) 이미지는 남깁니다.
# 종료 코드: 0 모든 확인이 기대와 일치, 1 불일치 있음.
set -euo pipefail

prod="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
entry_sh="$prod/ssh-entry.sh"
run_id="crelink-deploytest-$$"
work="$(cd "$(mktemp -d)" && pwd -P)"
registry_name="$run_id-registry"
target=deploytest
pull_user=tester
pull_token="test-pull-token-$(openssl rand -hex 16)"
marker="crelink-test-secret-$(openssl rand -hex 16)"

sha() { # sha <2자>: 20번 반복한 40자 SHA
	local s="" _
	for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do s+="$1"; done
	printf '%s' "$s"
}
c1="$(sha c1)" c2="$(sha c2)" c3="$(sha c3)" c4="$(sha c4)" c5="$(sha c5)" c6="$(sha c6)" c7="$(sha c7)"
missing="$(sha dd)"

# 사용자 docker 설정과 분리합니다. 데몬 주소·CLI 플러그인은 현재 컨텍스트에서 가져옵니다.
# config.json에 auths 항목이 하나도 없으면 docker CLI가 OS 기본 자격 증명 저장소(macOS 키체인)를 쓰므로, 자리표시 항목을 두어 파일에만 기록되게 합니다.
DOCKER_HOST="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
export DOCKER_HOST
docker_config() { # docker_config <폴더>
	mkdir -p "$1"
	echo '{"auths":{"crelink-test.invalid":{}}}' >"$1/config.json"
	if [[ -d "$HOME/.docker/cli-plugins" ]]; then ln -s "$HOME/.docker/cli-plugins" "$1/cli-plugins"; fi
}
export DOCKER_CONFIG="$work/docker-config" # 서버 역할(deploy.sh가 로그인·로그아웃)
docker_config "$DOCKER_CONFIG"
push_config="$work/push-config" # 시험 준비용(이미지 push)
docker_config "$push_config"

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
reg_port="$(free_port)"
registry="127.0.0.1:$reg_port"

export CRELINK_ROOT="$work/opt/crelink" CRELINK_ETC="$work/etc/crelink" CRELINK_RUN_DIR="$work/run/crelink"
export CRELINK_IMAGE_PREFIX="$registry/crelink" CRELINK_KEEP_RELEASES=20 CRELINK_WAIT_SECONDS=60
export COMPOSE_PROJECT_NAME="$run_id" CRELINK_SHORT_HOST=go.localhost CRELINK_WEB_HOST=links.localhost
CRELINK_HTTP_PORT="$(free_port)"
export CRELINK_HTTP_PORT
export COPYFILE_DISABLE=1 # macOS tar가 ._* 파일을 넣지 않게
unset SOPS_AGE_KEY SOPS_AGE_KEY_FILE SOPS_AGE_KEY_CMD GHCR_PULL_USER GHCR_PULL_TOKEN API_IMAGE WEB_IMAGE

cleanup() {
	local label="label=com.docker.compose.project=$COMPOSE_PROJECT_NAME"
	docker ps -aq --filter "$label" | xargs docker rm -f >/dev/null 2>&1 || true
	docker network ls -q --filter "$label" | xargs docker network rm >/dev/null 2>&1 || true
	docker volume ls -q --filter "$label" | xargs docker volume rm >/dev/null 2>&1 || true
	docker rm -f -v "$registry_name" >/dev/null 2>&1 || true
	docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$CRELINK_IMAGE_PREFIX-" | xargs docker rmi >/dev/null 2>&1 || true
	rm -rf "$work"
}
trap cleanup EXIT

if [[ "$(uname -s)" == Darwin ]]; then
	mkdir -p "$work/bin"
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
	export PATH="$work/bin:$PATH"
fi

failures=0
passes=0
LAST_OUT="$work/out.log"
result() { # result <설명> <기대> <실제>
	if [[ "$2" == "$3" ]]; then
		passes=$((passes + 1))
		printf 'ok   - %s\n' "$1"
	else
		failures=$((failures + 1))
		printf 'FAIL - %s\n       기대 [%s]\n       실제 [%s]\n' "$1" "$2" "$3"
		if [[ -s "$LAST_OUT" ]]; then sed 's/^/       | /' "$LAST_OUT"; fi
	fi
}

echo "== 준비: 레지스트리·더미 이미지"
mkdir -p "$work/auth"
if command -v htpasswd >/dev/null 2>&1; then
	htpasswd -Bbn "$pull_user" "$pull_token" >"$work/auth/htpasswd"
else
	docker run --rm --entrypoint htpasswd httpd:2-alpine -Bbn "$pull_user" "$pull_token" >"$work/auth/htpasswd"
fi
docker run -d --name "$registry_name" -p "$registry:5000" -v "$work/auth:/auth:ro" \
	-e REGISTRY_AUTH=htpasswd -e REGISTRY_AUTH_HTPASSWD_REALM=crelink-test -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
	registry:3 >/dev/null
for _ in $(seq 30); do
	[[ "$(curl -s -o /dev/null -w '%{http_code}' "http://$registry/v2/" || true)" == 401 ]] && break
	sleep 1
done

mkdir -p "$work/dummy"
cat >"$work/dummy/server.js" <<'EOF'
// 더미 api·web. /healthz는 HEALTHY=1이면 200, 아니면 503(HEALTHCHECK 실패 변형).
// 응답 헤더 x-dummy = "<역할> <버전> <app.env의 APP_LABEL>"(어느 이미지·어느 릴리스 비밀값으로 떠 있는지 확인용).
// api는 단축(/{slug})·클릭(/c/{id}) GET에 302, 그 밖은 200 "<역할> <버전>".
const { ROLE, VERSION, HEALTHY } = process.env;
require('http').createServer((q, s) => {
  if (q.url === '/healthz') { s.statusCode = HEALTHY === '1' ? 200 : 503; return s.end(); }
  s.setHeader('x-dummy', `${ROLE} ${VERSION} ${process.env.APP_LABEL || '-'}`);
  if (ROLE === 'api' && q.method === 'GET' && /^\/(c\/)?[A-Za-z0-9-]+$/.test(q.url.split('?')[0])) {
    s.statusCode = 302;
    s.setHeader('location', 'https://example.com/');
    return s.end();
  }
  s.end(`${ROLE} ${VERSION}\n`);
}).listen(Number(process.env.PORT || 3000));
EOF
cat >"$work/dummy/Dockerfile" <<'EOF'
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
printf '%s' "$pull_token" | DOCKER_CONFIG="$push_config" docker login "$registry" --username "$pull_user" --password-stdin >/dev/null 2>&1
# 역할:SHA 이름:헬스(1 통과, 0 실패)
for spec in "api:$c1:c1:1" "web:$c1:c1:1" "web:$c2:c2:1" "api:$c3:c3:0" "api:$c4:c4:1" "web:$c4:c4:1"; do
	IFS=: read -r role tag name healthy <<<"$spec"
	image="$CRELINK_IMAGE_PREFIX-$role:$tag"
	docker build -q --build-arg "ROLE=$role" --build-arg "VERSION=$name" --build-arg "HEALTHY=$healthy" -t "$image" "$work/dummy" >/dev/null
	DOCKER_CONFIG="$push_config" docker push -q "$image" >/dev/null
	docker rmi "$image" >/dev/null # 서버(이 데몬)에는 없게 해서 배포가 레지스트리에서 받게 합니다.
done
DOCKER_CONFIG="$push_config" docker logout "$registry" >/dev/null 2>&1
echo "레지스트리 $registry(인증 필요): api c1·c3(헬스 실패)·c4, web c1·c2·c4"

echo "== 준비: 임시 서버·age 키·릴리스 묶음"
mkdir -p "$CRELINK_ROOT/releases" "$CRELINK_ETC" "$work/bundles"
echo "$target" >"$CRELINK_ETC/target"
age-keygen -o "$CRELINK_ETC/age.key" 2>/dev/null
server_pub="$(age-keygen -y "$CRELINK_ETC/age.key")"
age-keygen -o "$work/other.key" 2>/dev/null
other_pub="$(age-keygen -y "$work/other.key")"
# bundle <이름> <APP_LABEL> <age 수신자>: 워크플로와 같은 tar(제외 규칙 동일)를 풀어 시험용 secrets/<대상>.sops.env를 넣고 다시 묶습니다.
bundle() {
	local stage="$work/stage/$1"
	mkdir -p "$stage"
	tar -czf - -C "$prod" --exclude ./tests --exclude ./README.md --exclude '*.example' --exclude ./.env . | tar -xzf - -C "$stage"
	(umask 077 && printf 'PORT=3000\nAPP_LABEL=%s\nAPP_SECRET=%s\n' "$2" "$marker" >"$work/plain.env")
	(cd "$work" && sops encrypt --age "$3" --input-type dotenv --output-type dotenv plain.env) >"$stage/secrets/$target.sops.env"
	rm -f "$work/plain.env"
	tar -czf "$work/bundles/$1.tgz" -C "$stage" .
}
bundle c1 r1 "$server_pub"
bundle c2 r2 "$server_pub"
bundle c3 r3 "$server_pub"
bundle c4 r4 "$server_pub"
bundle c5 r5 "$server_pub"
bundle c6 r6 "$other_pub" # 이 서버 키로 복호화할 수 없는 묶음
bundle c7 r7 "$server_pub"
listing="$(tar -tzf "$work/bundles/c1.tgz" | sed 's|^\./||' | grep -v '^$' | sort | tr '\n' ' ')"
for want in deploy.sh rollback.sh lib.sh ssh-entry.sh compose.yaml Caddyfile certs/supabase-ca.crt "secrets/$target.sops.env"; do
	result "묶음에 $want 포함" 있음 "$([[ " $listing " == *" $want "* ]] && echo 있음 || echo 없음)"
done
result '묶음에 tests/·README.md·.env·*.example 없음' '' "$(tr ' ' '\n' <<<"$listing" | grep -E '^(tests(/|$)|README\.md$|\.env$)|\.example$' | tr '\n' ' ' || true)"
result '시험 secrets에 평문 비밀값 없음' 없음 "$(grep -q "$marker" "$work/stage/c1/secrets/$target.sops.env" && echo 있음 || echo 없음)"

# ---- 실행·상태 도우미 ----
names() { # SHA·이미지 이름을 c1·api:c1처럼 줄입니다.
	sed -e "s|$CRELINK_IMAGE_PREFIX-||g" -e "s|$c1|c1|g" -e "s|$c2|c2|g" -e "s|$c3|c3|g" -e "s|$c4|c4|g" \
		-e "s|$c5|c5|g" -e "s|$c6|c6|g" -e "s|$c7|c7|g" -e "s|$missing|dd|g"
}
current() { if [[ -L "$CRELINK_ROOT/current" ]]; then basename "$(readlink "$CRELINK_ROOT/current")"; else echo -; fi; }
image_of() { sed -n "s/^$1=//p" "$CRELINK_ROOT/state/images.env" 2>/dev/null | tail -n 1; }
deployed() { printf '%s %s %s' "$(current)" "$(image_of API_IMAGE)" "$(image_of WEB_IMAGE)" | names; }
log_lines() { if [[ -f "$CRELINK_ROOT/state/releases.log" ]]; then wc -l <"$CRELINK_ROOT/state/releases.log" | tr -d ' '; else echo 0; fi; }
containers() { docker ps -q --no-trunc --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" | sort | tr '\n' ' '; }
snapshot() { printf '%s | log %s | containers %s' "$(deployed)" "$(log_lines)" "$(containers)"; }
probe() { # "<api 상태> <api x-dummy> / <web 본문>"(Caddy 경유)
	local base="http://127.0.0.1:$CRELINK_HTTP_PORT" a w
	a="$(curl -s --max-time 5 -o /dev/null -w '%{http_code} %header{x-dummy}' -H "Host: $CRELINK_SHORT_HOST" "$base/abcd" || true)"
	w="$(curl -s --max-time 5 -H "Host: $CRELINK_WEB_HOST" "$base/" || true)"
	printf '%s / %s' "$a" "$w"
}
releases() { find "$CRELINK_ROOT/releases" -mindepth 1 -maxdepth 1 -print | sed 's|.*/||' | names | sort | tr '\n' ' ' | sed 's/ $//'; }
has() { grep -q -F -- "$1" "$LAST_OUT" && echo 있음 || echo 없음; }

# 매 실행 뒤 불변 조건(⑨·⑪): 평문 app.env·임시 파일 없음, 출력에 비밀값·토큰 없음, 서버 DOCKER_CONFIG에 레지스트리 자격 증명 없음.
violations=""
runs=0
check_invariants() {
	local v=""
	[[ -z "$(find "$CRELINK_RUN_DIR" -mindepth 1 2>/dev/null)" ]] || v+=" 실행 폴더에 파일 남음($(find "$CRELINK_RUN_DIR" -mindepth 1 | tr '\n' ' '))"
	! grep -q -F -e "$marker" "$LAST_OUT" || v+=" 출력에 평문 비밀값"
	! grep -q -F -e "$pull_token" "$LAST_OUT" || v+=" 출력에 토큰"
	! grep -q -F "$registry" "$DOCKER_CONFIG/config.json" || v+=" DOCKER_CONFIG에 자격 증명 남음"
	! ls "$CRELINK_ROOT/state"/images.next.* >/dev/null 2>&1 || v+=" state/images.next.* 남음"
	! ls -d "$CRELINK_ROOT/releases"/.incoming.* >/dev/null 2>&1 || v+=" releases/.incoming.* 남음"
	if [[ -n "$v" ]]; then
		violations+=" [$1:$v]"
		printf 'FAIL - 불변 조건(%s):%s\n' "$1" "$v"
		failures=$((failures + 1))
	fi
}
# entry <stdin: token|notoken|none> <SSH_ORIGINAL_COMMAND> [묶음 이름]: forced command를 sshd 없이 실행합니다.
entry() {
	local mode="$1" cmd="$2" name="${3:-}" code=0
	{
		case "$mode" in
		token) printf '%s %s\n' "$pull_user" "$pull_token" ;;
		notoken) printf '\n' ;;
		esac
		if [[ -n "$name" ]]; then cat "$work/bundles/$name.tgz"; fi
	} >"$work/stdin"
	SSH_ORIGINAL_COMMAND="$cmd" "$entry_sh" <"$work/stdin" >"$LAST_OUT" 2>&1 || code=$?
	CODE="$code"
	LAST_LINE="$(tail -n 1 "$LAST_OUT" | names)"
	runs=$((runs + 1))
	check_invariants "$(names <<<"$cmd")"
}
expect_live() { # expect_live <설명> <"릴리스 api:x web:y"> <probe 기대>
	result "$1: current·images.env" "$2" "$(deployed)"
	result "$1: Caddy 경유 응답" "$3" "$(probe)"
}

echo "== ⑧ ssh-entry: 허용되지 않는 명령·잘못된 SHA 거부"
before="$(snapshot)"
for cmd in '' 'bash' 'sh -c id' 'status;id' 'deploy' "deploy $c1 $c1" "deploy $c1 $c1 $c1 extra" "deploy xyz $c1 $c1" \
	"deploy C1C1C1C1C1C1C1 $c1 $c1" "deploy 123456 $c1 $c1" "deploy ../../etc - -" "deploy $c1 api web" "deploy $c1 - abc" \
	"deploy $c1 $c1 $c1;id" "rollback ../x" "rollback $c1 $c2" "rollback HEAD"; do
	entry token "$cmd" c1
	result "⑧ 거부: '$(names <<<"$cmd")'" '1 ssh-entry 거부' "$CODE $(grep -q '^\[ssh-entry\] 오류' "$LAST_OUT" && echo 'ssh-entry 거부' || echo '거부 안 됨')"
done
result '⑧ 거부 뒤 releases/ 비어 있음' '' "$(releases)"
result '⑧ 거부 뒤 상태 그대로' "$before" "$(snapshot)"
entry none status
result '⑧ status(첫 배포 전)' '0 release -' "$CODE $(head -n 1 "$LAST_OUT")"

echo "== ① 첫 배포: api·web SHA 필수"
entry token "deploy $c1 - -" c1
result "① 'deploy c1 - -' 거부" '1 있음' "$CODE $(has '이미지가 운영 중이 아니라 SHA가 필요합니다')"
entry token "deploy $c1 $c1 -" c1
result "① 'deploy c1 c1 -' 거부" '1 있음' "$CODE $(has 'web 이미지가 운영 중이 아니라')"
result '① 거부 뒤 운영 상태 없음(current·images.env·releases.log·컨테이너)' "$before" "$(snapshot)"
entry token "deploy $c1 $c1 $c1" c1
result "① 'deploy c1 c1 c1' 종료·마지막 줄" '0 c1 api:c1 web:c1' "$CODE $LAST_LINE"
result '⑨ 토큰 있음 → 로그인·pull' '있음 있음' "$(has "$registry 로그인") $(has '이미지 받기')"
expect_live '①' 'c1 api:c1 web:c1' '302 api c1 r1 / web c1'
result '① 성공 기록 releases/c1/.images.env' "API_IMAGE=api:c1 WEB_IMAGE=web:c1" "$(names <"$CRELINK_ROOT/releases/$c1/.images.env" | tr '\n' ' ' | sed 's/ $//')"

echo "== ②·⑨ 두 번째 배포: web만 교체(api=-)"
before="$(snapshot)"
entry notoken "deploy $c2 - $c2" c2
result '⑨ 토큰 없음 → 로그인 안 함 → 비공개 이미지 pull 실패(종료 1)' '1 있음 있음' "$CODE $(has '토큰이 없어 로그인하지 않습니다') $(has '이미지를 받지 못했습니다')"
result '⑨ 실패 뒤 상태 그대로' "$before" "$(snapshot)"
entry token "deploy $c2 - $c2" c2
result "② 'deploy c2 - c2' 종료·마지막 줄" '0 c2 api:c1 web:c2' "$CODE $LAST_LINE"
expect_live '②' 'c2 api:c1 web:c2' '302 api c1 r2 / web c2'

echo "== ③ 헬스 실패 이미지 → 종료 1, 직전 릴리스로 restore"
entry token "deploy $c3 $c3 -" c3
result "③ 'deploy c3 c3 -'(api 헬스 실패) 종료" '1 있음 있음' "$CODE $(has '헬스 실패') $(has "복구 완료: $c2")"
expect_live '③ 복구 뒤' 'c2 api:c1 web:c2' '302 api c1 r2 / web c2'
result '③ 실패 릴리스에 성공 기록 없음' 없음 "$([[ -e "$CRELINK_ROOT/releases/$c3/.images.env" ]] && echo 있음 || echo 없음)"

echo "== 세 번째 성공 릴리스(c4)"
entry token "deploy $c4 $c4 $c4" c4
result "'deploy c4 c4 c4' 종료·마지막 줄" '0 c4 api:c4 web:c4' "$CODE $LAST_LINE"
expect_live 'c4' 'c4 api:c4 web:c4' '302 api c4 r4 / web c4'

echo "== ⑥ 레지스트리에 없는 이미지 SHA → 아무것도 바뀌지 않음"
before="$(snapshot)"
entry token "deploy $c5 $missing -" c5
result "⑥ 'deploy c5 dd -' 종료" '1 있음' "$CODE $(has '이미지를 받지 못했습니다')"
result '⑥ 상태·컨테이너·releases.log 그대로' "$before" "$(snapshot)"
result '⑥ 운영 응답 그대로' '302 api c4 r4 / web c4' "$(probe)"

echo "== ⑦ 복호화 불가(다른 age 키) → 아무것도 바뀌지 않음"
entry token "deploy $c6 - -" c6
result "⑦ 'deploy c6 - -' 종료" '1 있음' "$CODE $(has '복호화 실패')"
result '⑦ 상태·컨테이너·releases.log 그대로' "$before" "$(snapshot)"
result '⑦ 운영 응답 그대로' '302 api c4 r4 / web c4' "$(probe)"

echo "== ④ rollback(인자 없음): 직전 릴리스, 연달아 실행하면 한 단계씩"
entry token rollback
result '④ rollback #1 종료·마지막 줄' '0 c2 api:c1 web:c2' "$CODE $LAST_LINE"
result '④ 서버에 이미지가 있으면 로그인 안 함' 없음 "$(has "$registry 로그인")"
expect_live '④ #1' 'c2 api:c1 web:c2' '302 api c1 r2 / web c2'
entry token rollback
result '④ rollback #2 종료·마지막 줄' '0 c1 api:c1 web:c1' "$CODE $LAST_LINE"
expect_live '④ #2' 'c1 api:c1 web:c1' '302 api c1 r1 / web c1'
before="$(snapshot)"
entry token rollback
result '④ rollback #3(더 이전 없음) 거부' '1 있음' "$CODE $(has '이전 릴리스를 찾지 못했습니다')"
result '④ #3 뒤 상태 그대로' "$before" "$(snapshot)"

echo "== ⑤ rollback <SHA>"
entry token "rollback $c3"
result "⑤ 'rollback c3'(성공 기록 없음) 거부" '1 있음' "$CODE $(has '성공 기록(.images.env)이 없습니다')"
result '⑤ 거부 뒤 상태 그대로' "$before" "$(snapshot)"
docker rmi "$CRELINK_IMAGE_PREFIX-api:$c4" "$CRELINK_IMAGE_PREFIX-web:$c4" >/dev/null
entry notoken "rollback $c4"
result "⑤·⑨ 'rollback c4'(이미지 없음, 토큰 없음) 실패" '1 있음 있음' "$CODE $(has '토큰이 없어 로그인하지 않습니다') $(has '이미지를 받지 못했습니다')"
result '⑤ 실패 뒤 상태 그대로' "$before" "$(snapshot)"
entry token "rollback $c4"
result "⑤ 'rollback c4'(이미지 없음 → 로그인·pull) 종료·마지막 줄" '0 c4 api:c4 web:c4 있음' "$CODE $LAST_LINE $(has "$registry 로그인")"
expect_live '⑤' 'c4 api:c4 web:c4' '302 api c4 r4 / web c4'
entry none status
result 'status' "0 release c4 API_IMAGE=api:c4" "$CODE $(head -n 2 "$LAST_OUT" | names | tr '\n' ' ' | sed 's/ $//')"

echo "== ⑩ prune(CRELINK_KEEP_RELEASES=3)"
result '⑩ 정리 전 releases/' 'c1 c2 c3 c4 c5 c6' "$(releases)"
export CRELINK_KEEP_RELEASES=3
entry token "deploy $c7 - -" c7
export CRELINK_KEEP_RELEASES=20
result "⑩ 'deploy c7 - -'(이미지 유지, 설정·비밀값만) 종료·마지막 줄" '0 c7 api:c4 web:c4' "$CODE $LAST_LINE"
expect_live '⑩' 'c7 api:c4 web:c4' '302 api c4 r7 / web c4'
# 운영 중(c7) + 최근에 바뀐 2개(c4: 직전 운영, c1: 그 전 롤백)만 남습니다.
result '⑩ 정리 뒤 releases/' 'c1 c4 c7' "$(releases)"
entry token rollback
result '⑩ 정리 뒤 rollback → c4' '0 c4 api:c4 web:c4' "$CODE $LAST_LINE"
expect_live '⑩ 롤백' 'c4 api:c4 web:c4' '302 api c4 r4 / web c4'

echo "== ⑪ 평문 비밀값"
result "⑪ 매 실행 뒤 불변 조건(${runs}회: 실행 폴더 비움·출력에 비밀값/토큰 없음·DOCKER_CONFIG 자격 증명 없음)" '' "$violations"
result '⑪ 서버 폴더(CRELINK_ROOT·ETC·RUN_DIR)에 평문 비밀값 없음' '' "$(grep -rl -F "$marker" "$CRELINK_ROOT" "$CRELINK_ETC" "$CRELINK_RUN_DIR" 2>/dev/null | names || true)"
result '⑪ 비밀값은 컨테이너 환경에만 전달됨' 1 "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --filter label=com.docker.compose.service=api)" | grep -c -F "APP_SECRET=$marker" || true)"

echo "== ⑫ releases.log"
log_file="$CRELINK_ROOT/state/releases.log"
tab="$(printf '\t')"
sha_re='[0-9a-f]{7,40}'
bad_lines="$(grep -v -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z${tab}(deploy|rollback|restore)${tab}(-|$sha_re)${tab}$sha_re${tab}$CRELINK_IMAGE_PREFIX-api:$sha_re${tab}$CRELINK_IMAGE_PREFIX-web:$sha_re\$" "$log_file" || true)"
result '⑫ 모든 줄이 "UTC 시각<TAB>동작<TAB>이전<TAB>새<TAB>API 이미지<TAB>웹 이미지"' '' "$bad_lines"
expected_log='deploy - c1 api:c1 web:c1
deploy c1 c2 api:c1 web:c2
deploy c2 c3 api:c3 web:c2
restore c3 c2 api:c1 web:c2
deploy c2 c4 api:c4 web:c4
rollback c4 c2 api:c1 web:c2
rollback c2 c1 api:c1 web:c1
rollback c1 c4 api:c4 web:c4
deploy c4 c7 api:c4 web:c4
rollback c7 c4 api:c4 web:c4'
join_lines() { tr '\n' ';' | sed 's/;$//'; }
result '⑫ 기록 순서(실패한 ⑥·⑦·토큰 없음은 기록 없음)' "$(join_lines <<<"$expected_log")" "$(cut -f 2- "$log_file" | names | tr '\t' ' ' | join_lines)"
echo "releases.log:"
names <"$log_file" | sed 's/^/   /'

echo
echo "통과 $passes, 실패 $failures (ssh-entry 실행 ${runs}회)"
if ((failures > 0)); then
	exit 1
fi
echo "모든 확인이 기대와 일치했습니다."
