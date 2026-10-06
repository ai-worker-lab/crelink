#!/usr/bin/env bash
# blue/green 이전 단일 스택(crelink-prod: caddy·api·web)에서 edge(crelink-edge) + 색 스택(crelink-blue)으로 한 번 옮기는 cutover와 그 되돌리기.
# 서버에서 운영자가 직접 한 번 실행합니다(워크플로·ssh-entry.sh로는 실행되지 않음). 절차·확인: infra/docs/prod-runbook.md "14. blue/green cutover".
#   cutover:  sudo /opt/crelink/releases/<SHA>/cutover.sh [--dry-run] <릴리스 SHA> [<API SHA|-> <웹 SHA|->]
#             "-"(기본)는 지금 운영 중인 이미지(state/images.env). 그 릴리스 폴더(blue/green 형식)에서 실행합니다.
#   되돌리기: sudo /opt/crelink/current/cutover.sh --revert [--dry-run] [<옛 릴리스 SHA>]
#             옛 릴리스 기본값은 releases.log에서 가장 최근에 운영한 blue/green 이전 형식 릴리스(성공 기록 .images.env가 있는 것).
# root로 실행하면 /opt/crelink 소유자(deploy)로 다시 실행합니다(만드는 파일이 deploy 소유가 되게). deploy로 직접 실행해도 됩니다.
# --dry-run: 사전 점검과 할 일만 출력하고 아무것도 바꾸지 않습니다(복호화 확인용 app.env는 tmpfs에 잠깐 썼다가 지움).
#
# cutover 순서(각 단계는 다시 실행해도 같은 결과, 중간에 멈추면 같은 명령을 다시 실행):
#   ① 사전 점검(아래 check 목록, 하나라도 FAIL이면 아무것도 바꾸지 않고 종료 1)
#   ② 네트워크 crelink-edge·볼륨 crelink-prod_geoip·/opt/crelink/edge/conf 준비, edge/compose.yaml 복사, 없는 이미지 받기
#   ③ edge 설정(Caddyfile + upstreams.caddy=blue)을 쓰고 임시 컨테이너에서 caddy validate
#   ④ crelink-blue up --wait(옛 스택은 계속 서비스) → crelink-edge 네트워크에서 api-blue·web-blue 헬스 확인
#   ⑤ edge 컨테이너를 미리 만들고(up --no-start) → 옛 caddy 정지(-t CRELINK_CUTOVER_STOP_SECONDS, 기본 5) → edge 시작(18080, 이 사이가 공백)
#      → 127.0.0.1:18080으로 단축·웹 응답 확인. 실패하면 edge를 멈추고 옛 caddy를 다시 켠 뒤 blue를 내리고 종료 1
#   ⑥ active-color=blue·current·images.env·releases.log("deploy <옛> <새>")·.images.env 기록
#   ⑦ 옛 crelink-prod api·web(·caddy) 컨테이너 정지·삭제와 그 기본 네트워크 삭제(볼륨은 유지)
# 되돌리기 순서: 옛 릴리스 api·web을 crelink-prod로 up --wait(edge가 계속 서비스) → 옛 caddy를 미리 만들고 → edge 정지 → 옛 caddy 시작
#   → 18080 응답 확인 → active-color 삭제·current·images.env·releases.log("rollback <새> <옛>") → 두 색 정지(컨테이너·edge 설정은 남김).
#   되돌린 뒤 deploy.sh는 edge가 없으므로 다시 아무것도 바꾸지 않고 거부합니다. 다시 cutover하려면 같은 cutover 명령을 실행합니다.
# 종료 코드: 0 완료(또는 이미 완료), 1 실패(사전 점검 실패·자동 원복), 2 원복도 실패(즉시 수동 대응, 런북 14-6).
# 환경변수: CRELINK_CUTOVER_STOP_SECONDS(옛 Caddy 정지 유예, 기본 5), GHCR_PULL_USER·GHCR_PULL_TOKEN(이미지가 없을 때만), 그 밖은 lib.sh 머리말.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=SCRIPTDIR/lib.sh
source "$here/lib.sh"

