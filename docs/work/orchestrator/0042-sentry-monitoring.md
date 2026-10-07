# 0042 Sentry 오류·성능 모니터링

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-07

## 목적

운영 오류를 사용자가 알려 주기 전에 알고, 원래 코드 위치로 고칠 수 있게 합니다. 지금은 오류가 색 전환 뒤 사라지는 컨테이너 로그에만 있고 브라우저 오류는 남지 않으며, 운영자가 1명이라 장애를 늦게 압니다. 느린 요청·화면도 찾을 수단이 없습니다.

## 수용 기준

코드:

- [x] API(`@sentry/nestjs` 11.4.x): `src/instrument.ts`를 `main.ts` 맨 처음에 불러오고 `SentryModule.forRoot()`. `SENTRY_DSN`이 비면 아무것도 보내지 않음. `SENTRY_ENVIRONMENT`(기본 `NODE_ENV=production`이면 `production`, 아니면 `development`)·`SENTRY_RELEASE`·`SENTRY_TRACES_SAMPLE_RATE`(기본 0.1).
- [x] API: 예상하지 못한 오류(500 `internal_error`)만 보내고 4xx는 보내지 않음. user는 내부 ID(UUID)와 `clientIp`(`TRUSTED_PROXY_HOPS`)의 `ip_address`만(SDK 자동 IP 추론 끔). 쿠키·`Authorization`·`Cookie`·`X-Crelink-Internal`·요청 본문·DB 쿼리 파라미터 없음, 쿼리 `code`·`state`·`pass`는 `[Filtered]`. 종료 때 남은 이벤트를 비움.
- [x] 웹(`@sentry/nextjs` 11.4.x): 계측 파일(`instrumentation.ts`·`instrumentation-client.ts`·`sentry.server.config.ts`·`sentry.edge.config.ts`·`app/global-error.tsx`), `withSentryConfig`. 빌드 시점 `NEXT_PUBLIC_SENTRY_DSN`이 비면 꺼짐. traces 0.1, 리플레이·프로파일링·브라우저 세션 없음, `tunnelRoute` 없음, trace 전파는 같은 출처 BFF만, 서버는 쿠키·인증 헤더를 보내지 않음, 사용자 ID는 내부 ID만(`/me`에서 서버·브라우저).
- [x] 두 Dockerfile: BuildKit secret `sentry_auth_token`이 있을 때만 소스맵 업로드(빌드 인자 `SENTRY_ORG`·`SENTRY_PROJECT`·`SENTRY_RELEASE`), 토큰이 있는데 업로드가 실패하면 빌드 실패, 없으면 건너뛰고 성공. 웹 이미지에 소스맵 파일 없음.
- [x] `.github/workflows/deploy.yml`: 빌드 인자 `SENTRY_RELEASE=<배포 커밋 SHA>`, `vars.SENTRY_ORG`·`vars.SENTRY_PROJECT_API`·`vars.SENTRY_PROJECT_WEB`, 웹 `vars.SENTRY_WEB_DSN`, secret `SENTRY_AUTH_TOKEN`. 값이 없으면 빈 값.

시험:

- [x] DSN 없이 기존 시험·`pnpm verify`·`pnpm e2e`가 그대로 통과(이벤트 전송 없음).
- [x] API 전송 대상 판정(500만, 4xx 제외)과 이벤트 정리(user·쿠키·헤더·쿼리 필터)를 시험으로 확인.
- [x] 두 이미지가 secret 없이 빌드되고(업로드 건너뜀) 웹 이미지에 `.map` 파일이 없음.

문서:

- [x] ADR 0012(승인)와 문서 색인, `.sops.yaml` `unencrypted_regex`에 `SENTRY_DSN`·`SENTRY_ENVIRONMENT`.
- [x] 운영 설계(환경변수·빌드 인자·GitHub variables·secret·워크플로·보안 경계·위험), 외부 의존, 환경과 비밀값, 검증 루프 CD 표, MVP 설계 `권한·보안·개인정보`, PRD R9 위험.
- [x] 런북 15(조직·프로젝트 만들기, API DSN 암호문 넣기, GitHub 설정, 확인, 끄기·회전)와 출처.
- [x] 웹 `/privacy`의 오류·성능 진단 항목과 개인정보 국외 이전 고지(개인정보 보호법 제28조의8 항목).
- [x] CHANGELOGS(루트·api·web·infra).
- [x] API·웹 README 모니터링 절, `apps/api/.env.example`·`apps/web/.env.example`.
- [ ] 사용자가 Sentry 조직·프로젝트·DSN·토큰을 만든 뒤 운영에서 API·웹 오류 이벤트와 트레이스, 소스맵 적용 스택이 보인다.

