# 백엔드 API 운영 안내

크리링 MVP API(NestJS + PostgreSQL)의 실행·설정·동작 규칙입니다. 제품 요구와 계약의 기준은 [크리링 MVP 기술 설계](../../../docs/specs/crelink-mvp.md)와 `packages/shared/src/crelink.ts`이며, 이 문서는 구현이 그 기준을 어떻게 따르는지와 백엔드에서 내린 결정을 적습니다.

## 실행

- 로컬: 저장소 루트에서 `make infra-up` 후 `make up`(또는 `make api-up`). PM2가 `pnpm --filter @crelink/api start:dev`를 실행하고 `.local/instance.env`의 `PORT`·`DATABASE_URL`·`WEB_URL`·`SHORT_LINK_BASE_URL`을 넘깁니다. 나머지 키는 `apps/api/.env`에서 읽습니다.
- 기동하면 `apps/api/migrations/*.sql`을 이름 순으로 한 번씩 적용합니다(`src/database.ts`의 `runMigrations`). 스키마 원본은 [`migrations/0001_crelink_mvp.sql`](../migrations/0001_crelink_mvp.sql)입니다.
- 확인: `curl -i {API}/api/health/ready`(DB 포함 200), `curl -i {API}/없는주소`(302 `{WEB_URL}/notice?reason=link_not_found`).
- 테스트: `pnpm --filter @crelink/api test`. 테스트마다 일회용 DB를 만들어 지웁니다(`test/test-database.ts`). 구글 code 교환은 `GoogleOAuth` provider를, 위치 조회는 `GeoIpService`를 테스트용으로 바꿉니다(`test/test-app.ts`). `@crelink/shared`는 ESM 패키지라 Jest(Node 22)가 `require`하지 못하므로, Jest 설정의 `moduleNameMapper`가 공유 패키지 TypeScript 원본을 직접 컴파일해 씁니다. 실행 중인 API는 Node 22의 `require(esm)`로 빌드 결과를 읽습니다.

## 환경변수

`apps/api/.env.example`이 키 목록 원본입니다. 값은 실행 환경 변수가 `.env`보다 우선합니다.

| 키 | 필수 | 설명 |
| --- | --- | --- |
| `DATABASE_URL` | 예 | PostgreSQL 연결 문자열. |
| `PORT` | 예 | API 포트. |
| `WEB_URL` | 예 | 본 도메인. 랜딩 302 대상 `{WEB_URL}/p/{publicId}`, 안내 `{WEB_URL}/notice?reason=`, 이미지 주소 `{WEB_URL}/api/backend/api/files/{id}`, 구글 리디렉션 URI `{WEB_URL}/auth/google/callback`. https면 세션·state 쿠키에 `Secure`. |
| `SHORT_LINK_BASE_URL` | 예 | 단축 도메인. 단축 URL `{SHORT}/{slug}`, 클릭 주소 `{SHORT}/c/{linkPublicId}`. 로컬은 API 주소. https면 `cl_vid`에 `Secure`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 로그인에 필요 | 사용자가 Google Cloud 콘솔에서 발급. 비면 로그인 API가 503 `auth_not_configured`. 콘솔에 등록할 리디렉션 URI는 `{WEB_URL}/auth/google/callback`. |
| `OPERATOR_EMAILS` | 아니오 | 운영자 구글 이메일(쉼표 구분, 대소문자 무시). |
| `UPLOAD_DIR` | 아니오 | 이미지 저장 디렉터리. 비면 저장소 루트 `.local/uploads`(git 제외). |
| `GEOIP_MMDB_PATH` | 아니오 | mmdb(DB-IP Lite City 등, CC BY 4.0이라 웹 `/privacy`에 출처 표시) 경로. 비면 국가·도시를 null로 두고 기동 시 경고를 한 번 남김. 파일을 열지 못해도 같은 동작에 오류 로그. |

## 인증과 권한

