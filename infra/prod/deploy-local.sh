#!/usr/bin/env bash
# GitHub Actions 없이 운영자 컴퓨터에서 배포합니다(Actions 사용량 한도 초과·장애 때). `.github/workflows/deploy.yml`과 같은 순서입니다.
#   사용법: infra/prod/deploy-local.sh [--force] [--dry-run] [커밋(기본 origin/main)]
# 순서: 대상 커밋 확인 → 변경 영역 판별(태그 deploy/prod-api·deploy/prod-web·deploy/prod와 비교, deploy.yml과 같은 규칙)
#       → 대상 서버에서 바뀐 영역 이미지를 직접 빌드(서버 플랫폼 그대로, GHCR에 올리지 않음)
#       → infra/prod 묶음을 서버의 ssh-entry.sh(deploy 사용자) `deploy`로 넘김(레지스트리 로그인 없이 서버에 있는 이미지 사용)
#       → 운영 주소 검사(`verify`), 실패하면 `rollback` → 성공하면 배포 기록 태그를 옮겨 push.
# 필요: 대상 서버에 `ssh <host>`로 root(또는 sudo 가능한 계정) 접속(Tailscale), 로컬 git·jq·gh(로그인, GitHub variables 읽기).
# Sentry: 이미지 빌드 인자는 GitHub variables(SENTRY_ORG·SENTRY_PROJECT_*·SENTRY_WEB_DSN, 공개 값)를 `gh variable get`으로 읽습니다.
# 소스맵 업로드 토큰(secret)은 GitHub 밖에서 읽을 수 없어 업로드하지 않습니다(SENTRY_UPLOAD=no, 오류 이벤트·release는 그대로).
# 이렇게 만든 이미지는 그 서버에만 있습니다. 같은 이미지로 다른 대상에 배포하거나 GitHub Actions 롤백(GHCR pull)에 쓰려면 다시 빌드해야 합니다.
# 런북: infra/docs/prod-runbook.md "GitHub Actions 없이 배포".
# shellcheck disable=SC2029 # 원격 명령 인자는 이 컴퓨터에서 펼쳐 보냅니다(SHA·고정 경로뿐, 서버 forced command가 형식을 다시 검사).
set -euo pipefail

force=false
dry_run=false
ref=origin/main
while (($#)); do
	case "$1" in
	--force) force=true ;;
	--dry-run) dry_run=true ;;
	-h | --help)
		sed -n '2,13p' "$0"
		exit 0
		;;
	-*)
		echo "알 수 없는 옵션: $1" >&2
		exit 2
		;;
	*) ref="$1" ;;
	esac
	shift
done

root="$(git rev-parse --show-toplevel)"
cd "$root"
log() { printf '[deploy-local] %s\n' "$*"; }
die() {
	printf '[deploy-local] 오류: %s\n' "$*" >&2
	exit 1
}
for tool in git jq gh ssh tar; do command -v "$tool" >/dev/null || die "$tool 이 필요합니다."; done

git fetch --quiet --tags --force origin
sha="$(git rev-parse --verify "$ref^{commit}")" || die "커밋을 찾지 못했습니다: $ref"
git merge-base --is-ancestor "$sha" origin/main || die "$sha 는 origin/main에 없습니다(머지된 커밋만 배포합니다)."
log "배포 커밋: $sha ($(git log -1 --format=%s "$sha"))"

# deploy.yml plan과 같은 변경 판별. 바뀌지 않은 영역의 이미지는 마지막 성공 배포 태그의 커밋입니다.
decide() { # decide <태그> <패턴> → "true <이미지 SHA>" | "false <이미지 SHA>"
	local base
	base="$(git rev-parse -q --verify "refs/tags/$1^{commit}" || true)"
	if [[ "$force" == true || -z "$base" ]] || git diff --name-only "$base" "$sha" | grep -Eq "$2"; then
		printf 'true %s\n' "$sha"
	else
		printf 'false %s\n' "$base"
	fi
}
read -r api_build api_image < <(decide deploy/prod-api '^(apps/api/|packages/shared/|pnpm-lock\.yaml$|\.dockerignore$)')
read -r web_build web_image < <(decide deploy/prod-web '^(apps/web/|packages/shared/|packages/design-tokens/|RELEASES\.md$|pnpm-lock\.yaml$|\.dockerignore$)')
read -r release _ < <(decide deploy/prod '^(apps/api/|apps/web/|packages/shared/|packages/design-tokens/|RELEASES\.md$|pnpm-lock\.yaml$|\.dockerignore$|infra/prod/)')
log "api 새로 빌드: $api_build (이미지 ${api_image:0:7}) / web 새로 빌드: $web_build (이미지 ${web_image:0:7}) / 릴리스 배포: $release"
[[ "$release" == true ]] || {
	log "배포할 변경이 없습니다(--force로 강제)."
	exit 0
}

