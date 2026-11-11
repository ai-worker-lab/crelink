# 0233 지표의 본인 방문 표시와 Meta 링크 검사 제외

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-10

## 목적

쌓인 방문 대부분이 크리에이터 본인입니다. 사용자는 본인 방문을 빼지 않고 표시만 하기로 정했습니다. Instagram에 링크를 걸 때 들어온 Meta 자동 검사 16건도 일반 브라우저 User-Agent라 사람처럼 집계됩니다.

## 수용 기준

- [x] 공개 랜딩 페이지뷰를 저장할 때 유효한 로그인 세션의 사용자가 그 랜딩의 소유자이면 본인으로 표시하고, 이후 이벤트는 페이지뷰 값을 따릅니다.
- [x] 비로그인·다른 사용자 세션은 표시가 없고, 잘못되거나 만료된 세션과 세션 확인 실패에도 이벤트는 저장됩니다.
- [x] 지표·통계의 페이지뷰와 익명 순 방문자에 합계를 빼지 않고 `본인 N`을 표시합니다. 크리에이터·운영자 권한은 기존 그대로입니다.
- [x] 본인 표시가 없던 과거 구간은 `0`이 아니라 표시 없음이고, 화면에 `이번 배포 이후 로그인 상태의 방문만 표시`를 적습니다.
- [x] `2a03:2880::/32`에서 온 요청을 저장값 `ip` 기준으로 서버에서 봇 제외하며 판별 함수와 시험을 둡니다.
- [x] `cl_vid`와 계정을 잇는 표·필드, 새 쿠키가 없고 세션 값·IP·사용자 ID가 응답·로그에 없습니다.

## 설계 요약

- **세션을 왜 빼고 있었나:** BFF의 `visitorEvent` 경로는 익명 수집이라 쿠키를 넘기지 않았습니다(0181·0185, 0205 교차 검토). 수집에 인증이 필요 없으니 세션을 API로 보낼 이유가 없었다는 최소 노출 원칙이고, 코드나 기록에 별도 보안 사고·제약은 없습니다.
- **BFF:** 규칙에 `ownerSession`을 두어 랜딩 이벤트 경로에만 `cl_session`을 넘깁니다. 가입 경로 합계(`signup-funnel/events`)는 그대로 넘기지 않습니다. 같은 BFF의 로그인 경로들과 같은 방식이고 다른 곳으로 값을 복사하지 않습니다.
- **API:** `AuthService.sessionUserId`가 쿠키 세션만 보고 Bearer·Sentry user를 건드리지 않으며 실패해도 던지지 않습니다. 트랜잭션 밖에서 페이지뷰일 때만 한 번 호출합니다. 저장 값은 `landing_events.is_owner` boolean 하나입니다.
- **과거 구간:** 컬럼 기본값이 false라 과거 행과 "본인 아님"이 구분되지 않습니다. 조회 범위의 첫 본인 표시 날(`first_owner_day`)부터만 값을 내고 그 전은 `null`입니다. 보존 합계가 섞인 구간도 `null`입니다.
- **봇 제외:** 합계·분포·제외 건수가 쓰는 기존 판별식에 IP를 더했습니다. `isMetaCrawlerIp`(`apps/api/src/analytics/bot-ip.ts`)가 판별하고 SQL은 값 비교만 합니다. 클라이언트 번들에 들어가지 않도록 `packages/shared`에 두지 않았습니다.
- **화면:** 지표의 타일 두 칸과 양쪽 화면의 일별 표에 뱃지를 붙입니다. 일별 표는 1 이상일 때만 표시합니다(행마다 `본인 0`이 반복되지 않게).

## 범위

- 포함: migration `0018_landing_event_owner`, `apps/api/src/telemetry`·`auth`·`short-link` 모듈 연결·`analytics`, `packages/shared/src/analytics.ts`, BFF 규칙, `AnalyticsDashboard.tsx`, `styles.css`, 시험, 변경 기록, 관련 문서, 이 문서.
- 제외: 처리방침, 보존 작업(`retention.service.ts`), `/api/admin/metrics`·`/api/admin/creators/{id}/stats`, 앱 내 브라우저 처리, 과거 행 소급 표시.

## 위험·복구

