#!/usr/bin/env bash
# 크리링 배포 대상 서버 초기 설정(한 번, 다시 실행해도 같은 결과). Ubuntu(amd64·arm64)에서 root로 실행합니다.
#   sudo TARGET_NAME=<targets.json의 name> [DEPLOY_SSH_PUBKEY='ssh-ed25519 ...'] [CLOUDFLARED_TOKEN=...] ./bootstrap.sh
# 하는 일
#   - 패키지: ca-certificates·curl·gzip·tar·age(apt), sops(GitHub 릴리스 바이너리, SHA-256 확인), Docker Engine·Compose(없을 때 공식 apt 저장소)
#   - deploy 사용자(비밀번호 로그인 없음, sudo 없음, docker 그룹 = root와 같은 권한)
#     DEPLOY_SSH_PUBKEY를 주면 authorized_keys에 restrict,command="/usr/local/lib/crelink/ssh-entry.sh"로 등록(배포 명령만 가능)
#   - /usr/local/lib/crelink/ssh-entry.sh(root 소유, 이 폴더의 ssh-entry.sh 사본)
#   - /opt/crelink/{releases,state}(deploy 소유), /run/crelink(tmpfs, systemd-tmpfiles로 부팅마다 deploy 0700)
#   - /etc/crelink(root:deploy 750): target(대상 이름), age.key(없으면 생성, root:deploy 640). 공개키를 출력합니다 → .sops.yaml 수신자에 추가.
#   - CLOUDFLARED_TOKEN을 주면 cloudflared를 설치하고 원격 관리형 Tunnel 서비스로 등록(이미 있으면 건너뜀)
# Tailscale은 이 스크립트가 설치하지 않습니다(대상 추가 절차: infra/docs/prod-runbook.md "배포 대상 추가").
# 방화벽은 건드리지 않습니다. 공개는 Cloudflare Tunnel(아웃바운드)이고 관리는 Tailscale이라 인바운드 포트가 필요 없습니다.
set -euo pipefail

DEPLOY_USER=deploy
CRELINK_ROOT=/opt/crelink
CRELINK_ETC=/etc/crelink
LIB_DIR=/usr/local/lib/crelink
SOPS_VERSION=3.13.3
declare -A SOPS_SHA256=(
	[amd64]=e5bec3346a873ae91d871550f3e698c1aad962aff462a080e40f25fde17fef6b
	[arm64]=53b0abacd38ef1b12a66d6c100956691b9cefce018d91f81e73ddf7438b94d77
)
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[bootstrap] %s\n' "$*"; }
die() {
	printf '[bootstrap] 오류: %s\n' "$*" >&2
	exit 1
}

[[ "$(id -u)" -eq 0 ]] || die "root로 실행하세요: sudo $0"
[[ "${TARGET_NAME:-}" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "TARGET_NAME(infra/prod/targets.json의 name)이 필요합니다."
# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || die "Ubuntu 전용입니다(현재: ${ID:-알 수 없음})."
arch="$(dpkg --print-architecture)"
[[ -n "${SOPS_SHA256[$arch]:-}" ]] || die "지원하지 않는 아키텍처입니다: $arch"

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gzip tar age

if [[ "$(sops --version 2>/dev/null | awk 'NR == 1 { print $2 }')" == "$SOPS_VERSION" ]]; then
	log "sops $SOPS_VERSION 이 이미 있습니다."
else
	tmp="$(mktemp)"
	curl -fsSL -o "$tmp" "https://github.com/getsops/sops/releases/download/v$SOPS_VERSION/sops-v$SOPS_VERSION.linux.$arch"
	echo "${SOPS_SHA256[$arch]}  $tmp" | sha256sum -c --quiet - || die "sops 체크섬이 맞지 않습니다."
	install -m 755 "$tmp" /usr/local/bin/sops
	rm -f "$tmp"
	log "sops $SOPS_VERSION 설치"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
	log "Docker가 이미 있습니다: $(docker --version), compose $(docker compose version --short)"
else
	log "Docker 공식 저장소에서 설치합니다(https://docs.docker.com/engine/install/ubuntu/)."
	conflicts=()
	for pkg in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
		if dpkg -s "$pkg" >/dev/null 2>&1; then conflicts+=("$pkg"); fi
	done
	if ((${#conflicts[@]} > 0)); then apt-get remove -y "${conflicts[@]}"; fi
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
	chmod a+r /etc/apt/keyrings/docker.asc
	cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $arch
Signed-By: /etc/apt/keyrings/docker.asc
EOF
	apt-get update -q
	apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	systemctl enable --now docker
fi

if id "$DEPLOY_USER" >/dev/null 2>&1; then
	log "$DEPLOY_USER 사용자가 이미 있습니다."
else
	useradd --create-home --shell /bin/bash "$DEPLOY_USER"
	log "$DEPLOY_USER 사용자를 만들었습니다(비밀번호 없음 = 비밀번호 로그인 불가)."
fi
usermod -aG docker "$DEPLOY_USER"

install -d -m 755 -o root -g root "$LIB_DIR"
install -m 755 -o root -g root "$here/ssh-entry.sh" "$LIB_DIR/ssh-entry.sh"

deploy_home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$deploy_home/.ssh"
authorized="$deploy_home/.ssh/authorized_keys"
[[ -f "$authorized" ]] || install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$authorized"
if [[ -n "${DEPLOY_SSH_PUBKEY:-}" ]]; then
	line="restrict,command=\"$LIB_DIR/ssh-entry.sh\" $DEPLOY_SSH_PUBKEY"
	if grep -qxF "$line" "$authorized"; then
		log "배포 공개키가 이미 등록되어 있습니다."
	else
		printf '%s\n' "$line" >>"$authorized"
		log "배포 공개키를 forced command로 등록했습니다."
	fi
fi

install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$CRELINK_ROOT" "$CRELINK_ROOT/releases" "$CRELINK_ROOT/state"
printf 'd /run/crelink 0700 %s %s -\n' "$DEPLOY_USER" "$DEPLOY_USER" >/etc/tmpfiles.d/crelink.conf
systemd-tmpfiles --create /etc/tmpfiles.d/crelink.conf

install -d -m 750 -o root -g "$DEPLOY_USER" "$CRELINK_ETC"
printf '%s\n' "$TARGET_NAME" >"$CRELINK_ETC/target"
chmod 644 "$CRELINK_ETC/target"
if [[ ! -s "$CRELINK_ETC/age.key" ]]; then
	(umask 077 && age-keygen -o "$CRELINK_ETC/age.key" 2>/dev/null)
	log "age 키를 만들었습니다."
fi
chown root:"$DEPLOY_USER" "$CRELINK_ETC/age.key"
chmod 640 "$CRELINK_ETC/age.key"
log "이 서버의 age 공개키(.sops.yaml의 $TARGET_NAME 수신자): $(age-keygen -y "$CRELINK_ETC/age.key")"

if [[ -n "${CLOUDFLARED_TOKEN:-}" ]]; then
	if systemctl is-enabled cloudflared >/dev/null 2>&1; then
		log "cloudflared 서비스가 이미 있습니다."
	else
		install -m 0755 -d /usr/share/keyrings
		curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
		echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" >/etc/apt/sources.list.d/cloudflared.list
		apt-get update -q && apt-get install -y -q cloudflared
		cloudflared service install "$CLOUDFLARED_TOKEN"
		log "cloudflared 서비스를 등록했습니다."
	fi
fi

log "완료. 다음: infra/docs/prod-runbook.md \"배포 대상 추가\"의 남은 단계(SOPS 수신자·Tunnel 공개 호스트·첫 배포)."
