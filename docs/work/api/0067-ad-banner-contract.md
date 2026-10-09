# 0067 광고 배너 계약·스키마(shared·migration 0003·설정값)

- 단계: 티켓
- 역할: api
- 상위: 0063
- 상태: 준비
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T1입니다. 요구는 R20, R21입니다.

## 수용 기준

- [ ] 계약·스키마. 대상: `packages/shared`의 위 타입·경로·오류 코드·상수, `resolveBannerSlot`과 그 단위 테스트(`packages/shared` `test` 스크립트), migration `0003_ad_banner.sql`(`lock_timeout`, 되돌리기 주석), `AppConfig` `BANNER_SLOT_MAX`·`BANNER_SLOT_TOTAL_MAX`, `.env.example`·환경변수 문서. 확인: `pnpm --filter @crelink/shared build`, `pnpm --filter @crelink/shared test`, migration 테스트(FK 연쇄 2건·CHECK), AppConfig 파싱 테스트. 미정 1·2가 확정된 뒤 착수합니다. 전체 typecheck는 통합 브랜치에서 T2·T5·T9·T10 뒤에 확인합니다.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T1
- 요구: [PRD](../../product/crelink.md#요구사항) R20, R21
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
