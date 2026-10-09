# 백엔드 API 운영 안내

크리링 MVP API(NestJS + PostgreSQL)의 실행·설정·동작 규칙입니다. 제품 요구와 계약의 기준은 [크리링 MVP 기술 설계](../../../docs/specs/crelink-mvp.md)와 `packages/shared/src/crelink.ts`이며, 이 문서는 구현이 그 기준을 어떻게 따르는지와 백엔드에서 내린 결정을 적습니다.

## 실행

- 로컬: 저장소 루트에서 `make infra-up` 후 `make up`(또는 `make api-up`). PM2가 `pnpm --filter @crelink/api start:dev`를 실행하고 `.local/instance.env`의 `PORT`·`DATABASE_URL`·`WEB_URL`·`SHORT_LINK_BASE_URL`을 넘깁니다. 나머지 키는 `apps/api/.env`에서 읽습니다.
- 기동하면 `apps/api/migrations/*.sql`을 이름 순으로 한 번씩 적용합니다(`src/database.ts`의 `runMigrations`). 스키마 원본은 [`migrations/0001_crelink_mvp.sql`](../migrations/0001_crelink_mvp.sql)과 방명록을 더한 [`migrations/0002_guestbook.sql`](../migrations/0002_guestbook.sql)입니다.
- 확인: `curl -i {API}/api/health/ready`(DB 포함 200), `curl -i {API}/없는주소`(302 `{WEB_URL}/notice?reason=link_not_found`).
- 테스트: `pnpm --filter @crelink/api test`(Node 24.9 이상). 테스트마다 일회용 DB를 만들어 지웁니다(`test/test-database.ts`). 구글 code 교환은 `GoogleOAuth` provider를, 위치 조회는 `GeoIpService`를 테스트용으로 바꿉니다(`test/test-app.ts`). 이미지 저장소 계약 시험(`test/file-storage.e2e-spec.ts`)은 Docker로 일회용 SeaweedFS(`chrislusf/seaweedfs:4.47`, `test/test-s3.ts`)를 띄우므로 Docker가 실행 중이어야 합니다.
- ESM 의존성과 Jest: NestJS 12 패키지(`@nestjs/*`)와 `@crelink/shared`는 ESM 전용이고 API는 CommonJS입니다. Jest는 CommonJS 코드가 ESM을 `require`하는 것(require(esm))을 Node 24.9 이상에서 VM 모듈(`--experimental-vm-modules`)이 켜져 있을 때만 지원하므로, `test` 스크립트가 `NODE_OPTIONS`에 이 플래그를 붙입니다(워커마다 `ExperimentalWarning: VM Modules` 경고 한 줄). Node 22에서는 모든 스위트가 `Must use import to load ES Module`로 실패하고, Node 24.20에서도 플래그가 없으면 같은 오류였습니다(2026-10-07 실측). 근거: [Nest 마이그레이션 가이드 "Testing stack"](https://docs.nestjs.com/migration-guide#testing-stack), [Jest "require() of ESM"](https://jestjs.io/docs/ecmascript-modules#require-of-esm). `@crelink/shared`는 빌드 없이 시험하도록 Jest 설정의 `moduleNameMapper`가 TypeScript 원본을 직접 컴파일해 씁니다. 실행 중인 API(`node dist/main.js`)는 Node 자체의 require(esm)(플래그 없음, Node 22.12 이상)으로 두 패키지를 읽습니다.
- 운영: 배포 대상 서버의 Compose 스택에서 [컨테이너 이미지](#컨테이너-이미지)로 실행합니다(배포 구성은 [운영 배포 설계](../../../docs/specs/crelink-prod-deploy.md)).

## 환경변수

`apps/api/.env.example`이 키 목록 원본입니다. 값은 실행 환경 변수가 `.env`보다 우선합니다.

| 키 | 필수 | 설명 |
| --- | --- | --- |
| `NODE_ENV` | 아니오 | `production`이면 [운영 필수 설정](#운영-필수-설정)을 기동 전에 검사합니다. 이미지 기본값이 `production`입니다. |
| `DATABASE_URL` | 예 | PostgreSQL 연결 문자열. 운영(Supabase)은 세션 풀러(5432) 주소. [DB TLS](#db-tls) 참고. |
| `DATABASE_SSL` | 아니오 | `disable`·`require`·`verify-full`. 비면 URL을 그대로 씁니다(로컬, TLS 없음). 값이 있으면 URL의 `sslmode` 등 TLS 파라미터를 지우고 이 값만 따릅니다. 다른 값이면 기동 거부. [DB TLS](#db-tls). |
| `DATABASE_SSL_CA_PATH` | 아니오 | `verify-full`일 때 서버 인증서를 확인할 CA(PEM) 파일 경로(Supabase 루트 인증서). 다른 모드와 함께 쓰거나 파일을 읽지 못하면 기동 거부. |
| `DATABASE_POOL_MAX` | 아니오 | pg Pool 최대 연결 수(기본 15). 1 이상의 정수가 아니면 기동 거부(오류에는 키 이름만). 운영값은 [DB 연결 수](#db-연결-수) 기준으로 정합니다. |
| `PORT` | 예 | API 포트. 컨테이너 운영은 `3000`. |
| `WEB_URL` | 예(운영은 https) | 본 도메인. 랜딩 302 대상 `{WEB_URL}/p/{publicId}`, 안내 `{WEB_URL}/notice?reason=`, 이미지 주소 `{WEB_URL}/api/backend/api/files/{id}`, 구글 리디렉션 URI `{WEB_URL}/auth/google/callback`. https면 세션·state 쿠키에 `Secure`. |
| `SHORT_LINK_BASE_URL` | 예(운영은 https) | 단축 도메인. 단축 URL `{SHORT}/{slug}`, 클릭 주소 `{SHORT}/c/{linkPublicId}`. 로컬은 API 주소. https면 `cl_vid`에 `Secure`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 로그인에 필요(운영 필수) | 사용자가 Google Cloud 콘솔에서 발급. 비면 로그인 API가 503 `auth_not_configured`. 콘솔에 등록할 리디렉션 URI는 `{WEB_URL}/auth/google/callback`. |
| `OPERATOR_EMAILS` | 운영 필수 | 운영자 구글 이메일(쉼표 구분, 대소문자 무시). |
| `FILE_STORAGE` | 아니오 | 업로드 이미지 저장소. `disk`(기본, `UPLOAD_DIR`) 또는 `s3`(S3 호환 저장소, `S3_*`). 다른 값이면 기동 거부. [이미지 저장소](#이미지-저장소). |
| `UPLOAD_DIR` | `disk`면 운영 필수 | 이미지 저장 디렉터리. 비면 저장소 루트 `.local/uploads`(git 제외). 컨테이너는 `/data/uploads`. |
| `S3_ENDPOINT` | `s3`면 필수(운영은 https) | S3 호환 엔드포인트. path-style(`{S3_ENDPOINT}/{S3_BUCKET}/{key}`)로 부릅니다. 운영 SeaweedFS `https://s3.shaul.kr`. http(s) URL이 아니면 기동 거부. |
| `S3_REGION` | 아니오 | 서명 지역. 비면 `us-east-1`(SeaweedFS는 아무 값이나 받음, Cloudflare R2는 `auto`). |
| `S3_BUCKET` | `s3`면 필수 | 버킷 이름. 운영 `crelink-uploads`. API는 버킷을 만들지 않습니다. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `s3`면 필수(비밀) | 버킷 범위 읽기·쓰기 자격 증명. 운영 값은 SeaweedFS `s3.json`의 identity `crelink`이고 대상별 SOPS 암호문에만 둡니다. |
| `GEOIP_MMDB_PATH` | 아니오 | mmdb(DB-IP Lite City 등, CC BY 4.0이라 웹 `/privacy`에 출처 표시) 경로. 비면 국가·도시를 null로 두고 기동 시 경고를 한 번 남김. 파일을 열지 못해도 같은 동작에 오류 로그. 컨테이너는 볼륨 `/data/geoip`. |
| `TRUSTED_PROXY_HOPS` | 아니오 | 앞단의 신뢰할 리버스 프록시 수(기본 0). 0이면 소켓 주소, N이면 `X-Forwarded-For`의 오른쪽에서 N번째 값을 방문·클릭 IP로 씁니다([방문자 IP](#방문자-ip)). 운영(Caddy 1단)은 `1`. 0 이상의 정수가 아니면 기동 거부. |
| `BANNER_SLOT_MAX` | 아니오 | 크리에이터 배너 슬롯에서 보이게(숨김·차단 아님) 둘 수 있는 배너 수 n, 랜딩마다(기본 5, `[임시값]`). 1 이상의 정수가 아니면 기동 거부. 지금 장수보다 낮추면 있는 배너는 그대로 두고 추가·숨김 해제만 막습니다. 응답 `bannerLimits.visibleMax`. |
| `BANNER_SLOT_TOTAL_MAX` | 아니오 | 숨김·차단 포함 크리에이터 배너 보관 상한, 랜딩마다(기본 20, `[임시값]`). `BANNER_SLOT_MAX` 이상의 정수가 아니면 기동 거부. 응답 `bannerLimits.totalMax`. 운영 값을 바꿀 때는 비밀이 아니므로 `.sops.yaml` `unencrypted_regex`에 키를 먼저 더합니다(`DATABASE_POOL_MAX`와 같은 절차, [설계](../../../docs/specs/crelink-ad-banner.md#설정값)). |
| `SENTRY_DSN` | 아니오(운영 선택) | Sentry DSN. 비면 Sentry를 초기화하지 않습니다(로컬·시험·PR CI). 운영 값은 대상별 SOPS 암호문의 평문 키(이벤트 전송만 허용하는 공개 값). [오류 모니터링](#오류-모니터링). |
| `SENTRY_ENVIRONMENT` | 아니오 | 이벤트 환경 이름. 비면 `NODE_ENV=production`이면 `production`, 아니면 `development`. |
| `SENTRY_RELEASE` | 아니오 | release. 운영 이미지는 빌드 인자로 배포 커밋 SHA가 이미지 ENV에 들어가 소스맵 업로드 release와 같습니다. 비면 release 없이 보냅니다. |
| `SENTRY_TRACES_SAMPLE_RATE` | 아니오 | 성능 추적 비율(기본 0.1). 0~1 사이 수가 아니면 기동 거부. |

### 운영 필수 설정

`NODE_ENV=production`이면 `main.ts`가 Nest 모듈(DB 연결)보다 먼저 `assertProductionConfig`(`src/config.service.ts`)로 검사하고, 문제가 있으면 모두 모아 한 번에 오류를 내고 종료 코드 1로 끝납니다. 로컬·테스트(`NODE_ENV`가 `production`이 아님)는 영향이 없습니다.

- 비어 있거나 공백뿐이면 거부: `DATABASE_URL`, `PORT`, `WEB_URL`, `SHORT_LINK_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPERATOR_EMAILS`(쉼표로 나눠 이메일이 하나도 없으면 비어 있음), 그리고 `FILE_STORAGE`에 따라 `disk`(기본)면 `UPLOAD_DIR`, `s3`면 `S3_ENDPOINT`·`S3_BUCKET`·`S3_ACCESS_KEY_ID`·`S3_SECRET_ACCESS_KEY`.
- `FILE_STORAGE`가 `disk`·`s3`가 아니면 거부.
- `WEB_URL`·`SHORT_LINK_BASE_URL`(그리고 `s3`면 `S3_ENDPOINT`)이 https URL이 아니면 거부.
- 오류 메시지에는 키 이름만 넣고 값(비밀번호·클라이언트 비밀값·이메일)은 넣지 않습니다. 예: `NODE_ENV=production 설정 오류로 기동을 거부합니다. 비어 있음: DATABASE_URL, GOOGLE_CLIENT_ID / https URL이 아님: WEB_URL.`

### DB TLS

`src/database.ts`의 `databaseConnectionConfig`가 `DATABASE_URL`·`DATABASE_SSL`·`DATABASE_SSL_CA_PATH`를 pg Pool 설정으로 바꿉니다.

| `DATABASE_SSL` | pg `ssl` | 의미 |
| --- | --- | --- |
| 비어 있음 | 정하지 않음 | URL을 그대로 넘깁니다. URL에 TLS 파라미터가 없으면 평문(로컬 PostgreSQL). |
| `disable` | `false` | 평문. |
| `require` | `{ rejectUnauthorized: false }` | 암호화만 하고 서버 인증서는 확인하지 않습니다(libpq `sslmode=require`와 같음). |
| `verify-full` | `{ rejectUnauthorized: true, ca }` | CA 체인과 호스트 이름을 확인합니다. `DATABASE_SSL_CA_PATH`가 있으면 그 PEM을 `ca`로, 없으면 Node 기본 신뢰 저장소를 씁니다. |

- 설치된 pg(8.23, pg-connection-string 2.14)는 연결 문자열을 파싱한 결과로 Pool의 `ssl` 옵션을 덮어씁니다(`sslmode`가 있으면 `ssl` 객체를 새로 만들고 `disable`이면 `false`). 그래서 `DATABASE_SSL`이 있으면 URL의 `ssl`·`sslmode`·`sslrootcert`·`sslcert`·`sslkey`·`uselibpqcompat`를 지워 두 설정이 섞이지 않게 합니다. 운영은 `DATABASE_URL`에 TLS 파라미터를 넣지 말고 `DATABASE_SSL`로 정합니다.
- Supabase 운영 권장: `DATABASE_SSL=verify-full`, `DATABASE_SSL_CA_PATH`=대시보드 Database Settings의 SSL Configuration에서 받은 루트 인증서(`prod-ca-2021.crt`)를 컨테이너에 읽기 전용으로 마운트한 경로. `require`는 중간자 공격을 막지 못합니다. 근거: [Supabase SSL Enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement), [Supabase Connect to your database — SSL](https://supabase.com/docs/guides/database/connecting-to-postgres#connecting-with-ssl).

> **경고: Supabase 트랜잭션 풀러(포트 6543)를 쓰지 마세요.** API는 기동할 때 migration을 세션 advisory lock(`pg_advisory_lock`)으로 한 연결에서 잡고 풉니다(`runMigrations`). Supavisor 트랜잭션 모드는 트랜잭션마다 연결을 풀에 돌려줘 세션 단위 advisory lock·`SET`·prepared statement가 유지되지 않습니다. `DATABASE_URL`은 직접 연결 또는 Supavisor **세션 모드**(`aws-[INDEX]-[REGION].pooler.supabase.com:5432`, 사용자 `postgres.[PROJECT-REF]`)를 씁니다. Supabase 직접 연결은 IPv6 전용이라 IPv4만 쓰는 서버에서는 안 되므로 운영은 세션 모드 풀러가 기본입니다. 근거: [Supabase Connect to your database — Transaction mode limitations·Endpoints](https://supabase.com/docs/guides/database/connecting-to-postgres#transaction-mode-limitations) (2026-10-06 확인).

### DB 연결 수

`src/database.ts`의 pg Pool은 `max: DATABASE_POOL_MAX`(`parseDatabasePoolMax`, 기본 15)로 연결을 엽니다. idle 연결은 10초 뒤 닫히고(pg 기본 `idleTimeoutMillis`), 모든 연결이 사용 중이면 쿼리는 빈 연결을 기다리다 `connectionTimeoutMillis`(5초)를 넘으면 실패합니다.

운영 `DATABASE_URL`은 Supavisor 세션 모드라 Supabase 대시보드의 **Pool Size**가 그 프로젝트에 붙을 수 있는 클라이언트 연결 상한입니다(세션 모드는 클라이언트 연결 하나가 DB 연결 하나를 차지). 무중단 전환([ADR 0011](../../../docs/adr/0011-zero-downtime-deploy.md)) 중에는 구·신 API가 잠시 함께 돌아 연결이 최대 2배가 되므로 운영값은 다음을 지킵니다.

```text
2 × DATABASE_POOL_MAX ≤ Pool Size − 여유(관리 접속·migration 도구용, 최소 2)
```

- 예: Pool Size 15면 `2 × 6 = 12 ≤ 13`이라 6, Pool Size 20이면 `2 × 9 = 18 ≤ 18`이라 9.
- 맞출 수 없으면(필요한 동시 쿼리가 더 많으면) `DATABASE_POOL_MAX`를 억지로 낮추지 말고 Pool Size를 올립니다. Pool Size 상한은 compute 크기의 `max_connections`에 묶이므로 필요하면 compute를 올립니다.
- 상한을 넘으면 새 인스턴스의 연결(readiness·migration)이 `max clients reached`로 실패합니다. 운영값 설정과 Pool Size 기록은 인프라(`infra/prod/` 암호문)에서 합니다.
- 근거: [Supavisor FAQ](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI), [Supabase connection management](https://supabase.com/docs/guides/database/connection-management), [세션 모드 클라이언트 상한 discussion #22305](https://github.com/orgs/supabase/discussions/22305), [node-postgres Pool](https://node-postgres.com/apis/pool), [조사: 두 버전이 동시에 도는 동안의 조건](../../../docs/references/zero-downtime-deploy.md#두-버전이-동시에-도는-동안의-조건).

## 종료

`src/shutdown.ts`의 `enableGracefulShutdown`(`main.ts`가 `listen` 전에 부름)이 SIGTERM·SIGINT를 받으면 다음 순서로 끝냅니다. 컨테이너는 `init: true`(tini)가 신호를 node에 넘깁니다.

1. HTTP 서버를 닫아 새 연결을 받지 않습니다. idle keep-alive 연결은 바로 끊고, 진행 중 요청과 종료 중 기존 연결로 들어온 요청은 `Connection: close`로 응답한 뒤 연결을 끊습니다(이미 헤더를 보낸 응답은 끝나면 idle 연결로 끊음). 그래서 Caddy 같은 keep-alive 클라이언트가 종료를 `keepAliveTimeout`(5초)만큼 늦추거나 계속 붙잡지 못합니다.
2. 진행 중 요청이 모두 끝나면 `app.close()`로 `onModuleDestroy`를 부릅니다: `Database`가 빌려 간 연결이 돌아오길 기다려 pool을 닫고(`PostgreSQL pool을 닫았습니다.` 로그), `RetentionService`가 24시간 timer를 정리합니다.
3. Sentry 공식 안내(`close`는 종료 직전에)대로 `Sentry.close(2000)`으로 남은 이벤트를 최대 2초 보냅니다(Sentry가 꺼져 있으면 바로 끝남).
4. 종료 코드 0으로 끝냅니다. 종료 중 오류면 1입니다. 종료 중 다시 온 신호는 무시합니다.

- `app.enableShutdownHooks()`를 쓰지 않는 이유: Nest 11.2와 12.1 모두 신호를 받으면 `onModuleDestroy`를 HTTP 서버를 닫기 **전에** 부르고(`NestApplicationContext.runShutdownSequence`: destroy hook → beforeShutdown hook → HTTP 서버 close), 끝에 같은 신호로 자신을 다시 죽입니다(`useProcessExit` 옵션이면 `process.exit(0)`). 이 순서면 진행 중 업로드가 닫힌 pool을 써서 500이 되고(실측), 컨테이너 종료 코드가 143입니다. Nest 12 Express 어댑터의 종료 옵션(종료 중 새 요청에 503을 주는 `return503OnClosing`, 열린 연결을 `socket.destroy`로 끊는 `forceCloseConnections`)은 기본으로 꺼져 있고 이 순서 문제를 풀지 못하므로 쓰지 않습니다. 근거: `node_modules/@nestjs/core/nest-application-context.js`, `node_modules/@nestjs/platform-express/adapters/express-adapter.js`.
- 요청이 compose `stop_grace_period`(기본 10초)보다 오래 걸리면 Docker가 SIGKILL로 끝냅니다(종료 코드 137). 운영 grace는 `infra/prod/compose.yaml`에서 정합니다.
- 시험: `test/shutdown.e2e-spec.ts`(느린 업로드 중 SIGTERM → 201·`Connection: close`, 새 연결 거부, idle keep-alive 연결이 종료를 막지 않음, 그 뒤 pool·timer 정리와 종료 코드 0). 컨테이너 실측(느린 업로드 중 `docker stop -t 30`)은 [0032 진행 기록](../../../docs/work/api/0032-api-graceful-shutdown-pool-max.md#진행-기록).

## 컨테이너 이미지

`apps/api/Dockerfile`(멀티 스테이지). 빌드 컨텍스트는 저장소 루트이고, 루트 `.dockerignore`가 허용 목록(`package.json`·`pnpm-lock.yaml`·`pnpm-workspace.yaml`·`.npmrc`·`apps/api`·`packages/shared`, 웹 이미지용 `apps/web`·`packages/design-tokens`)만 넣으며 그 안에서도 `.env*`·`.local`·`node_modules`·`dist`·테스트를 뺍니다. 그래서 `apps/api/.env` 같은 비밀값은 이미지·빌드 캐시에 들어가지 않습니다. 운영 이미지 플랫폼은 `infra/prod/targets.json`의 사용 대상 플랫폼 합집합(지금 `linux/amd64`)이고, 같은 Dockerfile로 `linux/arm64`도 만듭니다.

```bash
# 저장소 루트에서. --platform은 배포 대상 플랫폼(linux/amd64 또는 linux/arm64).
docker buildx build --platform linux/amd64 -f apps/api/Dockerfile -t crelink-api:local --load .
```

- 빌드 단계(`--platform=$BUILDPLATFORM`, `node:24-slim`): corepack으로 루트 `packageManager`의 pnpm을 켜고 `pnpm install --frozen-lockfile --filter @crelink/api...`, `@crelink/shared`·`@crelink/api` 빌드, `pnpm --filter @crelink/api deploy --prod --legacy /out`으로 API와 운영 의존성만 모읍니다(`.npmrc`의 `node-linker=hoisted`라 평평한 `node_modules`, `@crelink/shared`는 빌드 결과를 포함한 복사본). 빌더(GitHub Actions는 amd64)와 대상 플랫폼이 달라도 대상 플랫폼 명령을 실행하지 않으므로 API 이미지는 QEMU가 필요 없습니다.
- 런타임 단계(대상 플랫폼 `node:24-slim`): `/app/apps/api/{package.json,dist,migrations,node_modules}`만 복사. 코드는 root 소유(읽기 전용), 실행은 `node` 사용자(uid 1000), `NODE_ENV=production`, `CMD node apps/api/dist/main.js`, `EXPOSE 3000`. `PORT`는 이미지에 넣지 않으므로 실행 환경에서 `PORT=3000`을 줍니다. `/data/uploads`·`/data/geoip`를 `node` 소유로 만들어 두어 빈 named volume이 처음 붙을 때 그 소유권을 이어받습니다.
- `HEALTHCHECK`: curl 없이 `node -e` 내장 `fetch`로 `http://127.0.0.1:${PORT:-3000}/api/health/ready`(DB 포함)를 4초 제한으로 확인합니다(간격 10초, 제한 5초, 시작 유예 30초, 재시도 3회). Compose는 이 정의를 재사용합니다.
- `@crelink/shared`와 NestJS 12 패키지는 ESM이고 API 빌드는 CommonJS라 Node의 `require(esm)`로 읽습니다. 이미지 기동과 단축 주소 302(`CRELINK_WEB_PATHS` 사용)로 해석을 확인했습니다.
- 운영 의존성은 순수 JS였습니다(2026-10-06 이미지 안 `node_modules` 127개에 `*.node`·`binding.gyp`·install 스크립트 없음. 2026-10-07 `@aws-sdk/client-s3`(`@aws-sdk/*`·`@smithy/*`) 추가 뒤 amd64 교차 빌드 이미지에서 다시 확인해도 없음). native 애드온 의존성을 추가하면 빌더 플랫폼의 바이너리가 다른 대상 플랫폼으로 옮겨져 깨지므로 이 구성을 다시 정해야 합니다(이식 규칙: 멀티 아키텍처 유지).
  - 예외(2026-10-07, `@sentry/nestjs` 11.4): `@sentry/node`가 의존하는 `@sentry/bundler-plugins`(번들러용 플러그인)가 `oxc-parser`의 플랫폼별 native 바인딩(`@oxc-parser/binding-<os>-<cpu>-<libc>`, 빌더 플랫폼 것만 설치됨)을 가져옵니다. API 런타임(`node dist/main.js`)은 이 패키지를 불러오지 않습니다: 이미지에서 `@oxc-parser`·`oxc-parser`를 지우고 Sentry를 켠 채 기동·오류 전송·SIGTERM 종료 코드 0을 확인했습니다. 그래서 빌더와 대상 플랫폼이 달라도 동작은 깨지지 않고, 쓰지 않는 바이너리가 이미지에 남을 뿐입니다. 이 패키지를 런타임에 쓰는 의존성이 생기면 다시 정합니다.
- 크기(2026-10-06, arm64 측정): 이미지 약 388MB(`docker image ls`), 압축 약 80MB. 대부분 Node 베이스 이미지이고 앱 레이어는 `node_modules` 37MB·`dist` 0.8MB·`migrations` 33KB. 2026-10-07 S3 SDK 추가 뒤(amd64): 이미지 약 392MB, `node_modules` 57MB. 같은 날 베이스를 `node:24-slim`(Node 24.21)으로 바꾼 뒤(arm64): 이미지 약 414MB. 같은 날 Sentry SDK 추가 뒤(arm64): 이미지 약 539MB, `node_modules` 159MB(`@sentry/*` 54MB와 `@sentry/bundler-plugins`가 가져오는 `@babel/*`·`oxc-parser` 등).
- Sentry 빌드 인자·secret과 소스맵 업로드는 [오류 모니터링](#오류-모니터링)의 소스맵 절에 있습니다.
- 로컬 확인 예(일회용 DB, 호스트 PostgreSQL은 `host.docker.internal`): `docker run -d --name crelink-api-check -p 3920:3000 -e PORT=3000 -e DATABASE_URL=postgresql://…@host.docker.internal:<포트>/<일회용 DB> -e WEB_URL=https://… -e SHORT_LINK_BASE_URL=https://… -e GOOGLE_CLIENT_ID=… -e GOOGLE_CLIENT_SECRET=… -e OPERATOR_EMAILS=… -e UPLOAD_DIR=/data/uploads crelink-api:local` 후 `docker inspect -f '{{.State.Health.Status}}' crelink-api-check`가 `healthy`, `curl -i http://127.0.0.1:3920/api/health/ready`가 200.

## 인증과 권한

- 로그인(R15): `GET /api/auth/google/start`가 `cl_oauth_state`(HttpOnly, SameSite=Lax, 10분)와 인증 주소를 주고, `POST /api/auth/google/callback`이 state를 쿠키와 비교한 뒤 `google-auth-library`로 code를 교환하고 ID 토큰(서명·aud·만료)을 검증합니다. 이메일은 소문자로 저장합니다.
- 첫 로그인은 한 트랜잭션으로 `users → user_identities → landings(10자 public_id) → landing_blocks(list) → short_links → short_slugs(7자 자동)`를 만듭니다. 같은 구글 계정의 첫 로그인이 동시에 오면 한 번 다시 시도해 기존 사용자로 로그인합니다.
- 역할: 구글이 검증한 이메일이 `OPERATOR_EMAILS`에 있으면 로그인할 때마다 `operator`, 아니면 `creator`로 갱신합니다.
- 세션: 쿠키 `cl_session`(원문 무작위 토큰, 30일), DB `sessions.token_hash`는 SHA-256 hex. API는 웹 BFF·웹 서버가 전달한 `Cookie` 헤더에서 읽습니다.
- `/api/me/*`는 로그인 필수(401 `unauthenticated`), 남의 리소스는 404. `/api/admin/*`는 로그인(401) 후 `role='operator'`(아니면 403 `forbidden`). 정지하면 그 사용자의 세션을 모두 지우고, 세션 조회도 정지 사용자를 제외하며, 다시 로그인하면 403 `account_suspended`.
- 공용 인증(`AuthService.authenticateRequest`, R23 ①): 세 가드(`SessionGuard`·`OperatorGuard`·`OptionalSessionGuard`)가 함께 씁니다. `Authorization: Bearer`가 있으면 쿠키를 보지 않고 AI 운영자 토큰으로만 인증합니다. 형식(`AI_TOKEN_PATTERN`)이 아니거나, 없거나 폐기됐거나, 계정이 정지됐거나 `users.kind`가 `ai`가 아니면 401 `unauthenticated`이고, `OptionalSessionGuard`도 잘못된 Bearer는 비회원으로 두지 않고 401입니다. 토큰은 `api_tokens.token_hash`(SHA-256 hex) 인덱스 조회 1회이고 `last_used_at`은 같은 문장에서 1분에 한 번만 갱신합니다. 두 경로 모두 `request.sessionUser`(기존 `CurrentUser`)와 `request.actor`(`@CurrentActor()`: `userId`·`email`·`kind`·`runId`)를 채웁니다.
- 행위자 규칙(`src/auth/actor-policy.ts` `ActorPolicy`, 인증 직후·파이프와 업로드 전): `@ActorKinds('human'|'ai')`(사람·AI 전용, 아니면 403 `forbidden`), AI의 상태 변경 요청(GET·HEAD·OPTIONS 밖)은 멈춤이면 409 `ai_operator_paused`(`@AllowWhilePaused` 밖), 실행 헤더 `X-Crelink-Agent-Run`이 이 계정의 `running` 실행이고 시작 뒤 90분 안이 아니면 409 `agent_run_required`(`@AgentRunExempt` 밖). 오류 순서는 401 → 403(운영자 아님) → 403(사람·AI 전용) → 409 멈춤 → 409 실행 헤더이고, 운영자 API와 크리에이터 API(`/api/me/*`) 모두에 적용됩니다. 가드 검사 뒤 쓰기까지의 멈춤 경쟁은 행동 기록이 막습니다([AI 운영자](#ai-운영자)).
- 오류 응답은 모두 `{ code, message }`입니다(`src/common/http.ts`의 `ApiExceptionFilter`). 없는 `/api` 경로는 404 `not_found`, 예상하지 못한 오류는 500 `internal_error`와 로그, Sentry 전송([오류 모니터링](#오류-모니터링)).
- 본문 파서(express body-parser, JSON 한도 기본 100KB)가 컨트롤러 전에 내는 클라이언트 오류는 `HttpException`이 아니라 http-errors(`status`, `expose`)라서 필터가 따로 읽습니다. 4xx이고 `expose`인 것만 그 상태로 응답하고 로그를 남기지 않습니다: 잘못된 JSON 400 `validation_failed`, 본문 한도 초과 413 `validation_failed`("요청 본문이 너무 큽니다."), 지원하지 않는 문자셋 415 `validation_failed`. 시험: `test/error-response.e2e-spec.ts`.

## 단축 도메인

- 같은 프로세스가 `/api` 접두사 밖의 `GET /{slug}`, `GET /c/{linkPublicId}`, `GET /a/{bannerPublicId}/{landingPublicId}`, `GET /b/{bannerPublicId}`를 처리합니다(`src/short-link/`). `app.setup.ts`의 `setGlobalPrefix` exclude(`SHORT_DOMAIN_ROUTES`)는 요청 URL이 아니라 라우트 정의 경로에 맞춰 보기 때문에, `:`를 이스케이프한 `\:slug`·`c/\:linkPublicId`·`a/\:bannerPublicId/\:landingPublicId`·`b/\:bannerPublicId`로 네 정의만 제외합니다. 그냥 `:slug`를 쓰면 `/api/me`·`/api/health` 같은 한 단계 경로가 접두사를 잃습니다. 이 매칭은 Nest 11.2와 12.1이 같습니다: `test/health.e2e-spec.ts`가 등록된 Express 라우트 표에서 `/api` 밖 라우트가 정확히 이 네 정의뿐이고 `/api/health/ready` 같은 두 단계 경로가 접두사를 유지하는지 확인합니다. 운영 edge(Caddy 단축 호스트)는 단축 주소와 `^/(c/[a-z0-9]{10}|a/[a-z0-9]{10}/[a-z0-9]{10}|b/[a-z0-9]{10})$`만 API로 넘기고, API도 배너·랜딩 공개 ID가 `[a-z0-9]{10}`이 아니면 DB를 보지 않고 안내로 보냅니다.
- 그래서 접두사 없는 `/health`, `/me`, `/api` 같은 요청은 단축 주소로 해석되고, 예약어라 없는 주소 안내로 302 합니다. 예약어 목록은 `RESERVED_SLUGS`(공유 계약).
- `GET /{slug}`: 대소문자를 무시하고 현재 주소 또는 `retired_at + 90일` 안의 옛 주소를 찾습니다. 찾으면 방문을 기록(응답을 기다리지 않음)하고 302 `{WEB_URL}/p/{publicId}?pass={통과 표시}`. 없으면 302 `…/notice?reason=link_not_found`, 정지 크리에이터면 `…reason=creator_suspended`.
- `GET /c/{linkPublicId}`: 클릭을 기록하고 DB에 저장된 URL(저장 시 http·https만 허용)로 302. 숨김·차단·삭제·정지면 302 `…/notice?reason=link_unavailable`. 열린 리디렉트를 막기 위해 요청 값으로 대상 URL을 만들지 않습니다.
- `GET /a/{bannerPublicId}/{landingPublicId}`(크리링 배너 클릭, R20 ⑧): 배너가 지금 게시 중(`starts_at <= now() < ends_at`)이고 랜딩이 있고 크리에이터가 정지가 아니면 `TrackingService.recordAdStat('click')`로 날짜(Asia/Seoul)·배너·랜딩 카운터(`ad_banner_daily_stats.clicks`)를 올리고(응답을 기다리지 않음) 저장된 URL로 302. 끝남·예약·없음·정지면 302 `…/notice?reason=link_unavailable`. 개인 식별 정보를 남기지 않으므로 방문자 쿠키를 읽거나 발급하지 않습니다. 공개 랜딩 API가 `passAccepted`일 때만 이 주소를 주므로 서비스 화면에서 연 랜딩의 클릭은 세지 않습니다. 누구나 주소를 만들어 수를 늘릴 수 있다는 점은 `/c/`와 같은 수준으로 받아들였습니다([기술 설계](../../../docs/specs/crelink-ad-banner.md) `노출·클릭 기록` 절).
- `GET /b/{bannerPublicId}`(크리에이터 배너 클릭, R21 ④): 연결 URL이 있고 숨김·차단이 아니고 계정이 배너 슬롯 부여됨·정지 아님이면 `creator_banner_clicks`에 링크 클릭과 같은 항목(방문자 쿠키·IP·국가·도시·유입 호스트·UA·기기·브라우저·OS)을 남기고 저장된 URL로 302. 단축 URL은 `short_links.landing_id = creator_banners.landing_id`로 찾습니다. URL 없음·숨김·차단·회수·정지·삭제면 `link_unavailable`. 배너를 지워도 기록은 `banner_public_id` 사본으로 남습니다.
- 리디렉트는 모두 `Cache-Control: no-store`이고, 방문자 쿠키 `cl_vid`(UUID, HttpOnly, SameSite=Lax, 1년)는 `/{slug}`·`/c/`·`/b/`에서 없거나 형식이 틀릴 때만 새로 발급합니다. `/a/`는 쿠키를 다루지 않습니다.

### 랜딩 통과 표시

방문은 `GET /{slug}`에서만 기록되므로, 웹 공개 랜딩은 외부에서 온 요청을 이 리디렉트로 온 경우에만 그대로 그리고 나머지는 단축 주소로 보냅니다(PRD R7, [기술 설계](../../../docs/specs/crelink-mvp.md#구성과-흐름)). 그 판단에 쓰는 값이 통과 표시입니다(`src/short-link/landing-pass.service.ts`).

- 형식 `<만료 epoch 초>.<base64url HMAC-SHA256 앞 16바이트>`, 서명 대상 `publicId + '.' + 만료`, 유효 60초. 비교는 `timingSafeEqual`.
- 키: API 프로세스가 시작할 때 `crypto.randomBytes(32)`로 만듭니다. 환경변수·비밀값이 없습니다. 위조·재사용돼도 결과는 "그 요청이 방문으로 안 세어짐"뿐이고, Blue/Green 전환 순간 다른 색 API가 검증해 실패해도 웹이 단축 주소로 한 번 더 보내 새 표시를 받으므로 스스로 복구됩니다. 한 색에서 API 프로세스를 여러 개(cluster·복제) 띄우면 발급과 검증이 다른 프로세스로 갈 수 있어 공유 키가 필요합니다.
- 검증: `GET /api/public/landings/{publicId}?pass=`가 `passAccepted`(이 publicId에 대해 발급했고 만료 전이면 true)와 `shortUrl`(현재 단축 주소, `CreatorService.shortLink`)을 줍니다. 발급(`ShortLinkModule`)과 검증(`CreatorModule`)이 같은 키를 쓰도록 `LandingPassModule` 하나가 서비스를 제공합니다.

### 방문자 IP

`X-Forwarded-For`는 클라이언트가 임의로 넣을 수 있는 헤더라, 첫 값을 쓰면 방문 기록의 IP와 위치를 누구나 위조할 수 있습니다. 그래서 `src/short-link/tracking.service.ts`의 `clientIp`는 `TRUSTED_PROXY_HOPS`(앞단의 신뢰할 프록시 수)만큼만 헤더를 믿습니다.

- `0`(기본, 로컬·테스트): 헤더를 무시하고 TCP 연결의 소켓 주소(`request.socket.remoteAddress`)를 씁니다.
- `N`: 신뢰할 프록시가 N단이면 각 프록시가 받은 연결 주소를 `X-Forwarded-For` 끝에 덧붙이므로, 오른쪽에서 N번째 값이 가장 바깥 신뢰 프록시가 본 클라이언트 주소입니다. 그 값을 쓰고 앞쪽 값(클라이언트가 넣은 위조 값)은 무시합니다. 운영은 Caddy 1단이라 `1`(마지막 값). 여러 줄로 온 헤더는 쉼표로 이어 한 목록으로 봅니다.
- 값이 N개보다 적거나, 고른 값이 IP가 아니면(포트가 붙은 값 포함) 소켓 주소로 돌아갑니다.
- 정규화: IPv4-mapped IPv6(`::ffff:1.2.3.4`)는 IPv4로, IPv6는 소문자로 저장합니다.
- 이 설정은 방문·클릭을 기록하는 요청이 모두 그 프록시를 거칠 때만 안전합니다. 운영은 API 포트를 호스트에 공개하지 않고 공용 Docker 네트워크 `crelink-edge`에서 edge Caddy와 같은 색 웹만 API를 부르며(색 별칭 `api-<색>`), 방문·클릭을 기록하는 단축·클릭 경로는 edge Caddy를 거쳐서만 들어옵니다([운영 배포 설계](../../../docs/specs/crelink-prod-deploy.md#공개-경로와-caddy-정책)).

### 방문·클릭 기록 항목

`src/short-link/tracking.service.ts`. IP, `cl_vid`, `Referer`(방문은 원문 2048자까지와 호스트, 클릭은 호스트만), User-Agent(512자까지), `bowser`로 기기 종류(`mobile`·`tablet`·`desktop` 등)·브라우저·OS, `maxmind`로 국가(ISO 코드)·도시(영문). 저장 실패는 리디렉트에 영향 없이 로그만 남깁니다.

## 오류 모니터링

Sentry(SaaS, 미국 리전)로 예상하지 못한 오류, 요청 10%의 성능 추적, Nest 로그(Logs), 업무 지표(Metrics), 보존 작업 체크인(Cron)을 보냅니다. 결정과 대안·위험은 [ADR 0012](../../../docs/adr/0012-error-monitoring-sentry.md)와 무료 기능 확장 [ADR 0014](../../../docs/adr/0014-sentry-free-plan-features.md), 운영 설정 절차는 [런북](../../../infra/docs/prod-runbook.md), 개인정보 고지는 웹 `/privacy`입니다. SDK는 `@sentry/nestjs` 11.4입니다.

- 초기화: `src/instrument.ts`가 `main.ts`의 첫 import라 Nest·Express·pg보다 먼저 실행되고(자동 계측 조건), `apps/api/.env`를 읽은 뒤(`src/local-env.ts`) `sentryOptions`(`src/monitoring/sentry.ts`)로 `Sentry.init`합니다. `SENTRY_DSN`이 비면 초기화하지 않아 나머지 코드(`SentryModule.forRoot()`, 필터 데코레이터, `setUser`, `Sentry.close`)는 아무것도 보내지 않습니다. Jest 시험은 `main.ts`를 거치지 않으므로 Sentry가 꺼진 채 돕니다.
- 보내는 오류: `ApiExceptionFilter`가 500 `internal_error`로 응답하는 오류만 `@SentryExceptionCaptured()`(500 처리 메서드에 붙임)로 보냅니다. Nest `HttpException`(4xx, 의도한 503 포함)과 본문 파서의 http-errors 4xx(400·413·415)는 보내지 않습니다. 이 데코레이터는 `HttpException`만 예상한 오류로 보므로 `catch`에 붙이면 http-errors 4xx도 보냅니다(실측: 데코레이터를 `catch`로 옮기면 아래 시험의 4xx 0건 검사가 실패).
- 사용자: 요청마다 `src/monitoring/request-user.ts`(`configureApp`이 가장 먼저 붙이는 Express 미들웨어)가 요청 격리 스코프의 `user.ip_address`를 [방문자 IP](#방문자-ip)와 같은 `clientIp`(`TRUSTED_PROXY_HOPS`)로 넣고, `SessionGuard`가 세션을 확인하면 `user.id`(내부 UUID)를 더합니다. 이메일·이름은 넣지 않습니다. SDK의 헤더 기반 IP 추론(`X-Forwarded-For` 첫 값 등, 클라이언트가 위조 가능)은 `dataCollection.userInfo: false`로 끕니다. 웹 BFF·서버 컴포넌트를 거친 요청은 웹 컨테이너가 직접 부르므로 IP가 웹 서버 주소이고, 방문자 IP는 같은 trace의 웹 브라우저 이벤트에 있습니다.
- 보내지 않는 것: 쿠키(`cl_session` 원문 포함)·`Authorization`·`Proxy-Authorization`·`X-Crelink-Internal`·`Set-Cookie` 헤더, 요청 본문, DB 쿼리 파라미터(`databaseQueryData: false`, 쿼리 문은 매개변수화된 형태만). URL 쿼리의 `code`·`state`(구글 로그인)·`pass`(통과 표시)는 `[Filtered]`. `dataCollection`(SDK 11은 `sendDefaultPii` 대신 이것으로 정함)으로 막고, `beforeSend`·`beforeSendSpan`(`scrubEvent`·`scrubSpan`)이 이벤트와 span 속성에서 한 번 더 지웁니다. SDK 11은 성능 데이터를 span 단위로 보내므로(`traceLifecycle: 'stream'` 기본) `beforeSendTransaction` 대신 `beforeSendSpan`을 씁니다.
- 그 밖에 SDK 기본으로 보내는 것: 프로세스 단위 세션(Release Health, 오류가 나면 `crashed`, `did`는 내부 사용자 ID), 버린 이벤트 수(client report).
- 종료: [종료](#종료) 3단계의 `Sentry.close(2000)`.
- 시험: `src/monitoring/sentry.spec.ts`(DSN 없음 → 설정 없음·`Sentry.isEnabled()` false, 기본값, 비율 검증, 헤더·쿠키 정리, 로그 속성·본문 정리, 지표 속성 정리), `test/sentry.e2e-spec.ts`(가짜 transport: 예상 못 한 오류 1건·user가 `{ id, ip_address }`뿐이고 IP는 `X-Forwarded-For` 오른쪽 신뢰 값·쿠키 원문 없음, 동시 요청의 user가 섞이지 않음, 401·404·413·400은 0건, span에 user가 붙고 쿠키 헤더 없음). 이 시험은 모듈을 불러온 뒤 초기화하므로 Express·pg 자동 계측 span은 확인하지 못합니다(실제 기동에서는 `SessionGuard`·`SELECT …` 같은 span이 붙는 것을 가짜 수신 서버로 확인, [0042 진행 기록](../../../docs/work/orchestrator/0042-sentry-monitoring.md#진행-기록)).
- 로컬에서 전송 확인: 가짜 수신 서버를 띄우고 `apps/api/.env`에 `SENTRY_DSN=http://public@127.0.0.1:<포트>/1`을 넣어 `make api-restart`. 수신 서버는 `POST /api/1/envelope/`로 envelope(줄마다 JSON, 큰 본문은 gzip)를 받습니다.

### 로그·지표·Cron

`SENTRY_DSN`이 비면 Sentry client가 없어 `Sentry.logger`·`Sentry.metrics.count`·체크인은 아무것도 보내지 않고, `Sentry.withMonitor`는 작업만 실행합니다. 로그·지표는 SDK가 모아 몇 초마다 보내고, 종료 때 `Sentry.close`가 남은 것을 보냅니다. 근거: [0052](../../../docs/work/orchestrator/0052-sentry-free-features.md).

- 로그(Sentry Logs): `main.ts`가 `NestFactory.create`의 `logger`로 `SentryConsoleLogger`(`src/monitoring/sentry-logger.ts`, Nest `ConsoleLogger` 하위 클래스)를 넘깁니다. 콘솔 출력은 그대로이고, `log`(Sentry `info`)·`warn`·`error`·`fatal`을 Sentry Logs로도 보냅니다. `debug`·`verbose`는 보내지 않습니다. 프레임워크 로그(기동 때 모듈·라우트 목록 등)와 모든 `new Logger(...)`가 대상입니다. 속성은 `nest.context`(로거 이름), 오류 스택이 있으면 `nest.stack`, SDK가 붙이는 release·environment·trace와 요청 중이면 `user.id`입니다. Jest 시험은 `main.ts`를 거치지 않고 `logger: false`로 앱을 만들어 이 로거를 쓰지 않습니다.
- 로그 정리(`beforeSendLog: scrubLog`, `src/monitoring/sentry.ts`): 이름에 `cookie`·`authorization`·`token`·`secret`·`password`·`email`이 들어간 속성(대소문자 무시)과 `user.email`·`user.name`을 지우고, 본문과 남은 문자열 속성의 이메일 주소는 `[email]`, JWT(`eyJ…`)는 `[token]`으로 바꿉니다. `user.id`(내부 UUID)는 오류 이벤트처럼 남깁니다. 다른 로그는 쿠키·토큰·이메일을 넣지 않습니다.
- 구글 검증 실패 경고(`AuthService`): `google-auth-library` 오류 문구는 이유 뒤에 ID 토큰 원문(`: eyJ…`)이나 payload JSON(`: {…}`, 이메일·이름·사진·sub)을 붙이므로, `googleVerifyFailureReason`(`src/auth/google-oauth.ts`)이 그 꼬리를 버리고 오류 이름과 이유만 남깁니다. 콘솔과 Sentry Logs에 같은 문구가 남습니다.
- 업무 지표(Sentry Metrics, counter, `src/monitoring/metrics.ts`의 `countBusinessMetric`): 아래 표. 없는 주소·정지·숨김 링크 안내 302는 세지 않습니다. 방문·클릭은 리디렉트 시점에 세므로 기록 저장 실패(오류 로그)와 무관합니다. 새 지표(방명록 0050 등)는 `BusinessMetric`에 이름을 더하고 이 표를 고칩니다.
- 지표 정리(`beforeSendMetric: scrubMetric`): `user.`로 시작하는 속성(SDK가 스코프 user에서 붙이는 `user.id`·`user.email`·`user.name`)과 이름에 `email` 또는 IP(`ip`·`ip_address`·`client.address`·`remote_addr`)가 들어간 속성을 지웁니다. 속성에는 낮은 카디널리티 열거값만 넣고 단축 주소·링크 ID·사용자·IP는 넣지 않습니다.
- Cron: `RetentionService`가 실행(기동 시·24시간마다)을 `Sentry.withMonitor('crelink-api-retention', …)`로 감싸 `in_progress` → `ok`(성공)·`error`(예외) 체크인을 보냅니다. 실패하면 기존 `보존 작업 실패` 오류 로그도 그대로 남습니다. 첫 체크인이 Sentry에 모니터를 만듭니다(무료 1개). 모니터 설정: interval 1일(기동 때 실행 + `setInterval`이라 crontab이 아님), 시간대 `Asia/Seoul`, 체크인 여유 60분(`setInterval` 지연, 배포·재시작은 다음 실행을 앞당기기만 함), 최대 실행 30분(보통 수 초, 다른 인스턴스의 advisory lock 대기 포함). 실행 중 프로세스가 끝나면 `error`나 시간 초과로 남을 수 있습니다.

| 지표 | 보내는 곳 | 속성 |
| --- | --- | --- |
| `crelink.auth.login` | `AuthController.callback`(`POST /api/auth/google/callback`) | `result`: `success`, `failure`(state·code 오류, 구글 검증 실패, 정지 계정, 로그인 설정 없음, 예상 못 한 오류) |
| `crelink.short_link.visit` | `ShortLinkController.visit`(`GET /{slug}`)이 랜딩으로 302 할 때(방문 기록 시작) | 없음 |
| `crelink.link.click` | `ShortLinkController.click`(`GET /c/{linkPublicId}`)이 외부 URL로 302 할 때(클릭 기록 시작) | 없음 |
| `crelink.ad_banner.impression` | `TrackingService.recordAdStat('impression')`: 공개 랜딩 API가 `passAccepted`이고 광고 블록이 보일 때 첫 장 1건(기록 시작) | 없음 |
| `crelink.ad_banner.click` | `TrackingService.recordAdStat('click')`: 광고 클릭 경로(기록 시작) | 없음 |
| `crelink.creator_banner.click` | `ShortLinkController.creatorBannerClick`(`GET /b/{bannerPublicId}`)이 외부 URL로 302 할 때(클릭 기록 시작) | 없음 |

### 소스맵

- `tsconfig.build.json`이 `sourceMap`·`inlineSources`·`sourceRoot: "/"`(Sentry TypeScript 안내)로 `dist/*.js.map`에 원본을 넣습니다.
- `Dockerfile` 빌드 단계는 BuildKit secret `sentry_auth_token`이 있을 때만 `@sentry/cli`(개발 의존성)로 `sourcemaps inject dist`(debug ID 삽입) 뒤 `sourcemaps upload --org $SENTRY_ORG --project $SENTRY_PROJECT --release $SENTRY_RELEASE dist`를 실행하고 그다음 운영 의존성을 모읍니다. secret이 없으면 건너뛰고 빌드는 성공합니다(로컬·PR CI). 토큰이 있는데 `SENTRY_ORG`·`SENTRY_PROJECT`·`SENTRY_RELEASE`가 비거나 업로드가 실패하면 빌드가 실패합니다(배포가 읽을 수 없는 스택으로 나가지 않게. Sentry 장애로 배포가 막히면 secret을 비우고 다시 실행). 토큰은 그 `RUN`에만 보이고 이미지·빌드 캐시에 남지 않습니다.
- 런타임 단계는 빌드 인자 `SENTRY_RELEASE`를 `ENV`로 둬 이벤트 release가 업로드 release와 같습니다. 배포 워크플로가 넘기는 값은 [운영 배포 설계](../../../docs/specs/crelink-prod-deploy.md)에 있습니다.

## 크리에이터 규칙

- 단축 주소(R8, `src/creator/slug.service.ts`): 입력은 앞뒤 공백을 빼고 소문자로 바꾼 뒤 `SLUG_PATTERN`·3~30자·예약어를 봅니다. 다른 단축 URL의 현재 주소나 90일 안의 옛 주소면 409 `slug_taken`. 자기 옛 주소는 되돌릴 수 있습니다. 첫 변경(`slug_changed_at`이 없음)은 바로, 그 뒤에는 마지막 변경에서 30일 뒤부터(429 `slug_change_too_soon`). 자동 주소로 되돌려도 30일 제한은 마지막 변경 시각 기준이라 우회할 수 없습니다. 같은 주소로 바꾸는 요청은 아무것도 바꾸지 않고 200입니다. 예약 기간이 끝난 남의 옛 주소는 행을 지우고 새로 만듭니다.
- 링크 한도(R13, R24 ②): 보이는(숨기지 않고 차단되지 않은) 링크 ≤ min(5 + `extra_link_slots` + 링크 슬롯 이벤트 보너스 합, 50)(409 `link_limit_reached`), 숨긴 링크 포함 ≤ 50(409 `link_total_limit_reached`). 보너스 합은 `slot_event_entries.bonus_links`의 합이라 운영자 추가 슬롯과 따로 더해집니다([링크 슬롯 이벤트](#링크-슬롯-이벤트)). 계산은 `CreatorService.limits` 한 곳이고, 추가와 숨김 해제에서 확인하며, 같은 사용자의 링크 변경은 사용자 행 잠금으로 줄 세웁니다(신청은 한도를 늘리기만 해서 잠그지 않음). 운영자 추가 슬롯은 0~45.
- 차단 도메인(R14): 링크 호스트가 차단 도메인이거나 그 하위 도메인이면 추가·URL 수정이 422 `link_domain_blocked`. 운영자가 도메인을 추가하면 같은 트랜잭션에서 기존 링크의 `blocked_at`을 채웁니다. 목록에서 빼도 이미 차단된 링크는 운영자가 링크별로 풉니다.
- 광고 블록·배너 슬롯 위치(R20 ①②, R21 ①, [기술 설계](../../../docs/specs/crelink-ad-banner.md#위치-모델)): 위치는 첫 list 구역의 `landing_blocks.slot_position`(NULL = 맨 뒤, k = `position < k`인 링크들 다음) 하나이고 링크 한도에 들지 않습니다. `PUT /api/me/links/order`가 링크를 0..n-1로 다시 매기며 같은 트랜잭션에서 저장합니다: `slotIndex`(0 이상 정수, 아니면 400 `validation_failed`)가 n 이상이면 NULL, 아니면 그 값. 생략하면(옛 웹) 다시 매기기 전의 슬롯 앞 링크 수(`SLOT_INDEX_SQL`)를 새 위치로 둬 상대 위치를 유지합니다. 편집 상태 `slot.slotIndex`도 같은 식(빈 번호와 무관)이고, `slot.kind`는 `users.banner_slot_granted_at`이 있으면 `creator`입니다.
- 공개 랜딩 슬롯(`src/creator/public-landing.controller.ts`): 첫 list 구역에만 `resolveBannerSlot`(공유 계약)을 적용하고 숨김이면 `slot: null`입니다. 링크는 숨김·차단 포함 전체를 읽어 위치를 계산하고 보이는 링크만 내려 줍니다. 배너 질의는 1개(부여됨: 그 랜딩의 숨김·차단 아닌 크리에이터 배너, 아니면 게시 중 `starts_at <= now() < ends_at` 크리링 배너 `sort_order, created_at`)입니다. `clickUrl`: 광고는 `passAccepted`일 때만 `{SHORT}/a/{배너}/{랜딩}`, 아니면 저장된 URL(R20 ⑧ 서비스 화면 제외). 크리에이터 배너는 늘 `{SHORT}/b/{배너}`이고 연결 URL이 없으면 null. `passAccepted`이고 광고 블록이 보이면 첫 장 노출을 `TrackingService.recordAdStat`로 `ad_banner_daily_stats`(Asia/Seoul 날짜·배너·랜딩 공개 ID, 개인 식별 정보 없음)에 더합니다(응답을 기다리지 않음). 관리 미리보기(`GET /api/me/landing`의 `adBanners`)는 저장된 URL이고 세지 않습니다(R7 ⑥).
- 배너 슬롯 부여·배너 차단(운영자, R21 ①④⑤, R14): `PUT /api/admin/creators/{userId}/banner-slot { granted }`는 `banner_slot_granted_at`을 다시 부여해도 처음 시각으로 두고(`coalesce`), 회수하면 NULL로 바꿉니다. 배너 행은 보관하고 위치(`slot_position`)는 그대로입니다. `PUT /api/admin/banners/{id}/block { blocked, reason? }`는 링크 차단과 같은 규칙(`blocked_at` 유지, 풀면 사유도 비움, 404 `banner_not_found`)입니다. `GET /api/admin/creators/{userId}`의 `bannerSlot`·`banners`(이 랜딩 전체, 숨김·차단·보관 포함)·`bannerLimits`는 편집 상태와 같은 도우미로 채웁니다. 차단 도메인을 더하면 같은 트랜잭션에서 걸리는 크리에이터 배너도 차단하고, 걸리는 게시 중·예약 크리링 배너는 내립니다(`ends_at = least(coalesce(ends_at, now()), now())`, 예약이면 `starts_at`도 지금). 도메인을 목록에서 빼도 차단·내림은 되돌리지 않습니다.
- 크리에이터 배너 쓰기(R21 ②④⑤⑥, `src/creator/banners.service.ts`): `POST /api/me/banners`(201, 맨 뒤 순서), `PATCH`·`DELETE /api/me/banners/{id}`, `PUT /api/me/banners/order`(이 랜딩 배너 전체, 아니면 400 `order_mismatch`). 모든 쓰기는 한 트랜잭션에서 사용자 행 잠금 → 부여 확인(아니면 403 `banner_slot_not_granted`, 회수 뒤 보관 배너를 고치는 길 없음) → 배너·파일 소유(404 `banner_not_found`·`file_not_found`) → 한도 순서라 회수와 줄을 섭니다. 한도는 랜딩마다 추가 때 보관 상한(409 `banner_total_limit_reached`)을 먼저, 보이는(숨김·차단 아님) 배너가 늘 때(추가·숨김 해제)만 n(409 `banner_limit_reached`)을 봅니다. 차단 배너는 수정·삭제·숨김 전환이 되고 주소를 바꿔도 `blocked_at`은 그대로입니다. 새 연결 URL(http·https, null·빈 문자열 = 연결 없음)은 차단 도메인이면 422 `link_domain_blocked`. 정지 이미지: 이미지가 움직이면(`FilesService.isAnimated`) `stillImageFileId`가 필요하고 그 파일은 움직이지 않아야 하며, 움직이지 않는 이미지에는 둘 수 없습니다. PATCH에서 이미지를 바꾸면 `stillImageFileId`도 같은 요청에 넣습니다. 어기면 400 `validation_failed`.
- 이미지(`src/files/`): multipart 필드 `file`, `CRELINK_LIMITS.imageMaxBytes`(4MB, MVP 임시값. 운영 edge Caddy의 웹 호스트 본문 한도는 6MB) 이하. 형식은 클라이언트 Content-Type이 아니라 파일 앞부분(매직 바이트)으로 JPEG·PNG·WebP·GIF만 받습니다. 저장은 `FileStorage` 경계 뒤의 로컬 디스크 또는 S3 호환 저장소([이미지 저장소](#이미지-저장소))이고, `GET /api/files/{id}`는 누구나 받을 수 있으며 1년 캐시합니다(id는 UUID, 내용 불변).
- 움직임 판정(`src/files/animated-image.ts`, 배너 정지 이미지 규칙의 근거): 업로드 때 GIF(이미지 서술자 2개 이상)·WebP(`VP8X` 애니메이션 플래그 또는 `ANIM` 청크)·PNG(`IDAT` 앞 `acTL`)를 판정해 `files.animated`에 저장하고 `UploadFileResponse.animated`로 돌려줍니다. 0003 전에 올린 파일은 NULL이며 `FilesService.isAnimated`가 쓸 때 저장소 바이트로 판정해 채웁니다.

## 방명록

`src/guestbook/`(R19). 계약은 `packages/shared/src/crelink.ts`의 방명록 절, 설계는 [랜딩 방명록 탭 기술 설계](../../../docs/specs/crelink-guestbook.md)입니다.

- 목록 `GET /api/landings/{publicId}/guestbook`은 `OptionalSessionGuard`(`src/auth/session.guard.ts`)를 씁니다. `cl_session`이 유효하면 그 사용자를 보는 사람으로, 없거나 만료·정지 세션이면 비회원으로 보고 401을 내지 않습니다. 작성·삭제·숨김은 `SessionGuard`입니다.
- 랜딩 판정은 공개 랜딩과 같은 `CreatorService.publicLanding`(없음 404 `landing_not_found`, 정지 410 `creator_suspended`) 뒤에 `guestbook_enabled`가 false면 목록·작성이 404 `guestbook_disabled`입니다. 끄기는 `PATCH /api/me/landing { guestbookEnabled }`이고 글은 지우지 않습니다. 삭제·숨김은 방명록을 꺼도 됩니다.
- 가시성은 SQL 한 곳에서 정합니다: 작성자가 정지된 글은 모두에게 빼고, 그 밖에는 보는 사람이 작성자이거나 랜딩 크리에이터이거나 공개·숨기지 않은 글이면 보입니다. `hidden`은 보는 사람이 랜딩 크리에이터일 때만 실제 값이고, `mine`은 보는 사람이 작성자일 때 true입니다. 안 보이는 글은 쪽 크기·커서에도 영향이 없습니다.
- 페이지는 최신순 `(created_at, id)` keyset 20개(`CRELINK_LIMITS.guestbookPageSize`)입니다. 커서는 마지막 글의 `created_at` epoch 마이크로초와 id를 `{마이크로초}.{id}`로 묶은 base64url이며(JS `Date`는 밀리초까지라 DB 값을 그대로 씀), 해석할 수 없거나 여러 번 준 커서는 400 `validation_failed`입니다.
- 작성자 이름·사진은 작성자 랜딩의 현재 `display_name`·`avatar_file_id`를 매번 조인합니다. 본문은 앞뒤 공백을 자른 뒤 1~500자(JS 문자열 길이 기준. DB `CHECK`는 `char_length` 1~500이라 API 검사가 더 엄격함)입니다.
- 권한 없는 삭제(작성자 아님)·숨김(랜딩 크리에이터 아님)과 없는 글·UUID가 아닌 id는 모두 404 `guestbook_entry_not_found`로 같게 답해 글의 존재를 드러내지 않습니다. 숨김은 `hidden_at = now()`, 해제는 NULL입니다.
- 네 경로의 성공 응답은 `Cache-Control: no-store`입니다(보는 사람마다 다름).

## 이미지 저장소

`src/files/file-storage.ts`의 `FileStorage` 경계(`put(key, data)`: 같은 key가 있으면 실패, `get(key)`: 없으면 null) 뒤에 두 구현이 있고, `FilesModule`이 `FILE_STORAGE`로 고릅니다. key는 업로드마다 API가 만든 UUID(확장자 없음)이고 DB `files.storage_key`에는 그 key만 저장하므로 구현을 바꿔도 DB는 그대로입니다. 웹·앱 계약은 바뀌지 않고 API가 `GET /api/files/{id}`로 바이트를 줍니다(저장소 공개 URL·CDN 직접 서빙은 쓰지 않음).

| `FILE_STORAGE` | 구현 | 같은 key 거부 | 없는 key |
| --- | --- | --- | --- |
| `disk`(기본, 로컬 개발) | `LocalDiskFileStorage`: `UPLOAD_DIR/<key>` 파일 | `writeFile` `flag: 'wx'`(O_EXCL) | `ENOENT` → null |
| `s3`(운영) | `S3FileStorage`(`src/files/s3-file-storage.ts`, AWS SDK v3 `@aws-sdk/client-s3`): `<bucket>/<key>` 객체 | 조건부 PUT `If-None-Match: *` → 저장소가 412 `PreconditionFailed` | `NoSuchKey`·404 → null |

- 연결: path-style(`forcePathStyle`), 자격 증명은 `S3_ACCESS_KEY_ID`·`S3_SECRET_ACCESS_KEY`만 씁니다(SDK 기본 체인의 `AWS_*` 환경변수·`~/.aws`를 보지 않음).
- 조건부 PUT 확인(2026-10-07, `chrislusf/seaweedfs:4.47` 로컬 컨테이너, 운영과 같은 버킷 범위 identity): 같은 key 두 번째 PUT은 412, 같은 key 동시 PUT 10개 중 1개만 성공. 이 동작은 계약 시험(`test/file-storage.e2e-spec.ts`)이 매번 확인합니다. Cloudflare R2·AWS S3도 `If-None-Match: *`를 지원합니다. 운영 경로(Cloudflare Tunnel 경유)에서의 412는 런북 [업로드 저장소](../../../infra/docs/prod-runbook.md#9-업로드-저장소) 전환 절차에서 확인합니다.
- 요청 한도(`S3_REQUEST_POLICY`): 연결 3초, 시도당 요청 15초(넘으면 `TimeoutError`), 최대 3번 시도(SDK `standard` 재시도: 연결 오류·시간 초과·5xx·스로틀만 지수 백오프로 다시 시도, 412 등 4xx는 바로 실패). 최악의 경우 요청 하나가 약 1분 걸립니다. 실패하면 업로드·이미지 조회는 500 `internal_error`와 오류 로그입니다(DB 행은 저장 성공 뒤에만 넣음).
- 한계: 첫 PUT이 저장된 뒤 응답만 잃어 재시도가 412를 받으면 업로드는 실패하고 DB에 없는 객체가 버킷에 남습니다(다시 올리면 새 UUID라 사용자 영향은 없음). 지운 이미지 객체 정리는 디스크와 마찬가지로 아직 없습니다.
- 기동 확인: `s3`면 `onApplicationBootstrap`에서 HeadBucket을 5초 한도로 한 번 보내고 결과를 로그로 남깁니다(`[S3FileStorage] 파일 저장소 s3 확인: <endpoint>/<bucket> 접근 가능` 또는 `… 확인 실패: … (오류 이름 HTTP 상태)`, 비밀값은 넣지 않음). 실패해도 기동은 계속합니다.
- readiness에 넣지 않음: `/api/health/ready`는 DB만 봅니다. 이 결과가 이미지 HEALTHCHECK·배포 `up --wait`·Caddy 기동 조건이라, 저장소(home-server SeaweedFS) 장애나 회선 문제를 넣으면 업로드와 무관한 단축 이동(서비스의 핵심 경로)까지 배포 실패·롤백으로 막히기 때문입니다. 저장소 장애는 업로드·이미지 조회 500과 위 로그로 드러나고, 전환 직후 확인은 런북 절차가 맡습니다.

## 크리링 배너 운영

`src/admin/ad-banners.service.ts`·`ad-banners.controller.ts`(R20 ④⑨, R14). 계약은 `packages/shared/src/crelink.ts`의 `AdBannerView`·`AdBannerRequest`, 설계는 [광고 블록과 크리에이터 배너 슬롯 기술 설계](../../../docs/specs/crelink-ad-banner.md#서버-규칙)입니다. 권한은 다른 운영자 API와 같은 `OperatorGuard`이고 삭제 경로는 없습니다.

- 목록 `GET /api/admin/ad-banners`: 전체를 `sort_order, created_at` 순으로, 상태는 한 문장 안의 같은 `now()`로 정합니다(`starts_at > now()` 예약, `ends_at <= now()` 끝남, 그 밖에는 게시 중. 공개 랜딩의 게시 중 조건과 같음). `counts`는 같은 결과에서 셉니다. 누적 노출·클릭은 `ad_banner_daily_stats`의 `sum(...)::int`(node-pg가 bigint를 문자열로 주므로)이고, 끝난 배너를 다시 열면 이어서 더합니다.
- 등록 `POST`(201): 맨 뒤 순서 `coalesce(max(sort_order) + 1, 0)`, `created_by`는 등록한 운영자. 시각은 시간대가 붙은 ISO 8601만 받고(아니면 400 `validation_failed`) 응답은 UTC ISO입니다. 끝 ≤ 시작은 400 `banner_period_invalid`(DB CHECK는 예약 배너를 내릴 때 같아질 수 있어 `>=`). URL은 http·https(400 `link_url_invalid`), 차단 도메인과 하위 도메인은 422 `link_domain_blocked`.
- 수정 `PATCH …/{id}`: 바뀐 필드만, 다른 운영자가 등록한 배너도 고칩니다. 결과가 게시 중·예약(끝이 없거나 지금보다 뒤)이면 저장된(또는 새) 호스트를 차단 도메인으로 다시 검사해, 차단으로 내려간 배너를 기간만 고쳐 다시 여는 길을 막습니다. 끝난 채로 두는 수정은 검사하지 않습니다.
- 이미지: 새 파일은 운영자(`users.role = 'operator'`)가 올린 것이어야 하고(아니면 404 `file_not_found`, 운영자끼리는 서로의 파일을 씀), 저장된 값과 같은 id는 검사를 건너뜁니다. 정지 이미지 규칙: 이미지가 움직이면(`FilesService.isAnimated`, NULL이면 판정해 채움) 움직이지 않는 정지 이미지가 필요하고, 움직이지 않으면 정지 이미지는 null입니다. PATCH에서 이미지를 바꾸면 `stillImageFileId`도 같은 요청에 넣어야 합니다. 어기면 400 `validation_failed`.
- 내리기 `PUT …/{id}/end`: `ends_at = least(coalesce(ends_at, now()), now())`, 예약 배너는 `starts_at = least(starts_at, now())`도 함께 당깁니다. 이미 끝난 배너는 바꾸지 않고 200(멱등). 수정·내리기는 배너 행 잠금(`FOR UPDATE`)으로 줄 섭니다.
- 정렬 `PUT …/order`: 전체 id를 받아(아니면 400 `order_mismatch`) 0..n-1로 다시 매기고 새 순서의 목록을 돌려줍니다.
- 등록·정렬·내리기는 트랜잭션 advisory lock(`pg_advisory_xact_lock(931475212)`, 보존 작업 931475211·migration 931475210과 다른 키)으로 줄 세워 맨 뒤 순서와 정렬이 동시 요청에 섞이지 않습니다.

## 링크 슬롯 이벤트

`src/slot-event/`(R24 ①③⑤). 계약은 `packages/shared/src/crelink.ts`의 `링크 슬롯 이벤트 (R24)` 절, 설계는 [링크 슬롯 +5 이벤트 기술 설계](../../../docs/specs/crelink-slot-event.md)입니다. API가 다루는 이벤트는 코드 `link-slots-plus-5`(`SLOT_EVENT_CODE`)인 `slot_events` 행 하나이고, migration `0005_slot_event`가 적용 시각에 열리고 끝이 없게 시드합니다. 이벤트를 만들거나 지우는 경로는 없습니다.

- 상태는 한 문장 안의 같은 `now()`로 정합니다: `starts_at > now()` `scheduled`, `ends_at <= now()` `ended`, 그 밖에는 `open`(크리링 배너 게시 기간과 같은 규칙).
- 공개 `GET /api/public/slot-event`: `{ event }`(행이 없으면 null), 기간·보너스만 주고 신청 수·신청자는 주지 않습니다. `Cache-Control: no-store`.
- 신청 `POST /api/me/slot-event/entry`(`SessionGuard`, 본문 없음, 대상은 세션 본인): 한 트랜잭션에서 `INSERT … SELECT … WHERE starts_at <= now() AND (ends_at IS NULL OR now() < ends_at) ON CONFLICT (event_id, user_id) DO NOTHING`. 신청 행은 그때의 이벤트 `bonus_links` 사본이라 나중에 이벤트를 고쳐도 받은 보너스는 그대로이고 회수하지 않습니다. 행이 생기면 201, 이미 신청한 계정이면 기간과 관계없이 200(같은 `CreatorSlotEventState`), 이벤트 행이 없으면 404 `slot_event_not_found`, 그 밖에는 409 `slot_event_closed`(시작 전·끝남은 문구로 구분). 같은 계정의 동시 신청은 PK가 줄 세워 1행만 생깁니다. 상태 코드는 `@Res({ passthrough: true })`로 정합니다.
- 편집 상태 `GET /api/me/landing`의 `slotEvent { event, entry }`(질의 하나), 운영자 상세 `GET /api/admin/creators/{userId}`의 `slotEvent`(신청 행 또는 null). 둘 다 `limits.visibleMax`에 보너스가 들어 있습니다.
- 운영자 `GET /api/admin/slot-event?page=`(`OperatorGuard`): 이벤트·`entryCount`·신청 최신순(`applied_at DESC, user_id`) 20개(`CRELINK_LIMITS.operatorPageSize`)와 신청자 이메일·표시 이름·현재 단축 주소. `page`는 운영자 크리에이터 목록과 같은 `pageNumber`(없으면 1, 1 이상 정수가 아니면 400 `validation_failed`).
- 기간 `PUT /api/admin/slot-event { startsAt, endsAt }`: 시간대가 붙은 ISO 8601만 받고(`zonedTime`, 크리링 배너와 같음, 아니면 400 `validation_failed`), `endsAt` null·생략은 끝 없음, 끝 ≤ 시작은 400 `slot_event_period_invalid`(DB CHECK도 `ends_at > starts_at`). 응답은 1쪽. 지금 끝내려면 끝을 지금으로 저장합니다(새 신청만 막힘).
- 시험: `test/slot-event.e2e-spec.ts`, `test/migrations.e2e-spec.ts` `0005_slot_event`.

## 통계와 보존 작업

- 날짜 기준 시간대는 `Asia/Seoul`입니다(`STATS_TIME_ZONE`). 통계 기간은 `from`·`to` 양 끝 포함 최대 366일이고, 둘 다 없으면 오늘까지 30일입니다.
- 보존 작업(R11, `src/retention/retention.service.ts`): 기동 시와 24시간마다 실행합니다. 트랜잭션 advisory lock(`pg_advisory_xact_lock`)으로 여러 인스턴스가 동시에 돌지 않게 하고, 늦게 온 인스턴스는 기다렸다가 남은 것만 처리합니다. 오늘(Asia/Seoul)에서 365일 전 0시보다 이전의 `visits`·`link_clicks`를 날짜·단축 URL 단위로 `visit_daily_rollups`, 값별로 `visit_dimension_rollups`(유입 호스트·기기·브라우저·OS·국가, 값이 없으면 `unknown`), 링크별로 `link_click_rollups`에 더하고, `creator_banner_clicks`는 배너별로 `creator_banner_click_rollups`에만 더한 뒤(`visit_daily_rollups.link_clicks`에 섞지 않음) 같은 트랜잭션에서 원본을 지웁니다. 집계에는 IP를 넣지 않습니다. 결과 건수는 로그로 남깁니다. `ad_banner_daily_stats`는 개인 식별 정보가 없는 집계라 계속 보관합니다.
- 통계 API는 원본과 집계를 합칩니다. 집계된 날짜의 순 방문자는 날짜별 순 방문자 합이라, 원본 기간의 순 방문자(기간 전체에서 중복 제거)와 계산 방식이 다릅니다.
- 링크별 클릭의 `linkId`는 링크 공개 ID(`{SHORT}/c/{linkPublicId}`의 값)입니다. 지운 링크도 기록이 남아 있으면 `title: null`로 나옵니다.
- 배너별 클릭(`bannerClicks`, R21 ④·미정 4 A)은 `creator_banner_clicks` 원본과 `creator_banner_click_rollups`를 합친 기간 합계입니다. `bannerId`는 배너 공개 ID(`{SHORT}/b/{bannerPublicId}`의 값)이고, 지운 배너는 `alt: null`입니다. `totals.linkClicks`·`daily`에는 넣지 않습니다.

## AI 운영자

`src/ai-operator/`(R23). 계약은 `packages/shared/src/crelink.ts`의 `AI 운영자 (R23)` 절, 설계는 [AI 운영자 기술 설계](../../../docs/specs/crelink-ai-operator.md)입니다. 데이터는 migration `0004_ai_operator`(`users.kind`·`metrics_excluded_at`, `api_tokens`, `agent_runs`, `operator_actions`, `ai_operator_settings`)입니다.

- 행동 기록: 모든 `/api/admin/*` 쓰기(`admin.service.ts`·`ad-banners.service.ts`)와 토큰 발급·폐기·멈춤은 한 트랜잭션에서 `FOR UPDATE`로 이전 값을 읽고 바꾼 뒤 `recordOperatorAction(client, actor, entry)`(`audit.ts`)로 행위자·행동·대상·관련 크리에이터·바뀐 필드의 전후 값·실행 id를 남깁니다. 쓰기가 실패하면 기록도 없고, 멱등 요청도 기록합니다. 행위자가 AI이면 같은 트랜잭션에서 `ai_operator_settings`를 `FOR SHARE`로 다시 읽어 멈춤이면 409 `ai_operator_paused`로 쓰기까지 되돌립니다(`PUT pause`는 `FOR UPDATE`). AI는 운영자·AI 계정 대상 `creator.*` 쓰기가 403 `forbidden`입니다.
- 실행 기록 `POST·PATCH·GET /api/admin/agent-runs`(`agent-runs.service.ts`): 시작은 한 트랜잭션에서 90분 지난 `running`을 `abandoned`로 닫고, 멈춤이면 같은 멈춤 동안(`started_at >= settings.updated_at`)의 직전 `paused` 행에 합치거나 새 `paused` 행을 만들며, 아니면 겹침 409 `agent_run_in_progress`(부분 유니크 인덱스 위반 포함). 갱신은 자기 실행만(403), 닫힌 실행 409 `agent_run_closed`, `refs[].url`은 http·https만. `cost_usd`(numeric)·토큰 수(bigint)는 node-pg 문자열을 number로 바꿉니다. 목록·운영 기록은 방명록과 같은 커서(`src/common/cursor.ts`)입니다.
- 멈춤·토큰: `GET /api/admin/ai-operator`, `PUT …/pause`·`PUT …/tokens/{id}/revoke`는 사람만(`@ActorKinds('human')`). 멈춤 값이 그대로면 `updated_at`·`updated_by`를 바꾸지 않아 같은 멈춤의 paused 합치기가 이어집니다.
- 지표 `GET /api/admin/metrics`(`metrics.service.ts`): 한 문장(같은 `now()`). 실사용자는 사람 크리에이터·지표 제외 아님·정지 아님이고 보이는 링크(`VISIBLE_LINK_CONDITION`, 공개 랜딩·관리 한도·단축 주소 클릭과 같은 상수) 또는 포트폴리오가 있는 계정입니다. 지표 제외는 `PUT /api/admin/creators/{id}/metrics-exclusion`(사람만).

### AI 운영자 토큰 CLI

`src/cli/ai-operator.ts` → `dist/cli/ai-operator.js`. Nest 앱·`AppConfig`·Sentry 초기화·migration 없이 DB 연결 1개(`max: 1`, `application_name=crelink-ai-operator-cli`, `databaseConnectionConfig`)만 씁니다. 표준 출력에는 결과만(토큰은 원문 한 줄), 진단은 표준 오류, 실패는 종료 코드 1입니다. 0004 전 DB면 "migration 0004_ai_operator가 적용된 API를 먼저 배포" 안내와 종료 1입니다.

| 명령 | 하는 일 |
| --- | --- |
| `ensure-account [--email <이메일>]` | AI 계정(`kind='ai'`, `role='operator'`)·랜딩·단축 주소를 없을 때만 만들고 userId 출력. 같은 이메일의 사람 계정이 있으면 실패 |
| `issue-token --label <이름> [--email …]` | 계정이 없으면 만들고 토큰 원문 한 줄 출력(DB에는 해시만), `ai_operator.token_issue`(system) 기록 |
| `list-tokens [--email …]` | id·label·prefix·생성·마지막 사용·폐기(원문 없음), 탭 구분, 첫 줄은 머리글 |
| `revoke-token <id>` | 폐기(멱등), `ai_operator.token_revoke`(system) 기록. 없는 id면 종료 1 |

기본 이메일은 `ai-operator@crelink.invalid`(예약 최상위 도메인)입니다. 로컬 실행(이 worktree의 `apps/api/.env` DB, 0004가 적용된 DB여야 함 — `make up`으로 API를 한 번 띄우면 적용됨):

```sh
pnpm --filter @crelink/shared build && pnpm --filter @crelink/api build
pnpm --filter @crelink/api --silent ai-operator list-tokens   # 또는 node apps/api/dist/cli/ai-operator.js list-tokens
```

`issue-token`의 출력은 토큰 원문이므로 터미널 기록·채팅·저장소에 남기지 말고 바로 `~/.config/crelink/ai-operator.env`(권한 600)로 옮깁니다. pnpm으로 부를 때는 `--silent`로 pnpm 머리말이 표준 출력에 섞이지 않게 합니다. 운영 절차는 [런북 17](../../../infra/docs/prod-runbook.md#17-ai-운영자-토큰)입니다.
