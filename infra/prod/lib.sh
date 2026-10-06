# shellcheck shell=bash
# deploy.sh·rollback.sh·geoip.sh·cutover.sh·verify.sh가 source하는 공용 함수. 단독 실행하지 않습니다.
#
# 구성(ADR 0011): edge Caddy(project crelink-edge, 127.0.0.1:18080) 하나가 배포와 무관하게 떠 있고, api·web은 같은 compose.yaml을
# 색(blue·green)마다 다른 project(crelink-blue·crelink-green)로 띄웁니다. 배포·롤백·GeoIP 재시작은 모두 switch_color로 비활성 색에
# 올린 뒤 edge의 업스트림 파일을 바꿔 reload합니다(무중단). blue/green 이전 구조(crelink-prod)에서 처음 옮기는 일은 cutover.sh입니다.
#
# 서버 배치(CRELINK_ROOT, 기본 /opt/crelink, deploy 사용자 소유)
#   releases/<SHA>/      커밋 SHA 시점의 infra/prod 사본(compose.yaml·Caddyfile·edge/·certs·secrets·스크립트). 배포 단위입니다.
#   releases/<SHA>/.images.env  그 릴리스가 성공했을 때의 이미지(롤백이 씀)
#   current              지금 운영 중인(활성 색의) 릴리스를 가리키는 심볼릭 링크
#   state/active-color   활성 색(blue|green). 없으면 blue/green 이전 서버라 deploy·rollback이 아무것도 바꾸지 않고 거부합니다.
#   state/images.env     지금 운영 중인 API_IMAGE·WEB_IMAGE
#   state/releases.log   탭 구분 "UTC 시각 / 동작(deploy|rollback|restore) / 이전 릴리스 / 새 릴리스 / API 이미지 / 웹 이미지".
#                        전환에 성공했을 때만 씁니다(restore는 blue/green 이전 릴리스가 남긴 줄).
#   edge/compose.yaml    edge 스택(cutover.sh가 릴리스의 edge/compose.yaml을 복사)
#   edge/conf/           edge Caddy의 /etc/caddy(읽기 전용 폴더 bind): Caddyfile(릴리스 사본)·upstreams.caddy(활성 색)
# 서버 고정 값
#   /etc/crelink/target  배포 대상 이름(infra/prod/targets.json의 name). secrets/<이름>.sops.env를 고릅니다.
#   /etc/crelink/age.key 이 서버의 age 개인키(SOPS 복호화, root:deploy 640)
#   /run/crelink         복호화한 app.env를 compose 실행 동안만 두는 tmpfs 폴더(deploy 0700). 실행이 끝나면 지웁니다.
#   Docker 네트워크 crelink-edge(edge와 두 색이 붙음), 볼륨 crelink-prod_geoip(두 색이 같이 씀). bootstrap.sh·cutover.sh가 만듭니다.
#
# 호출 측 환경변수
#   GHCR_PULL_USER·GHCR_PULL_TOKEN  레지스트리 로그인(워크플로 job의 GITHUB_TOKEN, 일회용). 없으면 로그인하지 않습니다.
#   CRELINK_DRAIN_SECONDS  전환 뒤 옛 색을 멈추기 전에 기다리는 시간(기본 20초). 옛 설정으로 들어온 진행 중 요청이 끝날 시간입니다.
# 시험(tests/*.sh)이 바꿔 쓰는 값: CRELINK_ROOT, CRELINK_ETC, CRELINK_RUN_DIR, CRELINK_IMAGE_PREFIX, CRELINK_KEEP_RELEASES, CRELINK_WAIT_SECONDS,
#   CRELINK_PROJECT_PREFIX(project 이름 앞부분, 기본 crelink), CRELINK_EDGE_NETWORK, CRELINK_GEOIP_VOLUME, CRELINK_LEGACY_PROJECT, CRELINK_DRAIN_SECONDS

