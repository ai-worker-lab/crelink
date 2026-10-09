# 0074 Caddy 단축 호스트 배너 클릭 경로

- 단계: 티켓
- 역할: infra
- 상위: 0063
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T8입니다. 요구는 R20 ⑧, R21 ④입니다.

## 수용 기준

- [x] Caddy 단축 호스트 `/a/`·`/b/` matcher와 주석, `infra/prod/README.md` Caddyfile 줄, `infra/CHANGELOGS.md`. `infra/prod/tests/caddy-routing.sh`에 경우를 더합니다. 통과(200 api, 경로·쿼리 그대로): `/a/abcde12345/fghij67890`, `/b/abcde12345`, `/b/abcde12345?x=1`. 404: 세그먼트마다 대문자·9자·11자, `/a/abcde12345`, `/b/abcde12345/fghij67890`, `/a/…/…/extra`, 끝 슬래시, POST·HEAD, `--path-as-is` 상위 경로. 웹 호스트는 web, 색 전환 뒤에도 `/b/`는 api. 머리말 문구도 고칩니다. 확인: `infra/prod/tests/caddy-routing.sh`, `infra/prod/tests/deploy-rollback.sh`(실제 Caddyfile을 `edge_apply`가 validate), 바꾼 스크립트 `bash -n`·`shellcheck`. compose는 바뀌지 않아 `config --quiet`·`make infra-up`은 해당 없음. `harness.sh`는 바꾸지 않습니다.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T8
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ⑧, R21 ④
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현. `infra/prod/Caddyfile`의 `@click`을 정규식 하나 `^/(c/[a-z0-9]{10}|a/[a-z0-9]{10}/[a-z0-9]{10}|b/[a-z0-9]{10})$`(GET만)로 넓힘. 같은 `handle`·`reverse_proxy`를 그대로 써서 블록 수가 늘지 않음(설계 "정규식 하나를 교대로 묶거나"). 단축 호스트 머리말·클릭 matcher 주석(id 원본: `links`·`ad_banners`·`landings`·`creator_banners`의 `public_id` CHECK) 갱신. `caddy-routing.sh`에 통과 3건·404 21건(1자 `/a`·`/b` 포함)·웹 호스트 `/a/`·`/b/` web 2건·색 전환 뒤 `/b/` api·green 2건을 더하고 단축 호스트 절 머리말을 고침. `infra/prod/README.md` Caddyfile 줄·시험 표, `infra/CHANGELOGS.md`. `infra/` 밖은 바꾸지 않음(main 먼저 머지 대상).
- 2026-10-09 검증(이 worktree, `set -o pipefail`):
  - `bash -n infra/prod/*.sh infra/prod/tests/*.sh infra/prod/tests/lib/*.sh && shellcheck -x …`(README `문법 확인`과 같은 범위): 통과.
  - `infra/prod/tests/caddy-routing.sh`: 통과 78, 실패 0(실제 `caddy:2.11.7-alpine`에서 `caddy validate`·`reload` 포함).
  - `infra/prod/tests/deploy-rollback.sh`: 통과 97, 실패 0(ssh-entry 38회, `edge_apply`가 바뀐 Caddyfile을 validate·reload).
  - `pnpm work:scope`: 통과(변경 파일 5개 모두 소유 경로 안. 이 worktree 브랜치 기준이라 0085로 판정됨, 별도 브랜치로 옮기면 다시 확인).
  - compose 변경 없음 → `config --quiet`·`make infra-up`은 해당 없음. `harness.sh` 변경 없음.
  - 운영 영향: main 머지 다음 배포의 `edge_apply`부터 `go.shaul.kr/a/…`·`/b/…`가 Caddy 404 대신 API로 감. API 경로(T7)가 없으면 API 404라 화면·동작 차이 없음. 운영 주소 검사(`verify.sh`) 추가는 T17.
