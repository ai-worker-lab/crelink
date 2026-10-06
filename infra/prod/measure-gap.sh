#!/usr/bin/env bash
# 배포 공백 측정. 스택 입구(caddy, 기본 http://127.0.0.1:${CRELINK_HTTP_PORT:-18080})에 대상(Host + 경로)마다 초당 N회 요청을 보내고,
# 끝나면 대상별 요청·실패 수, 실패 코드, 실패 구간 수, 최장 연속 실패 구간(공백)을 출력합니다. bash·curl(+coreutils)만 씁니다.
#   사용법: measure-gap.sh [-r 초당 횟수] [-d 초] [-t 초] [-m 초] [-u 기준 URL] [대상 ...] [-- 명령 [인자 ...]]
#   -r  대상마다 초당 요청 수(기본 5, 1~50). 요청은 앞 요청의 응답을 기다리지 않고 일정 간격으로 보냅니다.
#   -d  측정 시간(초). 0(기본)이면 Ctrl-C(SIGINT)·SIGTERM을 받을 때까지. "-- 명령"을 주면 쓰지 않습니다.
#   -t  "-- 명령"이 끝난 뒤 더 재는 시간(초, 기본 3).
#   -m  요청 하나의 제한 시간(초, 기본 30. curl --max-time). 넘으면 실패(000)로 셉니다.
#   -u  기준 URL(기본 http://127.0.0.1:${CRELINK_HTTP_PORT:-18080}).
#   대상 = <Host 헤더>[/경로]. 기본 "${CRELINK_SHORT_HOST:-go.shaul.kr}/zzzz"(api) "${CRELINK_WEB_HOST:-links.shaul.kr}/privacy"(web).
#   -- 명령: 측정을 시작한 뒤 명령을 실행하고, 명령이 끝나면 -t초 더 재고 마칩니다(로컬에서 배포 명령을 감쌀 때).
# 성공 = HTTP 응답 코드 100~499(302·404 포함). 실패 = 응답 없음(연결 실패·제한 시간 초과, 000) 또는 5xx.
# 공백 = 연속 실패 구간의 길이 = 첫 실패 요청을 보낸 시각부터 그 뒤 첫 성공 요청을 보낸 시각까지(끝까지 실패면 마지막 실패 + 간격).
# 서버에서: ssh home-server /opt/crelink/current/measure-gap.sh -d 180 (런북 "6-1. 배포 공백 측정")
# 종료 코드: 0 실패 없음, 1 실패 있음(또는 감싼 명령 실패), 2 사용법 오류.
set -euo pipefail

usage() {
	sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
	exit 2
}
die() {
	printf '[measure-gap] 오류: %s\n' "$1" >&2
	exit 2
}

rate=5 duration=0 tail_seconds=3 max_time=30
base="http://127.0.0.1:${CRELINK_HTTP_PORT:-18080}"
targets=()
command=()
while (($# > 0)); do
	case "$1" in
	-r | -d | -t | -m | -u)
		(($# >= 2)) || usage
		case "$1" in
		-r) rate="$2" ;;
		-d) duration="$2" ;;
		-t) tail_seconds="$2" ;;
		-m) max_time="$2" ;;
		-u) base="${2%/}" ;;
		esac
		shift 2
		;;
	-h | --help) usage ;;
	--)
		shift
		command=("$@")
		break
		;;
	-*) usage ;;
	*)
		targets+=("$1")
		shift
		;;
	esac
