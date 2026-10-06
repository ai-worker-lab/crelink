#!/usr/bin/env bash
# 크리링 API 롤백(서버 /opt/crelink). 사용법: ./rollback.sh [커밋 SHA]
#   SHA가 없으면 releases.log에서 현재 이미지를 배포한 마지막 deploy 줄의 "이전 이미지"로 돌아갑니다.
#   그래서 연달아 실행하면 배포 이력을 한 단계씩 거슬러 갑니다. 자동 복구(restore) 줄은 고려하지 않습니다.
# 이미지가 서버에 없을 때만 레지스트리에서 받습니다(토큰 전달 방식은 deploy.sh와 같음). edge 사이트 파일은 바꾸지 않습니다.
# 종료 코드: 0 성공(마지막 줄에 이미지), 1 실패(이전 이미지로 복구했거나 아무것도 바꾸지 않음), 2 실패 후 복구도 실패.
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ $# -le 1 ]] || die "사용법: $0 [커밋 SHA]"
require_env_file
current="$(env_get API_IMAGE)"

if [[ $# -eq 1 ]]; then
	valid_sha "$1" || die "SHA 형식이 아닙니다(7~40자 소문자 16진수): $1"
	target="$(image_for_sha "$1")"
else
	[[ -f "$RELEASES_LOG" ]] || die "$RELEASES_LOG 가 없습니다. SHA를 지정하세요."
	target="$(awk -F '\t' -v cur="$current" '$2 == "deploy" && $4 == cur && $3 != cur && $3 != "" { prev = $3 } END { print prev }' "$RELEASES_LOG")"
	[[ -n "$target" ]] || die "releases.log에서 $current 이전 이미지를 찾지 못했습니다. SHA를 지정하세요."
	valid_sha "${target##*:}" || die "releases.log의 이전 값이 이미지 태그 형식이 아닙니다: $target"
fi

[[ "$target" != "$current" ]] || die "이미 $target 입니다."
require_edge

trap registry_logout EXIT
if image_present "$target"; then
	# 워크플로가 stdin으로 넘긴 토큰을 쓰지 않더라도 읽어서 버립니다.
	if [[ "${GHCR_PULL_TOKEN_STDIN:-}" == 1 ]]; then IFS= read -r _ || true; fi
else
	registry_login
	pull_image "$target"
fi

status=0
switch_image "$target" rollback || status=$?
registry_logout
if ((status != 0)); then
	log "롤백 실패: $target"
	exit "$status"
fi
log "롤백 완료: $current → $target"
printf '%s\n' "$target"
