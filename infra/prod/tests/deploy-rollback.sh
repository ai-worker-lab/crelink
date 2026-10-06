#!/usr/bin/env bash
# 운영 배포·롤백(ssh-entry.sh → deploy.sh·rollback.sh, Blue/Green) 로컬 시뮬레이션. Docker·sops·age(+ curl·openssl·git)만 필요(sshd 불필요). 저장소 루트에서:
#   infra/prod/tests/deploy-rollback.sh
# - 서버 폴더·age 키·project 격리·mv 심·더미 이미지는 tests/lib/harness.sh(머리말). 시험용 secrets/<대상>.sops.env는 임시 키로 암호화합니다.
# - GHCR 대신 htpasswd 인증 로컬 레지스트리(registry:3, 127.0.0.1 빈 포트)에 더미 api·web 이미지(HEALTHCHECK 통과·실패 변형)를
#   CRELINK_IMAGE_PREFIX-api|web:<SHA>로 올립니다. 서버 쪽 docker login·logout은 임시 DOCKER_CONFIG에서만 일어납니다.
# - 워크플로(deploy.yml)와 같은 제외 규칙으로 저장소 infra/prod를 tar.gz로 묶고, 그 안의 secrets만 시험용으로 바꿔
#   ssh-entry.sh를 SSH_ORIGINAL_COMMAND + stdin(첫 줄 "<사용자> <토큰>" + 묶음)으로 직접 실행합니다.
# - 새 서버라 첫 deploy는 edge가 없어 거부되고(이미지는 받아 둠), cutover.sh로 edge + blue를 띄운 뒤 나머지를 확인합니다.
#   drain은 CRELINK_DRAIN_SECONDS=1(무중단 자체는 tests/zero-downtime.sh가 부하로 확인).
# - 끝나면(실패해도) 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. registry:3·caddy·node:22-alpine(htpasswd가 없으면 httpd:2-alpine) 이미지는 남깁니다.
# 종료 코드: 0 모든 확인이 기대와 일치, 1 불일치 있음.
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib/harness.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
run_id="crelink-deploytest-$$"
registry_name="$run_id-registry"
reg_port="$(free_port)"
registry="127.0.0.1:$reg_port"
export CRELINK_IMAGE_PREFIX="$registry/crelink"
test_cleanup() { docker rm -f -v "$registry_name" >/dev/null 2>&1 || true; }
harness_init "$run_id"
prod="$harness_prod"
entry_sh="$prod/ssh-entry.sh"
export CRELINK_DRAIN_SECONDS=1
pull_user=tester
pull_token="test-pull-token-$(openssl rand -hex 16)"
push_config="$work/push-config" # 시험 준비용(이미지 push)
docker_config "$push_config"

c1="$(sha c1)" c2="$(sha c2)" c3="$(sha c3)" c4="$(sha c4)" c5="$(sha c5)" c6="$(sha c6)" c7="$(sha c7)" cl="$(sha a0)"
missing="$(sha dd)"
legacy_ref="${CRELINK_LEGACY_REF:-433dc88}"

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
printf '%s' "$pull_token" | DOCKER_CONFIG="$push_config" docker login "$registry" --username "$pull_user" --password-stdin >/dev/null 2>&1
# 역할:SHA 이름:헬스(1 통과, 0 실패)
for spec in "api:$c1:c1:1" "web:$c1:c1:1" "web:$c2:c2:1" "api:$c3:c3:0" "api:$c4:c4:1" "web:$c4:c4:1"; do
	IFS=: read -r role tag name healthy <<<"$spec"
	image="$CRELINK_IMAGE_PREFIX-$role:$tag"
	dummy_build "$role" "$tag" "$name" "$healthy"
	DOCKER_CONFIG="$push_config" docker push -q "$image" >/dev/null
	docker rmi "$image" >/dev/null # 서버(이 데몬)에는 없게 해서 배포가 레지스트리에서 받게 합니다.
