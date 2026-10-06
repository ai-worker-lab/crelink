#!/usr/bin/env bash
# DB-IP IP to City Lite(MMDB, CC BY 4.0)를 받아 크리링 geoip 볼륨(/data/geoip/dbip-city-lite.mmdb)에 넣습니다. 서버 /opt/crelink에서 실행.
# 사용법: ./geoip.sh [--restart]
#   규칙은 scripts/geoip.mjs와 같습니다: 이번 달 파일이 아직 없을 수 있어 이번 달부터 두 달 전까지 차례로 시도(404면 이전 달).
#   API는 기동할 때 파일을 읽으므로 --restart를 주면 api를 재시작하고 헬스를 기다립니다(몇 초 단축 주소 중단). 주지 않으면 다음 배포부터 적용.
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
require_env_file

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
gunzip -c "$archive" | compose run --rm -T --no-deps geoip-writer sh -c '
	set -e
	cat >/data/geoip/dbip-city-lite.mmdb.partial
	chmod 644 /data/geoip/dbip-city-lite.mmdb.partial
	mv /data/geoip/dbip-city-lite.mmdb.partial /data/geoip/dbip-city-lite.mmdb
	ls -l /data/geoip/dbip-city-lite.mmdb
' >&2
log "geoip 볼륨에 저장했습니다."

if [[ -n "$restart" ]]; then
	compose restart api
	wait_api_healthy || die "재시작 뒤 API가 healthy가 되지 않았습니다." 2
	log "API 재시작 완료"
else
	log "API는 다음 배포나 ./geoip.sh --restart 이후 새 파일을 읽습니다."
fi
