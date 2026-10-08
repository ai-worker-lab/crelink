# ADR 0014: Sentry 무료(Developer) 요금제 기능 모두 사용

- 날짜: 2026-10-08
- 상태: 승인 (2026-10-08 사용자 결정: "무료로 사용할 수 있는 모든 sentry 기능은 다 사용하자")
- 범위: API(`apps/api`)의 Logs·Application Metrics·Cron 체크인, 웹(`apps/web`)의 Session Replay·브라우저 세션(Release Health)·콘솔 로그·User Feedback, Sentry 프로젝트 설정(Uptime 모니터·Inbound filters), 웹 `/privacy` 고지. Expo 앱은 범위 밖
- 관계: [ADR 0012](0012-error-monitoring-sentry.md) 결정 2(수집 범위)의 "세션 리플레이를 쓰지 않음·브라우저 Release Health 세션을 끔"과 대안 "세션 리플레이 탈락"을 대체합니다. 호스팅·개인정보 원칙(IP와 내부 사용자 ID만, 이메일·이름·쿠키·인증 헤더 제외)·소스맵·설정·끄기 방법은 ADR 0012를 그대로 따르고 새 데이터에도 같은 원칙을 적용합니다.

## 배경

- 0042로 오류와 성능 추적(10%)만 켰습니다. 그래서 Sentry의 Logs·Metrics·Replays·Cron·Uptime·User Feedback 화면이 비어 있고 브라우저 Release Health도 없습니다. 장애 때 컨테이너 로그(`docker logs`, 색 전환 뒤 다음 배포에 사라짐)와 사용자가 본 화면을 Sentry에서 볼 수 없습니다.
- 무료 요금제에 포함된 범위(2026-10-08 Sentry 결제 화면과 [요금제](https://sentry.io/pricing/) 기준): Logs 5GB/월, Application Metrics 5GB/월, Session Replay 50건/월, Cron 모니터 1개, Uptime 모니터 1개, Attachments 1GB, User Feedback·Release Health·Inbound filters 포함. 한도를 넘으면 그 달 나머지가 버려지고 요금은 청구되지 않습니다(결제 수단 없음). 보관 기간은 모든 데이터 종류가 30일입니다([보관 기간](https://docs.sentry.io/security-legal-pii/security/data-retention-periods/)).
- 프로파일링(UI·Continuous)은 종량제 결제가 필요하고 Seer는 유료입니다. Size Analysis는 앱 빌드를 아직 배포하지 않아 해당이 없습니다.
- SDK 11.4 사실(설치된 `node_modules/@sentry/core` 소스): 로그·지표는 켜는 옵션 없이 client가 있으면 보내고, client가 없으면(DSN 없음) 아무것도 하지 않습니다. 로그·지표에는 스코프 user의 `user.id`·`user.email`·`user.name`이 자동으로 붙습니다. 리플레이는 의견 창을 열 때 버퍼를 보냅니다(`openFeedbackWidget` → `sendBufferedReplayOrFlush`).

## 결정

1. **Logs(API)**: Nest `Logger` 출력 중 log·warn·error·fatal을 Sentry Logs로 보냅니다(`src/monitoring/sentry-logger.ts`의 `SentryConsoleLogger`, 콘솔 출력은 그대로). debug·verbose는 보내지 않습니다. Nest 기본 로거는 `console`이 아니라 표준 출력에 직접 쓰므로 Sentry 콘솔 통합으로는 잡히지 않아 로거를 바꿉니다.
2. **Logs(웹)**: 브라우저·Next 서버의 `console.warn`·`console.error`를 `consoleLoggingIntegration`으로 보냅니다.
3. **로그 정리**: 두 앱 모두 `beforeSendLog`에서 이름에 cookie·authorization·token·secret·password·email이 든 속성과 `user.email`·`user.name`을 지우고, 본문과 문자열 속성의 이메일 모양 글자를 `[email]`로 바꿉니다(API는 JWT도 `[token]`). 웹은 같은 규칙을 `beforeBreadcrumb`에도 적용합니다(콘솔 breadcrumb가 오류 이벤트와 리플레이에 같은 문구로 담기기 때문). `user.id`(내부 UUID)는 오류 이벤트와 같이 남깁니다. 외부 라이브러리 오류 문구에 토큰·payload가 붙는 구글 로그인 검증 실패 경고는 남기기 전에 그 꼬리를 뗍니다.
4. **Application Metrics(API)**: 업무 지표 3종 `crelink.auth.login`(속성 `result: success|failure`), `crelink.short_link.visit`, `crelink.link.click`을 셉니다(`src/monitoring/metrics.ts`). 속성은 정해 둔 값만 쓰고 단축 주소·링크·사용자 ID·IP를 넣지 않으며, `beforeSendMetric`이 `user.*`·IP 계열·email 속성을 지웁니다. 방명록(0050)은 main 병합 뒤 같은 방식으로 더합니다.
5. **Session Replay(웹 브라우저)**: 일반 세션 0%, 오류가 난 세션 100%(`replaysOnErrorSampleRate: 1.0`, 오류 전 화면은 브라우저 메모리 버퍼). 화면 글자·입력값·이미지·미디어를 모두 가리고(`maskAllText`·`maskAllInputs`·`blockAllMedia`), 네트워크 요청·응답 본문과 헤더는 담지 않습니다. iframe·shadow DOM 녹화 코드는 빌드에서 뺍니다(의견 창 내용은 리플레이에 담기지 않음). 관리 화면에서 의견 창을 연 세션도 SDK 동작으로 가린 리플레이를 보냅니다.
6. **Release Health(웹 브라우저)**: 기본 브라우저 세션(`BrowserSession`)을 다시 켭니다.
7. **User Feedback(웹)**: 로그인한 관리 화면(`/me`·`/admin`)에만 `의견 보내기` 버튼을 둡니다. 이름·이메일 입력은 없고(숨은 값도 비움) 스크린숏은 사용자가 직접 찍어 첨부할 때만 갑니다. 의견 코드는 관리 화면에서만 불러오고, DSN이 없으면 버튼을 그리지 않습니다.
8. **Cron(API)**: 보관 정리 작업(`RetentionService`, 기동 때와 24시간마다)을 `Sentry.withMonitor('crelink-api-retention')`로 감싸 `in_progress` → `ok`/`error` 체크인을 보냅니다. 설정은 코드에서 upsert합니다(interval 1일, `Asia/Seoul`, 여유 60분, 최대 실행 30분). 모니터는 첫 체크인 때 생깁니다.
9. **Uptime**: `crelink-web` 프로젝트(환경 `production`)에 `https://links.shaul.kr/api/backend/api/health` GET 1분 간격, 시간 초과 5초, 연속 3번 실패 → 이슈, 1번 성공 → 해결. 이 주소는 Cloudflare → edge Caddy → 웹 BFF(허용 목록 `GET api/health`) → API를 모두 지나므로 웹·API 어느 쪽이 죽어도 잡힙니다. "Allow Sampling"은 끄고 둬서 확인 요청이 성능 추적 표본에 들어가지 않습니다.
10. **Inbound filters**: 두 프로젝트 모두 브라우저 확장 오류·localhost·웹 크롤러·오래된 브라우저(전 종류)·헬스 체크 트랜잭션 거르기를 켭니다(웹은 기본으로 켜져 있었고 API에 확장·크롤러·오래된 브라우저를 켬).
11. **제외**: 프로파일링·Seer(유료), Size Analysis(해당 없음), 성능 추적 비율 변경, 알림 규칙 추가, 대시보드. Uptime·Cron 이슈 알림은 프로젝트에 이미 있는 이슈 알림을 따릅니다.
12. **고지**: `/privacy`의 진단 항목과 국외 이전에 화면 리플레이·로그·의견(스크린숏 포함)·브라우저 세션을 더하고 보유 기간(무료 요금제 30일)을 맞춥니다. 법률 검토 전 표시는 유지합니다.

## 검토한 대안

- **리플레이 일반 세션 표본(예: 10%)**: 문제 없는 방문도 볼 수 있지만 월 50건이 며칠 만에 소진돼 정작 오류 세션 리플레이를 못 받습니다. 오류 세션만 남깁니다.
- **리플레이 가림 해제(글자·이미지 보이기)**: 화면 재현은 쉬워지지만 크리에이터 랜딩의 개인 정보·관리 화면의 이메일이 그대로 미국으로 갑니다. 가림 기본값을 유지합니다.
- **공개 화면에도 의견 버튼**: 방문자 의견을 받을 수 있지만 스팸·개인정보(스크린숏)가 늘고 공개 화면 번들이 커집니다. 관리 화면만 둡니다.
- **API 로그를 콘솔 통합으로 수집**: 코드 변경이 가장 적지만 Nest `ConsoleLogger`가 `process.stdout`에 직접 써서 잡히지 않습니다. pino 등 로거 교체는 범위가 큽니다. `ConsoleLogger` 상속을 택했습니다.
- **Uptime 대상 `/health/ready`(DB 포함)**: DB 장애까지 잡지만 BFF 허용 목록을 넓혀야 합니다. DB 장애는 API 500 오류 이벤트로 이미 잡히므로 `api/health`로 둡니다.
- **Uptime을 API에 직접**: API는 외부에 공개하지 않으므로(웹 BFF 뒤) 불가능하고, 웹만 보는 `/`는 API 장애를 놓칩니다.
- **`tunnelRoute` 다시 검토**: 리플레이·의견이 늘어도 ADR 0012의 판단(웹 컨테이너 부하·공개 경로 증가, 국외 이전 자체는 같음)이 같아 쓰지 않습니다.

## 결과와 트레이드오프

- **개인정보·국외 이전 항목 증가**: 가린 화면 구조(DOM 변화)·화면 주소·클릭 위치, 로그 본문, 의견 내용과 사용자가 첨부한 스크린숏(가리지 않은 화면, 첨부 창의 가리기 도구로 직접 가림), 브라우저 세션 상태가 미국으로 갑니다. 의견에는 화면 주소가 함께 가므로 관리 화면 검색어가 주소에 있으면 그대로 갑니다(오류 이벤트와 같은 수준). 로그에는 내부 사용자 ID가 붙습니다.
- **Uptime 확인 데이터 위치**: Sentry 화면 안내대로 Uptime 확인 결과는 조직의 저장 위치(US) 밖에 저장될 수 있습니다. 확인 요청·응답(헬스 상태)뿐이라 개인정보는 없습니다.
- **한도**: 리플레이 월 50건을 넘으면 그 달 나머지 오류 세션 리플레이를 받지 못합니다. API는 배포(색 전환)마다 Nest 기동 로그 수십 줄이 Logs로 갑니다(5GB 한도에 비해 작음[추정]). Cron·Uptime은 무료 1개씩을 모두 씁니다.
- **번들 크기**: 첫 로드 JS(gzip)가 공개 화면 약 +38KB(`/privacy` 193→231KB, 대부분 리플레이), 관리 화면 약 +56KB(의견 코드 포함) 늘어납니다(0052 진행 기록). Turbopack 빌드에서는 `withSentryConfig`의 `bundleSizeOptimizations`가 번들에 적용되지 않아 같은 플래그(`__SENTRY_DEBUG__`, iframe·shadow DOM 녹화 제외)를 `next.config.ts`의 `compiler.define`으로 넣습니다. 더 줄이려면 리플레이 지연 로딩이나 압축 worker 직접 호스팅 같은 구조 변경이 필요합니다(지금은 하지 않음).
- **이중 기록**: API 500은 오류 이벤트와 error 로그 두 곳에 남습니다. 오류 이벤트는 이슈 묶음·알림용, 로그는 앞뒤 맥락용입니다.
- **끄기**: ADR 0012와 같습니다(DSN 비우기). 코드는 0052 변경을 되돌리고, Sentry 화면 설정은 Uptime·Cron 모니터와 켠 필터를 지웁니다([런북 15](../../infra/docs/prod-runbook.md#15-sentry-오류성능-모니터링)).
- 시험·로컬·PR CI는 DSN이 없어 아무것도 보내지 않습니다.
