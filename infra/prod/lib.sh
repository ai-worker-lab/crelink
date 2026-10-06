# shellcheck shell=bash
# deploy.sh·rollback.sh·geoip.sh가 source하는 공용 함수. 단독 실행하지 않습니다.
# 서버 /opt/crelink(이 파일이 있는 폴더)에서 compose.yaml·.env·releases.log를 씁니다.
#
# 호출 측 환경변수
#   GHCR_PULL_USER            레지스트리 사용자(워크플로: github.actor)
#   GHCR_PULL_TOKEN_STDIN=1   토큰을 stdin 첫 줄에서 읽음(워크플로 기본). 또는 GHCR_PULL_TOKEN 환경변수.
#                             둘 다 없으면 로그인하지 않습니다(이미 받은 이미지만 쓸 때).
# 기본값을 바꿀 일이 거의 없는 값(로컬 시험 스크립트 tests/*.sh가 바꿔 씀)
#   CRELINK_IMAGE_REPO  이미지 저장소(기본 ghcr.io/ai-worker-lab/crelink-api). 로그인 대상 레지스트리는 첫 경로 조각.
#   EDGE_DIR            edge Compose 폴더(기본 /opt/edge). 사이트 파일 sites/crelink.caddy를 씁니다.
#   EDGE_PROJECT        edge Compose project 이름(기본 edge). Caddy 컨테이너를 라벨로 찾습니다.
#   EDGE_NETWORK        edge 공용 네트워크 이름(기본 edge, compose.yaml과 같은 변수).
#   COMPOSE_PROJECT_NAME  크리링 Compose project 이름(기본 compose.yaml의 name: crelink-prod).

CRELINK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRELINK_IMAGE_REPO="${CRELINK_IMAGE_REPO:-ghcr.io/ai-worker-lab/crelink-api}"
EDGE_DIR="${EDGE_DIR:-/opt/edge}"
EDGE_PROJECT="${EDGE_PROJECT:-edge}"
EDGE_NETWORK="${EDGE_NETWORK:-edge}"
HEALTH_TIMEOUT_SECONDS=60
ENV_FILE="$CRELINK_DIR/.env"
RELEASES_LOG="$CRELINK_DIR/releases.log"
SITE_FILE="$CRELINK_DIR/crelink.caddy"
REGISTRY_LOGGED_IN=""
# 호출한 셸이 내보낸 API_IMAGE가 .env 값을 덮지 않게 합니다(Compose는 셸 환경을 .env보다 우선).
unset API_IMAGE

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() {
	log "오류: $1"
	exit "${2:-1}"
}

compose() { (cd "$CRELINK_DIR" && docker compose "$@"); }

require_env_file() {
	[[ -f "$ENV_FILE" ]] || die "$ENV_FILE 가 없습니다. .env.example을 복사해 값을 채우세요(infra/docs/prod-runbook.md)."
}

# .env에서 키 값을 읽습니다(마지막 줄 우선, 따옴표 없는 KEY=값 형식). 파일을 source하지 않습니다.
env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

# .env의 키 값을 바꿉니다(없으면 추가). 같은 폴더 임시 파일에 쓰고 rename해 중간 상태가 남지 않게 하며 권한 600을 유지합니다.
env_set() {
	local key="$1" value="$2" tmp
	tmp="$(umask 077 && mktemp "$CRELINK_DIR/.env.XXXXXX")"
	awk -v key="$key" -v value="$value" '
		BEGIN { done = 0 }
		index($0, key "=") == 1 { if (!done) { print key "=" value; done = 1 } ; next }
		{ print }
		END { if (!done) print key "=" value }
	' "$ENV_FILE" >"$tmp"
	chmod 600 "$tmp"
	mv "$tmp" "$ENV_FILE"
}

valid_sha() { [[ "$1" =~ ^[0-9a-f]{7,40}$ ]]; }
image_for_sha() { printf '%s:%s' "$CRELINK_IMAGE_REPO" "$1"; }
image_present() { [[ -n "$1" ]] && docker image inspect "$1" >/dev/null 2>&1; }

