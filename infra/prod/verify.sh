#!/usr/bin/env bash
# 운영 주소 검사. 배포 대상 서버에서 공개 주소(Cloudflare → Tunnel → 스택 Caddy)를 실제로 불러 봅니다.
#   사용법: /opt/crelink/current/verify.sh   (워크플로는 ssh-entry.sh의 verify 명령으로 부름)
# GitHub 호스트 러너에서 부르지 않는 이유: Cloudflare가 데이터센터 IP의 자동화 요청을 403으로 막아 앱 상태와 무관하게 실패합니다.
# 주소는 이 릴리스의 secrets/<대상>.sops.env의 평문 키(WEB_URL·SHORT_LINK_BASE_URL)에서 읽습니다(복호화 불필요).
# 종료 코드: 0 모두 기대대로, 1 하나라도 다름.
set -uo pipefail
# shellcheck source=SCRIPTDIR/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
file="$dir/secrets/$(target_name).sops.env"
web="$(file_get WEB_URL "$file")"
short="$(file_get SHORT_LINK_BASE_URL "$file")"
[[ "$web" == https://* && "$short" == https://* ]] || die "$file 에서 WEB_URL·SHORT_LINK_BASE_URL을 읽지 못했습니다."

fail=0
check() { # check <이름> <기대> <실제>
	if [[ "$3" == "$2" ]]; then
		printf 'ok   %s (%s)\n' "$1" "$3"
	else
		printf 'FAIL %s: 기대 %s, 실제 %s\n' "$1" "$2" "$3"
		fail=1
	fi
}
code() { curl -s -o /dev/null --max-time 20 -w '%{http_code}' "$1"; }

# Tunnel·Caddy 재연결 직후 잠깐 실패할 수 있어 첫 주소는 최대 60초 기다립니다.
for _ in $(seq 12); do [[ "$(code "$web/")" == 200 ]] && break; sleep 5; done
check "웹 /" 200 "$(code "$web/")"
check "웹 /privacy" 200 "$(code "$web/privacy")"
check "웹 BFF health" 200 "$(code "$web/api/backend/api/health")"
check "단축 없는 주소 302" 302 "$(code "$short/zzz-e2e-none")"
check "단축 → notice" "$web/notice?reason=link_not_found" "$(curl -s -o /dev/null --max-time 20 -w '%{redirect_url}' "$short/zzz-e2e-none")"
# 광고·크리에이터 배너 클릭 경로(docs/specs/crelink-ad-banner.md `클릭`): Caddy가 API로 넘기고 없는 배너는 link_unavailable 안내로 302.
for path in /b/zzzzzzzzzz /a/zzzzzzzzzz/zzzzzzzzzz; do
	check "배너 클릭 $path 302" 302 "$(code "$short$path")"
	check "배너 클릭 $path → notice" "$web/notice?reason=link_unavailable" \
		"$(curl -s -o /dev/null --max-time 20 -w '%{redirect_url}' "$short$path")"
done
check "API 직접 접근 차단" 404 "$(code "$short/api/health")"
exit "$fail"
