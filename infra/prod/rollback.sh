#!/usr/bin/env bash
# 크리링 운영 롤백. 이전에 성공한 릴리스(설정·비밀값·이미지 전체)로 되돌립니다.
#   사용법: rollback.sh [릴리스 SHA]
#   SHA가 없으면 releases.log에서 지금 릴리스로 올라오기 직전 운영 릴리스를 고릅니다(연달아 실행하면 한 단계씩 거슬러 감).
#   대상 릴리스 폴더와 그 .images.env(성공 기록)가 서버에 남아 있어야 합니다(최근 CRELINK_KEEP_RELEASES개).
# 이미지가 서버에 없을 때만 레지스트리에서 받습니다(GHCR_PULL_USER·GHCR_PULL_TOKEN).
# 종료 코드: 0 성공(마지막 줄에 "<릴리스> <API 이미지> <웹 이미지>"), 1 실패(복구했거나 아무것도 바꾸지 않음), 2 복구도 실패.
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ $# -le 1 ]] || die "사용법: $0 [릴리스 SHA]"
current="$(current_release)"
[[ -n "$current" ]] || die "운영 중인 릴리스가 없습니다."

if [[ $# -eq 1 ]]; then
	valid_sha "$1" || die "릴리스 SHA 형식이 아닙니다: $1"
	target="$1"
else
	[[ -f "$RELEASES_LOG" ]] || die "$RELEASES_LOG 가 없습니다. 릴리스 SHA를 지정하세요."
	# 지금 릴리스를 배포한 마지막 deploy 줄의 "이전 릴리스". rollback 줄을 보면 직전 롤백의 출발점으로 되돌아가
	# 두 릴리스 사이를 오가므로 deploy 줄만 봅니다(연달아 실행하면 배포 이력을 한 단계씩 거슬러 감).
	target="$(awk -F '\t' -v cur="$current" '$2 == "deploy" && $4 == cur && $3 != cur && $3 != "-" { prev = $3 } END { print prev }' "$RELEASES_LOG")"
	[[ -n "$target" ]] || die "releases.log에서 $current 이전 릴리스를 찾지 못했습니다. 릴리스 SHA를 지정하세요."
fi
[[ "$target" != "$current" ]] || die "이미 $target 입니다."
dir="$RELEASES_DIR/$target"
# shellcheck disable=SC2012 # 안내 출력용
[[ -f "$dir/.images.env" ]] || die "$dir 가 없거나 성공 기록(.images.env)이 없습니다. 남아 있는 릴리스: $(ls -1 "$RELEASES_DIR" | tr '\n' ' ')"
api="$(file_get API_IMAGE "$dir/.images.env")"
web="$(file_get WEB_IMAGE "$dir/.images.env")"

trap 'clear_app_env; registry_logout' EXIT
if ! image_present "$api" || ! image_present "$web"; then
	registry_login
	ensure_image "$api"
	ensure_image "$web"
	registry_logout
fi

status=0
switch_release rollback "$dir" "$api" "$web" || status=$?
if ((status != 0)); then
	log "롤백 실패: $target"
	exit "$status"
fi
log "롤백 완료: $current → $target"
printf '%s %s %s\n' "$target" "$api" "$web"