- migration은 추가 전용이고 기본값이 있어 이전 API로 되돌려도 동작합니다. 표시를 끄려면 코드를 revert하고 컬럼은 남겨 둡니다.
- `is_owner=true` 행은 같은 행의 `visitor_id`와 함께 있어 그 익명 쿠키가 소유자의 것임을 DB에서 추정할 수 있습니다. 요청대로 boolean만 저장했고 계정 ID·세션은 저장하지 않으며, 집계 건수만 응답합니다.
- 공개 이벤트 경로가 이제 페이지뷰마다 세션 조회 한 번을 더 합니다(`sessions.token_hash` 인덱스). 실패해도 저장은 진행됩니다.

## 알려진 한계

- 배포 이후 방문부터만 표시합니다. 그 전 행은 소급하지 않습니다.
- 세션이 없는 브라우저(앱 내 브라우저 등)에서 본인이 열면 구분하지 못하고 일반 방문으로 남습니다. 단축 주소 리디렉트 기록(`visits`·`link_clicks`·`creator_banner_clicks`)도 본인을 구분하지 못합니다.
- 소유자가 아직 로그인 상태로 자기 페이지를 본 적이 없으면 뱃지가 없습니다(`본인 0` 아님). 그 뒤부터는 본인 방문이 없는 기간이 `본인 0`으로 표시됩니다.
- 조회 범위가 첫 표시일 이전까지 걸치면 `본인 N`은 표시 시작 이후의 건수이고, 합계는 전 기간입니다.
- Meta 제외는 지정한 대역과 저장된 `ip`가 있는 행만 대상입니다. 보존 합계 구간은 IP가 없어 그대로 남습니다.

## 연결

