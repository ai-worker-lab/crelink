# 0052 Sentry 무료(Developer) 요금제 기능 전부 사용

- 단계: 티켓
- 역할: orchestrator
- 선행: 0042
- 상태: 완료
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-08

## 목적

0042는 오류와 성능 추적(10%)만 켰습니다. 그래서 Sentry Logs·Metrics·Replays·Release Health(브라우저)·Cron·Uptime·User Feedback이 비어 있고, 장애 때 컨테이너 로그와 사용자 화면 맥락을 볼 수 없습니다. 무료 요금제에 포함된 기능을 모두 켜서 운영자 1명이 장애를 더 빨리 알고 원인을 찾게 합니다.

## 무료 범위(2026-10-08 확인)

Sentry 결제 화면(`shaul1991` 조직, Developer plan, 2026-09-24 ~ 10-23 기간)과 [요금제](https://sentry.io/pricing/) 기준입니다.

| 기능 | 무료 포함 | 이 티켓 |
| --- | --- | --- |
| Errors | 5K/월 | 이미 켜짐(0042) |
| Tracing(spans) | 5M/월 | 이미 켜짐(10%), 변경 없음 |
| Logs | 5GB/월 | API Nest 로그·웹 서버/브라우저 콘솔 warn·error 켬 |
| Application Metrics | 5GB/월 | API 업무 지표(로그인·단축 주소 방문·외부 링크 클릭) 켬. 방명록(0050, main 미병합)은 병합 뒤 같은 방식으로 더함 |
| Session Replay | 50/월 | 웹 브라우저, 오류가 난 세션만(100%), 일반 세션 0%, 글자·입력·미디어 가림 |
| Cron Monitors | 1개 | API 보관 정리 작업(`RetentionService`, 하루 1번) |
| Uptime Monitors | 1개 | `https://links.shaul.kr/api/backend/api/health`(웹 → BFF → API 전체 경로. 처음 적은 `/api/backend/health`는 BFF 허용 목록에 없어 404) |
| Attachments | 1GB | User Feedback 스크린숏 첨부에 씀 |
| User Feedback | 포함 | 로그인한 관리 화면(`/me`·`/admin`)의 `의견 보내기` |
| Release Health | 포함 | 브라우저 세션 켬(0042에서 끈 것을 되돌림) |
| Inbound filters | 포함 | 두 프로젝트에 브라우저 확장·localhost·크롤러·오래된 브라우저 거르기 |
| UI·Continuous Profiling | 종량제 필요(유료) | 제외 |
| Seer | 유료 | 제외 |
| Size Analysis | 100 빌드 | 해당 없음(Expo 앱 빌드를 아직 배포하지 않음) |

## 수용 기준

- [x] API: Nest `Logger` 출력(log·warn·error·fatal)이 Sentry Logs로 가고, 로그 속성에 쿠키·인증 헤더·토큰·이메일이 없다. 업무 지표 3종이 Sentry Metrics로 가고 속성에 IP·사용자 ID·이메일이 없다. 보관 정리 작업이 Cron 체크인(`in_progress`→`ok`/`error`)을 보낸다. DSN이 없으면 아무것도 보내지 않는다.
- [x] 웹: Replay(오류 세션만, 가림 기본값), 브라우저 세션, 콘솔 warn·error 로그(브라우저·서버), 관리 화면 `의견 보내기`(이름·이메일 입력 없음, 스크린숏 선택)가 켜지고, `/api/backend/api/health`가 BFF를 통과한다. DSN이 없으면 아무것도 보내지 않는다.
- [x] Sentry 화면: Uptime 모니터 1개, Inbound filters, (첫 체크인 뒤) Cron 모니터가 보인다.
- [x] `/privacy` 고지(리플레이·로그·의견·세션), ADR 0014(ADR 0012 수집 범위 대체), 운영 설계·런북 15, 변경 기록 갱신.
- [x] `pnpm verify` 통과, 가짜 DSN 수신 서버로 로그·지표·체크인·리플레이·의견 envelope 확인.
- [x] 운영 배포 뒤 Sentry 화면에서 Logs·Metrics·Cron·Uptime·Replays(오류 발생 시)·Release Health를 확인한다.

## 범위

- 포함: 위 API·웹 코드, Sentry 프로젝트 설정(Uptime·Inbound filters), 문서·고지.
- 제외: 유료 기능(프로파일링·Seer), Expo 앱, 성능 추적 비율 변경, 알림 규칙 추가 설계, 대시보드.

## 위험·복구

- 개인정보: 리플레이는 화면 글자·입력·이미지를 가린 채 DOM 변화를 보냅니다(국외 이전 항목 추가). 의견 스크린숏은 가리지 않은 화면이므로 사용자가 직접 첨부할 때만 보냅니다. `/privacy`는 법률 검토 전 문구입니다.
- 한도: 리플레이 월 50건을 넘으면 그 달 나머지는 버려집니다(요금 청구 없음, 결제 수단 없음).
- 성능: 리플레이·의견 코드로 브라우저 번들이 커집니다(측정해 진행 기록에 남김).
- 끄기: 0042와 같습니다(DSN 비우기). 코드 되돌리기는 이 변경 revert, Sentry 화면 설정은 각 모니터·필터 삭제.

## 연결

- 결정: `docs/adr/0012-error-monitoring-sentry.md`, `docs/adr/0014-sentry-free-plan-features.md`
- 절차: `infra/docs/prod-runbook.md#15-sentry-오류성능-모니터링`
- 코드: `apps/api/src/monitoring/`, `apps/api/src/auth/google-oauth.ts`, `apps/api/src/retention/retention.service.ts`, `apps/web/src/instrumentation-client.ts`, `apps/web/src/sentry.*.config.ts`, `apps/web/src/lib/monitoring.ts`, `apps/web/src/components/FeedbackButton.tsx`, `apps/web/next.config.ts`, `apps/web/src/app/api/backend/[...path]/route.ts`, `apps/web/src/app/(public)/privacy/page.tsx`

## 진행 기록

- 2026-10-08: 생성·착수(브랜치 `work/0052-sentry-free-features`, worktree `../crelink-0052`). 사용자 확인: Logs 화면이 설정 안내만 보여 무료 기능이 켜지지 않은 것 같다 → 원인은 요금제가 아니라 코드(로그를 보내는 호출·통합이 없음, 0042 결정으로 리플레이·브라우저 세션 끔). 사용자 결정: "무료로 사용할 수 있는 모든 sentry 기능은 다 사용하자." 유료(프로파일링 종량제·Seer)와 해당 없는 기능(Size Analysis)은 제외.
- 2026-10-08: 구현(API 담당·웹 담당 위임, 통합 orchestrator).
  - API: `SentryConsoleLogger`(`ConsoleLogger` 상속, 콘솔 출력 그대로 + log→info·warn·error·fatal을 `Sentry.logger`로, 속성 `nest.context`·`nest.stack`), `beforeSendLog`(민감 키·`user.email`·`user.name` 삭제, 이메일·JWT 가림), 업무 지표 `crelink.auth.login`(`result`)·`crelink.short_link.visit`·`crelink.link.click`(302 시점), `beforeSendMetric`(`user.*`·IP·email 삭제), `Sentry.withMonitor('crelink-api-retention')`(interval 1일·`Asia/Seoul`·여유 60분·최대 30분). 구글 검증 실패 경고가 라이브러리 오류 문구 뒤 ID 토큰·payload(이메일·이름·사진·sub)를 남길 수 있어 `googleVerifyFailureReason`으로 꼬리를 뗌(콘솔도 같음).
  - 웹: `BrowserSession` 거르기 제거, `replayIntegration`(가림 3종, 일반 0%·오류 100%), `consoleLoggingIntegration`(warn·error, 브라우저·서버·edge), `scrubLog`·`scrubBreadcrumb`, `FeedbackButton`(`/me`·`/me/landings/[publicId]`·`/admin/*` 머리글, 이름·이메일 없음, 스크린숏 선택, DSN 없으면 안 그림, 의견 코드는 관리 화면 chunk에만), `/privacy` 항목·국외 이전·보유 기간(무료 30일). 웹 단위 테스트 실행기는 의존성 없이 `node --test`(`apps/web` `test` 스크립트).
  - 결정·발견: SDK 11.4는 로그·지표에 켜는 옵션이 없고 client가 있으면 보냄. 의견 창을 열면 replay 버퍼가 전송됨(`/privacy`·ADR에 반영). Turbopack에서는 `bundleSizeOptimizations`가 번들에 적용되지 않아 `compiler.define`(`__SENTRY_DEBUG__: false`, iframe·shadow DOM 녹화 제외)으로 대신함. 티켓에 처음 적은 Uptime 주소 `/api/backend/health`는 BFF 허용 목록에 없어 404 → `/api/backend/api/health`(운영 200 확인)로 고침, 코드 변경 없음.
  - 첫 로드 JS(gzip, `rootMainFiles`+화면 `entryJSFiles`): `/privacy` 193.2→231.3KB(+38.1), `/p/[publicId]` 197.7→235.8KB(+38.1), `/me` 204.6→261.0KB(+56.4), `/admin` 199.4→255.7KB(+56.3). 증가분 대부분 리플레이(rrweb), 관리 화면은 의견 코드 약 18KB 추가.
- 2026-10-08: 검증.
  - `pnpm verify` 8단계 통과(API 16 스위트 104건, 웹 `node:test` 4건), `pnpm work:scope 0052` 통과, `prettier --check apps/api apps/web` 통과. 로컬 인스턴스 슬롯 2가 남아 있던 0042 컨테이너와 포트가 겹쳐 슬롯 7로 바꿈.
  - 가짜 DSN API(`node dist/main.js`, 수신 서버 `http://public@127.0.0.1:39052/1`): 기동 로그 58건(info·warn, 속성은 `nest.context`·`sentry.*`·`server.address`뿐), 보관 정리 체크인 `in_progress`→`ok`(monitor_config interval 1 day·margin 60·max 30·Asia/Seoul), `visit_daily_rollups` 이름을 잠시 바꿔 `in_progress`→`error`와 error 로그 확인 후 되돌림. 단축 주소 302·클릭 302·로그인 콜백 503 → 지표 `crelink.short_link.visit`·`crelink.link.click`·`crelink.auth.login {result: failure}`, 속성에 `user.*`·IP 없음. 수신 내용 전체에 세션 토큰·`X-Forwarded-For` IP·사용자 이메일 없음.
  - 가짜 DSN 웹(DSN을 넣은 `next build` → standalone `server.js`, 시드 운영자 세션 쿠키, Playwright): `/p/{id}` 의견 버튼 0개, `/me`·`/admin` 1개. 의견 창 입력칸은 `message`뿐, 화면 캡처 첨부·보내기 → feedback(이름·이메일 빈 값, user.id, replay_id)과 `screenshot.png` 첨부 envelope. `console.warn('… owner@example.com')`·오류 → log `[email]`, 오류 이벤트(user.id), 리플레이 `replay_type: buffer` 3 segment(글자 `***`, 이미지 자리표시, 이메일·시드 이름 없음), 브라우저 세션(`ok`·`unhandled`). 처음 실행에서 콘솔 breadcrumb가 리플레이·오류 이벤트에 이메일 원문으로 들어가는 것을 발견해 `scrubBreadcrumb`(`beforeBreadcrumb`)를 더하고 다시 확인(원문 0건, `[email]` 7건).
  - DSN 없음: 웹(DSN 없이 빌드) `/me`·`/admin` 의견 버튼 0개·외부 요청 0건·수신 0건, API 단축 주소·클릭 302 뒤 수신 0건.
  - Sentry 화면(사용자 로그인 브라우저): `crelink-api` Inbound Filters에 브라우저 확장·웹 크롤러·오래된 브라우저(전 종류) 켬(localhost·헬스 체크 트랜잭션은 이미 켜짐, `crelink-web`은 다섯 개 모두 이미 켜짐). Uptime 모니터 `Uptime check for links.shaul.kr/api/backend/api/health`(`crelink-web`·`production`, 1분, 5초, 실패 3·복구 1, Allow Sampling 끔) 생성, 첫 확인 성공(Uptime 100%, 787ms), 프로젝트 알림 "Send a notification for high priority issues(Email)"이 연결됨.
  - 남은 것(당시): main 병합·운영 배포 뒤 런북 15-4 확인 → 아래 운영 확인에서 끝냄.
- 2026-10-08: 배포·운영 확인(사용자 지시: 푸시·main 병합·Sentry 확인).
  - PR #41 CI 6개(check Node 24·26, smoke, work scope, 이미지 빌드 api·web) 통과 → rebase 병합 `d32bf13` → CI·Deploy run 37727411026 성공(plan·이미지 api·web·배포 home-server·배포 기록 태그).
  - Sentry(조직 API를 로그인 브라우저 세션으로 조회): `crelink-api` Logs에 기동 로그(`Nest application successfully started`·보존 작업 완료 등), Cron 모니터 `crelink-api-retention` 생성(04:28:44Z, interval 1 day·margin 60·max 30·Asia/Seoul)과 체크인 `ok`(production). Uptime 모니터는 배포 중에도 100%(773ms). 운영 `/privacy`에서 Playwright로 `console.warn`·오류를 내자 `crelink-web` 로그 `sentry-check-0052 warn`, 이슈 `Error: sentry-check-0052`(release `d32bf13…`, `replayId` 태그), 리플레이 1건(오류 1), 새 릴리스 브라우저 세션(healthy 14·errored 1·unhandled 1).
  - 사용자가 Playwright 창에서 구글 로그인한 뒤: `/me` 의견 버튼 1개, 입력칸 `message`뿐, 의견 1건 → `crelink-web` User Feedback(이름·이메일 없음). 본인 단축 주소 `go.shaul.kr/shaul1991` 방문 1회·링크 클릭 1회(본인 통계에 각 1 더해짐)와 로그인으로 지표 `crelink.short_link.visit` 1·`crelink.link.click` 1·`crelink.auth.login` success 1·failure 1(콜백 시험), 속성 `user.id`·`user.email`·`client.address` 모두 비어 있음.
  - 확인용 이슈 2건(오류·의견)은 Resolve함.