done
if ! [[ "$rate" =~ ^[0-9]+$ ]] || ((rate < 1 || rate > 50)); then die "-r는 1~50 정수입니다: $rate"; fi
[[ "$duration" =~ ^[0-9]+$ ]] || die "-d는 0 이상 정수입니다: $duration"
[[ "$tail_seconds" =~ ^[0-9]+$ ]] || die "-t는 0 이상 정수입니다: $tail_seconds"
if ! [[ "$max_time" =~ ^[0-9]+$ ]] || ((max_time < 1)); then die "-m은 1 이상 정수입니다: $max_time"; fi
[[ "$base" =~ ^https?://[^/]+$ ]] || die "-u는 경로 없는 http(s) URL입니다: $base"
if ((${#targets[@]} == 0)); then
	targets=("${CRELINK_SHORT_HOST:-go.shaul.kr}/zzzz" "${CRELINK_WEB_HOST:-links.shaul.kr}/privacy")
fi
for t in "${targets[@]}"; do
	[[ "$t" =~ ^[A-Za-z0-9.-]+(:[0-9]+)?(/[^[:space:]]*)?$ ]] || die "대상은 <Host>[/경로]입니다: $t"
done
command -v curl >/dev/null || die "curl이 없습니다."

# 마이크로초 시각. bash 5는 $EPOCHREALTIME(프로세스 없음), 그 밖(macOS bash 3.2)은 date +%s%N(GNU·macOS 26 date).
now_us() {
	if [[ -n "${EPOCHREALTIME:-}" ]]; then
		printf '%s' "${EPOCHREALTIME/[.,]/}"
	else
		local ns
		ns="$(date +%s%N)"
		printf '%s' "${ns%???}"
	fi
}
[[ "$(now_us)" =~ ^[0-9]{16}$ ]] || die "마이크로초 시각을 얻지 못했습니다(bash 5 또는 date +%s%N 필요)."
secs() { # secs <마이크로초> → "12.3"(0.1초 단위, 반올림)
	local d=$((($1 + 50000) / 100000))
	printf '%d.%d' $((d / 10)) $((d % 10))
}
ms3() { # ms3 <마이크로초> → "0.012"(초, 밀리초 단위 버림)
	printf '%d.%03d' $(($1 / 1000000)) $(($1 % 1000000 / 1000))
}

work="$(mktemp -d)"
cmd_pid=""
cleanup() {
	if [[ -n "$cmd_pid" ]]; then kill "$cmd_pid" 2>/dev/null || true; fi
	rm -rf "$work"
}
trap cleanup EXIT
stop=0
trap 'stop=1' INT TERM

interval_us=$((1000000 / rate))
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '[measure-gap] %s 시작: %s, 대상 %s, 대상마다 초당 %d회, 요청 제한 %d초\n' \
	"$started_at" "$base" "${targets[*]}" "$rate" "$max_time" >&2

# 한 요청: "<순번> <보낸 시각(µs)> <HTTP 코드> <응답 시간(초)>"을 대상 파일에 덧붙입니다(백그라운드라 다음 요청을 막지 않음).
probe() { # probe <대상 번호> <순번> <보낸 시각>
	local t="${targets[$1]}" host path out
	host="${t%%/*}"
	path="/${t#*/}"
	[[ "$t" == */* ]] || path=/
	out="$(curl -s -o /dev/null --max-time "$max_time" -w '%{http_code} %{time_total}' -H "Host: $host" "$base$path" 2>/dev/null)" || true
	[[ "$out" =~ ^[0-9]{3}\ [0-9.]+$ ]] || out="000 $max_time"
	printf '%s %s %s\n' "$2" "$3" "$out" >>"$work/$1.log"
}

t0="$(now_us)"
deadline=0
if ((${#command[@]} > 0)); then
	"${command[@]}" &
	cmd_pid=$!
elif ((duration > 0)); then
	deadline=$((t0 + duration * 1000000))
fi
cmd_status=""
seq_no=0
while ((stop == 0)); do
	now="$(now_us)"
	if [[ -n "$cmd_pid" ]] && ! kill -0 "$cmd_pid" 2>/dev/null; then
		cmd_status=0
		wait "$cmd_pid" || cmd_status=$?
		cmd_pid=""
		deadline=$((now + tail_seconds * 1000000))
		printf '[measure-gap] 명령 종료(코드 %d, +%s초). %d초 더 잽니다.\n' "$cmd_status" "$(secs $((now - t0)))" "$tail_seconds" >&2
	fi
	if ((deadline > 0 && now >= deadline)); then break; fi
	at=$((t0 + seq_no * interval_us))
	if ((at > now)); then
		wait_us=$((at - now))
		sleep "$((wait_us / 1000000)).$(printf '%06d' $((wait_us % 1000000)))" || true
		continue
	fi
	for i in "${!targets[@]}"; do
		probe "$i" "$seq_no" "$at" &
	done
	seq_no=$((seq_no + 1))
done
trap - INT TERM
end_us="$(now_us)"
if [[ -n "$cmd_pid" ]]; then # Ctrl-C로 명령보다 먼저 끝남
	kill "$cmd_pid" 2>/dev/null || true
	wait "$cmd_pid" 2>/dev/null || true
	cmd_pid=""
	cmd_status=interrupted
fi
printf '[measure-gap] 요청 %d회 보냄(+%s초). 남은 응답을 기다립니다(최대 %d초).\n' "$seq_no" "$(secs $((end_us - t0)))" "$max_time" >&2
wait

total_failures=0
longest_us=0
printf '\n측정 %s부터 %s초, 대상마다 %s초 간격\n' "$started_at" "$(secs $((end_us - t0)))" "$(ms3 "$interval_us")"
for i in "${!targets[@]}"; do
	log_file="$work/$i.log"
	touch "$log_file"
	n=0 fails=0 gaps=0 gap_start=-1 last_fail=0 max_gap=0 max_gap_at=0 max_gap_open=0 slowest=0
	while read -r _ at code took; do
		n=$((n + 1))
		if [[ "$code" == 000 || "$code" == 5?? ]]; then
			fails=$((fails + 1))
			last_fail="$at"
			if ((gap_start < 0)); then
				gap_start="$at"
				gaps=$((gaps + 1))
			fi
			printf '%s\n' "$code" >>"$work/$i.codes"
		else
			# curl time_total("0.012345")을 마이크로초로
			frac="${took#*.}000000"
			[[ "$took" == *.* ]] || frac=000000
			us=$((10#${took%%.*} * 1000000 + 10#${frac:0:6}))
			((us <= slowest)) || slowest="$us"
			if ((gap_start >= 0)); then
				if ((at - gap_start > max_gap)); then max_gap=$((at - gap_start)) max_gap_at="$gap_start" max_gap_open=0; fi
				gap_start=-1
			fi
		fi
	done < <(sort -n -k1,1 "$log_file")
	if ((gap_start >= 0)) && ((last_fail + interval_us - gap_start > max_gap)); then
		max_gap=$((last_fail + interval_us - gap_start)) max_gap_at="$gap_start" max_gap_open=1
	fi
	codes=""
	if [[ -s "$work/$i.codes" ]]; then
		while read -r count code; do codes+="${codes:+ }${code}×${count}"; done < <(sort "$work/$i.codes" | uniq -c)
	fi
	gap_text=없음
	if ((gaps > 0)); then
		gap_text="$(secs "$max_gap")초(+$(secs $((max_gap_at - t0)))초부터$( ((max_gap_open == 0)) || printf ', 측정 끝까지 계속'))"
	fi
	slow_text=-
	if ((n > fails)); then slow_text="$(ms3 "$slowest")초"; fi
	printf '%s: 요청 %d, 실패 %d(%s), 실패 구간 %d개, 최장 공백 %s, 성공 응답 최장 %s\n' \
		"${targets[$i]}" "$n" "$fails" "${codes:--}" "$gaps" "$gap_text" "$slow_text"
	total_failures=$((total_failures + fails))
	((max_gap <= longest_us)) || longest_us="$max_gap"
done
printf '전체: 실패 %d, 최장 공백 %s초\n' "$total_failures" "$(secs "$longest_us")"
if [[ -n "$cmd_status" ]]; then
	printf '감싼 명령 종료 코드: %s\n' "$cmd_status"
fi
if ((total_failures > 0)) || [[ -n "$cmd_status" && "$cmd_status" != 0 ]]; then
	exit 1
fi
