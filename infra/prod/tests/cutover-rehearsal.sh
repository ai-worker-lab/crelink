#!/usr/bin/env bash
# blue/green cutover 로컬 리허설(cutover.sh와 되돌리기). Docker·sops·age·curl·git만 필요. 저장소 루트에서:
#   infra/prod/tests/cutover-rehearsal.sh
# 운영 서버에서 0036이 할 일을 그대로 흉내 냅니다.
#   1) 운영 중인 옛 구조: 지금 운영 릴리스 커밋(CRELINK_LEGACY_REF, 기본 433dc88)의 infra/prod를 git archive로 꺼내 그 커밋의 deploy.sh로
#      crelink-prod(caddy·api·web)를 띄우고 geoip 볼륨에 표시 파일을 둡니다.
#   2) 새 릴리스(작업 트리의 infra/prod)를 ssh-entry.sh로 배포하면 edge가 없어 아무것도 바꾸지 않고 거부되는지 → cutover.sh --dry-run(무변경)
#   3) measure-gap.sh(대상마다 0.1초 간격)로 재면서 cutover.sh → 공백·상태(활성 색 blue, 옛 스택 삭제·볼륨 유지, geoip 데이터 이어 씀) 확인
#      → 다시 실행해도 그대로(멱등) → 옛 형식 릴리스로의 rollback 거부 → cutover 뒤 첫 배포(green)가 무중단인지
#   4) 재면서 cutover.sh --revert → 옛 스택 복귀·deploy 다시 거부 → 되돌리기 멱등 → 두 번째 cutover(되돌린 뒤 다시)
# 더미 이미지·격리 값은 tests/lib/harness.sh. 운영과 같은 이미지 쌍을 쓰는 cutover("-" "-")라 앱 버전은 바뀌지 않고 릴리스(APP_LABEL)만 바뀝니다.
# 끝나면(실패해도) 컨테이너·네트워크·볼륨·더미 이미지·임시 폴더를 지웁니다. 측정한 공백은 마지막에 "수치" 줄로 출력합니다.
# 종료 코드: 0 모든 확인이 기대와 일치, 1 불일치 있음.
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib/harness.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/harness.sh"
harness_init "crelink-cuttest-$$"
prod="$harness_prod"
legacy_ref="${CRELINK_LEGACY_REF:-433dc88}"
L="$(sha a0)" c1="$(sha c1)" c2="$(sha c2)" i0="$(sha e0)" bad="$(sha bd)"
export CRELINK_DRAIN_SECONDS=3
names() { sed -e "s|$CRELINK_IMAGE_PREFIX-||g" -e "s|$L|L|g" -e "s|$c1|c1|g" -e "s|$c2|c2|g" -e "s|$i0|i0|g"; }
rel() { printf '%s' "$CRELINK_ROOT/releases/$1"; }
last_log() { tail -n 1 "$CRELINK_ROOT/state/releases.log" | cut -f 2- | names | tr '\t' ' '; }
status_line() { SSH_ORIGINAL_COMMAND=status "$prod/ssh-entry.sh" </dev/null 2>&1 | head -n 2 | names | tr '\n' ' ' | sed 's/ $//'; }
marker_in() { docker exec "$(docker ps -q --filter "label=com.docker.compose.project=$run_id-$1" --filter label=com.docker.compose.service=api)" cat /data/geoip/marker 2>&1 || true; }
lt() { awk -v a="$1" -v b="$2" 'BEGIN { print (a + 0 < b + 0) ? "ok" : a }'; }
port_owner_project() { docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$(docker ps -q --filter "publish=$CRELINK_HTTP_PORT")" 2>/dev/null | sed "s|^$run_id-||"; }
entry_stdin() { # entry_stdin <묶음 이름> → stdin 파일(토큰 없음 + 묶음)
	{
		printf '\n'
		cat "$work/bundles/$1.tgz"
	} >"$work/stdin.$1"
	printf '%s' "$work/stdin.$1"
}
show_gap() { grep -E '^(go|links)\.localhost/|^전체' "$1" | sed 's/^/   | /'; }

echo "== 준비: 더미 이미지, 옛 형식($legacy_ref)·새 형식(작업 트리) 릴리스 묶음"
dummy_build api "$i0" i0 1
dummy_build web "$i0" i0 1
dummy_build api "$bad" bad 0 # 헬스 실패 변형
bundle L r0 "$server_pub" "$(legacy_source "$legacy_ref")"
bundle c1 r1 "$server_pub"
bundle c2 r2 "$server_pub"
install_release L "$L"
result "옛 릴리스($legacy_ref)는 blue/green 이전 형식(name: crelink-prod, caddy 서비스)" '있음 있음' \
	"$(grep -q '^name: crelink-prod' "$(rel "$L")/compose.yaml" && echo 있음 || echo 없음) $(grep -q '^  caddy:' "$(rel "$L")/compose.yaml" && echo 있음 || echo 없음)"

echo "== 운영 중인 옛 구조 만들기(그 커밋의 deploy.sh, project $CRELINK_LEGACY_PROJECT)"
run env COMPOSE_PROJECT_NAME="$CRELINK_LEGACY_PROJECT" "$(rel "$L")/deploy.sh" "$L" "$i0" "$i0"
result '옛 deploy.sh 종료·마지막 줄' '0 L api:i0 web:i0' "$CODE $(tail -n 1 "$LAST_OUT" | names)"
result '옛 스택 응답(127.0.0.1:포트)' '302 api i0 r0 / web i0' "$(probe)"
docker run --rm -v "$CRELINK_GEOIP_VOLUME:/d" alpine:3.24 sh -c 'echo keep >/d/marker'
result '옛 스택 api가 geoip 볼륨을 읽음' keep "$(marker_in prod)"

echo "== cutover 전: 새 릴리스 배포는 아무것도 바꾸지 않고 거부"
before="$(snapshot)"
ssh_entry "deploy $c1 - -" c1
result "cutover 전 'deploy c1 - -' 거부(종료 1, 런북 cutover 안내)" '1 있음 있음' "$CODE $(has 'edge가 준비되지 않았습니다') $(has '14. blue/green cutover')"
result '거부 뒤 상태 그대로' "$before" "$(snapshot)"
result '거부 뒤 옛 스택 응답 그대로' '302 api i0 r0 / web i0' "$(probe)"
result '거부했지만 릴리스 폴더는 풀려 있음(cutover.sh가 씀)' 있음 "$([[ -x "$(rel "$c1")/cutover.sh" ]] && echo 있음 || echo 없음)"
result 'status(cutover 전)' 'release L color -' "$(status_line)"

echo "== cutover.sh --dry-run: 점검·할 일만"
run "$(rel "$c1")/cutover.sh" --dry-run "$c1"
result 'dry-run 종료 0, 할 일 출력, FAIL 없음' '0 있음 없음' "$CODE $(has '== 할 일') $(has 'FAIL')"
result 'dry-run 뒤 상태 그대로' "$before" "$(snapshot)"
result 'dry-run은 네트워크를 만들지 않음' 없음 "$(docker network inspect "$CRELINK_EDGE_NETWORK" >/dev/null 2>&1 && echo 있음 || echo 없음)"

echo "== cutover 실패 경로: 점검 실패(없는 이미지)·blue 헬스 실패 → 옛 스택 그대로"
run "$(rel "$c1")/cutover.sh" "$c1" "$(sha dd)" -
result '없는 이미지 → 사전 점검 FAIL, 종료 1' '1 있음 있음' "$CODE $(has 'FAIL') $(has '아무것도 바꾸지 않았습니다')"
result '점검 실패 뒤 상태 그대로(네트워크도 안 만듦)' "$before 없음" "$(snapshot) $(docker network inspect "$CRELINK_EDGE_NETWORK" >/dev/null 2>&1 && echo 있음 || echo 없음)"
run "$(rel "$c1")/cutover.sh" "$c1" "$bad" -
result 'blue 헬스 실패 → 종료 1, blue를 내림' '1 있음' "$CODE $(has 'blue가 헬스를 통과하지 못했습니다')"
result '헬스 실패 뒤 운영 상태 그대로(edge 설정 파일만 써 둠)' "${before% | conf *}" "$(snapshot | sed 's/ | conf .*//')"
result '헬스 실패 뒤 blue 컨테이너 없음, 옛 스택 응답 그대로' ' | 302 api i0 r0 / web i0' "$(project_states blue) | $(probe)"

echo "== cutover #1 (measure-gap 대상마다 초당 10회)"
measured "$work/gap-cutover1.txt" "$(rel "$c1")/cutover.sh" "$c1"
gap_cutover1="$GAP"
show_gap "$work/gap-cutover1.txt"
result 'cutover #1 종료' 0 "$CODE"
result 'cutover #1 공백 5초 미만' ok "$(lt "${GAP#* }" 5)"
result 'cutover 뒤 status' 'release c1 color blue' "$(status_line)"
result 'cutover 뒤 images.env는 옛 운영 이미지 그대로' 'api:i0 web:i0' "$(printf '%s %s' "$(image_of API_IMAGE)" "$(image_of WEB_IMAGE)" | names)"
result 'cutover 뒤 releases.log 마지막 줄' 'deploy L c1 api:i0 web:i0' "$(last_log)"
result 'cutover 뒤 응답(edge → blue, 새 릴리스 비밀값 r1)' '302 api i0 r1 / web i0' "$(probe)"
result '포트를 쥔 것은 edge' edge "$(port_owner_project)"
result "옛 $CRELINK_LEGACY_PROJECT 컨테이너·네트워크 없음" ' 없음' "$(project_states prod) $(docker network inspect "${CRELINK_LEGACY_PROJECT}_default" >/dev/null 2>&1 && echo 있음 || echo 없음)"
result 'geoip 볼륨 유지, blue api가 같은 데이터를 읽음' keep "$(marker_in blue)"
result 'edge·blue 실행 중' 'caddy:running / api:running web:running' "$(project_states edge) / $(project_states blue)"
result 'edge 설정 upstreams.caddy = blue' 'to api-blue:3000 to web-blue:3000' "$(grep -o 'to [a-z]*-[a-z]*:3000' "$CRELINK_ROOT/edge/conf/upstreams.caddy" | tr '\n' ' ' | sed 's/ $//')"
result 'edge compose는 서버 고정 폴더에 복사됨' 같음 "$(cmp -s "$prod/edge/compose.yaml" "$CRELINK_ROOT/edge/compose.yaml" && echo 같음 || echo 다름)"
result 'edge 호스트 포트는 127.0.0.1:<포트>→80 하나(관리 API 비공개)' "80/tcp -> 127.0.0.1:$CRELINK_HTTP_PORT" \
	"$(docker port "$(docker ps -q --filter "label=com.docker.compose.project=$run_id-edge")" | tr '\n' ' ' | sed 's/ *$//')"
result 'blue web의 API 주소는 같은 색 별칭' 'API_INTERNAL_URL=http://api-blue:3000' \
	"$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$(docker ps -q --filter "label=com.docker.compose.project=$run_id-blue" --filter label=com.docker.compose.service=web)" | grep '^API_INTERNAL_URL=')"

echo "== cutover 다시 실행(멱등)·옛 형식 릴리스로 rollback 거부"
before="$(snapshot)"
run "$(rel "$c1")/cutover.sh" "$c1"
result 'cutover 다시 실행 → 이미 완료(종료 0)' '0 있음' "$CODE $(has '이미 cutover됨')"
result '다시 실행 뒤 상태 그대로' "$before" "$(snapshot)"
ssh_entry rollback
result "rollback(기본 대상 L = 옛 형식) 거부" '1 있음 있음' "$CODE $(has 'blue/green 이전 형식') $(has 'cutover.sh --revert')"
result 'rollback 거부 뒤 상태 그대로' "$before" "$(snapshot)"

echo "== cutover 뒤 첫 배포(green, 무중단이어야 함)"
# shellcheck disable=SC2016 # 안쪽 bash가 펼침
measured "$work/gap-deploy.txt" env SSH_ORIGINAL_COMMAND="deploy $c2 - -" bash -c 'exec "$0" <"$1"' "$prod/ssh-entry.sh" "$(entry_stdin c2)"
gap_deploy="$GAP"
show_gap "$work/gap-deploy.txt"
result "'deploy c2 - -' 종료·마지막 줄" '0 c2 api:i0 web:i0' "$CODE $(tail -n 1 "$LAST_OUT" | names)"
result '배포 중 실패(5xx·무응답) 0' 0 "${GAP%% *}"
result '배포 뒤 green 서비스, blue 정지(컨테이너 유지)' 'green 302 api i0 r2 / web i0 | api:exited web:exited' "$(color_of) $(probe) | $(project_states blue)"

echo "== 되돌리기 --dry-run"
before="$(snapshot)"
run "$(rel "$c2")/cutover.sh" --revert --dry-run
result 'revert dry-run 종료 0, 대상 L, 할 일 출력' '0 있음 있음' "$CODE $(has "옛 $L") $(has '== 할 일')"
result 'revert dry-run 뒤 상태 그대로' "$before" "$(snapshot)"

echo "== 되돌리기(cutover.sh --revert)"
measured "$work/gap-revert.txt" "$(rel "$c2")/cutover.sh" --revert
gap_revert="$GAP"
show_gap "$work/gap-revert.txt"
result 'revert 종료' 0 "$CODE"
result 'revert 공백 5초 미만' ok "$(lt "${GAP#* }" 5)"
result 'revert 뒤 status' 'release L color -' "$(status_line)"
result 'revert 뒤 releases.log 마지막 줄' 'rollback c2 L api:i0 web:i0' "$(last_log)"
result 'revert 뒤 응답(옛 caddy → 옛 api·web, 비밀값 r0)' '302 api i0 r0 / web i0' "$(probe)"
result '포트를 쥔 것은 옛 스택' prod "$(port_owner_project)"
result 'revert 뒤 옛 스택 실행, edge·두 색 정지(컨테이너 유지)' 'api:running caddy:running web:running | caddy:exited | api:exited web:exited | api:exited web:exited' \
	"$(project_states prod) | $(project_states edge) | $(project_states blue) | $(project_states green)"
result 'revert 뒤 옛 api가 같은 geoip 데이터를 읽음' keep "$(marker_in prod)"
before="$(snapshot)"
ssh_entry "deploy $c2 - -" c2
result "revert 뒤 'deploy c2 - -' 다시 거부" '1 있음' "$CODE $(has 'edge가 준비되지 않았습니다')"
result 'revert 뒤 거부, 상태 그대로' "$before" "$(snapshot)"
run "$(rel "$c2")/cutover.sh" --revert
result 'revert 다시 실행 → 이미 되돌림(종료 0)' '0 있음' "$CODE $(has '이미 되돌림')"
result 'revert 다시 실행 뒤 상태 그대로' "$before" "$(snapshot)"

echo "== cutover #2 (되돌린 뒤 다시)"
measured "$work/gap-cutover2.txt" "$(rel "$c2")/cutover.sh" "$c2"
gap_cutover2="$GAP"
show_gap "$work/gap-cutover2.txt"
result 'cutover #2 종료' 0 "$CODE"
result 'cutover #2 공백 5초 미만' ok "$(lt "${GAP#* }" 5)"
result 'cutover #2 뒤 상태·응답' 'release c2 color blue | 302 api i0 r2 / web i0 | deploy L c2 api:i0 web:i0' "$(status_line) | $(probe) | $(last_log)"
result 'cutover #2 뒤 옛 스택 없음, edge·blue 실행' ' | caddy:running | api:running web:running' "$(project_states prod) | $(project_states edge) | $(project_states blue)"
result '평문 비밀값이 서버 폴더에 남지 않음' '' "$(grep -rl -F "$marker" "$CRELINK_ROOT" "$CRELINK_ETC" "$CRELINK_RUN_DIR" 2>/dev/null | names || true)"

echo
echo "수치(실패 수, 최장 공백 초; 대상마다 0.1초 간격): cutover#1 $gap_cutover1 / 첫 배포 $gap_deploy / 되돌리기 $gap_revert / cutover#2 $gap_cutover2"
harness_finish "cutover 리허설"
