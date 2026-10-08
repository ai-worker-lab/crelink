# ADR 0012: 오류·성능 모니터링에 Sentry SaaS(미국 리전) 사용

- 날짜: 2026-10-07
- 상태: 승인 (2026-10-07 사용자 선택: 호스팅·수집 범위·개인정보·소스맵 업로드·대상 앱). 결정 2의 리플레이·브라우저 세션 제외와 대안 "세션 리플레이"는 [ADR 0014](0014-sentry-free-plan-features.md)가 대체(2026-10-08)
- 범위: API(`apps/api`, `@sentry/nestjs`)·웹(`apps/web`, `@sentry/nextjs`)의 오류·성능 이벤트 전송, 두 Dockerfile의 소스맵 업로드, Deploy 워크플로의 빌드 인자·secret, 운영 암호문의 `SENTRY_*` 평문 키, 웹 `/privacy`의 국외 이전 고지. Expo 앱(`apps/app`)은 범위 밖
- 관계: [ADR 0010](0010-prod-deployment-topology.md)의 비밀값 원칙(앱 비밀값은 서버 복호화, CI에는 두지 않음)과 릴리스 단위(커밋 SHA)를 그대로 따릅니다. 운영 배포 설계 [`crelink-prod-deploy.md`](../specs/crelink-prod-deploy.md)의 "모니터링·알림 고도화(후속)" 중 오류·성능 모니터링을 이 결정이 정합니다.

## 배경

