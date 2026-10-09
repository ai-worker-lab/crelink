# 0068 광고 슬롯 위치·공개 응답·노출 기록·편집 상태

- 단계: 티켓
- 역할: api
- 상위: 0063
- 선행: 0067
- 상태: 준비
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T2입니다. 요구는 R20 ①②⑥⑧, R21 ③, R7 ⑥입니다.

## 수용 기준

- [ ] 위치·공개 랜딩·노출·편집 상태. 대상: `LinkOrderRequest.slotIndex` 저장(생략 시 상대 위치 유지), 공개 응답 `slot`·`clickUrl` 규칙, `recordAdStat`과 `passAccepted`일 때만 첫 장 노출 +1, `CreatorLandingState` 추가 필드. API 통합 테스트로 확인할 것: 위치 3가지, 생략 시 유지, 숨김 조건, `passAccepted` 유무별 노출 수와 `clickUrl`.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T2
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ①②⑥⑧, R21 ③, R7 ⑥
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
