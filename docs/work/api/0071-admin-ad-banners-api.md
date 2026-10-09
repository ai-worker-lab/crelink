# 0071 크리링 광고 배너 운영 API

- 단계: 티켓
- 역할: api
- 상위: 0063
- 선행: 0067, 0069
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T5입니다. 요구는 R20 ④⑨, R14입니다.

## 수용 기준

- [x] 크리링 배너 운영(새 `admin/ad-banners.service.ts`·controller): 목록(상태·`counts`·누적 합계 `::int`), 등록·수정·내리기(멱등)·정렬, advisory lock, 운영자 이미지 소유 규칙, PATCH 차단 재검사. 통합 테스트(상태 경계 `starts_at = now`·`ends_at = now`, 다른 운영자의 수정, `/end` 두 번, 동시 정렬).

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T5
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ④⑨, R14
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(통합 브랜치 `work/0085-ad-banner-integration` 위 격리 작업공간). 공유 계약(`packages/shared`)과 migration은 바꾸지 않았습니다.
  - `src/admin/ad-banners.service.ts`·`ad-banners.controller.ts`(`@Controller('admin/ad-banners')`, `OperatorGuard`). `AdminModule`에 컨트롤러·서비스와 `FilesModule`(정지 이미지 판정 `FilesService.isAnimated`) 가져오기를 더함. `AdminService`·`AdminController`는 건드리지 않음(0072와 충돌 방지).
  - 목록: 설계 `운영자 표 누적 집계` 질의를 `LEFT JOIN LATERAL`(배너별 `sum(...)::int`)로, 상태는 같은 문장의 `now()`, `counts`는 같은 결과에서. 단건 응답(등록·수정·내리기)도 같은 SELECT.
  - 등록: 맨 뒤 `coalesce(max(sort_order) + 1, 0)`, `created_by`, `insertWithRandomId(10)` 공개 ID. 시각은 시간대가 붙은 ISO 8601(밀리초까지)만, `endsAt > startsAt`.
  - 수정: 바뀐 필드만, 배너 행 `FOR UPDATE`. 결과가 게시 중·예약이면 최종 호스트를 `CreatorService.blockedDomainFor`로 재검사. 이미지는 저장된 id와 같으면 검사를 건너뛰고, 새 파일은 `users.role = 'operator'`가 올린 것만(아니면 404 `file_not_found`).
  - 정지 이미지: 최종 이미지가 움직이면 움직이지 않는 정지 이미지 필수, 움직이지 않으면 정지 이미지 null. PATCH에서 이미지를 바꾸면 `stillImageFileId` 키 필수. 모두 400 `validation_failed`.
  - 내리기: 설계 SQL(`least(coalesce(ends_at, now()), now())`, 예약은 `starts_at`도), 이미 끝났으면 갱신 없이 200. 정렬: 잠금 뒤 `orderedIds` → `unnest … WITH ORDINALITY`로 0..n-1. 등록·정렬·내리기는 `pg_advisory_xact_lock(931475212)`.
  - 문서: `apps/api/docs/README.md` `크리링 배너 운영` 절, `apps/api/CHANGELOGS.md`.
  - 설계와 다른 점: 없음. 설계가 정하지 않은 부분의 판단은 셋입니다. (1) 움직이지 않는 이미지에 정지 이미지를 보내면 400(계약 주석 "아니면 null"을 엄격히 적용). (2) 수정도 배너 행 잠금으로 내리기와 줄 세움. (3) 시각 소수 초는 밀리초(3자리)까지만 받음(JS 비교와 DB 값이 어긋나지 않게).
- 2026-10-09: 검증(Node 24.20, `set -o pipefail`, 격리 인스턴스 `PORT_SLOT=45`·Compose project `crelink-adbanners`).
  - 새 시험 `test/ad-banners.e2e-spec.ts` 11건 통과: 401·403(5경로), 등록 응답·맨 뒤 순서·`created_by`, 등록 검증(ftp·시간대 없음·끝 ≤ 시작·차단 도메인과 하위·크리에이터 파일·없는 파일·이미지 없음·대체 문구), 정지 이미지 규칙(NULL 파일 지연 판정 포함), 상태 경계(한 트랜잭션에서 `starts_at = now()` 게시 중·`ends_at = now()` 끝남·`+1µs` 예약/게시 중·`starts = ends = now()` 끝남, `CreatorService.liveAdBanners`와 같은 판정), HTTP 상태별 `counts`, 누적 합계(20억 단위 합이 JSON number, 기록 없음 0), 다른 운영자의 수정(문구·주소·이미지 교체, 운영자 공용 파일, 크리에이터 파일 404, 이미지만 바꾸면 400, 404), PATCH 차단 재검사(게시 중 문구만 422, 끝난 채 수정 200, 기간만 다시 열면 422, 주소 바꿔 열기 200), `/end` 두 번(같은 응답·`updated_at` 그대로, 예약은 시작 = 끝, 이미 끝난 배너 그대로, 404), 정렬(`order_mismatch` 5가지, 동시 정렬 4개 모두 200·결과는 그중 하나·`sort_order` 0..3, 동시 등록 3개 서로 다른 맨 뒤).
  - `make infra-up` 뒤 `pnpm verify` 통과(API 21 suites 154/154, lint·typecheck·build). `pnpm verify --fast` 통과. `pnpm work:scope 0071 --base HEAD` 통과(변경 6개).
  - `make up` 뒤 실제 HTTP(`127.0.0.1:7520`, 운영자 2명·크리에이터 세션은 SQL로 넣고 이미지는 `POST /api/me/files`로 올림): 401·403, 등록 201(게시 중, 움직이는 GIF + 정지 이미지 예약), 정지 이미지 없음 400 `validation_failed`, `ftp://` 400 `link_url_invalid`, 시간대 없음 400, 끝 < 시작 400 `banner_period_invalid`, 크리에이터 파일 404. 카운터 3행(SQL) 뒤 목록 `impressions: 50`·`clicks: 8`. 도메인 차단 뒤 운영자 2의 문구만 수정 422, 주소 바꾼 수정 200. `/end` 두 번 같은 `endsAt`, 예약 배너 내리기는 `starts_at = ends_at`. 차단 주소로 다시 열기 422, 기간만 다시 열기 200. 정렬 `order_mismatch` 400·성공 200, 없는 배너 404. 최종 `counts` `{all: 2, live: 1, scheduled: 0, ended: 1}`.
  - `pnpm smoke` 5/5 통과.
- 2026-10-09: 0085 통합에서 실제 웹 화면으로 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts` `운영자 크리링 배너`·`무료 랜딩`).
  - 이미지: 운영자 계정의 `POST /api/me/files` 업로드로 등록합니다(PNG, GIF + 정지 이미지).
  - 등록 오류: `link_url_invalid`·`link_domain_blocked`를 확인했습니다. 끝이 시작보다 앞인 기간은 웹이 먼저 막습니다.
  - 상태와 순서: 예약은 `예약`에만 보이고, 정렬은 공개 랜딩 순서와 같습니다. 수정은 바뀐 필드만 PATCH합니다.
  - 내리기·재열기: 내리면 `끝남`이 되고, 차단 도메인으로 끝난 배너를 기간만 고쳐 다시 열면 422입니다.
  - 집계: 표의 노출·클릭이 DB 누적과 같습니다.
