# 0073 배너 클릭 경로·보존·클릭 통계

- 단계: 티켓
- 역할: api
- 상위: 0063
- 선행: 0068
- 상태: 완료
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-09

## 목적

광고 블록·배너 슬롯 기술 설계의 티켓 분해 T7입니다. 요구는 R20 ⑧, R21 ④, R9, R11입니다.

## 수용 기준

- [x] 클릭 경로·보존: `GET {SHORT}/a/…`·`/b/…`와 `SHORT_DOMAIN_ROUTES`(접두사 회귀 확인), 클릭 기록, 보존 작업 집계, `OperatorCreatorStats.bannerClicks`(미정 4), 지표·API 문서. 통합 테스트(`short-link.e2e-spec.ts`, 보존 작업). `/b/` 시험의 배너 행은 SQL로 넣습니다.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ad-banner.md)의 해당 절을 따릅니다.
- 제외: 다른 티켓의 범위.

## 위험·복구

기술 설계 `위험과 스파이크`·`통합과 배포 순서`를 따릅니다.

## 연결

- 설계: [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../specs/crelink-ad-banner.md) `티켓 분해` T7
- 요구: [PRD](../../product/crelink.md#요구사항) R20 ⑧, R21 ④, R9, R11
- 디자인: `design/ad-banner-block/handoff.md`

## 진행 기록

- 2026-10-09: 생성(0065 설계 승인 뒤 분해).
- 2026-10-09: 구현(api, 격리 worktree, `PORT_SLOT=47`, Compose project `crelink-apit7`).
  - `src/short-link/short-link.controller.ts`: `GET /a/:bannerPublicId/:landingPublicId`(게시 중 `starts_at <= now() < ends_at`·랜딩 있음·크리에이터 정지 아님 → `TrackingService.recordAdStat('click')` 백그라운드 → 저장된 URL 302, 쿠키를 읽거나 발급하지 않음), `GET /b/:bannerPublicId`(URL 있음·숨김·차단 아님·`banner_slot_granted_at` 있음·정지 아님 → `cl_vid` → `creator_banner_clicks` 원본 → 302, 단축 URL은 `short_links.landing_id = creator_banners.landing_id`). 아니면 둘 다 302 `/notice?reason=link_unavailable`. 공개 ID가 `^[a-z0-9]{10}$`(Caddy 세그먼트와 같음)이 아니면 DB를 보지 않고 안내. `SHORT_DOMAIN_ROUTES`에 `a/\:bannerPublicId/\:landingPublicId`·`b/\:bannerPublicId`.
  - `TrackingService.recordBannerClick`(링크 클릭과 같은 항목), 지표 `crelink.creator_banner.click`(`monitoring/metrics.ts`).
  - 보존 작업 `runOnce`: 365일 전 `creator_banner_clicks`를 `creator_banner_click_rollups`(날짜·단축 URL·배너 공개 ID)로 옮기고 같은 트랜잭션에서 지움. `visit_daily_rollups.link_clicks`에는 섞지 않음. 반환값에 `bannerClicks` 건수.
  - `StatsService`: `bannerClicks`를 원본(기간 안)과 집계를 합쳐 채움, `alt`는 `creator_banners`에서, 지운 배너는 null, 클릭 수 내림차순. `totals.linkClicks`·`daily`에는 넣지 않음.
  - 문서: `apps/api/docs/README.md` 단축 도메인 절(네 정의, Caddy 정규식, `/a/`·`/b/` 규칙, 쿠키), 지표 표, 보존·통계 절. `app.setup.ts` 주석, `.env.example` 주석. `apps/api/CHANGELOGS.md` 한 줄.
  - 계약 변경 없음(`OperatorCreatorStats.bannerClicks`는 0067에 있음). 소비자 영향: 웹 0082 통계 배너 클릭 표가 실제 값을 받음.
- 2026-10-09: 검증.
  - `make infra-up`(crelink-apit7) 후 `TEST_DATABASE_URL=…:10152 pnpm --filter @crelink/api test -- test/short-link.e2e-spec.ts`: 12건 통과(새 4건: `/a/` 성공·끝남·예약·없는 배너·없는 랜딩·정지·대문자·9자 안내와 카운터 `impressions 1, clicks 2`, 쿠키 없음 / `/b/` 원본 항목·`cl_vid` 발급·숨김·차단·URL 없음·회수·정지·없음·대문자·11자 안내·되돌리면 다시 302·삭제 뒤 기록 유지 / 접두사 회귀 `/a`·`/b`·`/c` link_not_found, `/a/x`·`/b/x/y`·`/a/x/y/extra` 404, `/api/health`·`/api/health/ready` 200, `/api/me/landing` 401 / 보존 뒤 원본 1건·집계 2행·재실행 0건·`bannerClicks` 합계와 `alt: null`).
  - `pnpm --filter @crelink/api test`(전체): 20 스위트 147건 통과(`test/health.e2e-spec.ts` 라우트 표가 `/api` 밖 네 정의만 있음을 확인).
  - `set -o pipefail; pnpm verify --fast`: 통과 6, 실패 0.
  - `make up` 뒤 실제 HTTP(SQL로 넣은 표본): `/a/t7adlive01/t7landing1` 302 `https://ad.example/x?y=1`·`Cache-Control: no-store`·Set-Cookie 없음, DB `ad_banner_daily_stats` `clicks 1`; `/a/t7adended1/…`·`/a/…/zzzzzzzzzz` 302 `link_unavailable`; `/b/t7crlive01` 302 저장된 URL + `cl_vid` 발급, DB `creator_banner_clicks` 1행(IP·유입 호스트·mobile·Safari·iOS); `/b/t7crhidden`·`/b/zzzzzzzzzz` `link_unavailable`; `/a/abcde12345` 404, `/b` `link_not_found`; `/api/health/ready` 200. `pnpm smoke` 5건 통과.
  - `pnpm work:scope 0073 --base HEAD` 통과(기본 기준 origin/main은 통합 브랜치의 다른 티켓 변경까지 세어 실패하므로 HEAD 기준으로 확인).
  - 통합 선행조건: 운영 클릭은 T8(0074, Caddy `/a/`·`/b/` matcher)이 main에 들어가야 Caddy 404가 아님. 실제 운영자 통계 HTTP 확인은 운영자 로그인이 필요해 통합 테스트로만 확인.
- 2026-10-09: 0085 통합에서 실제 웹·API로 확인하고 `완료`로 바꿨습니다(`tests/e2e/ad-banner.spec.ts`).
  - `/a/`: 302로 저장된 URL로 보내고(`no-store`, 쿠키 없음), 랜딩별 클릭 +1입니다.
  - `/b/`: 302하고 `creator_banner_clicks`에 visitor_id·IP를 남깁니다.
  - 안내 화면: 숨김·차단·없는 배너는 `link_unavailable`입니다.
  - 통계: 운영자 상세 `배너별 클릭` 표가 보입니다.
  - 보존 작업은 API 통합 테스트로만 확인했습니다(E2E 범위 밖). 운영 Caddy(0074)는 main에 있습니다.
