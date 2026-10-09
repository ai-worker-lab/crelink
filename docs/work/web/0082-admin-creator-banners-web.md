# 0082 운영자 크리에이터 상세 배너 슬롯·배너·클릭 통계

- 단계: 티켓
- 역할: web
- 상위: 0063
- 선행: 0067
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T14입니다. 요구는 R21 ①④⑤, R10입니다.

## 수용 기준

- [x] 운영자 크리에이터 상세: `배너 슬롯` 묶음, `배너` 카드, 공용 차단 구성 요소, 통계 배너 클릭(미정 4), BFF. 390·1280px.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T14
- 요구: [PRD](../../product/crelink.md#요구사항) R21 ①④⑤, R10
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(통합 브랜치 `work/0085-ad-banner-integration` 위 격리 작업공간, 0080과 한 번에). 계약 `OperatorCreatorDetail.bannerSlot`·`banners`·`bannerLimits`, `OperatorCreatorStats.bannerClicks`, `SetBannerSlotRequest`, `CRELINK_API_PATHS.adminCreatorBannerSlot`·`adminBannerBlock` 그대로(계약 변경 없음).
  - `CreatorControls.tsx`: `BannerSlotControl`(`계정 관리` 카드의 `subform`, 제목 `배너 슬롯`, 상태 3가지 문구 없음·부여됨·회수 뒤, 확인 대화 2가지, `처리 중…`, 결과 `배너 슬롯을 부여했어요.`/`배너 슬롯을 회수했어요.`, `ActionStatus`, `PUT …/banner-slot` 뒤 `router.refresh()`). `LinkBlockControl`을 공용 `BlockControl({ blocked, blockedReason, path, noun })`로 넓혀 링크·배너가 함께 씀(결과 `링크를 차단했어요.`/`배너를 차단했어요.`).
  - `admin/creators/[userId]/page.tsx`: `링크` 카드 아래 `배너` 카드(보관 포함 전체 순서, 썸네일 120×40 원본·대체 문구·연결 URL 또는 `연결 없음`·`숨김`/`차단됨` 배지·차단 사유·`차단`/`차단 풀기`, 없으면 `만든 배너가 없어요.`). 통계 카드 `링크별 클릭` 아래 `배너별 클릭` 표(지운 배너 `(지운 배너)`, 없으면 `이 기간에 배너 클릭이 없어요.`).
  - BFF 허용 목록: `PUT api/admin/creators/{ID}/banner-slot`(기존 정규식에 더함), `PUT api/admin/banners/{ID}/block`.
  - `styles.css`: `.item-thumb-banner`(120×40).
  - 디자인 인계와 다른 점: 부여일은 화면의 `가입일`과 같은 `formatDate`(`2026년 10월 9일`)로 보입니다(handoff 예시 `2026-10-09`). `없음` 상태 둘째 문장 `배너는 n장까지 둘 수 있어요(설정값).`는 handoff 문구 그대로, n은 `bannerLimits.visibleMax`. 묶음 제목 `배너 슬롯`(h3, `role="group"` 이름)은 handoff에 묶음 이름으로만 있어 제목으로 두었습니다. 부여됨 문구의 수는 `bannerLimits.visibleUsed`·`totalUsed`, 회수 확인·보관 문구의 수는 `banners.length`입니다.
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`).
  - `pnpm --filter @crelink/web typecheck` 통과, 바꾼 파일 `prettier`·`eslint` 통과, `pnpm verify --fast` 통과, `pnpm --filter @crelink/web test` 27/27 통과.
  - 계약 fixture(저장소 밖 `.local/`, `OperatorCreatorDetail`·`OperatorCreatorStats` 타입 검사 통과)와 mock API에 붙인 `next dev`, Playwright Chromium: 부여됨(배너 3장: 보이는·숨김·차단, 긴 대체 문구·긴 URL, 배너 클릭 3행·지운 배너)·회수 뒤(보관 3장)·없음(배너 0장·클릭 0행) × 1280·390·320px 모두 가로 넘침 0·콘솔 오류 0. 1280·390px에서 회수(확인 문구) → `배너 슬롯을 회수했어요.`·`보관 중인 배너 3장` → 부여 → `부여됨(`, 배너 사유 입력·`차단` → `배너를 차단했어요.`·`사유: …` → `차단 풀기` → `차단을 풀었어요.`
  - 격리 인스턴스(`PORT_SLOT=43`, Compose project `crelink-webadmin`): `make up` 뒤 `pnpm smoke` 5/5 통과. 실제 API(0067 최소 연결 상태)로 운영자 세션을 DB에 만들어 크리에이터 상세 1280·390px: `없음` 문구·`만든 배너가 없어요.`·`이 기간에 배너 클릭이 없어요.`, 가로 넘침 0, 콘솔 오류 0(시험 행은 지움). BFF: 새 두 경로는 API까지 전달(API 404 `not_found`, T6 전), 목록에 없는 경로는 404 `route_not_allowed`.
  - 통합 선행조건: 부여·회수와 배너 차단 API·상세 필드는 T6(0072), `bannerClicks`는 T7(0073). 실제 API로 끝까지 도는 확인은 T17 E2E(설계 검증 계획 4·7) 몫입니다.
- 2026-10-09: 0085 통합에서 실제 API(0072·0073)로 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts` `배너 슬롯`).
  - 배너 슬롯 묶음: 부여(확인)·회수(확인)·재부여, `부여됨`·`보관 중인 배너 6장` 문구.
  - `배너` 카드: 보관 6장, 차단(사유)·`차단 풀기`.
  - 통계와 폭: `배너별 클릭 수` 표에 클릭 1이 보이고, 390·1280px에서 가로 넘침이 없습니다.