# releases.log: 탭 구분 "UTC 시각 / 동작(deploy|rollback|restore) / 이전 이미지 / 새 이미지". .env를 바꾸기 전에 씁니다.
record_release() { printf '%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" >>"$RELEASES_LOG"; }

# 토큰은 변수에만 잠깐 두고 docker login --password-stdin으로 넘깁니다. 출력하지 않습니다.
registry_login() {
	local registry="${CRELINK_IMAGE_REPO%%/*}" token=""
	if [[ "${GHCR_PULL_TOKEN_STDIN:-}" == 1 ]]; then
		IFS= read -r token || true
	elif [[ -n "${GHCR_PULL_TOKEN:-}" ]]; then
		token="$GHCR_PULL_TOKEN"
	fi
	if [[ -z "$token" ]]; then
		log "레지스트리 토큰이 없어 로그인하지 않습니다($registry)."
		return 0
	fi
	[[ -n "${GHCR_PULL_USER:-}" ]] || die "GHCR_PULL_USER가 없습니다."
	if ! printf '%s' "$token" | docker login "$registry" --username "$GHCR_PULL_USER" --password-stdin >/dev/null; then
		die "$registry 로그인 실패"
	fi
	token=""
	REGISTRY_LOGGED_IN="$registry"
	log "$registry 로그인"
}

# 서버에 레지스트리 자격 증명을 남기지 않습니다. 스크립트 종료 시(trap EXIT) 호출합니다.
registry_logout() {
	if [[ -n "$REGISTRY_LOGGED_IN" ]]; then
		docker logout "$REGISTRY_LOGGED_IN" >/dev/null 2>&1 || log "경고: $REGISTRY_LOGGED_IN 로그아웃 실패"
		REGISTRY_LOGGED_IN=""
	fi
}

pull_image() {
	log "이미지 받기: $1"
	API_IMAGE="$1" compose pull --quiet api || die "이미지를 받지 못했습니다: $1 (아무것도 바꾸지 않았습니다)"
}

edge_caddy_container() {
	docker ps -q --filter "label=com.docker.compose.project=$EDGE_PROJECT" --filter "label=com.docker.compose.service=caddy" | head -n 1
}

# 크리링은 edge 네트워크에 붙고 edge Caddy가 공개를 맡으므로, 없으면 아무것도 바꾸기 전에 멈춥니다.
require_edge() {
	docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1 ||
		die "edge 네트워크(${EDGE_NETWORK})가 없습니다. 먼저 ${EDGE_DIR}에서 edge Caddy를 올리세요(infra/docs/prod-runbook.md)."
	[[ -n "$(edge_caddy_container)" ]] ||
		die "실행 중인 edge Caddy 컨테이너(project ${EDGE_PROJECT})가 없습니다. ${EDGE_DIR}에서 docker compose up -d를 실행하세요."
	[[ -d "$EDGE_DIR/sites" ]] || die "$EDGE_DIR/sites 폴더가 없습니다."
}

api_health() {
	local id
	id="$(compose ps -q api)"
	[[ -n "$id" ]] || {
		echo missing
		return
	}
	docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo missing
}

# 이미지의 HEALTHCHECK가 healthy가 될 때까지 최대 HEALTH_TIMEOUT_SECONDS초 기다립니다. unhealthy(시작 유예가 지난 뒤 연속 실패)면 바로 실패.
wait_api_healthy() {
	local status deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
	while :; do
		status="$(api_health)"
		case "$status" in
		healthy) return 0 ;;
		unhealthy)
			log "API 컨테이너가 unhealthy입니다."
			return 1
			;;
		none)
			log "이미지에 HEALTHCHECK가 없습니다."
			return 1
			;;
		esac
		if ((SECONDS >= deadline)); then
			log "${HEALTH_TIMEOUT_SECONDS}초 안에 healthy가 되지 않았습니다(마지막 상태: $status)."
			return 1
		fi
		sleep 2
	done
}

# API_IMAGE를 target으로 바꾸고 올린 뒤 헬스를 기다립니다. 실패하면 이전 이미지로 되돌립니다.
# 반환: 0 성공, 1 실패 후 이전 이미지 복구(또는 복구할 이전 이미지 없음), 2 복구도 실패.
switch_image() {
	local target="$1" action="$2" previous
	previous="$(env_get API_IMAGE)"
	if [[ "$previous" != "$target" ]]; then
		record_release "$action" "$previous" "$target"
		env_set API_IMAGE "$target"
	fi
	log "API 기동: $target"
	if compose up -d api && wait_api_healthy; then
		return 0
	fi
	log "새 이미지 헬스 실패. 최근 로그:"
	compose logs --no-color --tail 30 api >&2 || true
	if [[ -z "$previous" || "$previous" == "$target" ]] || ! valid_sha "${previous##*:}"; then
		log "되돌릴 이전 이미지가 없습니다(이전 값: ${previous:-없음}). API는 실패한 상태로 남아 있습니다."
		return 1
	fi
	log "이전 이미지로 복구: $previous"
	record_release restore "$target" "$previous"
	env_set API_IMAGE "$previous"
	if compose up -d api && wait_api_healthy; then
		log "복구 완료: $previous"
		return 1
	fi
	log "복구도 실패했습니다. 즉시 수동 대응이 필요합니다(infra/docs/prod-runbook.md 장애 대응)."
	return 2
}

# edge Caddy에 사이트 파일 검증: 컨테이너 /tmp에 복사해 caddy validate(CRELINK_* 값은 edge 컨테이너 환경).
validate_site() {
	local caddy output
	caddy="$(edge_caddy_container)"
	if ! output="$(docker exec -i "$caddy" sh -c 'cat >/tmp/crelink-site-check.caddy && caddy validate --config /tmp/crelink-site-check.caddy --adapter caddyfile' <"$SITE_FILE" 2>&1)"; then
		printf '%s\n' "$output" | tail -n 20 >&2
		die "crelink.caddy 검증 실패(아무것도 바꾸지 않았습니다)"
	fi
}

# 사이트 파일이 바뀐 경우만 $EDGE_DIR/sites/crelink.caddy에 덮어쓰고(같은 inode, bind mount가 그대로 봄) edge Caddy를 reload합니다.
# reload가 실패하면 이전 내용으로 되돌립니다(Caddy는 실패한 reload 때 이전 설정을 계속 씀).
install_site() {
	local dest="$EDGE_DIR/sites/crelink.caddy" backup caddy output
	if [[ -f "$dest" ]] && cmp -s "$SITE_FILE" "$dest"; then
		log "crelink.caddy 변경 없음"
		return 0
	fi
	caddy="$(edge_caddy_container)"
	backup="$(mktemp)"
	if [[ -f "$dest" ]]; then cat "$dest" >"$backup"; fi
	cat "$SITE_FILE" >"$dest" || {
		rm -f "$backup"
		die "$dest 에 쓸 수 없습니다(bootstrap.sh가 deploy 소유로 만듦)."
	}
	if output="$(docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1)"; then
		rm -f "$backup"
		log "edge Caddy reload: crelink.caddy 반영"
		return 0
	fi
	printf '%s\n' "$output" | tail -n 20 >&2
	cat "$backup" >"$dest"
	rm -f "$backup"
	die "edge Caddy reload 실패. crelink.caddy를 이전 내용으로 되돌렸습니다(API는 새 이미지로 동작 중)."
}
