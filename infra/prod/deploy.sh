#!/usr/bin/env bash
# 크리링 API 배포(서버 /opt/crelink). 사용법: ./deploy.sh <커밋 SHA>
#   워크플로: printf '%s\n' "$TOKEN" | ssh ... "cd /opt/crelink && GHCR_PULL_USER=... GHCR_PULL_TOKEN_STDIN=1 ./deploy.sh <SHA>"
# 순서: 입력·edge 확인 → crelink.caddy 검증 → 레지스트리 로그인·pull → releases.log에 이전 이미지 기록 → .env의 API_IMAGE 교체
#       → up -d → 헬스(최대 60초) → 성공 시 edge 사이트 파일 갱신·reload, 실패 시 이전 이미지로 복구.
# 종료 코드: 0 성공(마지막 줄에 배포한 이미지), 1 실패(이전 이미지로 복구했거나 아무것도 바꾸지 않음), 2 실패 후 복구도 실패.
# 환경변수: lib.sh 머리말.
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[[ $# -eq 1 ]] || die "사용법: $0 <커밋 SHA>"
valid_sha "$1" || die "SHA 형식이 아닙니다(7~40자 소문자 16진수): $1"
target="$(image_for_sha "$1")"

require_env_file
require_edge
validate_site

trap registry_logout EXIT
registry_login
pull_image "$target"

status=0
switch_image "$target" deploy || status=$?
registry_logout
if ((status != 0)); then
	log "배포 실패: $target"
	exit "$status"
fi

install_site
log "배포 완료"
printf '%s\n' "$target"
