# 0068 광고 슬롯 위치·공개 응답·노출 기록·편집 상태

- 단계: 티켓
- 역할: api
- 상위: 0063
- 선행: 0067
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T2입니다. 요구는 R20 ①②⑥⑧, R21 ③, R7 ⑥입니다.

## 수용 기준

- [x] 위치·공개 랜딩·노출·편집 상태. 대상: `LinkOrderRequest.slotIndex` 저장(생략 시 상대 위치 유지), 공개 응답 `slot`·`clickUrl` 규칙, `recordAdStat`과 `passAccepted`일 때만 첫 장 노출 +1, `CreatorLandingState` 추가 필드. API 통합 테스트로 확인할 것: 위치 3가지, 생략 시 유지, 숨김 조건, `passAccepted` 유무별 노출 수와 `clickUrl`.

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
- 2026-10-09: 구현(통합 브랜치 `work/0085-ad-banner-integration` 위 격리 작업공간). 공유 계약(`packages/shared`)은 바꾸지 않았습니다.
  - `PUT /api/me/links/order`(`src/creator/links.service.ts`): 사용자 잠금 트랜잭션 안에서 링크를 다시 매긴 뒤 첫 list 구역 `slot_position` 저장. `slotIndex`는 `optionalNonNegativeInteger`(`src/common/input.ts`)로 검사(아니면 400 `validation_failed`), n 이상이면 NULL. 생략하면 다시 매기기 전 `SLOT_INDEX_SQL`(슬롯 앞 링크 수) 값을 새 위치로.
  - 공개 랜딩(`src/creator/public-landing.controller.ts`): `publicLanding` users JOIN에 `banner_slot_granted`, 구역 질의에 `type`·`slot_position`, 링크 질의는 숨김·차단 포함 전체(+`position`·`visible`), 배너 질의 1개. 첫 list 구역에만 `resolveBannerSlot`, 숨김이면 `slot: null`. `clickUrl` 광고 `passAccepted` → `{SHORT}/a/{배너}/{랜딩}`, 아니면 저장된 URL. 크리에이터 배너 `{SHORT}/b/{배너}`·URL 없으면 null. `passAccepted`이고 광고 블록이 보이면 첫 장 `recordAdStat('impression')`(백그라운드).
  - `TrackingService.recordAdStat(kind, adBannerId, landingPublicId)`(`src/short-link/tracking.service.ts`): 설계 SQL upsert(`STATS_TIME_ZONE` 날짜), 지표 `crelink.ad_banner.impression`·`crelink.ad_banner.click`(`src/monitoring/metrics.ts`). `ShortLinkModule`이 `TrackingService`를 내보내고 `CreatorModule`이 가져옵니다.
  - `GET /api/me/landing`: T1 빈 값을 `CreatorService` 공용 도우미로 채움 — `bannerSlot`(kind·slotIndex·grantedAt), `liveAdBanners`(+`publicBannerView`, 미리보기 clickUrl = 저장된 URL), `creatorBanners`(+`creatorBannerView`, `CREATOR_BANNER_COLUMNS`), `bannerLimits`. 공개 응답용 `visibleCreatorBanners`.
  - 문서: `apps/api/docs/README.md` 크리에이터 규칙(위치·공개 랜딩 슬롯)·지표 표, `apps/api/CHANGELOGS.md`.
  - 설계와 다른 점: 없음. 설계 `노출·클릭 기록`의 지표 중 `crelink.ad_banner.impression`·`click` 두 개는 `recordAdStat` 안에서 세도록 이 티켓에서 넣었습니다(T7은 `crelink.creator_banner.click`만 더하면 됨).
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`, 격리 인스턴스 `PORT_SLOT=41`·Compose project `crelink-apicore`).
  - `make infra-up` 뒤 `pnpm --filter @crelink/api test` 20 suites 143/143 통과. 새 시험 `test/ad-banner-slot.e2e-spec.ts` 9건(위치 3가지와 n 이상, slotIndex 검증·order_mismatch, 생략 시 유지·빈 번호·새 링크, 게시 중만·앞 링크 숨김, 광고 숨김 조건(no_banners·no_content·포트폴리오만), 배너 슬롯(0장 숨김·빈 랜딩·회수), `passAccepted` 유무별 노출 수(0 → 1 → 2, 첫 장만, Asia/Seoul 날짜)와 `clickUrl`, 숨김·배너 슬롯은 노출 없음, 편집 상태).
  - `make up` 뒤 실제 HTTP(`127.0.0.1:7120`, 세션·크리링 배너 행은 SQL로 넣음): 공개 랜딩 크리링 배너 없음 → `slot: null`, 게시 2장·예약 1장 → `kind: ad`·`afterLinkCount: 3`·2장·저장된 URL. `PUT /api/me/links/order` `slotIndex` 0 → 공개 0, 2 → 공개 2·편집 `slotIndex: 2`, 생략(역순) → 2 유지, 3(n) → `slotIndex: null`, -1 → 400 `validation_failed`, 빈 ids → 400 `order_mismatch`. `GET /apicore` 302의 `pass`로 → `passAccepted: true`·`/a/adcheck001/apicore001` 주소, `ad_banner_daily_stats` 첫 장만 1(서울 날짜), pass 없는 조회·`/api/me/landing` 뒤 그대로 1, 두 번째 pass 조회 2. 부여 + 배너(보임·숨김) → `kind: creator`·`/b/crcheck001` 1장, 편집 상태 `grantedAt`·`banners` 2·`bannerLimits` 1/5·2/20. 회수 → 다시 광고 2장. 없는 랜딩 404 `landing_not_found`.
  - `pnpm smoke` 5/5 통과.
  - `pnpm verify --fast` 통과, `pnpm verify` 통과(lint·typecheck·build, API 143/143). `pnpm work:scope 0068 --base HEAD` 통과(통합 브랜치 기준 변경 19개 모두 api 소유. 기본 기준(main)으로는 T1·S1·D1이 이미 넣은 웹·디자인·설계 파일이 함께 잡힘).
- 2026-10-09: 0085 통합에서 실제 API·웹으로 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts` `무료 랜딩`). 확인 내용은 다음과 같습니다.
  - 위치: 맨 뒤·맨 앞·2번째 링크 다음, 링크가 슬롯 너머로 옮겨도 공개 랜딩 순서가 같습니다.
  - 노출: 단축 주소로 연 랜딩만 첫 장 노출 +1이고, 관리 미리보기·운영자 화면에서 연 랜딩은 늘지 않습니다.
  - `clickUrl`: 통과 표시가 있으면 `/a/…`, 같은 출처면 저장된 URL입니다.
  - 숨김: 게시 0장, 링크 모두 숨김(빈 랜딩), 포트폴리오만 있으면 광고 블록만 보입니다.
