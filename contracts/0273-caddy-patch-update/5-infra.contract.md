# [Infra Deployment Contract] PR #178 Caddy 패치 갱신

## 1. 인프라 변경 및 영향 범위

- 대상: 고정 edge `caddy`. 이미지의 유일한 원본은 [edge Compose](../../infra/prod/edge/compose.yaml)이며 2.11.7-alpine에서 2.11.9-alpine으로 갱신합니다. [라우팅 시험](../../infra/prod/tests/caddy-routing.sh)도 이 이미지 값을 읽습니다.
- 공개 포트는 기존 loopback 바인딩, `crelink-edge` 네트워크, 읽기 전용 설정 마운트와 권한 제한을 유지합니다. Caddyfile·앱·데이터·비밀값 변경은 없습니다.

## 2. 무중단 배포 및 롤백 계획

- 배포 방식: edge Restart. 기존 [배포 스크립트](../../infra/prod/deploy.sh)는 앱 색 전환과 Caddy reload만 하므로 PR 병합이나 앱 배포만으로 실행 중인 edge 이미지가 갱신되지는 않습니다.
- 실제 적용은 [런북 6-3](../../infra/docs/prod-runbook.md#6-3-edge-설정-갱신caddy-이미지-업그레이드)에 따라 새 릴리스의 edge Compose를 복사하고 `docker compose -p crelink-edge -f /opt/crelink/edge/compose.yaml up -d --wait`로 재생성합니다. 런북상 공백 1~2초는 추정치이며 이번 작업에서 운영 실측·적용하지 않습니다.
- 롤백: 같은 런북에 따라 교체 전 edge Compose를 복구하고 위 명령으로 재생성합니다. 앱 `rollback.sh`만 실행해서는 고정 edge 이미지가 되돌아가지 않습니다.
- 마이그레이션: 해당 없음. 이번 인계는 로컬 검증·push·CI status까지만 수행합니다.

## 3. 리소스 및 커넥션 풀 영향

- DB Connection Pool 변경 없음. 앱 설정·동시 인스턴스 수도 바꾸지 않습니다.
- CPU·메모리 설정 변경 없음. edge Compose의 기존 설정을 유지합니다.

## 4. 헬스체크 및 관측 가능성 검증

- edge healthcheck는 [Compose](../../infra/prod/edge/compose.yaml)의 컨테이너 내부 `http://127.0.0.1:2020/healthz`입니다. 앱 readiness와 공개 경로는 기존 정책을 유지합니다.
- 로컬 근거: prod `config --quiet`(blue·green·edge), `bash -n`, `shellcheck -x`, `prod/tests/*.sh`, `pnpm ci:local`. 실제 결과는 [0273 진행 기록](../../docs/work/orchestrator/0273-caddy-patch-update.md)에 남깁니다.
- 향후 운영 적용 담당자용 로그 명령: `docker compose -f /opt/crelink/edge/compose.yaml logs --tail 100 caddy`. 이번 작업에서는 운영에 접속하지 않습니다.