- 운영(home-server, Blue/Green)의 오류는 지금 컨테이너 로그(`docker logs`)로만 볼 수 있습니다. 로그는 색 전환 뒤 옛 색 컨테이너와 함께 남았다가 다음 배포에 사라지고, 브라우저에서 난 오류는 어디에도 남지 않습니다. 운영자가 1명이라 사용자가 알려 주기 전에는 장애를 알기 어렵습니다.
- 웹·API 모두 빌드 산출물이 압축·변환된 코드라 스택에서 원래 파일·줄을 찾으려면 소스맵이 필요합니다. 운영 이미지에 소스맵을 넣으면 공개 웹에서 원본 코드가 보입니다.
- 방문 기록(IP 원문 포함, PRD R9·R11)을 이미 다루므로, 오류 이벤트에 들어가는 IP·사용자 식별자도 개인정보 처리방침에 고지해야 하고 해외 서비스로 보내면 개인정보 보호법 제28조의8의 국외 이전 고지가 필요합니다.
- Sentry 사실(2026-10-07 공식 문서 확인, 출처는 [prod 런북 "출처"](../../infra/docs/prod-runbook.md#출처)): SaaS 조직은 만들 때 데이터 저장 위치(US = 미국 아이오와, EU = 독일 프랑크푸르트)를 고르고 나중에 바꿀 수 없습니다. DSN은 이벤트 제출만 허용하고 읽기 권한이 없어 공개돼도 됩니다. 무료 Developer 요금제는 사용자 1명, 월 오류 5천 건·span 500만 개, 보관 30일입니다. 조직 토큰(Organization Token)은 권한이 CI용(`org:ci`: 소스맵 업로드·릴리스 생성)으로 고정됩니다.

## 결정

1. **호스팅**: Sentry SaaS(sentry.io), 데이터 저장 위치 **미국(US)**. 조직 하나에 프로젝트 둘(API·웹, 프로젝트마다 DSN 하나).
2. **수집 범위**: 오류 전부 + 성능 추적 표본 10%(`tracesSampleRate` 0.1, API는 `SENTRY_TRACES_SAMPLE_RATE`로 조정). 세션 리플레이·프로파일링은 쓰지 않습니다. 브라우저 Release Health 세션(`browserSessionIntegration`, 기본으로 켜짐)도 꺼서 페이지를 열 때마다 보내지 않게 합니다. (리플레이·브라우저 세션·로그·지표·의견·Cron·Uptime은 [ADR 0014](0014-sentry-free-plan-features.md)로 켬. 프로파일링 제외는 유지)
3. **개인정보**: 사용자 결정 `sendDefaultPii: true`(IP와 사용자 정보 포함)를 SDK 11.x에서는 `dataCollection` 옵션으로 구현합니다(11.x에는 `sendDefaultPii` 옵션이 없음).
   - 사용자 정보는 크리링 내부 사용자 ID(UUID)만 `Sentry.setUser({ id })`로 넣고, 이메일·이름은 넣지 않습니다. API는 세션 가드가 확인한 모든 요청에, 웹은 서버가 `GET /api/me`로 ID를 아는 `/me` 화면(서버 요청과 브라우저)에만 붙입니다.
   - API는 SDK의 자동 IP 추론(`X-Forwarded-For` 첫 값이라 위조 가능)을 끄고(`dataCollection.userInfo: false`), 요청 스코프의 user에 방문 기록과 같은 `clientIp`(`TRUSTED_PROXY_HOPS`) 값을 `ip_address`로 직접 넣습니다. 웹 브라우저는 기본값(`userInfo` 켜짐)이라 Sentry가 브라우저 접속 IP를 기록합니다. 웹 서버는 신뢰할 프록시 판정 기준이 없어 헤더 기반 추론을 끄고 IP를 넣지 않습니다(방문자 IP는 같은 trace의 브라우저·API 이벤트에 있음).
   - 쿠키(`cl_session`·`cl_vid` 포함)·`Authorization`·`Cookie`·`X-Crelink-Internal` 헤더는 API·웹 서버 모두 보내지 않습니다(`dataCollection`으로 쿠키 끔 + 전송 전 정리). 요청 본문과 DB 쿼리 파라미터는 보내지 않고, URL 쿼리 `code`·`state`·`pass`는 `[Filtered]`로 바꿉니다.
4. **API 동작**: `src/instrument.ts`를 `main.ts` 맨 처음에 불러오고 `SentryModule.forRoot()`를 둡니다. 전역 필터 `ApiExceptionFilter`가 예상하지 못한 오류(500 `internal_error`)만 보내고 4xx는 보내지 않습니다. 종료 때 남은 이벤트를 비우고 끝냅니다.
5. **웹 동작**: Next.js 계측 파일(`instrumentation.ts`의 `register`·`onRequestError`, `instrumentation-client.ts`, `sentry.server.config.ts`·`sentry.edge.config.ts`, `app/global-error.tsx`)과 `withSentryConfig`. 브라우저의 trace 전파는 같은 출처(BFF `/api/backend`)에만 붙입니다. `tunnelRoute`는 쓰지 않아 브라우저가 Sentry(미국)로 직접 보냅니다.
6. **설정**: DSN이 비어 있으면 SDK를 켜지 않습니다(로컬·시험·PR CI는 아무것도 보내지 않음). 값이 들어오면 켜집니다.
   - API 런타임: `SENTRY_DSN`(선택), `SENTRY_ENVIRONMENT`(기본 `NODE_ENV=production`이면 `production`, 아니면 `development`), `SENTRY_RELEASE`(이미지 빌드 인자 → 이미지 ENV, 배포 커밋 SHA), `SENTRY_TRACES_SAMPLE_RATE`(기본 0.1). 운영 값은 SOPS 암호문의 **평문 키** `SENTRY_DSN`·`SENTRY_ENVIRONMENT`(DSN은 비밀이 아님).
   - 웹: 빌드 시점 `NEXT_PUBLIC_SENTRY_DSN`(서버·브라우저 공용)과 `SENTRY_RELEASE`를 Dockerfile 빌드 인자로 받습니다.
7. **소스맵 업로드**: Deploy 워크플로의 이미지 빌드 중 Dockerfile 빌드 단계에서 BuildKit secret `sentry_auth_token`(GitHub secret `SENTRY_AUTH_TOKEN`)이 있을 때만 올립니다(API는 `@sentry/cli`, 웹은 `withSentryConfig`). 조직·프로젝트는 GitHub variables `SENTRY_ORG`·`SENTRY_PROJECT_API`·`SENTRY_PROJECT_WEB`, 웹 DSN은 `SENTRY_WEB_DSN`입니다. secret이 없으면 업로드를 건너뛰고 빌드는 성공합니다(PR CI·로컬). **토큰이 있는데 업로드가 실패하면 빌드를 실패**시켜 소스맵 없는 릴리스가 나가지 않게 합니다. 웹은 업로드 뒤 소스맵 파일을 지워 이미지에 넣지 않습니다.
8. **고지**: 웹 `/privacy`(`apps/web/src/app/(public)/privacy/page.tsx`)에 오류·성능 진단 항목과 개인정보 국외 이전(이전받는 자 Functional Software, Inc. d/b/a Sentry, 미국, 항목·목적·보유 기간·거부 방법)을 둡니다. 법률 검토 전 문구라는 기존 표시는 유지합니다.

## 검토한 대안

- **GlitchTip 자체 호스팅**: Sentry SDK와 호환되고 데이터가 국내 서버에 남아 국외 이전이 없습니다. 그러나 DB·워커 등을 home-server에 더 띄워 운영 대상이 늘고, 그 서버가 죽으면 오류 수집도 함께 멈춥니다(서비스 장애를 알려 줄 수단이 같은 장애점에 묶임). 성능 추적·소스맵 기능도 Sentry보다 좁습니다[추정]. 탈락.
- **self-hosted Sentry**: 기능은 같지만 권장 사양이 크고(Kafka·ClickHouse 등 여러 컨테이너) 1인 운영 서버에 맞지 않으며, 같은 장애점 문제가 같습니다. 탈락.
- **오류만 수집(성능 추적 없음)**: 무료 한도를 아끼지만 느린 요청·화면을 찾을 수단이 없습니다. 표본 10%면 지금 트래픽에서 한도 안이라고 보고[추정] 성능 추적을 넣습니다.
- **세션 리플레이**: 화면 녹화가 들어가 개인정보 범위(입력값·화면 내용)가 크게 늘고 무료 한도가 작습니다. 사용자 결정으로 제외.
- **PII 미전송(IP·사용자 ID 없음)**: 국외 이전 항목이 줄지만 같은 사용자의 반복 오류·영향 사용자 수를 알 수 없고 방문 기록과 맞춰 볼 수 없습니다. 사용자 결정으로 IP와 내부 ID만 보냅니다.
- **소스맵 미업로드**: 토큰을 CI에 둘 필요가 없지만 운영 스택이 압축 코드 위치로만 보여 오류를 고치기 어렵습니다. 탈락.
- **`tunnelRoute`(웹 서버를 거쳐 전송)**: 광고 차단기에 덜 막히고 브라우저가 Sentry와 직접 통신하지 않지만, 모든 브라우저 이벤트가 웹 컨테이너를 거쳐 부하·공개 경로(Caddy 정책)가 늘고 국외 이전 자체는 그대로입니다. 쓰지 않습니다(아래 결과 참고).

## 결과와 트레이드오프

- **국외 이전 고지**: 방문자·크리에이터의 IP·내부 사용자 ID·기기 정보·오류 내용이 미국으로 갑니다. `/privacy`에 제28조의8 항목을 고지하고, 법률 검토(PRD 위험)에서 함께 봅니다. 보관 기간은 요금제를 따르므로 요금제를 바꾸면 고지 문구도 맞춥니다.
- **무료 요금제 한도·보관**: Developer 요금제는 사용자 1명, 월 오류 5천 건·span 500만 개, 보관 30일입니다. 오류 폭주(같은 오류가 반복)로 한도를 넘으면 그 달 나머지 이벤트를 받지 못합니다. 운영자 외 사람이 보거나 90일 보관이 필요해지면 Team 요금제로 바꿉니다(결정 사항이 아니라 그때 사용자 결정).
- **광고 차단기**: 브라우저가 Sentry로 직접 보내므로 광고·추적 차단 확장이나 Brave 같은 브라우저에서 일부 이벤트가 막힙니다. 서버 쪽 오류(API·Next 서버)는 영향이 없습니다. 이를 고지의 거부 방법으로도 안내합니다.
- **tunnel 미사용 이유**: 위 대안. 브라우저 IP가 Sentry에 그대로 남는 것을 받아들이고(사용자 결정의 IP 포함과 같음), 막히는 이벤트가 많아지면 그때 `tunnelRoute`를 다시 검토합니다.
- **웹 이미지가 배포 대상별이 됨**: `NEXT_PUBLIC_SENTRY_DSN`은 빌드 때 번들에 들어가므로 웹 이미지가 그 DSN(그 Sentry 프로젝트)에 묶입니다. 대상마다 다른 Sentry 프로젝트를 쓰려면 이미지를 따로 빌드해야 합니다. 지금은 대상이 하나이고 모든 대상이 같은 프로젝트를 쓰면 문제없습니다. API는 런타임 env라 영향이 없습니다.
- **GitHub Free 조직의 secret 노출**: `SENTRY_AUTH_TOKEN`은 앱 비밀값이 아니라 소스맵 업로드용 조직 토큰(`org:ci`)이지만, environment 보호 규칙이 없는 Free 조직에서는 push 권한자가 워크플로를 고쳐 읽을 수 있습니다. 새면 릴리스·소스맵을 올리거나 지울 수 있고 이벤트를 읽을 수는 없습니다[추정: `org:ci` 범위 기준]. Sentry 조직 설정에서 바로 폐기·재발급합니다(런북).
- **업로드 실패 = 배포 실패**: Sentry 장애 때 이미지 빌드가 실패해 배포가 막힙니다. 급하면 secret `SENTRY_AUTH_TOKEN`을 비우거나(소스맵 없이 배포) Sentry가 돌아온 뒤 다시 실행합니다.
- **끄기**: 암호문 `SENTRY_DSN`을 비우고 배포하면 API가, GitHub variable `SENTRY_WEB_DSN`을 비우고 웹 이미지를 다시 빌드해 배포하면(빌드 시점 값) 웹이 아무것도 보내지 않습니다. 롤백하면 그 릴리스의 암호문·이미지 값으로 돌아갑니다.
- 시험·로컬·PR CI는 DSN이 없어 동작이 바뀌지 않습니다.
