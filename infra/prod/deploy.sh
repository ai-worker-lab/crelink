#!/usr/bin/env bash
# 크리링 운영 배포. 이 파일이 들어 있는 릴리스 폴더(/opt/crelink/releases/<SHA>)를 운영으로 올립니다(무중단 Blue/Green, ADR 0011).
#   사용법: releases/<SHA>/deploy.sh <릴리스 SHA> <API 이미지 SHA|-> <웹 이미지 SHA|->
#   "-"는 그 영역 이미지를 지금 운영 중인 것으로 둡니다(첫 배포는 둘 다 SHA). 롤백 뒤에는 지금 이미지가 옛 이미지이므로
#   워크플로는 "-"를 쓰지 않고 항상 이미지 SHA를 넘깁니다. "-"는 운영자가 직접 쓸 때만 씁니다.
#   워크플로는 ssh-entry.sh(deploy 사용자의 SSH forced command)가 릴리스 폴더를 풀고 이 스크립트를 부릅니다.
# 순서: 입력·대상 확인 → 이미지 결정 → 복호화·compose 문법 확인 → 레지스트리 로그인·pull → edge 준비 확인
#       → lib.sh switch_color(비활성 색 up --wait → edge에서 헬스 → Caddy 업스트림 교체·reload → 상태·releases.log 갱신 → drain 뒤 옛 색 정지)
#       → 성공 시 오래된 릴리스 정리.
# edge가 준비되지 않은 서버(blue/green 이전 crelink-prod, 또는 cutover 전 새 서버)에서는 이미지만 받아 두고 아무것도 바꾸지 않은 채
# 종료 1입니다. cutover는 자동으로 하지 않습니다(런북 "14. blue/green cutover"의 cutover.sh).
# 종료 코드: 0 성공(마지막 줄에 "<릴리스> <API 이미지> <웹 이미지>"), 1 실패(아무것도 바꾸지 않음: 활성 색·current·images.env·트래픽 그대로),
#           2 edge 설정을 되돌리지 못함(즉시 수동 대응).
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
compose "$(other_color "$(active_color || echo green)")" "$dir" "$next_images" config --quiet ||
	die "compose 설정 오류(아무것도 바꾸지 않았습니다)"
clear_app_env

# 이미지는 edge 확인보다 먼저 받습니다. cutover 전 서버에서도 병합 배포가 이미지를 받아 두어 cutover.sh가 레지스트리 없이 씁니다.
registry_login
ensure_image "$api"
ensure_image "$web"
registry_logout

require_edge
status=0
switch_color deploy "$dir" "$api" "$web" || status=$?
if ((status != 0)); then
	log "배포 실패: $release"
	exit "$status"
fi
prune_releases
log "배포 완료: $release"
printf '%s %s %s\n' "$release" "$api" "$web"