- 설계: [지표·통계 설계](../../specs/crelink-analytics.md#본인-방문-표시와-meta-링크-검사-제외0233), [방문자 수집](../../specs/crelink-visitor-data.md)
- 코드: `apps/api/migrations/0018_landing_event_owner.sql`, `apps/api/src/telemetry/landing-events.service.ts`, `apps/api/src/analytics/bot-ip.ts`, `apps/api/src/analytics/analytics.service.ts`, `apps/web/src/app/api/backend/[...path]/route.ts`, `apps/web/src/components/analytics/AnalyticsDashboard.tsx`

## 진행 기록

- 2026-11-10: 생성·구현. API 통합 시험(실제 PostgreSQL) 본인 표시 4개, 지표 5개, Meta IP 단위 시험 21개를 추가했습니다.
- 2026-11-10: 시험이 결함을 잡는지 변이 12개로 확인했습니다(타인 세션 표시, 앵커 미상속, 세션 실패 전파, 본인 제외, 과거 구간 0, 보존 구간 비표시, 범위 격리, Meta 필터 제거·대역 확대, 봇 시작일). 첫 실행에서 보존 구간 변이 하나가 살아남아 최근 원본에 본인 표시가 남는 경우로 시험을 고친 뒤 모두 실패(종료 코드 1)를 확인했고 파일은 복원했습니다.
- 2026-11-10: 로컬 화면 확인(ego-lite, 합성 계정, 390·1280px). 단축 주소부터 실제로 방문해 비로그인·소유자·다른 크리에이터 세션의 저장 값을 DB로 대조했습니다(`is_owner` 0→1→1건 유지). 크리에이터·운영자 × 지표·통계 × 첫 표시를 포함한 기간·과거 구간 × 두 폭 16화면과 운영자 서비스 전체 1화면에서 `본인 N`, 과거 구간 뱃지 없음, 안내 문구, 문서 가로 넘침 없음, 콘솔 오류 없음을 확인했습니다. 합계 133개 통과, 합성 계정은 끝난 뒤 지웠습니다.
- 2026-11-10: `pnpm verify` 8단계(API 34개 스위트 311개 시험), `pnpm work:scope 0233`, `pnpm work:check`, `pnpm ci:local`(11단계 통과, 스택 정리는 이 실행이 띄운 스택이 없어 건너뜀, ego smoke·analytics-responsive·visitor·signup-funnel·이미지 빌드 포함)을 통과했습니다.
- 2026-11-10: 앞선 `pnpm verify` 두 번은 실패했습니다. 하나는 `test/health.e2e-spec.ts`의 migration 고정 목록 누락이라 고쳤고, 다른 하나는 `sorry, too many clients already`였습니다. 12코어에서 jest 워커 11개가 풀 상한까지 연결을 잡으면 로컬 PostgreSQL `max_connections` 100에 닿습니다. 스위트별 연결은 풀 상한(10~11) 안이라 누수는 보이지 않았고, 이 브랜치 피크는 95~105, `origin/main`은 65~90이었습니다. 차이의 원인은 확정하지 못했고 `pnpm verify`가 이 기기에서 간헐적으로 실패할 수 있습니다. 시험 수나 코드를 건드리지 않았고 통과한 실행은 기본 설정입니다.
- 2026-11-10: Playwright 전용 시험(personas, analytics-responsive의 WebKit·Firefox 등)은 이 기기에서 돌리지 않았고 PR CI로 확인합니다.

- 2026-11-11: 첫 로컬 CI 통과(12단계·실패 0, 121.8초). API 48 suite·769건, 웹 165건, ego smoke 22·analytics-responsive 155·visitor 66·signup-funnel 45건과 이미지 빌드가 통과했습니다. 실제 집계가 익명 1건/본인 null에서 본인 방문 뒤 합계 2건/본인 1건이 되고, 크리에이터·운영자 지표/통계의 본인 1 뱃지와 과거 빈 구간 비표시를 확인했습니다. 당시 최신 main 미포함 경고 이후 #178·#166이 반영된 main을 추가 통합했습니다.
- 2026-11-11: 기존 worktree DB에 과거 개발용 `0014_landing_event_owner`가 남아 있어 데이터를 삭제하지 않았습니다. 같은 격리 PostgreSQL 안에 `crelink_pr161_merge_20261111` DB를 만들어 이번 검증에 연결했습니다. 이전 연결 설정은 Git 밖 `/tmp/crelink-pr161-instance-original.env`에만 보관합니다. 별도 migration 회귀는 0017까지 적용한 DB의 방문 행을 넣고 0018을 두 번 실행해 기존 행 보존·기본 false·이전 API 삽입 호환을 검사합니다. 새 회귀와 최종 통합 결과는 후속 전체 CI/원격 CI로 확인합니다.
- 원본 로그는 Git 밖 `/tmp/crelink-pr161-*.log`에만 둡니다. 최종 task `task-b076da2d76454af4ad3d9404dd3b6759`의 양측 검수·완료 게이트, PR 검사 및 merge SHA의 Deploy가 완료 근거이며 미실행 결과를 선기재하지 않습니다.
- 2026-11-11: #178·#166이 반영된 main `aa00a58`을 통합한 로컬 CI가 12단계·실패 0·건너뜀 0으로 통과했습니다(133.2초). API 48 suite·770건에는 기존 main DB에서 0018로 올라가는 추가 회귀가 포함됩니다. 웹 165건, ego 22/155/66/45건과 api/web arm64 이미지 빌드도 통과했습니다. 모바일 지표 전체 캡처와 운영자 통계 데스크톱 캡처를 직접 열어 본인 뱃지·표·날짜 입력의 배치와 가독성을 확인했습니다. 캡처와 합성 세션은 ignored 로컬 경로에만 두며 개인정보·인증정보를 Git에 넣지 않습니다. 이어 고정 SHA의 `--report`와 수동 GitHub CI(추가 엔진·amd64·주요 사용자 흐름)를 실행한 뒤 최종 양측 검수를 받습니다.

- 2026-11-11: 사용자 순차 머지 승인으로 최신 main 통합 충돌을 해소합니다. BFF 허용 목록이 `lib/api/backend-rules.ts`로 이동한 현 구조에 `ownerSession`을 연결하고 Instagram 공개 수신 거부의 IP 전달·기존 세션·페이지 헤더 전달을 보존했습니다. BFF 실행 회귀(랜딩 이벤트 세션 전달·가입 이벤트 미전달·익명·기존 소유자 세션/IP 경로)를 추가했으며 웹 시험 165건 통과를 확인했습니다.
- 2026-11-11: 기존 main이 migration 0014~0017을 이미 사용하므로 미배포 본인 표시 migration을 `0018_landing_event_owner`로 이동하고 고정 migration 목록과 참조를 갱신했습니다. 초기 빈 DB와 기존 main DB에서 추가되는 동작은 최종 통합 시험으로 확인합니다. ego 반응형 시험에도 익명 방문 후 소유자의 실제 공개 방문, 합계 유지·본인 1 뱃지·과거 구간 뱃지 없음을 추가했습니다. 최종 main 통합·전체 CI·원격 CI와 양측 검수는 아직 대기입니다.