## 범위

- 포함: 위 코드·시험·문서, `.sops.yaml` 정규식.
- 제외: Expo 앱(`apps/app`), 세션 리플레이, 프로파일링, 알림 규칙 설계, 암호문에 실제 DSN 넣기와 정규식 변경 뒤 재암호화(사용자가 Sentry를 만든 뒤 런북 15-2), Sentry 계정·조직·프로젝트·토큰 만들기(사용자 작업).

## 위험·복구

- 개인정보 국외 이전: 방문자·크리에이터 IP와 내부 사용자 ID가 미국으로 갑니다. `/privacy` 고지는 법률 검토 전 문구입니다. 이벤트에 쿠키·인증 정보가 섞이면 세션 탈취 위험이 있어 정리 동작을 시험으로 확인합니다.
- 외부 서비스: Sentry 장애 때 토큰이 있으면 소스맵 업로드 실패로 이미지 빌드·배포가 막힙니다. 복구는 Sentry 복구 뒤 재실행, 급하면 secret `SENTRY_AUTH_TOKEN` 삭제 뒤 재실행(소스맵 없이 배포).
- secret: `SENTRY_AUTH_TOKEN`은 GitHub Free 조직에서 push 권한자가 읽을 수 있습니다(권한 `org:ci` 고정). 새면 Sentry에서 폐기·재발급(런북 15-5).
- 무료 요금제 한도(월 오류 5천 건)를 넘으면 그 달 나머지 이벤트가 버려집니다. 브라우저 이벤트는 광고 차단기에 일부 막힙니다.
- 끄기: 암호문 `SENTRY_DSN`을 비우고 배포(API), `SENTRY_WEB_DSN`을 지우고 웹 이미지 재빌드(웹). 코드 되돌리기는 이 변경의 커밋 revert(DB·데이터 변경 없음).

## 연결