done
DOCKER_CONFIG="$push_config" docker logout "$registry" >/dev/null 2>&1
echo "레지스트리 $registry(인증 필요): api c1·c3(헬스 실패)·c4, web c1·c2·c4"

echo "== 준비: 릴리스 묶음"
age-keygen -o "$work/other.key" 2>/dev/null
other_pub="$(age-keygen -y "$work/other.key")"
bundle c1 r1 "$server_pub"
bundle c2 r2 "$server_pub"
bundle c3 r3 "$server_pub"
bundle c4 r4 "$server_pub"
bundle c5 r5 "$server_pub"
bundle c6 r6 "$other_pub" # 이 서버 키로 복호화할 수 없는 묶음
bundle c7 r7 "$server_pub"
listing="$(tar -tzf "$work/bundles/c1.tgz" | sed 's|^\./||' | grep -v '^$' | sort | tr '\n' ' ')"
for want in deploy.sh rollback.sh cutover.sh lib.sh ssh-entry.sh compose.yaml edge/compose.yaml Caddyfile certs/supabase-ca.crt "secrets/$target.sops.env"; do
	result "묶음에 $want 포함" 있음 "$([[ " $listing " == *" $want "* ]] && echo 있음 || echo 없음)"
done
result '묶음에 tests/·README.md·.env·*.example 없음' '' "$(tr ' ' '\n' <<<"$listing" | grep -E '^(tests(/|$)|README\.md$|\.env$)|\.example$' | tr '\n' ' ' || true)"
result '시험 secrets에 평문 비밀값 없음' 없음 "$(grep -q "$marker" "$work/stage/c1/secrets/$target.sops.env" && echo 있음 || echo 없음)"

