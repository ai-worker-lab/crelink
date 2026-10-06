#!/usr/bin/env bash
# DB-IP IP to City Lite(MMDB, CC BY 4.0)를 받아 크리링 geoip 볼륨(/data/geoip/dbip-city-lite.mmdb)에 넣습니다.
# 사용법(서버, deploy 사용자): /opt/crelink/current/geoip.sh [--restart]
#   규칙은 scripts/geoip.mjs와 같습니다: 이번 달 파일이 아직 없을 수 있어 이번 달부터 두 달 전까지 차례로 시도(404면 이전 달).
#   API는 기동할 때 파일을 읽으므로 --restart를 주면 지금 릴리스·이미지를 반대 색에 다시 올려 전환합니다(배포와 같은 무중단 절차,
#   lib.sh switch_color. releases.log에는 쓰지 않음). 주지 않으면 다음 배포부터 적용.
# 출처 표기: 웹 /privacy의 https://db-ip.com 링크(docs/specs/crelink-mvp.md).
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

restart=""
case "${1:-}" in
"") ;;
--restart) restart=1 ;;
*) die "사용법: $0 [--restart]" ;;
esac
release="$(current_release)"
dir="$RELEASES_DIR/$release"
[[ -n "$release" && -f "$dir/compose.yaml" && -f "$IMAGES_FILE" ]] || die "운영 중인 릴리스가 없습니다($CURRENT_LINK). 먼저 배포하세요."
# 볼륨 쓰기·재기동 모두 blue/green 구성을 전제로 합니다(활성 색 project로 geoip-writer 실행).
require_edge
color="$(active_color)"

# 이번 달부터 두 달 전까지 YYYY-MM(UTC). GNU·BSD date 차이를 피하려고 직접 계산합니다.
year="$(date -u +%Y)"
month="$((10#$(date -u +%m)))"
months=()
for back in 0 1 2; do
	m=$((month - back))
	y=$year
	if ((m <= 0)); then
		m=$((m + 12))
		y=$((year - 1))
	fi
	months+=("$(printf '%04d-%02d' "$y" "$m")")
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
archive="$work/dbip-city-lite.mmdb.gz"

found=""
for ym in "${months[@]}"; do
	url="https://download.db-ip.com/free/dbip-city-lite-$ym.mmdb.gz"
	code="$(curl -sS -L -o "$archive" -w '%{http_code}' "$url")" || die "$url 내려받기 실패"
	if [[ "$code" == 404 ]]; then
		log "$url 없음, 이전 달을 시도합니다."
		continue
	fi
	[[ "$code" == 200 ]] || die "$url 내려받기 실패 (HTTP $code)"
	found="$url"
	break
done
[[ -n "$found" ]] || die "최근 석 달의 DB-IP Lite 파일을 찾지 못했습니다. https://db-ip.com/db/download/ip-to-city-lite 를 확인하세요."
gzip -t "$archive" || die "받은 파일의 압축이 깨졌습니다: $found"
log "받음: $found"

# 볼륨에는 .partial로 쓴 뒤 rename해 API가 반쯤 쓴 파일을 읽지 않게 합니다. 파일은 root 소유 644(API의 node 사용자가 읽기 가능).
# geoip-writer는 앱 설정을 쓰지 않으므로 app.env 대신 빈 파일로 compose를 읽습니다.
gunzip -c "$archive" | APP_ENV=/dev/null compose "$color" "$dir" "$IMAGES_FILE" run --rm -T --no-deps geoip-writer sh -c '
	set -e
	cat >/data/geoip/dbip-city-lite.mmdb.partial
	chmod 644 /data/geoip/dbip-city-lite.mmdb.partial
	mv /data/geoip/dbip-city-lite.mmdb.partial /data/geoip/dbip-city-lite.mmdb
	ls -l /data/geoip/dbip-city-lite.mmdb
' >&2
log "geoip 볼륨에 저장했습니다."

if [[ -n "$restart" ]]; then
	trap 'rm -rf "$work"; clear_app_env' EXIT
	status=0
	switch_color "" "$dir" "$(file_get API_IMAGE "$IMAGES_FILE")" "$(file_get WEB_IMAGE "$IMAGES_FILE")" || status=$?
	((status == 0)) || die "반대 색으로 다시 올리지 못했습니다(종료 1이면 트래픽은 그대로 $color)." "$status"
	log "재기동 완료: $release 를 $(active_color) 로 전환했습니다."
else
	log "API는 다음 배포나 geoip.sh --restart 이후 새 파일을 읽습니다."
fi
