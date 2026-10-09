# 0072 배너 슬롯 부여·배너 차단·차단 도메인 처리

- 단계: 티켓
- 역할: api
- 상위: 0063
- 선행: 0068
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T6입니다. 요구는 R21 ①④⑤, R14입니다.

## 수용 기준

- [x] 부여·차단: `PUT …/banner-slot`, `PUT /api/admin/banners/{id}/block`, `OperatorCreatorDetail` 추가 필드, 차단 도메인 추가 시 배너 처리(미정 3). 통합 테스트.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T6
- 요구: [PRD](../../product/crelink.md#요구사항) R21 ①④⑤, R14
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(통합 브랜치 `work/0085-ad-banner-integration` 위 격리 작업공간). 공유 계약(`packages/shared`)은 바꾸지 않았습니다.
  - `PUT /api/admin/creators/{userId}/banner-slot`(`AdminService.setBannerSlot`): `granted`가 boolean이 아니면 400 `validation_failed`, 없는 크리에이터 404 `creator_not_found`. `banner_slot_granted_at = CASE WHEN granted THEN coalesce(banner_slot_granted_at, now()) END`(다시 부여해도 시각 유지, 회수는 NULL, 배너 행·`slot_position` 그대로). 응답 `OperatorCreatorDetail`.
  - `PUT /api/admin/banners/{id}/block`(`setBannerBlock`): 링크 차단과 같은 입력 검사(`blockInput`으로 묶음: `blocked` boolean, `reason` 200자 이하 문자열·공백은 null)와 규칙(`blocked_at = coalesce(blocked_at, now())`, 풀면 사유도 null). uuid가 아니거나 없으면 404 `banner_not_found`. 응답 `CreatorBannerView`(`CreatorService.creatorBannerView`).
  - `GET /api/admin/creators/{userId}`: `SUMMARY_SELECT`에 `l.id AS landing_id`, `u.banner_slot_granted_at`을 더하고 `bannerSlot.grantedAt`, `banners`(`CreatorService.creatorBanners`), `bannerLimits`(`CreatorService.bannerLimits`)를 채움(0067의 빈 값 제거).
  - `POST /api/admin/blocked-domains`(`addBlockedDomain`): 같은 트랜잭션에서 링크와 같은 호스트 조건으로 `creator_banners`(차단 안 된 것만, 사유 = 입력 또는 `차단 도메인: …`)를 차단하고, 게시 중·예약 `ad_banners`를 `ends_at = least(coalesce(ends_at, now()), now())`, `starts_at = least(starts_at, now())`로 내림(0071의 `…/end`와 같은 식, ApiT5와 확인). 중복 도메인 409면 모두 되돌아감.
  - 문서: `apps/api/docs/README.md` 크리에이터 규칙에 한 줄, `apps/api/CHANGELOGS.md` 한 줄.
  - 설계와 다른 점: 없음.
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`, 격리 인스턴스 `PORT_SLOT=46`·Compose project `crelink-t6grant`).
  - 새 시험 `apps/api/test/admin-banner-slot.e2e-spec.ts` 5건 통과: 새 두 경로 401·403(행 안 바뀜), 상세 추가 필드(빈 값 → 숨김·차단 포함 순서·다른 크리에이터 제외·한도 1/5·3/20), 부여·회수(부여 시각 유지, 공개 랜딩 `ad` → `creator` → `ad`, 편집 상태 `grantedAt`, 회수해도 배너 보관, 재부여, 400 5가지·404 2가지), 배너 차단·풀기(공개 랜딩 숨김·한도 제외·편집 상태 사유, 다시 막아도 `blocked_at` 유지·공백 사유 null, 풀면 사유 null, 400 4가지·404 2가지), 차단 도메인(정확·하위 도메인 차단, 비슷한 이름·URL 없음·먼저 막은 사유 유지, 게시 중 2장 끝남·시작 그대로, 예약 시작=끝=지금, 이미 끝난 배너·다른 도메인 그대로, 기본 사유, 목록에서 빼도 유지, 409면 배너 안 바뀜).
  - `pnpm verify --fast` 통과, `make infra-up` 뒤 `pnpm verify` 통과(API 21 suites 148/148).
  - `make up` 뒤 실제 HTTP(`127.0.0.1:7620`, 세션·크리에이터·배너 행은 SQL, 이미지는 운영자 `POST /api/me/files`): 상세 `grantedAt: null`·배너 2·한도 2/5·2/20 → 부여 200(`grantedAt`) → 공개 `kind: creator`·2장. 부여 400 `validation_failed`(`"yes"`)·404 `creator_not_found`·크리에이터 403 `forbidden`·익명 401 `unauthenticated`. 배너 차단 200(`blocked: true`·`신고`) → 풀기 200(사유 null), 없는 배너 404 `banner_not_found`, `blocked: 1` 400. `POST /api/admin/blocked-domains` `t6spam.example` 201 → `www.t6spam.example` 배너 차단(`차단 도메인: t6spam.example`)·한도 1/5, 공개 랜딩 1장, 게시 중 크리링 배너 끝남(시작 그대로)·예약 배너 시작=끝·다른 도메인 게시 중 그대로. 회수 → `grantedAt: null`·배너 2 보관, 공개 `kind: ad`·남은 크리링 배너 1장.
  - `pnpm smoke` 5/5 통과.
- 2026-10-09: 0085 통합에서 실제 웹 화면으로 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts` `배너 슬롯`·`운영자 크리링 배너`).
  - 부여·회수: 부여하면 같은 자리가 배너 슬롯, 회수하면 광고 블록으로 돌아가고 배너 6장은 보관됩니다. 다시 부여하면 이전 배너가 그대로 보입니다.
  - 배너 차단: 차단·풀기가 됩니다.
  - 차단 도메인 추가: 크리에이터 배너는 차단되고(사유 유지), 게시 중 크리링 배너는 끝납니다.
