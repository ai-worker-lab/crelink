# 크리에이터·서비스 지표와 통계

본인 랜딩이 있는 사람 계정은 역할에 관계없이 본인 페이지의 집계를 조회합니다. 운영자는 서비스 전체 또는 선택 크리에이터의 집계도 조회합니다. 지표와 통계 화면은 같은 응답을 사용합니다. 방문자 IP·원문 UA·방문자/세션/페이지뷰/이벤트 UUID와 개별 방문 기록은 반환하지 않습니다. 계약은 [AnalyticsReport](../../../packages/shared/src/analytics.ts), 구현은 [AnalyticsService](../src/analytics/analytics.service.ts), 공유 경로는 [crelink.ts](../../../packages/shared/src/crelink.ts)가 기준입니다. 요구·화면은 [조회 설계](../../../docs/specs/crelink-analytics.md)를 따릅니다.

## 조회와 권한

| 경로 | 권한 | 조건 |
| --- | --- | --- |
| `GET /api/me/analytics` | `SessionGuard` | `CurrentUser.id`의 페이지(사람 크리에이터·운영자). `from`, `to`만 허용 |
| `GET /api/admin/analytics` | `OperatorGuard` | `from`, `to`, 선택 `creatorId`, `landingPublicId`, `includeExcluded=1` |

날짜는 `YYYY-MM-DD`, `Asia/Seoul` 기준 양 끝 포함이며 기본은 오늘까지 30일, 최대 366일입니다. 잘못된 날짜는 400 `date_range_invalid`, 중복·알 수 없는 query와 필터 형식 오류는 400 `validation_failed`입니다. 없는 크리에이터와 서로 맞지 않는 계정·랜딩 조건은 404 `creator_not_found`, 미로그인은 401, 운영자가 아닌 관리 경로 접근은 403입니다. 본인 경로는 계정·랜딩·시험 계정 포함 필터를 거부해 타인 범위로 넓힐 수 없습니다. 응답 캐시는 `private, no-store`입니다.

서비스 기본 범위는 기존 사업 지표와 같은 사람 크리에이터 중 `metrics_excluded_at IS NULL`인 계정입니다. 운영자는 `includeExcluded=1`로 제외 표시 계정도 합치거나 `creatorId`·`landingPublicId`로 직접 선택할 수 있습니다. 명시 계정 선택과 본인 조회는 지표 제외 여부와 무관합니다. 정지 계정의 과거 집계는 관리 범위에 남고 정지한 본인 세션 인증은 기존 가드가 거부합니다. `scope.includeExcluded`는 서비스 범위에만 의미가 있습니다. 관리자 선택 UI는 기존 크리에이터 검색·쪽 나누기 API를 사용합니다.

기존 `/api/admin/metrics`의 가입·활성화·실사용자 목표와 기간 정의는 그대로입니다. 새 관리자 지표 화면이 별도 카드로 병행하며 새 방문 분석과 같은 기간이라고 설명하지 않습니다. 기존 `/api/admin/creators/{userId}/stats`도 응답 계약을 유지합니다.

## 수량과 분모

- `pageViews`, `clicks`, `impressions`는 브라우저 이벤트가 발생한 서울 날짜의 수량입니다. 브라우저 보고이므로 실제 사람 방문의 보증은 아닙니다.
- `activeMs`는 `page_view` 앵커의 누적 최댓값만 합합니다. `engagement` 행의 누적값은 다시 더하지 않습니다. 평균은 이 합을 페이지 표시 수로 나누며 분모가 없으면 null입니다.
- `clickedPageViews`와 `clickThroughRate`는 선택 기간에 시작한 페이지 표시 중 후속 클릭이 있는 수와 비율입니다. 반복 클릭은 한 표시로 세고 자정 뒤 클릭도 시작한 표시의 cohort에 귀속합니다. 0~1 비율이며 클릭 횟수/페이지 표시 횟수와 다릅니다.
- 대상별 비율은 선택 기간의 관측 노출 중 동일 페이지 표시·대상에 후속 클릭이 있는 비율입니다. 클릭 시각이 노출보다 빠르거나 관측 노출이 없으면 그 클릭을 분자에 넣지 않습니다. 클릭 횟수는 별도로 유지합니다. 대상 목록은 클릭·노출 내림차순 상위 100개이며 삭제된 대상 이름은 null입니다.
- `scroll25/50/75/100`은 선택 기간에 시작한 페이지 표시 중 해당 비율에 도달한 수입니다. 실제 읽음으로 단정하지 않습니다.
- `uniqueVisitors`, `sessions`는 원본 `page_view`의 선택 소유 범위 전체 DISTINCT입니다. 관리자 전체에서도 크리에이터별 고유 수를 더하지 않습니다. 보존 집계가 섞인 기간은 정확한 기간 중복 제거를 복원할 수 없어 null이며 `dailyPageUniqueVisitors`, `dailyPageSessions`에 일별·페이지별 고유 수의 합을 별도로 제공합니다.
- `legacy`와 일별 `legacy*`는 기존 단축 요청과 302 링크·크리에이터 배너 클릭입니다. 브라우저 표시·클릭과 중복될 수 있어 합산하지 않습니다. 브라우저 자료가 없고 legacy만 있는 과거는 행동 자료 미수집으로 설명합니다.

