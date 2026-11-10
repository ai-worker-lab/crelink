# 0248 채널별 짧은 주소 edge 경로

- 단계: 티켓
- 역할: infra
- 선행: 0246
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-10

## 목적

운영 edge(Caddy 단축 호스트)가 `/s/{7~10자}`만 API로 넘기게 하고 운영 주소 검사에 없는 code 안내를 추가합니다.

## 수용 기준

설계 [채널별 짧은 주소](../../specs/channel-links.md#수용-기준) 10을 따릅니다.

- [x] `infra/prod/Caddyfile`의 `@click` 정규식에 `s/[a-z0-9]{7,10}`가 있습니다.
- [x] `infra/prod/tests/caddy-routing.sh`에 `/s/` 7·10자 api, 6·11자·대문자·끝 슬래시·세그먼트 둘·POST·HEAD·path-as-is 404, 웹 호스트 web, 색 전환 뒤 정책 유지가 있고 Docker로 직접 실행해 통과합니다.
- [x] `infra/prod/verify.sh`에 `/s/zzzzzzz` 302와 `notice?reason=link_not_found`가 있습니다(검사 11개 → 13개).

## 범위

- 포함: `infra/prod/Caddyfile`, `infra/prod/verify.sh`, `infra/prod/tests/caddy-routing.sh`, 관련 문서·변경 기록.
- 제외: 실제 서버 적용·배포(병합 뒤 Deploy job과 운영 주소 검사로만 확인), `ssh-entry.sh`·`bootstrap.sh`.

## 위험·복구

`infra/prod/`의 변경은 main 병합 시 서버에서 그대로 실행됩니다. 새 경로는 GET `/s/{7~10자}` 하나뿐이고 나머지 공개 정책은 그대로입니다. 롤백하면 옛 Caddyfile로 돌아가 이미 공유한 `/s/` 주소가 재배포 전까지 404가 됩니다.

## 연결

- 설계: [채널별 짧은 주소](../../specs/channel-links.md), 배포 설계: [운영 배포·CD](../../specs/crelink-prod-deploy.md), [prod README](../../../infra/prod/README.md)
- 선행 계약: [0246](../orchestrator/0246-channel-links.md)

## 진행 기록

- 2026-11-10: 생성.
- 2026-11-10: `infra/prod/tests/caddy-routing.sh`를 Docker(`caddy:2.11.7-alpine`)로 직접 실행해 통과 94, 실패 0(`/s/` 관련 14건 포함). `bash -n`은 통과했고 `shellcheck`는 이 기기에 없어 실행하지 못했습니다. `config --quiet`는 실제 Caddy 기동으로 대신했습니다.
- 2026-11-10: `verify.sh`는 서버에서 Cloudflare를 거쳐 도는 검사라 로컬에서 실행하지 않았습니다. 병합 뒤 Deploy job의 운영 주소 검사(13개)로만 확인합니다.