- 결정: `docs/adr/0012-error-monitoring-sentry.md`
- 설계·절차: `docs/specs/crelink-prod-deploy.md#비밀값과-환경변수`, `infra/docs/prod-runbook.md#15-sentry-오류성능-모니터링`
- 고지: `apps/web/src/app/(public)/privacy/page.tsx`, PRD R9(`docs/product/crelink.md`)
- 코드: `apps/api/src/instrument.ts`, `apps/api/src/main.ts`, `apps/web/`(Next.js 계측 파일·`next.config.ts`), `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.github/workflows/deploy.yml`, `.sops.yaml`
- 근거: [Sentry 데이터 저장 위치](https://docs.sentry.io/organization/data-storage-location/), [DSN](https://docs.sentry.io/concepts/key-terms/dsn-explainer/), [보관 기간](https://docs.sentry.io/security-legal-pii/security/data-retention-periods/), [요금제](https://sentry.io/pricing/), [Auth Tokens](https://docs.sentry.io/account/auth-tokens/), [Sentry 개인정보 처리방침](https://sentry.io/privacy/)

## 진행 기록

- 2026-10-07: 생성·착수(브랜치 `work/0042-sentry-monitoring`). 사용자 결정(2026-10-07 확정, 원문 요지):
  - 호스팅: Sentry SaaS(sentry.io), 데이터 리전 미국(US).
  - 수집: 오류 전부 + 낮은 비율 성능 추적(traces 10%). 세션 리플레이·프로파일링 없음.
  - 개인정보: IP와 사용자 정보 포함(`sendDefaultPii: true`), 단 사용자 정보는 내부 사용자 ID(UUID)만(이메일·이름 넣지 않음).
  - 소스맵: CI(Deploy 워크플로 이미지 빌드)에서 Sentry에 업로드, GitHub secret `SENTRY_AUTH_TOKEN`.
  - Expo 앱(`apps/app`)은 범위 밖.
  - 실제 Sentry 조직·프로젝트·DSN·토큰은 사용자가 아직 만들지 않았다. DSN이 없으면 Sentry 완전 비활성(no-op, 로컬·시험·PR CI), 값이 들어오면 켜진다.
- 2026-10-07: 결정(구현). SDK 11.x에는 `sendDefaultPii` 옵션이 없어 사용자 결정을 `dataCollection`으로 구현: API는 자동 IP 추론(위조 가능한 `X-Forwarded-For` 첫 값)을 끄고 `clientIp`를 user `ip_address`로 직접 넣음, 웹 브라우저는 기본값(브라우저 접속 IP 기록). 브라우저 Release Health 세션(`browserSessionIntegration`, 기본 켜짐)은 페이지를 열 때마다 보내므로 끔. Next.js 서버 SDK가 기본으로 쿠키를 보내므로 API·웹 모두 쿠키·인증 헤더를 끄고 전송 전 정리.
- 2026-10-07: 문서·고지(문서 담당). Sentry 공식 출처 확인: 운영 회사 Functional Software, Inc. d/b/a Sentry(45 Fremont Street, 8th Floor, San Francisco, CA 94105, compliance@sentry.io, `sentry.io/privacy`), US 저장 위치 = 미국 아이오와·생성 후 변경 불가, DSN 공개 가능(제출만), 보관 Developer 30일·Team/Business 오류 90일·span 30일·체험은 Team 보관, 백업 90일 뒤 삭제, Developer 요금제 사용자 1명·월 오류 5천·span 500만, 조직 토큰 권한 고정(`org:ci`). ADR 0012, `.sops.yaml`, 운영 설계·런북 15·외부 의존·환경과 비밀값·검증 루프·MVP 설계·PRD, `/privacy` 국외 이전 절, CHANGELOGS 4곳.
- 2026-10-07: 구현·검증(코드 담당). 구현 결정: `@SentryExceptionCaptured()`는 Nest `HttpException`만 예상한 오류로 보므로 `catch`에 붙이면 본문 파서 http-errors 4xx(400·413)도 보냄 → 500 처리 메서드에 붙임(데코레이터를 `catch`로 옮겨 시험하면 4xx 0건 검사가 1건으로 실패, 되돌림). SDK 11은 성능을 span으로 보내(`traceLifecycle: 'stream'`) `beforeSendTransaction` 대신 `beforeSendSpan`. `.env`를 pg보다 먼저 읽도록 `loadLocalEnvironment`를 `src/local-env.ts`로 옮김. 웹 플러그인은 업로드 실패를 기본으로 로그만 남겨(가짜 토큰으로 `Failed to create release: 404` 뒤 빌드 성공을 실측) `errorHandler`로 실패시킴. 웹 서버는 신뢰 프록시 기준이 없어 헤더 IP 추론을 끔. 웹 사용자 ID는 서버가 `GET /api/me`를 부르는 `/me`에서만 붙임(다른 화면은 사용자 조회가 없어 붙이려면 요청마다 API를 더 불러야 함).
  - `pnpm verify` 8단계 통과(API 시험 16 스위트 101건, 기존 92건 + 9건), `pnpm smoke` 5건·`pnpm e2e` 7건 통과(실행 중 API·웹, DSN 없음), `pnpm work:scope 0042` 통과, `actionlint` 통과, 바꾼 파일 prettier 통과.
  - 가짜 DSN(로컬 수신 서버 `http://public@127.0.0.1:39042/1`) API(`make api-up`, `TRUSTED_PROXY_HOPS=1`): `landings` 테이블 이름을 잠시 바꿔 로그인 요청을 500으로 만들자 이벤트 1건, user `{ ip_address: 203.0.113.7(X-Forwarded-For 오른쪽), id: 내부 UUID }`, release·environment, 요청 헤더에 `Cookie`·`Authorization`·`X-Forwarded-For` 없음. 401·404·413은 이벤트 0건. traces 1로 바꾸면 Express·Nest·pg span(`SessionGuard`, `SELECT sessions users` 등, 쿼리는 매개변수 형태, `db.connection_string`에 비밀번호 없음)에 user가 붙고 쿠키 헤더 속성 없음. 세션 토큰·이메일 문자열은 어떤 envelope에도 없음.
  - 가짜 DSN 웹(DSN을 넣고 `next build` 후 standalone `server.js`, 가짜 API): `/p/{id}` 307 유지, `/me` 서버 렌더 오류 → `onRequestError` 이벤트(user.id, 쿠키 없음), Playwright 브라우저 오류 2건(로그인 `/me` → user.id, `/privacy` → user 없음, `sdk.settings.infer_ip: auto`), 브라우저 세션 항목 없음, BFF 요청에만 `sentry-trace`·`baggage`(외부 출처 없음), BFF → API 요청에 trace 헤더.
  - 이미지(arm64): secret 없이 API·웹 빌드 성공(업로드 건너뜀 로그). API 이미지(`SENTRY_RELEASE` 빌드 인자 → ENV)를 가짜 DSN으로 띄워 healthy, 500 이벤트 release `local-image-0042`, `docker stop -t 30` 종료 코드 0(`Sentry.close`가 세션까지 보냄). `@oxc-parser` native 바인딩을 지우고 띄워도 동일(런타임 미사용). API 이미지 539MB(이전 414MB). 웹 이미지 healthy·`/privacy` 200·`/p` 307·`.next/static`의 `.map` 0개·`docker stop` 143(기존과 같음), 443MB. 가짜 토큰: API는 `sourcemaps inject` 뒤 `upload`가 `API request failed`로 빌드 실패, `SENTRY_ORG` 없이 토큰만 주면 안내 문구로 실패, 웹은 `errorHandler` 뒤 `Failed to create release: 404 Not Found`로 빌드 실패.
  - 남은 것: 사용자가 Sentry 조직·프로젝트·DSN·토큰을 만든 뒤 런북 15로 값을 넣고 운영에서 이벤트·트레이스·소스맵 스택 확인.
- 2026-10-07: 운영 값 넣기(통합 담당). 사용자가 Sentry(US) 프로젝트 `crelink-api`·`crelink-web`을 만들고 DSN을 줌(조직 ID `o877167`). 암호문 `infra/prod/secrets/home-server.sops.env`: 정규식 변경 뒤 한 번 다시 암호화하고 평문 키 `SENTRY_DSN`(crelink-api DSN)·`SENTRY_ENVIRONMENT=production` 추가(다른 값은 복호화 해시 비교로 불변 확인). GitHub variables `SENTRY_WEB_DSN`·`SENTRY_PROJECT_API=crelink-api`·`SENTRY_PROJECT_WEB=crelink-web` 등록. 남은 것: 조직 slug(`SENTRY_ORG`)·`SENTRY_AUTH_TOKEN`(사용자) 뒤 강제 배포.
- 2026-10-07: `SENTRY_ORG=shaul1991` 등록, 사용자가 `SENTRY_AUTH_TOKEN`(조직 토큰) 등록. API 컨테이너에서 시험 메시지 1건 전송 성공(이벤트 `a88a20d0…`). 강제 배포 2회(run 37580367678: 토큰 전 → 웹 DSN 반영, run 37580697263: 토큰 후) 성공했으나 두 번째에서 업로드 RUN이 `CACHED` — BuildKit secret은 캐시 키에 들어가지 않아 같은 커밋을 토큰 없이 만든 층을 재사용함(결함). 고침: 두 Dockerfile에 `ARG SENTRY_UPLOAD`, Deploy가 토큰 유무를 `yes`/`no`로 넘겨 캐시 키에 넣음.
- 2026-10-07: 장애. `f00ae15` 병합 뒤 실제로 업로드가 돌면서 API 이미지 빌드가 `sentry-cli` TLS 오류(`unable to get local issuer certificate`)로 실패해, `f00ae15`·`d766e57`·`8c4c71a`·`35ee77a`(다른 작업 포함) Deploy가 이미지 단계에서 멈춤(운영은 직전 릴리스 그대로, 서비스 영향 없음). 원인: `node:24-slim`에 CA 묶음이 없고 `sentry-cli`는 시스템 CA를 씀(로컬 재현: CA 없음 → SSL 오류, `ca-certificates` 설치 → TLS 통과 후 가짜 토큰 404). 고침: 두 Dockerfile 빌드 단계에 `ca-certificates` 설치(런타임 단계는 그대로).
- 2026-10-07: 운영 확인. 수정(PR #36, `5c0648c`) 배포 성공, 이미지 빌드 로그에서 API `Bundled 86 files for upload`·`Uploaded files to Sentry`, 웹 `Successfully uploaded source maps to Sentry`. PR #29(`41f89f5`) 배포도 성공. 사용자 확인(Sentry 화면): `crelink-api` Issues에 시험 메시지 "crelink-api 운영 연결 확인(0042)" 도착, Releases에 `41f89f5`·`5c0648c`가 `crelink-api`·`crelink-web` 두 프로젝트로 보이고 세션 adoption·crash free 100%(두 SDK 모두 운영에서 동작). 남은 것: 실제 웹 오류 이벤트와 소스맵이 적용된 스택은 첫 실제 오류(또는 운영 시험 오류)에서 확인. `8c4c71a`·`35ee77a`는 실패한 배포에서 웹 빌드가 먼저 만든 Sentry 릴리스라 운영에 쓰이지 않음.