- `sources`는 유입 사이트(`referrer_host`)·UTM 소스 값별 페이지뷰, 한 번 이상 클릭한 페이지뷰, 그 비율입니다. 값 규칙은 분포와 같고 상위 20개 뒤는 `other`로 합칩니다. 선택 기간에 보존 집계가 섞이면 클릭 값은 null입니다.
- `visitorRecency`는 선택 기간 익명 방문자를 같은 소유 범위의 기간 시작 전 원본 page_view 유무로 나눈 수입니다. 선택 기간에 보존 집계가 섞이면 null이고 원본이 없는 365일 이전 방문은 비교하지 못합니다.
- 합계·분포·대상·`legacy`는 알려진 크롤러·자동화 도구를 뺀 값입니다(`isBotUserAgent`, `packages/shared/src/bot-user-agent.ts`). 저장된 `user_agent`로 판별해 `landing_events`와 `visits`·`link_clicks`·`creator_banner_clicks` 양쪽에 적용합니다. 값이 없으면 사람으로 둡니다. `botExclusions`에 뺀 건수만 내보내며 보존 집계 구간은 구분할 수 없어 합계에 남고 해당 건수는 null입니다.

분포는 페이지 표시를 분모로 유입 호스트·국가/도시·기기/브라우저/OS·언어/시간대·viewport/screen/DPR·UTM 여섯 항목을 집계합니다. 값이 없으면 `unknown`, 상위 20개 이후는 `other`로 합쳐 분모를 유지합니다. 이는 값별 합계이며 개별 방문자의 속성 조합이나 식별자를 제공하지 않습니다.

## 과거 자료와 보존

[0010 migration](../migrations/0010_analytics_rollups.sql)은 기존 일별 집계에 클릭한 표시·노출 후 클릭·스크롤 카운터를 nullable로 추가하고 `landing_event_dimension_rollups`를 만듭니다. 과거에 원본을 지운 집계는 새 비율·스크롤을 복원할 수 없어 null을 유지하고 분포 누락은 `unknown`으로 합칩니다. `coverage.hasMissingDimensions`가 이 누락을 알립니다.

365일 전 자료는 기존 보존 작업의 같은 트랜잭션에서 새 카운터·값별 분포를 먼저 집계하고 원본을 지웁니다. 장기 집계에는 IP·원문 UA·방문자/세션/페이지뷰/이벤트 UUID를 넣지 않습니다. 날짜·소유 페이지·콘텐츠 대상·각 분포 값은 집계 구분에 남습니다. 실패하면 집계와 삭제가 함께 롤백되고 재실행으로 중복 집계하지 않습니다.

`coverage.rawFrom`은 현재 서울 날짜의 원본 보존 경계이며 보존 작업 전에는 그보다 오래된 원본도 남을 수 있습니다. `includesRollups`는 선택 날짜 범위에 실제 보존 이벤트 행이 있는지, `firstRecordedDay`는 날짜 필터와 무관하게 해당 소유 범위 전체 가용 페이지 표시의 첫 날짜입니다. 첫 수집일을 계측 도입일로 단정하지 않습니다. 수집 차단·직접 미리보기·수집 이전 기간에서는 표시 자료가 없을 수 있습니다.

새 조회와 기존 `StatsService`는 [Database.snapshot](../src/database.ts)의 단일 `REPEATABLE READ READ ONLY` 트랜잭션을 사용합니다. 원본 조회와 보존 합계 조회 사이에 보존 작업이 커밋해도 같은 스냅샷을 읽어 중복·누락을 막습니다. 대여한 한 연결의 쿼리는 순서대로 실행합니다.

## 검증

[analytics.e2e-spec.ts](../test/analytics.e2e-spec.ts)는 실제 일회용 PostgreSQL과 HTTP에서 권한·본인 범위·관리 필터·서비스 전체 DISTINCT·누적 체류·cohort 자정·원식별자 비노출·날짜/빈 구간·기존 302 분리·보존 전후·이전 집계의 null·원본 읽기 뒤 실제 보존 커밋을 검증합니다. 운영자 본인 조회는 실제 이벤트·기존 방문 집계를 반환하고, 타인 자료와 관리자 전체 집계의 운영자 제외 정책을 유지하는지 확인합니다. 동시성 회귀는 새 조회와 기존 운영자 통계 모두에 적용합니다. 운영 DB·실제 개인정보는 시험에 사용하지 않습니다.

집중 명령: `pnpm --filter @crelink/api test --runInBand analytics admin landing-events health`.
