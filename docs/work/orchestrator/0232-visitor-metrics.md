# 0232 방문자 지표 보강: 봇 제외, 유입별 클릭률, 신규·재방문

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-10

## 목적

곧 신청형 게시로 방문자를 모으는데 지금 화면으로는 어느 유입이 실제로 링크를 누르는지, 사람이 다시 오는지 볼 수 없습니다. 방문 수가 적어(최근 30일 55건) 봇 몇 건에도 숫자가 흔들리는데 봇 구분이 없습니다. 새 데이터를 수집하지 않고 저장된 값으로 계산합니다.

## 수용 기준

- [x] `packages/shared`의 패턴 목록 순수 함수 `isBotUserAgent`가 알려진 크롤러·자동화 도구와 일반·앱 내 브라우저를 구분합니다(단위 시험).
- [x] 지표 합계에서 봇을 빼고 제외 건수를 화면에 작게 표시합니다. `user_agent` 원문·IP·방문자 ID는 응답과 화면에 없습니다.
- [x] 유입 사이트와 UTM 소스별 페이지뷰·클릭한 페이지뷰·클릭률을 기존 `유입·캠페인` 구역에 표시합니다.
- [x] 선택 기간의 익명 방문자를 처음 본 방문자·다시 온 방문자로 나누고 기준을 화면에 적습니다.
- [x] 보존 합계가 섞인 구간은 세 지표가 `null`이고 화면에 `집계 불가`로 표시됩니다.
- [x] 크리에이터 본인·운영자 화면 모두 기존 권한 그대로이고 다른 크리에이터 자료가 섞이지 않습니다(API 통합 시험).

## 봇 제외를 적용한 곳

코드로 두 기록의 차이를 확인했습니다.

| 기록 | 만들어지는 경로 | 봇이 섞이는지 | User-Agent |
| --- | --- | --- | --- |
| `visits`·`link_clicks`·`creator_banner_clicks`(화면의 `단축 주소 리디렉트 기록`) | `apps/api/src/short-link/short-link.controller.ts`, `tracking.service.ts`. GET 요청마다 서버가 저장. JS 불필요 | 링크 미리보기·검색 크롤러·curl까지 모두 섞입니다. 가장 많이 섞이는 쪽입니다 | 요청 헤더 그대로 |
| `landing_events`(화면의 페이지뷰·클릭·세션·체류) | `apps/api/src/telemetry/landing-events.service.ts`. 브라우저 JS가 서명 token과 Origin으로 POST | JS를 실행하는 자동화(Googlebot 렌더링, HeadlessChrome, Lighthouse)만 들어옵니다. 미리보기 크롤러는 못 들어옵니다 | 같은 방문자·시각으로 연결한 `visits`의 값을 복사. 연결 실패면 NULL |

그래서 **두 쪽 모두** 적용했습니다. `visits`·`link_clicks`·`creator_banner_clicks`는 `legacy` 합계, `landing_events`는 요약·일별·분포·대상·유입별 클릭률·신규/재방문의 사람 합계에서 뺍니다. NULL·빈 값은 사람으로 둡니다. 제외 건수는 `botExclusions`로만 내보내고 User-Agent 값이나 봇 이름은 내보내지 않습니다.

## 설계 요약

- 계약: `AnalyticsReport`에 `sources`, `visitorRecency`, `botExclusions`를 추가했습니다. `summary`는 그대로입니다.
- 계산: `apps/api/src/analytics/analytics.service.ts`. 같은 스냅샷에서 범위의 서로 다른 User-Agent를 읽어 `isBotUserAgent`로 고르고 SQL은 그 값과의 일치만 봅니다(판별식이 코드 한 곳).
- 유입별 클릭률의 페이지뷰는 기존 분포와 같은 값입니다. 상위 20개 밖은 기타로 합칩니다(분자도 보존).
- 재방문: 같은 소유 범위에서 기간 시작 전 사람 `page_view`가 있는 `visitor_id`입니다. 크리에이터 화면에서는 다른 크리에이터의 방문을 재방문으로 세지 않습니다. 운영자 서비스 전체는 그 전체가 범위입니다.
- 화면: `AnalyticsDashboard.tsx`. 지표 화면에 처음 본·다시 온 방문자 칸과 기준, 두 화면 공통으로 봇 제외 건수, 통계 화면 `유입·캠페인`에 유입별 표. 표는 기존 `table-scroll`·`data-table`입니다.
- 작은 표본: 기존 관례대로 값별 합계만 보여 주고 날짜×유입 교차·방문자 목록·봇 종류 표시를 만들지 않습니다.

