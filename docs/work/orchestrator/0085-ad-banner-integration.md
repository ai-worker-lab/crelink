# 0085 광고 블록 통합·E2E·main 머지

- 단계: 티켓
- 역할: orchestrator
- 상위: 0063
- 선행: 0070, 0071, 0072, 0073, 0074, 0081, 0082, 0084
- 상태: 준비
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T17입니다. 요구는 R20, R21입니다.

## 수용 기준

- [ ] 통합 브랜치를 main에 한 번 머지합니다. 그 전에: 전체 `pnpm verify`, 실제 API로 E2E `tests/e2e/ad-banner.spec.ts`(아래 검증 계획), mock 제거, E2E 정리 순서. 운영 주소 검사 `infra/prod/verify.sh`에 `{SHORT}/b/zzzzzzzzzz`(와 `/a/zzzzzzzzzz/zzzzzzzzzz`)가 302 `…/notice?reason=link_unavailable`인지 더합니다(T8이 main에 들어간 뒤). `docs/specs/crelink-prod-deploy.md`의 구성도·공개 경로 줄, 변경 기록, 릴리스 노트도 고칩니다.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T17
- 요구: [PRD](../../product/crelink.md#요구사항) R20, R21
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