# ---- 실행·상태 도우미 ----
names() { # SHA·이미지 이름을 c1·api:c1처럼 줄입니다.
	sed -e "s|$CRELINK_IMAGE_PREFIX-||g" -e "s|$c1|c1|g" -e "s|$c2|c2|g" -e "s|$c3|c3|g" -e "s|$c4|c4|g" \
		-e "s|$c5|c5|g" -e "s|$c6|c6|g" -e "s|$c7|c7|g" -e "s|$cl|cL|g" -e "s|$missing|dd|g"
}
deployed() { printf '%s %s %s %s' "$(current)" "$(color_of)" "$(image_of API_IMAGE)" "$(image_of WEB_IMAGE)" | names; }
releases() { find "$CRELINK_ROOT/releases" -mindepth 1 -maxdepth 1 -print | sed 's|.*/||' | names | sort | tr '\n' ' ' | sed 's/ $//'; }
upstream() { grep -o 'to [a-z]*-[a-z]*:3000' "$CRELINK_ROOT/edge/conf/upstreams.caddy" 2>/dev/null | tr '\n' ' ' | sed 's/ $//'; }

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
	! ls -d "$CRELINK_ROOT/edge/conf/.next" "$CRELINK_ROOT/edge/conf/.prev" >/dev/null 2>&1 || v+=" edge/conf/.next·.prev 남음"
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
expect_live() { # expect_live <설명> <"릴리스 색 api:x web:y"> <probe 기대>
	result "$1: current·활성 색·images.env" "$2" "$(deployed)"
	result "$1: edge 경유 응답" "$3" "$(probe)"
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
result '⑧ status(첫 배포 전)' '0 release - color -' "$CODE $(head -n 2 "$LAST_OUT" | tr '\n' ' ' | sed 's/ $//')"

echo "== ① 첫 배포: api·web SHA 필수, edge가 없으면 거부, cutover.sh로 edge + blue"
entry token "deploy $c1 - -" c1
result "① 'deploy c1 - -' 거부" '1 있음' "$CODE $(has '이미지가 운영 중이 아니라 SHA가 필요합니다')"
entry token "deploy $c1 $c1 -" c1
result "① 'deploy c1 c1 -' 거부" '1 있음' "$CODE $(has 'web 이미지가 운영 중이 아니라')"
entry token "deploy $c1 $c1 $c1" c1
result "① 'deploy c1 c1 c1'(edge 없음) 거부: 런북 cutover 안내, 이미지는 받아 둠" '1 있음 있음 있음' \
	"$CODE $(has 'edge가 준비되지 않았습니다') $(has '14. blue/green cutover') $(has '이미지 받기')"
result '⑨ 토큰 있음 → 로그인·pull' '있음 있음' "$(has "$registry 로그인") $(has '이미지 받기')"
result '① 거부 뒤 운영 상태 없음(current·색·images.env·releases.log·컨테이너)' "$before" "$(snapshot)"
run "$CRELINK_ROOT/releases/$c1/cutover.sh" "$c1" "$c1" "$c1"
runs=$((runs + 1))
check_invariants cutover
result '① cutover.sh c1 c1 c1(새 서버, 레지스트리 없이 받아 둔 이미지 사용)' '0 없음' "$CODE $(has "$registry 로그인")"
expect_live '①' 'c1 blue api:c1 web:c1' '302 api c1 r1 / web c1'
result '① edge 업스트림 blue' 'to api-blue:3000 to web-blue:3000' "$(upstream)"
result '① releases/c1/.images.env 성공 기록' "API_IMAGE=api:c1 WEB_IMAGE=web:c1" "$(names <"$CRELINK_ROOT/releases/$c1/.images.env" | tr '\n' ' ' | sed 's/ $//')"
# compose의 api·web healthcheck는 start_period·start_interval만 덧쓰고 test·interval·timeout·retries는 이미지 HEALTHCHECK를 물려받습니다.
for spec in api:30s web:20s; do
	svc="${spec%%:*}"
	result "① $svc 헬스체크(이미지 test·interval·timeout·retries + compose start_period·start_interval)·정지 유예" \
		"[\"CMD-SHELL\",\"wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1\"] 1s 2s 2 ${spec#*:} 1s stop 30" \
		"$(docker inspect --format '{{json .Config.Healthcheck.Test}} {{.Config.Healthcheck.Interval}} {{.Config.Healthcheck.Timeout}} {{.Config.Healthcheck.Retries}} {{.Config.Healthcheck.StartPeriod}} {{.Config.Healthcheck.StartInterval}} stop {{.Config.StopTimeout}}' \
			"$(docker ps -q --filter "label=com.docker.compose.project=$run_id-blue" --filter "label=com.docker.compose.service=$svc")" 2>&1)"
done

echo "== ②·⑨ 두 번째 배포: web만 교체(api=-) → green"
before="$(snapshot)"
entry notoken "deploy $c2 - $c2" c2
result '⑨ 토큰 없음 → 로그인 안 함 → 비공개 이미지 pull 실패(종료 1)' '1 있음 있음' "$CODE $(has '토큰이 없어 로그인하지 않습니다') $(has '이미지를 받지 못했습니다')"
result '⑨ 실패 뒤 상태 그대로' "$before" "$(snapshot)"
entry token "deploy $c2 - $c2" c2
result "② 'deploy c2 - c2' 종료·마지막 줄" '0 c2 api:c1 web:c2' "$CODE $LAST_LINE"
expect_live '②' 'c2 green api:c1 web:c2' '302 api c1 r2 / web c2'
result '② edge 업스트림 green, 옛 색 blue는 stopped(컨테이너 유지)' 'to api-green:3000 to web-green:3000 | api:exited web:exited' "$(upstream) | $(project_states blue)"

echo "== ③ 헬스 실패 이미지 → 종료 1, 활성 색·current·트래픽 그대로, 실패한 색만 내림"
before="$(snapshot)"
entry token "deploy $c3 $c3 -" c3
result "③ 'deploy c3 c3 -'(api 헬스 실패) 종료" '1 있음 있음' "$CODE $(has '헬스 실패') $(has '트래픽은 바뀌지 않았습니다')"
result '③ 실패 뒤 상태(current·활성 색·images.env·releases.log·실행 컨테이너·edge 설정) 그대로' "$before" "$(snapshot)"
expect_live '③ 실패 뒤' 'c2 green api:c1 web:c2' '302 api c1 r2 / web c2'
result '③ 실패한 색 blue는 내려감(컨테이너 없음)' '' "$(project_states blue)"
result '③ 실패 릴리스에 성공 기록 없음' 없음 "$([[ -e "$CRELINK_ROOT/releases/$c3/.images.env" ]] && echo 있음 || echo 없음)"

echo "== 세 번째 성공 릴리스(c4) → blue"
entry token "deploy $c4 $c4 $c4" c4
result "'deploy c4 c4 c4' 종료·마지막 줄" '0 c4 api:c4 web:c4' "$CODE $LAST_LINE"
expect_live 'c4' 'c4 blue api:c4 web:c4' '302 api c4 r4 / web c4'

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

echo "== ④ rollback(인자 없음): 직전 릴리스를 반대 색으로, 연달아 실행하면 한 단계씩"
entry token rollback
result '④ rollback #1 종료·마지막 줄' '0 c2 api:c1 web:c2' "$CODE $LAST_LINE"
result '④ 서버에 이미지가 있으면 로그인 안 함' 없음 "$(has "$registry 로그인")"
expect_live '④ #1' 'c2 green api:c1 web:c2' '302 api c1 r2 / web c2'
entry token rollback
result '④ rollback #2 종료·마지막 줄' '0 c1 api:c1 web:c1' "$CODE $LAST_LINE"
expect_live '④ #2' 'c1 blue api:c1 web:c1' '302 api c1 r1 / web c1'
before="$(snapshot)"
entry token rollback
result '④ rollback #3(더 이전 없음) 거부' '1 있음' "$CODE $(has '이전 릴리스를 찾지 못했습니다')"
result '④ #3 뒤 상태 그대로' "$before" "$(snapshot)"

echo "== ⑤ rollback <SHA>"
entry token "rollback $c3"
result "⑤ 'rollback c3'(성공 기록 없음) 거부" '1 있음' "$CODE $(has '성공 기록(.images.env)이 없습니다')"
result '⑤ 거부 뒤 상태 그대로' "$before" "$(snapshot)"
# blue/green 이전 형식 릴리스(지금 운영 릴리스 커밋의 infra/prod)를 성공 기록과 함께 둡니다.
bundle cL r0 "$server_pub" "$(legacy_source "$legacy_ref")"
install_release cL "$cl"
printf 'API_IMAGE=%s\nWEB_IMAGE=%s\n' "$CRELINK_IMAGE_PREFIX-api:$c1" "$CRELINK_IMAGE_PREFIX-web:$c1" >"$CRELINK_ROOT/releases/$cl/.images.env"
entry token "rollback $cl"
result "⑤ 'rollback cL'(blue/green 이전 형식 $legacy_ref) 거부, cutover 되돌리기 안내" '1 있음 있음' "$CODE $(has 'blue/green 이전 형식') $(has 'cutover.sh --revert')"
result '⑤ 이전 형식 거부 뒤 상태 그대로' "$before" "$(snapshot)"
docker rmi "$CRELINK_IMAGE_PREFIX-api:$c4" "$CRELINK_IMAGE_PREFIX-web:$c4" >/dev/null
entry notoken "rollback $c4"
result "⑤·⑨ 'rollback c4'(이미지 없음, 토큰 없음) 실패" '1 있음 있음' "$CODE $(has '토큰이 없어 로그인하지 않습니다') $(has '이미지를 받지 못했습니다')"
result '⑤ 실패 뒤 상태 그대로' "$before" "$(snapshot)"
entry token "rollback $c4"
result "⑤ 'rollback c4'(이미지 없음 → 로그인·pull) 종료·마지막 줄" '0 c4 api:c4 web:c4 있음' "$CODE $LAST_LINE $(has "$registry 로그인")"
expect_live '⑤' 'c4 green api:c4 web:c4' '302 api c4 r4 / web c4'
entry none status
result 'status(활성 색 포함)' "0 release c4 color green API_IMAGE=api:c4" "$CODE $(head -n 3 "$LAST_OUT" | names | tr '\n' ' ' | sed 's/ $//')"

echo "== ⑩ prune(CRELINK_KEEP_RELEASES=3)"
result '⑩ 정리 전 releases/' 'c1 c2 c3 c4 c5 c6 cL' "$(releases)"
export CRELINK_KEEP_RELEASES=3
entry token "deploy $c7 - -" c7
export CRELINK_KEEP_RELEASES=20
result "⑩ 'deploy c7 - -'(이미지 유지, 설정·비밀값만) 종료·마지막 줄" '0 c7 api:c4 web:c4' "$CODE $LAST_LINE"
expect_live '⑩' 'c7 blue api:c4 web:c4' '302 api c4 r7 / web c4'
# 운영 중(c7) + 최근에 바뀐 2개(c4: 직전 운영, cL: 그 전에 놓은 옛 형식)만 남습니다.
result '⑩ 정리 뒤 releases/' 'c4 c7 cL' "$(releases)"
entry token rollback
result '⑩ 정리 뒤 rollback → c4' '0 c4 api:c4 web:c4' "$CODE $LAST_LINE"
expect_live '⑩ 롤백' 'c4 green api:c4 web:c4' '302 api c4 r4 / web c4'

echo "== ⑪ 평문 비밀값"
result "⑪ 매 실행 뒤 불변 조건(${runs}회: 실행 폴더 비움·출력에 비밀값/토큰 없음·DOCKER_CONFIG 자격 증명 없음·임시 파일 없음)" '' "$violations"
result '⑪ 서버 폴더(CRELINK_ROOT·ETC·RUN_DIR)에 평문 비밀값 없음' '' "$(grep -rl -F "$marker" "$CRELINK_ROOT" "$CRELINK_ETC" "$CRELINK_RUN_DIR" 2>/dev/null | names || true)"
result '⑪ 비밀값은 컨테이너 환경에만 전달됨' 1 "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(docker ps -q --filter "label=com.docker.compose.project=$run_id-green" --filter label=com.docker.compose.service=api)" | grep -c -F "APP_SECRET=$marker" || true)"

