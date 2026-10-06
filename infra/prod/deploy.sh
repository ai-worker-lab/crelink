#!/usr/bin/env bash
# 크리링 운영 배포. 이 파일이 들어 있는 릴리스 폴더(/opt/crelink/releases/<SHA>)를 운영으로 올립니다.
#   사용법: releases/<SHA>/deploy.sh <릴리스 SHA> <API 이미지 SHA|-> <웹 이미지 SHA|->
#   "-"는 그 영역 이미지를 지금 운영 중인 것으로 둡니다(바뀌지 않은 영역). 첫 배포는 둘 다 SHA여야 합니다.
#   워크플로는 ssh-entry.sh(deploy 사용자의 SSH forced command)가 릴리스 폴더를 풀고 이 스크립트를 부릅니다.
# 순서: 입력·대상 확인 → 이미지 결정 → 복호화·compose 문법 확인 → 레지스트리 로그인·pull → releases.log 기록
#       → current·images.env 교체 → up --wait(caddy·api·web 헬스) → 성공 시 오래된 릴리스 정리, 실패 시 직전 상태로 복구.
# 종료 코드: 0 성공(마지막 줄에 "<릴리스> <API 이미지> <웹 이미지>"), 1 실패(복구했거나 아무것도 바꾸지 않음), 2 복구도 실패.
# 환경변수·서버 배치: lib.sh 머리말.
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ $# -eq 3 ]] || die "사용법: $0 <릴리스 SHA> <API 이미지 SHA|-> <웹 이미지 SHA|->"
release="$1"
valid_sha "$release" || die "릴리스 SHA 형식이 아닙니다: $release"
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ "$dir" == "$RELEASES_DIR/$release" ]] || die "이 스크립트는 $RELEASES_DIR/$release 에서 실행해야 합니다(현재 $dir)."
install -d -m 755 "$STATE_DIR"

pick() { # pick api|web <SHA|-> <지금 이미지>
	if [[ "$2" == - ]]; then
		[[ -n "$3" ]] || die "$1 이미지가 운영 중이 아니라 SHA가 필요합니다(첫 배포)."
		printf '%s' "$3"
	else
		valid_sha "$2" || die "$1 이미지 SHA 형식이 아닙니다: $2"
		image_for "$1" "$2"
	fi
}
api="$(pick api "$2" "$(file_get API_IMAGE "$IMAGES_FILE")")"
web="$(pick web "$3" "$(file_get WEB_IMAGE "$IMAGES_FILE")")"

# 문법·복호화를 먼저 확인합니다(아무것도 바꾸기 전).
next_images="$(mktemp "$STATE_DIR/images.next.XXXXXX")"
trap 'rm -f "$next_images"; clear_app_env; registry_logout' EXIT
write_images "$next_images" "$api" "$web"
decrypt_app_env "$dir"
compose "$dir" "$next_images" config --quiet || die "compose 설정 오류(아무것도 바꾸지 않았습니다)"
clear_app_env

registry_login
ensure_image "$api"
ensure_image "$web"
registry_logout

status=0
switch_release deploy "$dir" "$api" "$web" || status=$?
if ((status != 0)); then
	log "배포 실패: $release"
	exit "$status"
fi
prune_releases
log "배포 완료: $release"
printf '%s %s %s\n' "$release" "$api" "$web"