if [[ "$(id -u)" -eq 0 ]]; then
	owner="$(stat -c %U "$CRELINK_ROOT")" || die "$CRELINK_ROOT 가 없습니다(bootstrap.sh)."
	[[ "$owner" != root ]] || die "$CRELINK_ROOT 가 root 소유입니다. bootstrap.sh를 먼저 실행하세요."
	# docker CLI가 root의 ~/.docker를 읽지 않게 HOME도 그 사용자 것으로 둡니다. 작업 폴더가 /root처럼 그 사용자가 못 읽는 곳이면
	# docker compose가 "stat .: permission denied"로 실패하므로(2026-10-07 운영 dry-run) $CRELINK_ROOT에서 실행합니다.
	cd "$CRELINK_ROOT"
	HOME="$(getent passwd "$owner" | cut -d: -f6)" exec runuser -u "$owner" -- "$here/$(basename "${BASH_SOURCE[0]}")" "$@"
fi

STOP_SECONDS="${CRELINK_CUTOVER_STOP_SECONDS:-5}"
usage() { die "사용법: $0 [--dry-run] <릴리스 SHA> [<API SHA|-> <웹 SHA|->]  또는  $0 --revert [--dry-run] [<옛 릴리스 SHA>]"; }
mode=cutover dry=0 args=()
while (($# > 0)); do
	case "$1" in
	--dry-run) dry=1 ;;
	--revert) mode=revert ;;
	-) args+=("$1") ;;
	-*) usage ;;
	*) args+=("$1") ;;
	esac
	shift
done
[[ "$STOP_SECONDS" =~ ^[0-9]+$ ]] || die "CRELINK_CUTOVER_STOP_SECONDS는 0 이상 정수입니다."

http_port="${CRELINK_HTTP_PORT:-18080}"
short_host="${CRELINK_SHORT_HOST:-go.shaul.kr}"
web_host="${CRELINK_WEB_HOST:-links.shaul.kr}"
edge_image="$(sed -n 's/^    image: *//p' "$here/edge/compose.yaml" 2>/dev/null | head -n 1)"
legacy_project="$CRELINK_LEGACY_PROJECT"

# ---- 점검 출력 ----
fails=0
check() { # check ok|FAIL|info <설명>
	printf '  %-4s %s\n' "$1" "$2" >&2
	if [[ "$1" == FAIL ]]; then fails=$((fails + 1)); fi
}
step() { log "단계 $*"; }
plan() { printf '  - %s\n' "$*" >&2; }

# 127.0.0.1:<포트>에서 단축·웹 호스트가 5xx·무응답이 아닌지(최대 30초). "<단축 코드> <웹 코드>"를 출력하고 결과로 반환.
port_serves() {
	local a w _
	for _ in $(seq 30); do
		a="$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' -H "Host: $short_host" "http://127.0.0.1:$http_port/zzzz" || true)"
		w="$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' -H "Host: $web_host" "http://127.0.0.1:$http_port/privacy" || true)"
		if [[ "$a" =~ ^[1-4][0-9][0-9]$ && "$w" =~ ^[1-4][0-9][0-9]$ ]]; then
			echo "$a $w"
			return 0
		fi
		sleep 1
	done
	echo "${a:-000} ${w:-000}"
	return 1
}
# 포트를 쥔 컨테이너 ID(실행 중)
port_owner() { docker ps -q --filter "publish=$http_port" | head -n 1; }
legacy_caddy() { project_containers "$legacy_project" all caddy | head -n 1; }
# edge 네트워크에 임시 컨테이너를 붙여 새 색 헬스를 확인합니다(edge가 아직 없을 때).
probe_color_via_temp() { # probe_color_via_temp <색>
	local c="$1" _
	for _ in 1 2 3 4 5 6 7 8 9 10; do
		if docker run --rm --network "$CRELINK_EDGE_NETWORK" "$edge_image" sh -c \
			"wget -q -O /dev/null -T 5 http://api-$c:3000/api/health/ready && wget -q -O /dev/null -T 5 http://web-$c:3000/privacy" >/dev/null 2>&1; then
			return 0
		fi
		sleep 1
	done
	return 1
}
# images 파일 하나로 compose config 확인(복호화 포함). <색 또는 legacy> <릴리스 폴더> <images 파일>
config_ok() {
	local out
	decrypt_app_env "$2"
	if [[ "$1" == legacy ]]; then
		out="$(legacy_compose "$2" "$3" config --quiet 2>&1)" || {
			clear_app_env
			printf '%s\n' "$out" | tail -n 3 >&2
			return 1
		}
	else
		out="$(compose "$1" "$2" "$3" config --quiet 2>&1)" || {
			clear_app_env
			printf '%s\n' "$out" | tail -n 3 >&2
			return 1
		}
	fi
	clear_app_env
}
# legacy_compose <옛 릴리스 폴더> <images 파일> <docker compose 인자...>: blue/green 이전 compose를 crelink-prod project로 실행
legacy_compose() {
	local dir="$1" images="$2"
	shift 2
	(cd "$dir" && CRELINK_APP_ENV="$APP_ENV" docker compose -p "$legacy_project" -f compose.yaml --env-file "$images" "$@")
}

