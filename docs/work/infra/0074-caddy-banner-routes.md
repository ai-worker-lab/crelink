# 0074 Caddy 단축 호스트 배너 클릭 경로

- 단계: 티켓
- 역할: infra
- 상위: 0063
- 상태: 준비
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T8입니다. 요구는 R20 ⑧, R21 ④입니다.

## 수용 기준

- [ ] Caddy 단축 호스트 `/a/`·`/b/` matcher와 주석, `infra/prod/README.md` Caddyfile 줄, `infra/CHANGELOGS.md`. `infra/prod/tests/caddy-routing.sh`에 경우를 더합니다. 통과(200 api, 경로·쿼리 그대로): `/a/abcde12345/fghij67890`, `/b/abcde12345`, `/b/abcde12345?x=1`. 404: 세그먼트마다 대문자·9자·11자, `/a/abcde12345`, `/b/abcde12345/fghij67890`, `/a/…/…/extra`, 끝 슬래시, POST·HEAD, `--path-as-is` 상위 경로. 웹 호스트는 web, 색 전환 뒤에도 `/b/`는 api. 머리말 문구도 고칩니다. 확인: `infra/prod/tests/caddy-routing.sh`, `infra/prod/tests/deploy-rollback.sh`(실제 Caddyfile을 `edge_apply`가 validate), 바꾼 스크립트 `bash -n`·`shellcheck`. compose는 바뀌지 않아 `config --quiet`·`make infra-up`은 해당 없음. `harness.sh`는 바꾸지 않습니다.

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