echo "== ⑫ releases.log"
log_file="$CRELINK_ROOT/state/releases.log"
tab="$(printf '\t')"
sha_re='[0-9a-f]{7,40}'
bad_lines="$(grep -v -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z${tab}(deploy|rollback|restore)${tab}(-|$sha_re)${tab}$sha_re${tab}$CRELINK_IMAGE_PREFIX-api:$sha_re${tab}$CRELINK_IMAGE_PREFIX-web:$sha_re\$" "$log_file" || true)"
result '⑫ 모든 줄이 "UTC 시각<TAB>동작<TAB>이전<TAB>새<TAB>API 이미지<TAB>웹 이미지"' '' "$bad_lines"
expected_log='deploy - c1 api:c1 web:c1
deploy c1 c2 api:c1 web:c2
deploy c2 c4 api:c4 web:c4
rollback c4 c2 api:c1 web:c2
rollback c2 c1 api:c1 web:c1
rollback c1 c4 api:c4 web:c4
deploy c4 c7 api:c4 web:c4
rollback c7 c4 api:c4 web:c4'
join_lines() { tr '\n' ';' | sed 's/;$//'; }
result '⑫ 기록 순서(전환에 성공한 것만: 실패한 ③·⑥·⑦·토큰 없음·거부는 기록 없음, 첫 줄은 cutover)' "$(join_lines <<<"$expected_log")" "$(cut -f 2- "$log_file" | names | tr '\t' ' ' | join_lines)"
echo "releases.log:"
names <"$log_file" | sed 's/^/   /'

harness_finish "ssh-entry 실행 ${runs}회"