- 로그인(R15): `GET /api/auth/google/start`가 `cl_oauth_state`(HttpOnly, SameSite=Lax, 10분)와 인증 주소를 주고, `POST /api/auth/google/callback`이 state를 쿠키와 비교한 뒤 `google-auth-library`로 code를 교환하고 ID 토큰(서명·aud·만료)을 검증합니다. 이메일은 소문자로 저장합니다.
- 첫 로그인은 한 트랜잭션으로 `users → user_identities → landings(10자 public_id) → landing_blocks(list) → short_links → short_slugs(7자 자동)`를 만듭니다. 같은 구글 계정의 첫 로그인이 동시에 오면 한 번 다시 시도해 기존 사용자로 로그인합니다.
- 역할: 구글이 검증한 이메일이 `OPERATOR_EMAILS`에 있으면 로그인할 때마다 `operator`, 아니면 `creator`로 갱신합니다.
- 세션: 쿠키 `cl_session`(원문 무작위 토큰, 30일), DB `sessions.token_hash`는 SHA-256 hex. API는 웹 BFF·웹 서버가 전달한 `Cookie` 헤더에서 읽습니다.
- `/api/me/*`는 로그인 필수(401 `unauthenticated`), 남의 리소스는 404. `/api/admin/*`는 로그인(401) 후 `role='operator'`(아니면 403 `forbidden`). 정지하면 그 사용자의 세션을 모두 지우고, 세션 조회도 정지 사용자를 제외하며, 다시 로그인하면 403 `account_suspended`.
- 오류 응답은 모두 `{ code, message }`입니다(`src/common/http.ts`의 `ApiExceptionFilter`). 없는 `/api` 경로는 404 `not_found`, 예상하지 못한 오류는 500 `internal_error`와 로그.

## 단축 도메인

- 같은 프로세스가 `/api` 접두사 밖의 `GET /{slug}`와 `GET /c/{linkPublicId}`를 처리합니다(`src/short-link/`). `app.setup.ts`의 `setGlobalPrefix` exclude는 요청 URL이 아니라 라우트 정의 경로에 맞춰 보기 때문에, `:`를 이스케이프한 `\:slug`·`c/\:linkPublicId`로 두 정의만 제외합니다. 그냥 `:slug`를 쓰면 `/api/me`·`/api/health` 같은 한 단계 경로가 접두사를 잃습니다.
- 그래서 접두사 없는 `/health`, `/me`, `/api` 같은 요청은 단축 주소로 해석되고, 예약어라 없는 주소 안내로 302 합니다. 예약어 목록은 `RESERVED_SLUGS`(공유 계약).
- `GET /{slug}`: 대소문자를 무시하고 현재 주소 또는 `retired_at + 90일` 안의 옛 주소를 찾습니다. 찾으면 방문을 기록(응답을 기다리지 않음)하고 302 `{WEB_URL}/p/{publicId}`. 없으면 302 `…/notice?reason=link_not_found`, 정지 크리에이터면 `…reason=creator_suspended`.
- `GET /c/{linkPublicId}`: 클릭을 기록하고 DB에 저장된 URL(저장 시 http·https만 허용)로 302. 숨김·차단·삭제·정지면 302 `…/notice?reason=link_unavailable`. 열린 리디렉트를 막기 위해 요청 값으로 대상 URL을 만들지 않습니다.
- 두 리디렉트 모두 `Cache-Control: no-store`이고, 방문자 쿠키 `cl_vid`(UUID, HttpOnly, SameSite=Lax, 1년)는 없거나 형식이 틀릴 때만 새로 발급합니다.

### 방문자 IP

`X-Forwarded-For`는 클라이언트가 임의로 넣을 수 있는 헤더라, 앞단에 신뢰할 프록시가 있다는 설정 없이 첫 값을 쓰면 방문 기록의 IP와 위치를 누구나 위조할 수 있습니다. 그래서 MVP는 TCP 연결의 소켓 주소(`request.socket.remoteAddress`, IPv4-mapped IPv6는 IPv4로)만 기록합니다. 운영에서 리버스 프록시·CDN 뒤에 두면 소켓 주소가 프록시 주소가 되므로, 그때는 신뢰할 프록시 목록을 설정으로 받아 그 프록시가 붙인 값만 쓰도록 바꿉니다(운영 단축 도메인과 배포 구성이 정해질 때 결정).

### 방문·클릭 기록 항목