## 범위

- 포함: `packages/shared`(판별 함수·계약), `apps/api/src/analytics`, `apps/api/test/analytics.e2e-spec.ts`, `apps/web/src/components/analytics/AnalyticsDashboard.tsx`, `apps/web/src/lib/analytics.ts`, `tests/e2e/fixtures.ts`(세션 기본 UA), 변경 기록, `docs/specs/crelink-analytics.md`, `apps/api/docs/analytics.md`, 이 문서.
- 제외: 새 컬럼·쿠키·수집 항목, 처리방침, 보존 작업(`retention.service.ts`), 기존 `/api/admin/metrics`·`/api/admin/creators/{id}/stats`, 새 차트 라이브러리, 웹 페이지 구조 변경.

## 위험·복구

- 데이터 변경·migration이 없습니다. 되돌리려면 이 변경을 revert합니다.
- 패턴 목록에 없는 봇은 사람으로 남고, UA를 위장한 봇은 구분되지 않습니다. 이 값은 사람 수의 증명이 아닙니다.
- `landing_events`의 User-Agent는 `visits`와 시각으로 연결해 복사한 값이라 연결이 안 된 행은 NULL이고 사람으로 셉니다.
- 보존 합계(`*_rollups`)는 User-Agent가 없어 봇이 그대로 남습니다. 365일을 넘긴 구간은 봇 제외 전 합계이고, 화면의 제외 건수와 세 지표는 `집계 불가`입니다. 보존 작업에서 봇을 빼려면 새 컬럼 또는 합계 정책 변경이 필요해 이번 범위 밖입니다.
- 재방문은 원본이 남은 365일 안에서만 비교합니다. 그보다 오래된 방문자는 처음 본 방문자로 셉니다(화면에 적음).
- e2e 세션의 기본 UA: Playwright 1.64의 `browser.newContext()`는 설정의 `use`를 상속하지 않아 크로미움 헤드리스 기본값 `HeadlessChrome`이 됩니다. 그대로면 CI의 `personas`·`analytics-responsive`가 페이지뷰 0으로 실패하므로 `tests/e2e/fixtures.ts`의 `session()`에서 크로미움만 `Desktop Chrome` UA를 씁니다.

## 연결

- 설계: [지표·통계 설계](../../specs/crelink-analytics.md#방문자-지표-보강0232), [방문자 수집](../../specs/crelink-visitor-data.md)
- 코드: `packages/shared/src/bot-user-agent.ts`, `packages/shared/src/analytics.ts`, `apps/api/src/analytics/analytics.service.ts`, `apps/web/src/components/analytics/AnalyticsDashboard.tsx`

## 진행 기록

- 2026-11-10: 생성·구현. `pnpm verify` 8단계, `pnpm work:scope 0232`, `pnpm work:check`, `pnpm ci:local`(12단계, ego smoke·analytics-responsive·visitor·signup-funnel 포함)을 통과했습니다. API 통합 시험 `test/analytics.e2e-spec.ts` 16개(실제 PostgreSQL, 이번 추가 5개), 봇 판별 단위 시험 45개가 통과했습니다.
- 2026-11-10: 시험이 결함을 잡는지 변이로 확인했습니다. `visits`의 봇 필터 제거, 재방문 비교의 소유 범위 제거, 유입별 클릭의 보존 구간 `null` 제거를 각각 넣으면 해당 시험이 실패합니다(종료 코드 1). 되돌린 뒤 파일이 원본과 같은 것을 확인했습니다.
- 2026-11-10: 로컬 화면 확인(ego-lite, 합성 계정, 390·1280px). 크리에이터·운영자 × 지표·통계 × 데이터 있음·보존 합계만·빈 기간 24조합에서 세 지표 표시, 가로 넘침 0, 콘솔 오류·외부 요청 0, User-Agent 문구 미노출을 확인했습니다. 합성 계정은 끝난 뒤 지웠습니다.
- 2026-11-10: Playwright 전용 시험(`personas`, `analytics-responsive`의 WebKit·Firefox 등)은 이 기기에 브라우저가 없어 돌리지 않았고 PR CI로 확인합니다. `tests/e2e/fixtures.ts`의 UA 변경은 이 CI에서 처음 실행됩니다.