images_tmp=""
cleanup() {
	[[ -z "$images_tmp" ]] || rm -f "$images_tmp"
	clear_app_env
	registry_logout
}
trap cleanup EXIT

# ================= cutover =================
do_cutover() {
	((${#args[@]} == 1 || ${#args[@]} == 3)) || usage
	local release="${args[0]}" api_arg="${args[1]:--}" web_arg="${args[2]:--}" legacy cur_api cur_web api web missing=() img caddy_id edge_id code
	valid_sha "$release" || die "릴리스 SHA 형식이 아닙니다: $release"
	[[ "$here" == "$RELEASES_DIR/$release" ]] || die "이 스크립트는 $RELEASES_DIR/$release 에서 실행해야 합니다(현재 $here)."
	legacy="$(current_release)"

	echo "== cutover 사전 점검 ($release, 대상 $(target_name))" >&2
	# 이미 끝났는지(멱등)
	if active_color >/dev/null; then
		if [[ "$legacy" == "$release" && -n "$(edge_container)" && -z "$(project_containers "$legacy_project")" ]]; then
			check ok "이미 cutover됨: 활성 색 $(active_color), current $release, edge 실행 중, $legacy_project 없음"
			log "할 일이 없습니다."
			return 0
		fi
		check FAIL "이미 blue/green 모드입니다(활성 색 $(active_color), current ${legacy:--}). 배포·롤백은 deploy.sh·rollback.sh로 합니다."
		return 1
	fi
	if is_bluegreen_release "$here"; then check ok "릴리스 $release 는 blue/green 형식"; else check FAIL "릴리스 $release 가 blue/green 형식이 아닙니다"; fi
	if [[ -n "$edge_image" ]]; then check ok "edge 이미지 $edge_image"; else check FAIL "edge/compose.yaml에서 이미지를 읽지 못했습니다"; fi
	# 옛 스택
	caddy_id="$(legacy_caddy)"
	if [[ -n "$legacy" ]]; then
		if is_bluegreen_release "$RELEASES_DIR/$legacy"; then
			check FAIL "current($legacy)가 이미 blue/green 형식인데 활성 색 상태가 없습니다. 런북 14-6을 보세요"
		else
			check ok "지금 릴리스(옛 형식) $legacy"
		fi
	else
		check info "운영 중인 릴리스 없음(새 서버): 옛 스택 정지 단계를 건너뜁니다"
	fi
	if [[ -n "$caddy_id" ]]; then
		check ok "옛 caddy $(docker inspect -f '{{.Name}} {{.State.Status}}' "$caddy_id" | sed 's|^/||')"
	else
		check info "옛 caddy($legacy_project) 없음"
	fi
	edge_id="$(project_containers "$EDGE_PROJECT" all caddy | head -n 1)"
	local owner
	owner="$(port_owner)"
	if [[ -z "$owner" ]]; then
		check ok "127.0.0.1:$http_port 를 쥔 컨테이너 없음"
	elif [[ "$owner" == "$caddy_id" ]]; then
		check ok "127.0.0.1:$http_port 는 옛 caddy가 쥐고 있음(⑤에서 넘김)"
	elif [[ -n "$edge_id" && "$owner" == "$edge_id" ]]; then
		check ok "127.0.0.1:$http_port 는 이미 edge가 쥐고 있음(⑤ 건너뜀)"
	else
		check FAIL "127.0.0.1:$http_port 를 다른 컨테이너가 쥐고 있습니다: $(docker inspect -f '{{.Name}}' "$owner")"
	fi
	# 이미지
	cur_api="$(file_get API_IMAGE "$IMAGES_FILE")"
	cur_web="$(file_get WEB_IMAGE "$IMAGES_FILE")"
	if [[ "$api_arg" == - ]]; then api="$cur_api"; elif valid_sha "$api_arg"; then api="$(image_for api "$api_arg")"; else die "API 이미지 SHA 형식이 아닙니다: $api_arg"; fi
	if [[ "$web_arg" == - ]]; then web="$cur_web"; elif valid_sha "$web_arg"; then web="$(image_for web "$web_arg")"; else die "웹 이미지 SHA 형식이 아닙니다: $web_arg"; fi
	[[ -n "$api" && -n "$web" ]] || check FAIL "운영 중인 이미지가 없어(state/images.env) API·웹 SHA가 필요합니다"
	for img in "$api" "$web" "$edge_image"; do
		[[ -n "$img" ]] || continue
		if image_present "$img"; then
			check ok "이미지 있음: $img"
		elif [[ -n "${GHCR_PULL_TOKEN:-}" || "$img" == "$edge_image" ]]; then
			check info "이미지 없음, ②에서 받음: $img"
			missing+=("$img")
		else
			check FAIL "이미지 없음: $img (서버에 받아 두거나 GHCR_PULL_USER·GHCR_PULL_TOKEN을 주세요)"
		fi
	done
	# 설정
	images_tmp="$(mktemp "$STATE_DIR/images.next.XXXXXX")"
	write_images "$images_tmp" "$api" "$web"
	if config_ok blue "$here" "$images_tmp"; then check ok "복호화·앱 compose 문법(crelink-blue)"; else check FAIL "복호화 또는 앱 compose 문법 오류"; fi
	if edge_out="$(CRELINK_EDGE_CONF="$CRELINK_EDGE_CONF" docker compose -p "$EDGE_PROJECT" -f "$here/edge/compose.yaml" config --quiet 2>&1)"; then
		check ok "edge compose 문법"
	else
		check FAIL "edge compose 문법: $edge_out"
	fi
	if docker network inspect "$CRELINK_EDGE_NETWORK" >/dev/null 2>&1; then check ok "네트워크 $CRELINK_EDGE_NETWORK 있음"; else check info "네트워크 $CRELINK_EDGE_NETWORK 없음, ②에서 만듦"; fi
	if docker volume inspect "$CRELINK_GEOIP_VOLUME" >/dev/null 2>&1; then check ok "볼륨 $CRELINK_GEOIP_VOLUME 있음(그대로 씀)"; else check info "볼륨 $CRELINK_GEOIP_VOLUME 없음, ②에서 만듦"; fi
	if [[ -n "$(project_containers "$(color_project blue)")" || -n "$(project_containers "$(color_project green)")" ]]; then
		check info "이미 떠 있는 색 컨테이너가 있습니다(중단된 cutover 다시 실행): blue는 ④에서 새 릴리스로 맞춤"
	fi
	if command -v free >/dev/null 2>&1; then check info "메모리(겹치는 동안 앱 2벌): $(free -m | awk 'NR == 2 { print "available " $7 " MiB / total " $2 " MiB" }')"; fi

	if ((fails > 0)); then
		log "사전 점검 실패 ${fails}건. 아무것도 바꾸지 않았습니다."
		return 1
	fi
	echo "== 할 일" >&2
	plan "② docker network create $CRELINK_EDGE_NETWORK · docker volume create $CRELINK_GEOIP_VOLUME (없을 때만), $EDGE_DIR/{compose.yaml,conf/} 준비"
	plan "③ $CRELINK_EDGE_CONF/{Caddyfile,upstreams.caddy(blue)} 쓰기 → caddy validate"
	plan "④ $(color_project blue) up --wait (api $api, web $web) → api-blue·web-blue 헬스"
	plan "⑤ $EDGE_PROJECT 만들기 → 옛 caddy docker stop -t $STOP_SECONDS → edge 시작(127.0.0.1:$http_port, 공백 수 초) → 응답 확인"
	plan "⑥ active-color=blue, current=$release, images.env, releases.log: deploy ${legacy:--} $release"
	plan "⑦ $legacy_project 컨테이너 정지·삭제(볼륨 유지)"
	if ((dry == 1)); then
		log "--dry-run: 아무것도 바꾸지 않았습니다."
		return 0
	fi

	step "②: 네트워크·볼륨·edge 폴더"
	docker network inspect "$CRELINK_EDGE_NETWORK" >/dev/null 2>&1 || docker network create "$CRELINK_EDGE_NETWORK" >/dev/null
	docker volume inspect "$CRELINK_GEOIP_VOLUME" >/dev/null 2>&1 || docker volume create "$CRELINK_GEOIP_VOLUME" >/dev/null
	install -d -m 755 "$EDGE_DIR" "$CRELINK_EDGE_CONF"
	write_file "$EDGE_DIR/compose.yaml" "$(cat "$here/edge/compose.yaml")"$'\n'
	if ((${#missing[@]} > 0)); then
		registry_login
		for img in "${missing[@]}"; do ensure_image "$img"; done
		registry_logout
	fi

	step "③: edge 설정"
	if [[ -n "$(edge_container)" ]]; then
		local rc=0
		edge_apply "$here" blue || rc=$?
		((rc == 0)) || die "edge 설정 반영 실패" "$rc"
	else
		write_file "$CRELINK_EDGE_CONF/upstreams.caddy" "$(upstreams_for blue)"$'\n'
		write_file "$CRELINK_EDGE_CONF/Caddyfile" "$(cat "$here/Caddyfile")"$'\n'
		docker run --rm -v "$CRELINK_EDGE_CONF:/etc/caddy:ro" -e "CRELINK_SHORT_HOST=$short_host" -e "CRELINK_WEB_HOST=$web_host" \
			"$edge_image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 ||
			die "edge 설정이 caddy validate를 통과하지 못했습니다(옛 스택은 그대로 서비스 중)."
	fi

	step "④: $(color_project blue) 기동"
	decrypt_app_env "$here"
	if ! compose blue "$here" "$images_tmp" up -d --quiet-pull --remove-orphans --wait --wait-timeout "$CRELINK_WAIT_SECONDS"; then
		compose blue "$here" "$images_tmp" logs --no-color --tail 30 >&2 || true
		compose blue "$here" "$images_tmp" down --remove-orphans --timeout 30 >&2 || true
		die "blue가 헬스를 통과하지 못했습니다. blue를 내렸고 옛 스택은 그대로 서비스 중입니다."
	fi
	if [[ -n "$(edge_container)" ]]; then
		edge_probe blue || die "edge에서 blue에 닿지 않습니다(옛 스택 또는 edge가 그대로 서비스 중)."
	else
		probe_color_via_temp blue || {
			compose blue "$here" "$images_tmp" down --remove-orphans --timeout 30 >&2 || true
			die "$CRELINK_EDGE_NETWORK 에서 api-blue·web-blue에 닿지 않습니다. blue를 내렸고 옛 스택은 그대로 서비스 중입니다."
		}
	fi

	edge_id="$(edge_container)"
	if [[ -n "$edge_id" && "$(port_owner)" == "$edge_id" ]]; then
		step "⑤: edge가 이미 127.0.0.1:$http_port 를 서비스 중이라 건너뜀"
	else
		step "⑤: 18080 넘기기(옛 caddy → edge)"
		edge_compose up --no-start --quiet-pull >&2
		caddy_id="$(legacy_caddy)"
		if [[ -n "$caddy_id" ]]; then docker stop -t "$STOP_SECONDS" "$caddy_id" >/dev/null || log "경고: 옛 caddy 정지 실패"; fi
		if ! edge_compose up -d --wait --wait-timeout 60 >&2 || ! code="$(port_serves)"; then
			log "edge가 서비스하지 못했습니다(응답 ${code:-없음}). 옛 caddy로 되돌립니다."
			edge_compose stop >&2 || true
			if [[ -n "$caddy_id" ]]; then
				docker start "$caddy_id" >/dev/null || die "옛 caddy를 다시 켜지 못했습니다. 즉시 수동 대응(런북 14-6)." 2
				port_serves >/dev/null || die "옛 caddy를 켰지만 $http_port 응답이 없습니다. 즉시 수동 대응(런북 14-6)." 2
			fi
			compose blue "$here" "$images_tmp" down --remove-orphans --timeout 30 >&2 || true
			die "cutover 실패: 옛 스택으로 되돌렸습니다."
		fi
		log "edge 서비스 시작: 127.0.0.1:$http_port 단축·웹 응답 $code"
	fi

	step "⑥: 상태 기록"
	write_file "$ACTIVE_COLOR_FILE" "blue"$'\n'
	set_current "$release"
	write_images "$IMAGES_FILE" "$api" "$web"
	record_release deploy "$legacy" "$release" "$api" "$web"
	write_images "$here/.images.env" "$api" "$web"
	clear_app_env

	step "⑦: 옛 $legacy_project 정리(볼륨 유지)"
	local old
	old="$(project_containers "$legacy_project" all)"
	if [[ -n "$old" ]]; then
		# shellcheck disable=SC2086 # 컨테이너 ID 목록
		docker stop -t 30 $old >/dev/null || log "경고: $legacy_project 정지 실패"
		# shellcheck disable=SC2086
		docker rm $old >/dev/null || log "경고: $legacy_project 컨테이너 삭제 실패"
	fi
	docker network rm "${legacy_project}_default" >/dev/null 2>&1 || true
	log "cutover 완료: 활성 색 blue, 릴리스 $release (api $api, web $web). 다음: ssh deploy@<서버> verify, status"
}

# ================= 되돌리기 =================
do_revert() {
	((${#args[@]} <= 1)) || usage
	local cur legacy api web edge_id caddy_id code ids
	cur="$(current_release)"
	legacy="${args[0]:-}"
	if [[ -z "$legacy" && -f "$RELEASES_LOG" ]]; then
		# 아래에서부터 "새 릴리스"가 옛 형식이고 성공 기록이 남은 첫 줄
		while IFS= read -r r; do
			if [[ -n "$r" && "$r" != "$cur" && -f "$RELEASES_DIR/$r/.images.env" && -f "$RELEASES_DIR/$r/compose.yaml" ]] &&
				! is_bluegreen_release "$RELEASES_DIR/$r"; then
				legacy="$r"
				break
			fi
		done < <(awk -F '\t' '{ print $4 }' "$RELEASES_LOG" | sed '1!G;h;$!d')
	fi
	echo "== 되돌리기 사전 점검 (current ${cur:--} → 옛 ${legacy:--})" >&2
	if ! active_color >/dev/null; then
		if [[ -n "$(legacy_caddy)" && "$(port_owner)" == "$(legacy_caddy)" ]]; then
			check ok "이미 되돌림: 활성 색 없음, $legacy_project caddy가 127.0.0.1:$http_port 서비스 중"
			log "할 일이 없습니다."
			return 0
		fi
		check FAIL "활성 색 상태가 없습니다(blue/green 모드가 아님). 런북 14-6을 보세요"
		return 1
	fi
	[[ -n "$legacy" ]] || die "되돌릴 옛 형식 릴리스를 찾지 못했습니다. <옛 릴리스 SHA>를 지정하세요."
	valid_sha "$legacy" || die "릴리스 SHA 형식이 아닙니다: $legacy"
	local ldir="$RELEASES_DIR/$legacy"
	if [[ -f "$ldir/.images.env" && -f "$ldir/compose.yaml" ]] && ! is_bluegreen_release "$ldir"; then
		check ok "옛 릴리스 $legacy(blue/green 이전 형식, 성공 기록 있음)"
	else
		check FAIL "$ldir 가 없거나 옛 형식이 아니거나 성공 기록(.images.env)이 없습니다"
	fi
	api="$(file_get API_IMAGE "$ldir/.images.env")"
	web="$(file_get WEB_IMAGE "$ldir/.images.env")"
	for img in "$api" "$web"; do
		if image_present "$img"; then check ok "이미지 있음: $img"; else check FAIL "이미지 없음: ${img:--}"; fi
	done
	if [[ -f "$ldir/compose.yaml" ]] && config_ok legacy "$ldir" "$ldir/.images.env"; then
		check ok "복호화·옛 compose 문법($legacy_project)"
	else
		check FAIL "복호화 또는 옛 compose 문법 오류"
	fi
	edge_id="$(edge_container)"
	if [[ -n "$edge_id" ]]; then check ok "edge 실행 중(활성 색 $(active_color))"; else check info "edge가 실행 중이 아님"; fi
	if ((fails > 0)); then
		log "사전 점검 실패 ${fails}건. 아무것도 바꾸지 않았습니다."
		return 1
	fi
	echo "== 할 일" >&2
	plan "① $legacy_project api·web up --wait (릴리스 $legacy, api $api, web $web). edge는 계속 서비스"
	plan "② 옛 caddy 만들기 → edge docker stop -t $STOP_SECONDS → 옛 caddy 시작(127.0.0.1:$http_port, 공백 수 초) → 응답 확인"
	plan "③ active-color 삭제, current=$legacy, images.env, releases.log: rollback ${cur:--} $legacy"
	plan "④ $(color_project blue)·$(color_project green) 정지(컨테이너·edge 설정은 남김)"
	if ((dry == 1)); then
		log "--dry-run: 아무것도 바꾸지 않았습니다."
		return 0
	fi

	step "①: $legacy_project api·web 기동"
	decrypt_app_env "$ldir"
	legacy_compose "$ldir" "$ldir/.images.env" up -d --quiet-pull --wait --wait-timeout "$CRELINK_WAIT_SECONDS" api web >&2 || {
		legacy_compose "$ldir" "$ldir/.images.env" logs --no-color --tail 30 api web >&2 || true
		legacy_compose "$ldir" "$ldir/.images.env" down --timeout 30 >&2 || true
		die "옛 api·web이 헬스를 통과하지 못했습니다. 내렸고 edge가 그대로 서비스 중입니다."
	}
	step "②: 18080 넘기기(edge → 옛 caddy)"
	legacy_compose "$ldir" "$ldir/.images.env" up --no-start --no-recreate caddy >&2
	if [[ -n "$edge_id" ]]; then docker stop -t "$STOP_SECONDS" "$edge_id" >/dev/null || log "경고: edge 정지 실패"; fi
	if ! legacy_compose "$ldir" "$ldir/.images.env" up -d --no-recreate --wait --wait-timeout 60 >&2 || ! code="$(port_serves)"; then
		log "옛 caddy가 서비스하지 못했습니다(응답 ${code:-없음}). edge로 되돌립니다."
		caddy_id="$(legacy_caddy)"
		if [[ -n "$caddy_id" ]]; then docker stop -t 1 "$caddy_id" >/dev/null || true; fi
		if [[ -n "$edge_id" ]]; then
			docker start "$edge_id" >/dev/null || die "edge를 다시 켜지 못했습니다. 즉시 수동 대응(런북 14-6)." 2
			port_serves >/dev/null || die "edge를 켰지만 $http_port 응답이 없습니다. 즉시 수동 대응(런북 14-6)." 2
		fi
		legacy_compose "$ldir" "$ldir/.images.env" down --timeout 30 >&2 || true
		die "되돌리기 실패: edge로 되돌렸습니다."
	fi
	log "옛 caddy 서비스 시작: 127.0.0.1:$http_port 단축·웹 응답 $code"

	step "③: 상태 기록"
	rm -f "$ACTIVE_COLOR_FILE"
	set_current "$legacy"
	write_images "$IMAGES_FILE" "$api" "$web"
	record_release rollback "$cur" "$legacy" "$api" "$web"
	clear_app_env

	step "④: 두 색 정지(컨테이너 유지)"
	ids="$(project_containers "$(color_project blue)") $(project_containers "$(color_project green)")"
	if [[ -n "${ids// /}" ]]; then
		# shellcheck disable=SC2086 # 컨테이너 ID 목록
		docker stop -t 30 $ids >/dev/null || log "경고: 색 컨테이너 정지 실패"
	fi
	log "되돌리기 완료: $legacy_project 릴리스 $legacy (api $api, web $web). deploy.sh는 다시 cutover할 때까지 거부합니다."
}

install -d -m 755 "$STATE_DIR"
if [[ "$mode" == revert ]]; then do_revert; else do_cutover; fi
