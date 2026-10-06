#!/usr/bin/env bash
# OCI ARM Ubuntu 서버 초기 설정(한 번, 다시 실행해도 같은 결과). root로 실행: sudo ./bootstrap.sh
#   - Docker Engine·Compose 플러그인: 이미 있으면 건너뜀. 없으면 Docker 공식 apt 저장소로 설치(https://docs.docker.com/engine/install/ubuntu/)
#   - rsync·curl·gzip 설치(워크플로 동기화·geoip.sh)
#   - deploy 사용자(비밀번호 로그인 없음, sudo 없음, docker 그룹). docker 그룹은 root와 같은 권한입니다.
#     DEPLOY_SSH_PUBKEY 환경변수(공개키 한 줄)를 주면 authorized_keys에 추가합니다.
#   - /opt/crelink(deploy 소유 755. 워크플로 rsync -a가 저장소 폴더 권한으로 맞추므로 같은 값, 비밀값은 .env 600으로 보호)
#   - /opt/edge(root 소유 755)·/opt/edge/sites, /opt/edge/sites/crelink.caddy(deploy가 쓰기)
# 방화벽은 건드리지 않습니다. OCI Ubuntu 이미지는 UFW 사용을 금지하고(부팅 실패 가능) iptables(/etc/iptables/rules.v4)로 관리합니다.
# 열 포트와 명령은 infra/docs/prod-runbook.md "OCI 인스턴스·네트워크"에 있습니다.
set -euo pipefail

DEPLOY_USER=deploy
CRELINK_DIR=/opt/crelink
EDGE_DIR=/opt/edge

log() { printf '[bootstrap] %s\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || {
	echo "root로 실행하세요: sudo $0" >&2
	exit 1
}
# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || {
	echo "Ubuntu 전용입니다(현재: ${ID:-알 수 없음})." >&2
	exit 1
}

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gzip rsync

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
	log "Docker가 이미 있습니다: $(docker --version), $(docker compose version --short). 설치를 건너뜁니다."
else
	log "Docker 공식 저장소에서 설치합니다."
	# 공식 문서의 충돌 패키지(설치된 것만 제거).
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
Architectures: $(dpkg --print-architecture)
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

deploy_home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$deploy_home/.ssh"
authorized="$deploy_home/.ssh/authorized_keys"
[[ -f "$authorized" ]] || install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$authorized"
if [[ -n "${DEPLOY_SSH_PUBKEY:-}" ]]; then
	if grep -qxF "$DEPLOY_SSH_PUBKEY" "$authorized"; then
		log "배포 공개키가 이미 등록되어 있습니다."
	else
		printf '%s\n' "$DEPLOY_SSH_PUBKEY" >>"$authorized"
		log "배포 공개키를 등록했습니다."
	fi
fi

install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$CRELINK_DIR"
# CA 인증서는 공개 정보이고 컨테이너의 node 사용자(uid 1000)가 읽어야 하므로 755(파일은 644).
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$CRELINK_DIR/certs"
install -d -m 755 -o root -g root "$EDGE_DIR" "$EDGE_DIR/sites"
site="$EDGE_DIR/sites/crelink.caddy"
if [[ ! -e "$site" ]]; then
	install -m 644 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$site"
	log "$site 를 비어 있는 deploy 소유 파일로 만들었습니다(deploy.sh가 채움)."
else
	chown "$DEPLOY_USER:$DEPLOY_USER" "$site"
	chmod 644 "$site"
fi

log "완료. 다음: infra/docs/prod-runbook.md의 'edge 전환'과 '최초 배포'."