CRELINK_ROOT="${CRELINK_ROOT:-/opt/crelink}"
CRELINK_ETC="${CRELINK_ETC:-/etc/crelink}"
CRELINK_RUN_DIR="${CRELINK_RUN_DIR:-/run/crelink}"
CRELINK_IMAGE_PREFIX="${CRELINK_IMAGE_PREFIX:-ghcr.io/ai-worker-lab/crelink}"
CRELINK_KEEP_RELEASES="${CRELINK_KEEP_RELEASES:-5}"
CRELINK_WAIT_SECONDS="${CRELINK_WAIT_SECONDS:-120}"
CRELINK_DRAIN_SECONDS="${CRELINK_DRAIN_SECONDS:-20}"
CRELINK_PROJECT_PREFIX="${CRELINK_PROJECT_PREFIX:-crelink}"
# blue/green 이전 단일 스택의 project(cutover.sh가 내리고 되돌리기가 다시 올림).
CRELINK_LEGACY_PROJECT="${CRELINK_LEGACY_PROJECT:-crelink-prod}"
# compose.yaml·edge/compose.yaml이 읽는 값입니다(서버에서는 기본값 그대로).
export CRELINK_EDGE_NETWORK="${CRELINK_EDGE_NETWORK:-crelink-edge}"
export CRELINK_GEOIP_VOLUME="${CRELINK_GEOIP_VOLUME:-crelink-prod_geoip}"
RELEASES_DIR="$CRELINK_ROOT/releases"
CURRENT_LINK="$CRELINK_ROOT/current"
STATE_DIR="$CRELINK_ROOT/state"
IMAGES_FILE="$STATE_DIR/images.env"
RELEASES_LOG="$STATE_DIR/releases.log"
ACTIVE_COLOR_FILE="$STATE_DIR/active-color"
EDGE_DIR="$CRELINK_ROOT/edge"
export CRELINK_EDGE_CONF="$EDGE_DIR/conf"
EDGE_PROJECT="$CRELINK_PROJECT_PREFIX-edge"
APP_ENV="$CRELINK_RUN_DIR/app.env"
RUNBOOK_CUTOVER='infra/docs/prod-runbook.md "14. blue/green cutover"'
REGISTRY_LOGGED_IN=""
# 호출한 셸이 내보낸 값이 images.env·app.env·색을 덮지 않게 합니다(Compose는 셸 환경을 --env-file보다 우선).
unset API_IMAGE WEB_IMAGE CRELINK_APP_ENV CRELINK_COLOR COMPOSE_PROJECT_NAME

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() {
	log "오류: $1"
	exit "${2:-1}"
}

