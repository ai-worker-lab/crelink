#!/usr/bin/env bash
# deploy 사용자의 SSH forced command(~deploy/.ssh/authorized_keys의 command="..."). bootstrap.sh가 /usr/local/lib/crelink/ssh-entry.sh로 설치합니다.
# CI 배포 키로는 아래 명령만 실행할 수 있고 셸·포트 포워딩은 열리지 않습니다(authorized_keys의 restrict).
#   deploy <릴리스 SHA> <API SHA|-> <웹 SHA|->
#       stdin: 첫 줄 "<GHCR 사용자> <GHCR 토큰>"(빈 줄이면 로그인 안 함), 이어서 infra/prod의 tar.gz. releases/<SHA>에 풀고 그 안의 deploy.sh를 실행합니다.
#   rollback [릴리스 SHA]
#       stdin: 첫 줄 "<GHCR 사용자> <GHCR 토큰>"(이미지가 서버에 없을 때만 씀). 지금 릴리스의 rollback.sh를 실행합니다.
#   status
#       지금 릴리스, 활성 색(blue|green, blue/green 이전 서버는 -)·이미지와 releases.log 마지막 5줄.
#   verify
#       지금 릴리스의 verify.sh(공개 주소 검사, 이 서버에서 Cloudflare를 거쳐 호출)를 실행합니다.
# 이 파일을 바꾸면 서버에서 bootstrap.sh를 다시 실행해야 반영됩니다(워크플로가 바꿀 수 없음).
set -euo pipefail

CRELINK_ROOT="${CRELINK_ROOT:-/opt/crelink}"
die() {
	printf '[ssh-entry] 오류: %s\n' "$1" >&2
	exit 1
}
is_sha() { [[ "$1" =~ ^[0-9a-f]{7,40}$ ]]; }
# 토큰은 환경변수로만 넘깁니다(명령줄·로그에 남기지 않음). sshd는 클라이언트 환경변수를 받지 않으므로 stdin으로 받습니다.
GHCR_PULL_USER=""
GHCR_PULL_TOKEN=""
read_token() { read -r GHCR_PULL_USER GHCR_PULL_TOKEN || true; }

read -r -a cmd <<<"${SSH_ORIGINAL_COMMAND:-}"
case "${cmd[0]:-}" in
deploy)
	((${#cmd[@]} == 4)) || die "사용법: deploy <릴리스 SHA> <API SHA|-> <웹 SHA|->"
	is_sha "${cmd[1]}" || die "릴리스 SHA 형식이 아닙니다."
	for s in "${cmd[2]}" "${cmd[3]}"; do [[ "$s" == - ]] || is_sha "$s" || die "이미지 SHA 형식이 아닙니다: $s"; done
	read_token
	release="$CRELINK_ROOT/releases/${cmd[1]}"
	staging="$(mktemp -d "$CRELINK_ROOT/releases/.incoming.XXXXXX")"
	trap 'rm -rf "$staging"' EXIT
	tar -xzf - -C "$staging" --no-same-owner || die "릴리스 묶음을 풀지 못했습니다."
	[[ -x "$staging/deploy.sh" && -f "$staging/compose.yaml" ]] || die "릴리스 묶음에 deploy.sh·compose.yaml이 없습니다."
	chmod 755 "$staging"
	# 같은 SHA를 다시 배포하면 폴더를 새 묶음으로 바꿉니다(같은 커밋이라 내용도 같음).
	rm -rf "$release.old"
	if [[ -d "$release" ]]; then mv "$release" "$release.old"; fi
	mv "$staging" "$release"
	rm -rf "$release.old"
	GHCR_PULL_USER="$GHCR_PULL_USER" GHCR_PULL_TOKEN="$GHCR_PULL_TOKEN" exec "$release/deploy.sh" "${cmd[1]}" "${cmd[2]}" "${cmd[3]}"
	;;
rollback)
	((${#cmd[@]} <= 2)) || die "사용법: rollback [릴리스 SHA]"
	((${#cmd[@]} == 1)) || is_sha "${cmd[1]}" || die "릴리스 SHA 형식이 아닙니다."
	read_token
	[[ -x "$CRELINK_ROOT/current/rollback.sh" ]] || die "운영 중인 릴리스가 없습니다."
	GHCR_PULL_USER="$GHCR_PULL_USER" GHCR_PULL_TOKEN="$GHCR_PULL_TOKEN" exec "$CRELINK_ROOT/current/rollback.sh" "${cmd[@]:1}"
	;;
status)
	printf 'release %s\n' "$(basename "$(readlink "$CRELINK_ROOT/current" 2>/dev/null || echo -)")"
	printf 'color %s\n' "$(tr -d '[:space:]' 2>/dev/null <"$CRELINK_ROOT/state/active-color" || echo -)"
	cat "$CRELINK_ROOT/state/images.env" 2>/dev/null || true
	tail -n 5 "$CRELINK_ROOT/state/releases.log" 2>/dev/null || true
	;;
verify)
	((${#cmd[@]} == 1)) || die "사용법: verify"
	[[ -x "$CRELINK_ROOT/current/verify.sh" ]] || die "운영 중인 릴리스에 verify.sh가 없습니다."
	exec "$CRELINK_ROOT/current/verify.sh"
	;;
*)
	die "허용되지 않은 명령입니다. deploy | rollback | status | verify"
	;;
esac