prefix=ghcr.io/ai-worker-lab/crelink
var() { gh variable get "$1" 2>/dev/null || true; }
sentry_org="$(var SENTRY_ORG)"
# macOS 기본 bash(3.2)에는 mapfile이 없어 공백으로 나눕니다(호스트 이름에는 공백이 없음).
# shellcheck disable=SC2207
targets=($(git show "$sha:infra/prod/targets.json" | jq -r '.targets[] | select(.enabled) | .host'))
((${#targets[@]})) || die "infra/prod/targets.json에 enabled 대상이 없습니다."
if [[ "$dry_run" == true ]]; then
	log "dry-run: 대상 ${targets[*]}, 여기서 멈춥니다."
	exit 0
fi

# deploy 사용자 명령은 서버의 SSH forced command(ssh-entry.sh)를 같은 인자로 부릅니다(인자는 SHA·`-`·명령 이름뿐이라 따옴표로 충분).
remote_entry() { # remote_entry <host> <ssh-entry 명령...> (stdin 전달)
	local host="$1"
	shift
	ssh "$host" "sudo -u deploy env SSH_ORIGINAL_COMMAND='$*' /usr/local/lib/crelink/ssh-entry.sh"
}

build_on() { # build_on <host> <api|web> <프로젝트 변수>
	local host="$1" area="$2" project dsn='' dir="/tmp/crelink-build-$sha"
	project="$(var "$3")"
	[[ "$area" == web ]] && dsn="$(var SENTRY_WEB_DSN)"
	log "$host: $area 이미지 빌드 → $prefix-$area:$sha"
	git archive --format=tar "$sha" | ssh "$host" "rm -rf '$dir' && mkdir -p '$dir' && tar -xf - -C '$dir'"
	ssh "$host" "cd '$dir' && DOCKER_BUILDKIT=1 docker build --quiet --file apps/$area/Dockerfile \
		--build-arg SENTRY_RELEASE=$sha --build-arg SENTRY_ORG=$(printf %q "$sentry_org") \
		--build-arg SENTRY_PROJECT=$(printf %q "$project") --build-arg NEXT_PUBLIC_SENTRY_DSN=$(printf %q "$dsn") \
		--build-arg SENTRY_UPLOAD=no --tag $prefix-$area:$sha . >/dev/null && rm -rf '$dir'"
}

for host in "${targets[@]}"; do
	[[ "$api_build" == true ]] && build_on "$host" api SENTRY_PROJECT_API
	[[ "$web_build" == true ]] && build_on "$host" web SENTRY_PROJECT_WEB
	# 바뀌지 않은 영역 이미지가 서버에 없으면(서버를 새로 만든 경우 등) 실패합니다. 그때는 --force로 둘 다 빌드합니다.
	log "$host: 배포 $sha (api ${api_image:0:7}, web ${web_image:0:7})"
	bundle="$(mktemp -d)"
	git archive --format=tar "$sha" infra/prod | tar -xf - -C "$bundle"
	{
		printf '\n' # GHCR 자격 증명 없음: 서버에 있는 이미지만 씀
		# macOS tar가 확장 속성(com.apple.provenance)을 넣으면 서버 GNU tar가 경고를 내므로 빼고 묶습니다.
		COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C "$bundle/infra/prod" --exclude ./tests --exclude ./README.md --exclude '*.example' --exclude ./.env .
	} | remote_entry "$host" deploy "$sha" "$api_image" "$web_image" || die "$host 배포 실패(서버는 활성 색·트래픽을 바꾸지 않았습니다)."
	rm -rf "$bundle"
	if ! remote_entry "$host" verify </dev/null; then
		log "$host: 운영 주소 검사 실패 → 직전 릴리스로 롤백"
		printf '\n' | remote_entry "$host" rollback || true
		remote_entry "$host" verify </dev/null || log "경고: 롤백 뒤에도 운영 주소 검사가 실패합니다(런북 \"장애 대응\")."
		die "$host 운영 주소 검사가 실패해 직전 릴리스로 되돌렸습니다."
	fi
done

tags=(deploy/prod)
[[ "$api_build" == true ]] && tags+=(deploy/prod-api)
[[ "$web_build" == true ]] && tags+=(deploy/prod-web)
for t in "${tags[@]}"; do
	git tag -f "$t" "$sha" >/dev/null
	git push --quiet --force origin "refs/tags/$t"
done
log "완료: $sha, 태그 ${tags[*]}"