valid_sha() { [[ "$1" =~ ^[0-9a-f]{7,40}$ ]]; }
image_for() { printf '%s-%s:%s' "$CRELINK_IMAGE_PREFIX" "$1" "$2"; } # image_for api|web <SHA>
image_present() { [[ -n "$1" ]] && docker image inspect "$1" >/dev/null 2>&1; }
target_name() {
	local name
	name="$(tr -d '[:space:]' <"$CRELINK_ETC/target" 2>/dev/null)" || true
	[[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "$CRELINK_ETC/target 에 배포 대상 이름이 없습니다(bootstrap.sh)."
	printf '%s' "$name"
}
current_release() { [[ -L "$CURRENT_LINK" ]] && basename "$(readlink "$CURRENT_LINK")" || true; }
set_current() { ln -sfn "releases/$1" "$CURRENT_LINK.tmp" && mv -T "$CURRENT_LINK.tmp" "$CURRENT_LINK"; } # set_current <SHA>

# KEY=값 파일에서 값 읽기(마지막 줄 우선). source하지 않습니다.
file_get() { [[ -f "$2" ]] && sed -n "s/^$1=//p" "$2" | tail -n 1 || true; }

write_file() { # write_file <파일> <내용>: 같은 폴더의 임시 파일에 쓴 뒤 rename(원자적 교체)
	local tmp
	tmp="$(mktemp "$1.XXXXXX")"
	printf '%s' "$2" >"$tmp"
	chmod 644 "$tmp"
	mv "$tmp" "$1"
}
write_images() { write_file "$1" "$(printf 'API_IMAGE=%s\nWEB_IMAGE=%s\n' "$2" "$3")"$'\n'; } # write_images <파일> <API 이미지> <웹 이미지>

record_release() { # record_release <동작> <이전 릴리스> <새 릴리스> <API 이미지> <웹 이미지>
	printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${2:--}" "$3" "$4" "$5" >>"$RELEASES_LOG"
}

# ---- 색 ----
valid_color() { [[ "$1" == blue || "$1" == green ]]; }
other_color() { if [[ "$1" == blue ]]; then echo green; else echo blue; fi; }
color_project() { printf '%s-%s' "$CRELINK_PROJECT_PREFIX" "$1"; }
# 활성 색. 상태 파일이 없거나 값이 틀리면 빈 문자열(반환 1).
active_color() {
	local c
	c="$(tr -d '[:space:]' 2>/dev/null <"$ACTIVE_COLOR_FILE")" || true
	valid_color "$c" || return 1
	printf '%s' "$c"
}
# project의 컨테이너 ID(실행 중만, 또는 all이면 멈춘 것 포함). project_containers <project> [all] [서비스]
project_containers() {
	local args=(ps -q --filter "label=com.docker.compose.project=$1")
	if [[ "${2:-}" == all ]]; then args+=(-a); fi
	if [[ -n "${3:-}" ]]; then args+=(--filter "label=com.docker.compose.service=$3"); fi
	docker "${args[@]}"
}
# blue/green 형식 릴리스인지: 앱 compose에 색 별칭이 있고 caddy 서비스·고정 project 이름(name:)이 없으며 edge 스택이 있음.
is_bluegreen_release() { # is_bluegreen_release <릴리스 폴더>
	[[ -f "$1/compose.yaml" && -f "$1/Caddyfile" && -f "$1/edge/compose.yaml" ]] &&
		grep -q 'CRELINK_COLOR' "$1/compose.yaml" &&
		! grep -Eq '^name:' "$1/compose.yaml" &&
		! grep -Eq '^  caddy:' "$1/compose.yaml"
}

# ---- edge ----
edge_container() { project_containers "$EDGE_PROJECT" "" caddy | head -n 1; }
edge_exec() { # edge_exec <명령...>: 실행 중인 edge Caddy 컨테이너 안에서 실행
	local id
	id="$(edge_container)"
	[[ -n "$id" ]] || return 1
	docker exec "$id" "$@"
}
# edge가 준비되어 있으면 0, 아니면 이유를 출력하고 1.
edge_ready() {
	if ! active_color >/dev/null; then
		echo "활성 색 상태($ACTIVE_COLOR_FILE)가 없습니다"
		return 1
	fi
	if ! docker network inspect "$CRELINK_EDGE_NETWORK" >/dev/null 2>&1; then
		echo "Docker 네트워크 $CRELINK_EDGE_NETWORK 가 없습니다"
		return 1
	fi
	if [[ ! -f "$CRELINK_EDGE_CONF/Caddyfile" || ! -f "$CRELINK_EDGE_CONF/upstreams.caddy" ]]; then
		echo "edge 설정($CRELINK_EDGE_CONF/Caddyfile·upstreams.caddy)이 없습니다"
		return 1
	fi
	if [[ -z "$(edge_container)" ]]; then
		echo "edge Caddy(project $EDGE_PROJECT)가 실행 중이 아닙니다"
		return 1
	fi
}
require_edge() {
	local reason
	reason="$(edge_ready)" ||
		die "edge가 준비되지 않았습니다: $reason. 아무것도 바꾸지 않았습니다. blue/green 이전 서버면 $RUNBOOK_CUTOVER(cutover.sh)를 먼저 하세요."
}
upstreams_for() { # upstreams_for <색>: upstreams.caddy 내용(Caddyfile의 import api_upstream·web_upstream)
	printf '# 활성 색: %s (lib.sh가 씀, 손으로 바꾸면 런북 "수동 전환")\n(api_upstream) {\n\tto api-%s:3000\n}\n(web_upstream) {\n\tto web-%s:3000\n}\n' "$1" "$1" "$1"
}
# edge 안에서 새 색의 내부 헬스를 확인합니다(같은 네트워크·색 별칭으로 실제로 닿는지). 최대 10초 다시 시도.
edge_probe() { # edge_probe <색>
	local c="$1" _
	for _ in 1 2 3 4 5 6 7 8 9 10; do
		if edge_exec wget -q -O /dev/null -T 5 "http://api-$c:3000/api/health/ready" 2>/dev/null &&
			edge_exec wget -q -O /dev/null -T 5 "http://web-$c:3000/privacy" 2>/dev/null; then
			return 0
		fi
		sleep 1
	done
	log "edge에서 api-$c:3000/api/health/ready 또는 web-$c:3000/privacy 에 닿지 않습니다."
	return 1
}
# edge 설정을 <릴리스>/Caddyfile + <색> 업스트림으로 바꿉니다: conf/.next에 쓰고 edge 안에서 validate → mv → reload.
# 반환: 0 성공, 1 실패(이전 파일·설정 그대로), 2 되돌린 파일로도 reload 실패(즉시 수동 대응).
edge_apply() { # edge_apply <릴리스 폴더> <색>
	local dir="$1" color="$2" next="$CRELINK_EDGE_CONF/.next" prev="$CRELINK_EDGE_CONF/.prev" f out
	rm -rf "$next" "$prev"
	mkdir -p "$next" "$prev"
	cp "$dir/Caddyfile" "$next/Caddyfile"
	upstreams_for "$color" >"$next/upstreams.caddy"
	chmod 755 "$next" && chmod 644 "$next/Caddyfile" "$next/upstreams.caddy"
	if ! out="$(edge_exec caddy validate --config /etc/caddy/.next/Caddyfile --adapter caddyfile 2>&1)"; then
		printf '%s\n' "$out" | tail -n 5 >&2
		rm -rf "$next" "$prev"
		log "새 edge 설정이 caddy validate를 통과하지 못했습니다(아무것도 바꾸지 않음)."
		return 1
	fi
	for f in Caddyfile upstreams.caddy; do
		if [[ -f "$CRELINK_EDGE_CONF/$f" ]]; then cp -p "$CRELINK_EDGE_CONF/$f" "$prev/$f"; fi
	done
	mv "$next/upstreams.caddy" "$CRELINK_EDGE_CONF/upstreams.caddy"
	mv "$next/Caddyfile" "$CRELINK_EDGE_CONF/Caddyfile"
	rm -rf "$next"
	if out="$(edge_exec caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1)"; then
		rm -rf "$prev"
		return 0
	fi
	printf '%s\n' "$out" | tail -n 5 >&2
	log "caddy reload 실패. 이전 edge 설정 파일로 되돌립니다(Caddy는 실패한 reload에서 옛 설정을 유지)."
	for f in Caddyfile upstreams.caddy; do
		if [[ -f "$prev/$f" ]]; then mv "$prev/$f" "$CRELINK_EDGE_CONF/$f"; fi
	done
	rm -rf "$prev"
	if edge_exec caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
		return 1
	fi
	log "되돌린 edge 설정으로도 reload하지 못했습니다. 즉시 수동 대응이 필요합니다(infra/docs/prod-runbook.md \"장애 대응\")."
	return 2
}

# 릴리스의 secrets/<대상>.sops.env를 이 서버 키로 복호화해 $APP_ENV(tmpfs)에 씁니다. 값은 출력하지 않습니다.
decrypt_app_env() { # decrypt_app_env <릴리스 폴더>
	local file
	file="$1/secrets/$(target_name).sops.env"
	[[ -f "$file" ]] || die "$file 이 없습니다(이 대상의 설정 파일, infra/docs/prod-runbook.md \"비밀값\")."
	install -d -m 700 "$CRELINK_RUN_DIR"
	(umask 077 && SOPS_AGE_KEY_FILE="$CRELINK_ETC/age.key" sops decrypt --input-type dotenv --output-type dotenv "$file" >"$APP_ENV") ||
		die "$file 복호화 실패($CRELINK_ETC/age.key가 이 파일의 수신자인지 확인)"
}
clear_app_env() { rm -f "$APP_ENV"; }

# compose <색> <릴리스 폴더> <images 파일> <docker compose 인자...>: 그 색의 project(crelink-<색>)로 앱 compose를 실행합니다.
compose() {
	local color="$1" dir="$2" images="$3"
	shift 3
	(cd "$dir" && CRELINK_COLOR="$color" CRELINK_APP_ENV="$APP_ENV" docker compose -p "$(color_project "$color")" -f compose.yaml --env-file "$images" "$@")
}
# edge_compose <docker compose 인자...>: 서버의 edge/compose.yaml로 edge project를 실행합니다.
edge_compose() { docker compose -p "$EDGE_PROJECT" -f "$EDGE_DIR/compose.yaml" "$@"; }

# 토큰은 변수에만 잠깐 두고 --password-stdin으로 넘깁니다. 출력하지 않습니다.
registry_login() {
	local registry="${CRELINK_IMAGE_PREFIX%%/*}"
	if [[ -z "${GHCR_PULL_TOKEN:-}" ]]; then
		log "레지스트리 토큰이 없어 로그인하지 않습니다($registry). 서버에 이미 있는 이미지만 씁니다."
		return 0
	fi
	[[ -n "${GHCR_PULL_USER:-}" ]] || die "GHCR_PULL_USER가 없습니다."
	printf '%s' "$GHCR_PULL_TOKEN" | docker login "$registry" --username "$GHCR_PULL_USER" --password-stdin >/dev/null ||
		die "$registry 로그인 실패"
	unset GHCR_PULL_TOKEN
	REGISTRY_LOGGED_IN="$registry"
	log "$registry 로그인"
}
# 서버에 레지스트리 자격 증명을 남기지 않습니다(trap EXIT).
registry_logout() {
	if [[ -n "$REGISTRY_LOGGED_IN" ]]; then
		docker logout "$REGISTRY_LOGGED_IN" >/dev/null 2>&1 || log "경고: $REGISTRY_LOGGED_IN 로그아웃 실패"
		REGISTRY_LOGGED_IN=""
	fi
}
ensure_image() {
	image_present "$1" && return 0
	log "이미지 받기: $1"
	docker pull --quiet "$1" >/dev/null || die "이미지를 받지 못했습니다: $1 (아무것도 바꾸지 않았습니다)"
}

# 색 전환(ADR 0011 결정 4). 릴리스를 비활성 색에 올리고 edge를 그 색으로 돌린 뒤 옛 색을 멈춥니다.
#   ① 활성 색의 반대가 다음 색 ② 복호화 → 다음 색 up --wait ③ 실패면 그 색만 down(활성 색·current·images.env·트래픽 불변)
#   ④ edge 안에서 새 색 헬스 ⑤ edge 설정 validate → mv → reload ⑥ active-color·current·images.env·releases.log 갱신
#   ⑦ drain(CRELINK_DRAIN_SECONDS) 뒤 옛 색 stop(컨테이너 유지) ⑧ app.env 삭제
# <동작>이 비면(geoip.sh --restart처럼 릴리스가 그대로인 재기동) releases.log에 쓰지 않습니다. 호출 전에 require_edge를 확인합니다.
# 반환: 0 성공, 1 실패(아무것도 바뀌지 않음), 2 edge 설정을 되돌리지 못함(즉시 수동 대응).
switch_color() { # switch_color <동작|""> <릴리스 폴더> <API 이미지> <웹 이미지>
	local action="$1" dir="$2" api="$3" web="$4" release cur next prev images status=0 old
	release="$(basename "$dir")"
	cur="$(active_color)" || {
		log "활성 색 상태가 없습니다."
		return 1
	}
	next="$(other_color "$cur")"
	prev="$(current_release)"
	images="$(mktemp "$STATE_DIR/images.next.XXXXXX")"
	write_images "$images" "$api" "$web"
	decrypt_app_env "$dir"
	log "기동: $release → $next (api $api, web $web). 활성 색 $cur 은 그대로 서비스합니다."
	if ! compose "$next" "$dir" "$images" up -d --quiet-pull --remove-orphans --wait --wait-timeout "$CRELINK_WAIT_SECONDS"; then
		status=1
		log "헬스 실패($next). 최근 로그:"
		compose "$next" "$dir" "$images" logs --no-color --tail 30 >&2 || true
	elif ! edge_probe "$next"; then
		status=1
	fi
	if ((status == 0)); then
		edge_apply "$dir" "$next" || status=$?
	fi
	if ((status != 0)); then
		log "$next 를 내립니다. 활성 색($cur)·current·images.env·트래픽은 바뀌지 않았습니다."
		compose "$next" "$dir" "$images" down --remove-orphans --timeout 30 >&2 || log "경고: $next down 실패"
		clear_app_env
		rm -f "$images"
		return "$status"
	fi
	write_file "$ACTIVE_COLOR_FILE" "$next"$'\n'
	set_current "$release"
	write_images "$IMAGES_FILE" "$api" "$web"
	[[ -z "$action" ]] || record_release "$action" "$prev" "$release" "$api" "$web"
	write_images "$dir/.images.env" "$api" "$web"
	log "전환 완료: 트래픽 $cur → $next ($release)"
	old="$(project_containers "$(color_project "$cur")")"
	if [[ -n "$old" ]]; then
		log "옛 색 $cur: ${CRELINK_DRAIN_SECONDS}초 drain 뒤 정지(컨테이너는 남김)"
		sleep "$CRELINK_DRAIN_SECONDS"
		# shellcheck disable=SC2086 # 컨테이너 ID 목록
		docker stop -t 30 $old >/dev/null || log "경고: 옛 색 $cur 정지 실패(트래픽은 이미 $next)"
	fi
	clear_app_env
	rm -f "$images"
	return 0
}

# 오래된 릴리스 폴더를 지웁니다. 최근 CRELINK_KEEP_RELEASES개와 지금 운영 중인 릴리스는 남깁니다.
prune_releases() {
	local cur keep=0 dir
	cur="$(current_release)"
	# shellcheck disable=SC2012 # 폴더 이름은 16진수 SHA라 ls 수정 시각 정렬로 충분합니다(숨김 폴더 .incoming.*는 제외됨).
	while IFS= read -r dir; do
		[[ "$dir" == "$cur" ]] && continue
		keep=$((keep + 1))
		((keep < CRELINK_KEEP_RELEASES)) && continue
		rm -rf "${RELEASES_DIR:?}/$dir"
		log "오래된 릴리스 정리: $dir"
	done < <(ls -1t "$RELEASES_DIR")
}