`src/short-link/tracking.service.ts`. IP, `cl_vid`, `Referer`(방문은 원문 2048자까지와 호스트, 클릭은 호스트만), User-Agent(512자까지), `bowser`로 기기 종류(`mobile`·`tablet`·`desktop` 등)·브라우저·OS, `maxmind`로 국가(ISO 코드)·도시(영문). 저장 실패는 리디렉트에 영향 없이 로그만 남깁니다.

## 크리에이터 규칙

- 단축 주소(R8, `src/creator/slug.service.ts`): 입력은 앞뒤 공백을 빼고 소문자로 바꾼 뒤 `SLUG_PATTERN`·3~30자·예약어를 봅니다. 다른 단축 URL의 현재 주소나 90일 안의 옛 주소면 409 `slug_taken`. 자기 옛 주소는 되돌릴 수 있습니다. 첫 변경(`slug_changed_at`이 없음)은 바로, 그 뒤에는 마지막 변경에서 30일 뒤부터(429 `slug_change_too_soon`). 자동 주소로 되돌려도 30일 제한은 마지막 변경 시각 기준이라 우회할 수 없습니다. 같은 주소로 바꾸는 요청은 아무것도 바꾸지 않고 200입니다. 예약 기간이 끝난 남의 옛 주소는 행을 지우고 새로 만듭니다.
- 링크 한도(R13): 보이는(숨기지 않고 차단되지 않은) 링크 ≤ 5 + `extra_link_slots`(409 `link_limit_reached`), 숨긴 링크 포함 ≤ 50(409 `link_total_limit_reached`). 추가와 숨김 해제에서 확인하며, 같은 사용자의 링크 변경은 사용자 행 잠금으로 줄 세웁니다. 운영자 추가 슬롯은 0~45.
- 차단 도메인(R14): 링크 호스트가 차단 도메인이거나 그 하위 도메인이면 추가·URL 수정이 422 `link_domain_blocked`. 운영자가 도메인을 추가하면 같은 트랜잭션에서 기존 링크의 `blocked_at`을 채웁니다. 목록에서 빼도 이미 차단된 링크는 운영자가 링크별로 풉니다.
- 이미지(`src/files/`): multipart 필드 `file`, 5MB 이하. 형식은 클라이언트 Content-Type이 아니라 파일 앞부분(매직 바이트)으로 JPEG·PNG·WebP·GIF만 받습니다. 저장은 `FileStorage` 경계 뒤의 로컬 디스크(`UPLOAD_DIR`)이고, `GET /api/files/{id}`는 누구나 받을 수 있으며 1년 캐시합니다(id는 UUID, 내용 불변).

## 통계와 보존 작업

- 날짜 기준 시간대는 `Asia/Seoul`입니다(`STATS_TIME_ZONE`). 통계 기간은 `from`·`to` 양 끝 포함 최대 366일이고, 둘 다 없으면 오늘까지 30일입니다.
- 보존 작업(R11, `src/retention/retention.service.ts`): 기동 시와 24시간마다 실행합니다. 트랜잭션 advisory lock(`pg_advisory_xact_lock`)으로 여러 인스턴스가 동시에 돌지 않게 하고, 늦게 온 인스턴스는 기다렸다가 남은 것만 처리합니다. 오늘(Asia/Seoul)에서 365일 전 0시보다 이전의 `visits`·`link_clicks`를 날짜·단축 URL 단위로 `visit_daily_rollups`, 값별로 `visit_dimension_rollups`(유입 호스트·기기·브라우저·OS·국가, 값이 없으면 `unknown`), 링크별로 `link_click_rollups`에 더하고 같은 트랜잭션에서 원본을 지웁니다. 집계에는 IP를 넣지 않습니다. 결과 건수는 로그로 남깁니다.
- 통계 API는 원본과 집계를 합칩니다. 집계된 날짜의 순 방문자는 날짜별 순 방문자 합이라, 원본 기간의 순 방문자(기간 전체에서 중복 제거)와 계산 방식이 다릅니다.
- 링크별 클릭의 `linkId`는 링크 공개 ID(`{SHORT}/c/{linkPublicId}`의 값)입니다. 지운 링크도 기록이 남아 있으면 `title: null`로 나옵니다.
