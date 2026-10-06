# shellcheck shell=bash
# deploy.sh·rollback.sh·geoip.sh·ssh-entry.sh가 source하는 공용 함수. 단독 실행하지 않습니다.
#
# 서버 배치(CRELINK_ROOT, 기본 /opt/crelink, deploy 사용자 소유)
#   releases/<SHA>/      커밋 SHA 시점의 infra/prod 사본(compose.yaml·Caddyfile·certs·secrets·스크립트). 배포 단위입니다.
#   releases/<SHA>/.images.env  그 릴리스가 성공했을 때의 이미지(롤백이 씀)
#   current              지금 운영 중인 릴리스를 가리키는 심볼릭 링크
#   state/images.env     지금 운영 중인 API_IMAGE·WEB_IMAGE(compose --env-file)
#   state/releases.log   탭 구분 "UTC 시각 / 동작(deploy|rollback|restore) / 이전 릴리스 / 새 릴리스 / API 이미지 / 웹 이미지"
# 서버 고정 값
#   /etc/crelink/target  배포 대상 이름(infra/prod/targets.json의 name). secrets/<이름>.sops.env를 고릅니다.
#   /etc/crelink/age.key 이 서버의 age 개인키(SOPS 복호화, root:deploy 640)
#   /run/crelink         복호화한 app.env를 compose 실행 동안만 두는 tmpfs 폴더(deploy 0700). 실행이 끝나면 지웁니다.
#
# 호출 측 환경변수
#   GHCR_PULL_USER·GHCR_PULL_TOKEN  레지스트리 로그인(워크플로 job의 GITHUB_TOKEN, 일회용). 없으면 로그인하지 않습니다.
# 시험(tests/deploy-rollback.sh)이 바꿔 쓰는 값: CRELINK_ROOT, CRELINK_ETC, CRELINK_RUN_DIR, CRELINK_IMAGE_PREFIX, CRELINK_KEEP_RELEASES, CRELINK_WAIT_SECONDS

CRELINK_ROOT="${CRELINK_ROOT:-/opt/crelink}"
CRELINK_ETC="${CRELINK_ETC:-/etc/crelink}"
CRELINK_RUN_DIR="${CRELINK_RUN_DIR:-/run/crelink}"
CRELINK_IMAGE_PREFIX="${CRELINK_IMAGE_PREFIX:-ghcr.io/ai-worker-lab/crelink}"
CRELINK_KEEP_RELEASES="${CRELINK_KEEP_RELEASES:-5}"
CRELINK_WAIT_SECONDS="${CRELINK_WAIT_SECONDS:-120}"
RELEASES_DIR="$CRELINK_ROOT/releases"
CURRENT_LINK="$CRELINK_ROOT/current"
STATE_DIR="$CRELINK_ROOT/state"
IMAGES_FILE="$STATE_DIR/images.env"
RELEASES_LOG="$STATE_DIR/releases.log"
APP_ENV="$CRELINK_RUN_DIR/app.env"
REGISTRY_LOGGED_IN=""
# 호출한 셸이 내보낸 값이 images.env·app.env를 덮지 않게 합니다(Compose는 셸 환경을 --env-file보다 우선).
unset API_IMAGE WEB_IMAGE CRELINK_APP_ENV

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

# KEY=값 파일에서 값 읽기(마지막 줄 우선). source하지 않습니다.
file_get() { [[ -f "$2" ]] && sed -n "s/^$1=//p" "$2" | tail -n 1 || true; }

write_images() { # write_images <파일> <API 이미지> <웹 이미지>
	local tmp
	tmp="$(mktemp "$1.XXXXXX")"
	printf 'API_IMAGE=%s\nWEB_IMAGE=%s\n' "$2" "$3" >"$tmp"
	mv "$tmp" "$1"
}

record_release() { # record_release <동작> <이전 릴리스> <새 릴리스> <API 이미지> <웹 이미지>
	printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${2:--}" "$3" "$4" "$5" >>"$RELEASES_LOG"
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

# compose <릴리스 폴더> <images 파일> <docker compose 인자...>
compose() {
	local dir="$1" images="$2"
	shift 2
	(cd "$dir" && CRELINK_APP_ENV="$APP_ENV" docker compose -f compose.yaml --env-file "$images" "$@")
}

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

# 릴리스를 운영으로 올립니다: app.env 복호화 → images.env·current 교체 → up --wait(헬스 통과까지) → app.env 삭제.
# 반환 0 성공, 1 헬스 실패(상태는 바꾼 채로 둠, 호출 측이 복구).
bring_up() { # bring_up <릴리스 폴더> <API 이미지> <웹 이미지>
	local dir="$1" status=0
	decrypt_app_env "$dir"
	write_images "$IMAGES_FILE" "$2" "$3"
	ln -sfn "releases/$(basename "$dir")" "$CURRENT_LINK.tmp" && mv -T "$CURRENT_LINK.tmp" "$CURRENT_LINK"
	log "기동: $(basename "$dir") (api $2, web $3)"
	compose "$dir" "$IMAGES_FILE" up -d --quiet-pull --remove-orphans --wait --wait-timeout "$CRELINK_WAIT_SECONDS" || status=1
	if ((status != 0)); then
		log "헬스 실패. 최근 로그:"
		compose "$dir" "$IMAGES_FILE" logs --no-color --tail 30 >&2 || true
	fi
	clear_app_env
	return "$status"
}

# 새 릴리스로 바꾸고, 실패하면 직전 운영 상태(릴리스·이미지)로 되돌립니다.
# 반환: 0 성공, 1 실패 후 복구(또는 되돌릴 이전 상태 없음), 2 복구도 실패.
switch_release() { # switch_release <동작> <릴리스 폴더> <API 이미지> <웹 이미지>
	local action="$1" dir="$2" api="$3" web="$4" prev prev_api prev_web
	prev="$(current_release)"
	prev_api="$(file_get API_IMAGE "$IMAGES_FILE")"
	prev_web="$(file_get WEB_IMAGE "$IMAGES_FILE")"
	record_release "$action" "$prev" "$(basename "$dir")" "$api" "$web"
	if bring_up "$dir" "$api" "$web"; then
		write_images "$dir/.images.env" "$api" "$web"
		return 0
	fi
	if [[ -z "$prev" || ! -d "$RELEASES_DIR/$prev" || -z "$prev_api" || -z "$prev_web" ]]; then
		log "되돌릴 이전 릴리스가 없습니다. 실패한 상태로 남아 있습니다."
		return 1
	fi
	log "이전 상태로 복구: $prev"
	record_release restore "$(basename "$dir")" "$prev" "$prev_api" "$prev_web"
	if bring_up "$RELEASES_DIR/$prev" "$prev_api" "$prev_web"; then
		log "복구 완료: $prev"
		return 1
	fi
	log "복구도 실패했습니다. 즉시 수동 대응이 필요합니다(infra/docs/prod-runbook.md \"장애 대응\")."
	return 2
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
