# 크리링 MVP 기술 설계

- 상태: 승인 (2026-10-06)
- 작성일: 2026-10-06
- 에픽: `docs/work/epics/0014-crelink-mvp.md`
- 입력: PRD([docs/product/crelink.md](../product/crelink.md), R1~R16, 상태 확정·MVP 범위). 디자인 인계 없음(사용자 결정: 기본 디자인 토큰으로 바로 구현). 기술 조사 문서 없음(아래 `기술 선택`의 후보는 `[AI 제안]`).

작성 절차와 분해 규칙은 [기술 설계와 티켓 분해](README.md)를 따릅니다. `[임시값]`은 PRD에서 미정이라 MVP를 위해 정한 값이며 MVP 이후 사용자 결정으로 바꿉니다.

## 요구 대응

| 요구 | 화면 | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| R1 | `/me` 내 링크 카드(복사 버튼) | `GET /api/me/landing` | `short_links`, `short_slugs` | 0016, 0017 |
| R2 | — | 단축 도메인 `GET /{slug}` | `visits` | 0016 |
| R3 | `/p/{publicId}`, `/notice` | `GET /api/public/landings/{publicId}` | `landings`, `users.suspended_at` | 0016, 0017 |
| R4 | `/me` 외부 링크 목록 | `POST·PATCH·DELETE /api/me/links`, `PUT /api/me/links/order` | `links` | 0016, 0017 |
| R5 | `/p/{publicId}` 리스트형 구역, `/me` 항목 편집 | 위 링크 API, `POST /api/me/files` | `landing_blocks(type='list')`, `links.description`, `links.thumbnail_file_id` | 0016, 0017 |
| R6 | — | 가입 시 단축 URL 1개·랜딩 1개 생성 | `short_links.landing_id` | 0016 |
| R7 | `/p/{publicId}` 진입 판정 | `GET /{slug}` → 302 `{WEB_URL}/p/{publicId}?pass=…`, `GET /api/public/landings/{publicId}?pass=`의 `passAccepted`·`shortUrl` | `landings.public_id` | 0016, 0038 |
| R8 | `/me` 주소 변경 | `GET /api/me/short-link/availability`, `PUT /api/me/short-link/slug` | `short_slugs` | 0016, 0017 |
| R9 | `/privacy` 고지 | `GET /{slug}`, `GET /c/{linkPublicId}` | `visits`, `link_clicks` | 0016, 0017 |
| R10 | `/admin`, `/admin/creators/{id}` | `GET /api/admin/creators…`, `…/stats` | 집계 질의 | 0016, 0017 |
| R11 | — | 일 단위 보존 작업 | `visit_daily_rollups`, `visit_dimension_rollups` | 0016 |
| R12 | `/me` 프로필·SNS·포트폴리오, `/p/{publicId}` | `PATCH /api/me/landing`, `PUT /api/me/socials`, 포트폴리오 API | `landings`, `social_links`, `portfolio_items` | 0016, 0017 |
| R13 | `/me` 한도 안내, `/admin/creators/{id}` 슬롯 | `PUT /api/admin/creators/{id}/extra-slots` | `users.extra_link_slots` | 0016, 0017 |
| R14 | `/me` 차단 표시, `/admin/blocked-domains`, `/admin/creators/{id}` 링크 차단 | 차단 목록·링크 차단 API | `blocked_domains`, `links.blocked_at` | 0016, 0017 |
| R15 | `/` 로그인 버튼, `/auth/google/callback` | `GET /api/auth/google/start`, `POST /api/auth/google/callback`, `POST /api/auth/logout`, `GET /api/me` | `users`, `user_identities`, `sessions` | 0016, 0017 |
| R16 | 모든 화면 390px·1280px | — | — | 0017, 0018 |

## 구성과 흐름

- **본 도메인(웹)**: Next.js. 공개 랜딩, 크리에이터 편집, 운영자 화면, 로그인 콜백. 브라우저는 같은 출처 BFF(`/api/backend/*`)로만 API를 부릅니다. 로컬 주소는 `WEB_URL`(`http://127.0.0.1:5193`).
- **API**: NestJS + PostgreSQL. 도메인 규칙·인증·로그 수집의 단일 경계입니다. `/api` 접두사 경로.
- **단축 도메인**: 같은 NestJS 프로세스가 `/api` 접두사 밖의 `GET /{slug}`, `GET /c/{linkPublicId}`를 처리합니다. 로컬 기준 주소는 API 주소(`http://127.0.0.1:3020`), 운영 단축 도메인은 `[미정]`이며 `SHORT_LINK_BASE_URL`로 바꿉니다.

```text
인스타 프로필 링크 → GET {SHORT}/{slug}
  API: slug 조회 → visits 기록(실패해도 계속) → cl_vid 쿠키 → 302 {WEB}/p/{publicId}?pass={통과 표시}
방문자 → GET {WEB}/p/{publicId}?pass=… (SSR, API 공개 조회에 pass 전달)
  웹: passAccepted 또는 Sec-Fetch-Site: same-origin → 그림(통과 표시는 history.replaceState로 주소창에서 지움)
      그 밖(외부 링크·주소창 직접 입력·미리보기 봇·헤더 없음) → 307 {SHORT}/{현재 slug} → 위 단축 주소 흐름
외부 링크 클릭 → GET {SHORT}/c/{linkPublicId}
  API: link_clicks 기록(같은 cl_vid) → 302 외부 URL (차단·숨김·삭제면 302 {WEB}/notice)
```

외부 진입(R7, 2026-10-07 사용자 결정): 방문은 단축 주소에서만 기록되므로, 주소창의 `/p/{publicId}`를 복사해 공유한 주소로 들어와도 단축 주소를 거쳐야 합니다. 서비스 안(관리 화면 미리보기, 운영자 화면, Next 클라이언트 이동)은 브라우저가 `Sec-Fetch-Site: same-origin`을 보내므로 그대로 그리고 방문으로 세지 않습니다.

- 통과 표시(`apps/api/src/short-link/landing-pass.service.ts`): `<만료 epoch 초>.<base64url HMAC-SHA256 앞 16바이트>`, 서명 대상 `publicId.만료`, 60초. 키는 API 프로세스가 시작할 때 만든 무작위 32바이트이며 새 비밀값이 없습니다. 위조돼도 결과는 "그 요청이 방문으로 안 세어짐"뿐이고, Blue/Green 전환 순간 다른 색 API가 검증해 실패해도 웹이 단축 주소로 한 번 더 보내 새 표시를 받으므로 스스로 복구됩니다. 한 색이 API 프로세스를 여러 개 띄우면 이 전제가 깨집니다(공유 키 필요).
- 웹 판정(`apps/web/src/app/(public)/p/[publicId]/page.tsx`): 404·410·API 오류는 리디렉트하지 않고 안내 화면. 무효·만료 표시는 단축 주소에서 새 표시를 받아 돌아오므로 반복되지 않습니다. 리디렉트가 HTTP 307이 되도록 이 화면 위에는 `loading.tsx`(Suspense 경계)를 두지 않습니다.
- 공유용으로 보여 주는 주소는 단축 주소입니다(`/me` 카드, 관리 화면의 공개 주소). 랜딩 주소는 미리보기 링크와 운영자 화면에만 씁니다.

로그인(R15):

```text
/ 로그인 버튼 → 웹 GET /auth/google → API GET /api/auth/google/start (state 쿠키 발급, authorizationUrl 반환) → 302 Google
Google → {WEB}/auth/google/callback?code&state → 웹 라우트가 API POST /api/auth/google/callback {code,state} + state 쿠키 전달
  API: state 확인 → code 교환(redirect_uri={WEB}/auth/google/callback) → ID 토큰 검증 → user·identity upsert → session 생성
  → Set-Cookie cl_session → 웹이 쿠키를 전달하고 /me로 302
```

BFF(`apps/web/src/app/api/backend/[...path]/route.ts`)는 허용 경로 목록에 새 경로를 더하고, `cl_session` 쿠키를 API로 넘기며 API의 `Set-Cookie`를 그대로 돌려줍니다. 이미지 업로드 경로만 `multipart/form-data`를 그대로 넘깁니다.

## 데이터 모델

migration은 `apps/api/migrations/`의 SQL 파일(기존 실행기). 모든 시각은 `timestamptz`.

| 테이블 | 주요 컬럼 | 규칙 |
| --- | --- | --- |
| `users` | `id uuid`, `email`, `role ('creator'\|'operator')`, `extra_link_slots int default 0`, `suspended_at`, `created_at` | R15 크리링 고유 사용자. 운영자는 `OPERATOR_EMAILS`에 있는 구글 이메일(검증된 이메일)로 로그인할 때 `operator`. |
| `user_identities` | `id`, `user_id`, `provider ('google')`, `provider_subject`, `email`, `created_at`, `last_login_at` | `UNIQUE(provider, provider_subject)`. 한 사용자에 여러 행 가능(R15). |
| `sessions` | `id`, `user_id`, `token_hash`, `expires_at`, `created_at` | 쿠키에는 원문 토큰, DB에는 SHA-256. 30일 `[임시값]`. |
| `landings` | `id`, `user_id`, `public_id` (10자 `[a-z0-9]`, 변경 불가), `display_name`, `bio`, `avatar_file_id`, `created_at`, `updated_at` | R7 자동 ID. MVP는 사용자당 1개(R6). |
| `landing_blocks` | `id`, `landing_id`, `type ('list')`, `position` | R5 구역. MVP는 가입 시 리스트형 1개. |
| `links` | `id`, `public_id`, `user_id`, `block_id`, `title`, `url`, `host`, `description`, `thumbnail_file_id`, `position`, `hidden`, `blocked_at`, `blocked_reason`, `created_at`, `updated_at` | R4·R5·R13·R14. 삭제는 행 삭제(클릭 기록은 `link_public_id` 사본으로 유지). |
| `social_links` | `id`, `landing_id`, `platform`, `url`, `position` | R12. platform `[임시값]`: instagram, youtube, tiktok, naver_blog, x, threads, facebook, other. 최대 10개. |
| `portfolio_items` | `id`, `landing_id`, `title`, `url`, `image_file_id`, `description`, `position` | R12. 항목 구성 `[임시값]`: 제목(필수)·링크·이미지·설명. 최대 20개. |
| `short_links` | `id`, `user_id`, `landing_id`, `slug_changed_at`, `created_at` | R6. MVP는 사용자당 1개. |
| `short_slugs` | `slug PK`, `short_link_id`, `is_auto`, `retired_at` | R8. 현재 주소는 `retired_at IS NULL`. 옛 주소는 `retired_at + 90일`까지 연결·예약. |
| `files` | `id`, `owner_user_id`, `storage_key`, `content_type`, `size`, `created_at` | 이미지. 저장은 `FileStorage` 인터페이스 뒤의 로컬 디스크(`UPLOAD_DIR`). |
| `visits` | `id`, `short_link_id`, `slug`, `occurred_at`, `visitor_id`, `ip inet`, `country`, `city`, `referrer`, `referrer_host`, `user_agent`, `device_type`, `browser`, `os` | R9. 원본 1년(R11). |
| `link_clicks` | `id`, `link_id (nullable)`, `link_public_id`, `short_link_id`, `occurred_at`, `visitor_id`, `ip`, `country`, `city`, `referrer_host`, `user_agent`, `device_type`, `browser`, `os` | R9. 원본 1년(R11). |
| `visit_daily_rollups` | `day`, `short_link_id`, `visits`, `unique_visitors`, `link_clicks` | R11 집계. 원본 삭제 전에 생성. |
| `visit_dimension_rollups` | `day`, `short_link_id`, `dimension ('referrer_host'\|'device_type'\|'browser'\|'os'\|'country')`, `value`, `visits` | R10 분포를 원본 삭제 뒤에도 유지. IP는 넣지 않음. |
| `link_click_rollups` | `day`, `short_link_id`, `link_public_id`, `clicks` | 링크별 클릭 집계. |
| `blocked_domains` | `domain PK`, `reason`, `created_by`, `created_at` | R14. 도메인과 그 하위 도메인을 막음. |

- **가입 시 생성**(한 트랜잭션): `users` → `user_identities` → `landings` → `landing_blocks(list)` → `short_links` → `short_slugs(is_auto, 7자 [a-z0-9])`.
- **예약어**: 단축 주소로 쓸 수 없는 값 `api`, `c`, `health`, `admin`, `auth`, `p`, `me`, `notice`, `privacy`, `docs`, `static`, `files`, `www`, `crelink` `[임시값]`.
- **보존 작업**(R11): API 기동 시와 24시간마다 실행. 365일보다 오래된 날짜의 원본을 날짜·단축 URL 단위로 집계 테이블에 넣고 같은 트랜잭션에서 원본을 지웁니다. 여러 인스턴스가 동시에 돌지 않게 advisory lock.
- **되돌리기**: 새 테이블만 추가하므로 migration 이전으로 돌아가려면 테이블을 지웁니다. 운영 데이터가 생긴 뒤에는 되돌리지 않고 다음 migration으로 고칩니다.

## API 계약 초안

`packages/shared`에 확정합니다(티켓 0015). 오류 형식은 기존 `ApiError { code, message }`.

| 메서드·경로 | 권한 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- | --- |
| `GET /api/auth/google/start` | 누구나 | — | `{ authorizationUrl }` + state 쿠키 | 503 `auth_not_configured` |
| `POST /api/auth/google/callback` | 누구나 | `{ code, state }` | `{ user }` + `cl_session` 쿠키 | 400 `oauth_state_invalid`, 401 `oauth_failed`, 403 `account_suspended`, 503 `auth_not_configured` |
| `POST /api/auth/logout` | 로그인 | — | 204, 쿠키 삭제 | — |
| `GET /api/me` | 로그인 | — | `{ id, email, role }` | 401 `unauthenticated` |
| `GET /api/me/landing` | 크리에이터 | — | 편집 화면 전체 상태(프로필, 단축 URL·랜딩 URL·다음 변경 가능일, 링크(숨김·차단 상태 포함), SNS, 포트폴리오, 한도 `{ visibleMax, visibleUsed, totalMax }`) | 401 |
| `PATCH /api/me/landing` | 크리에이터 | `{ displayName?, bio?, avatarFileId? }` | 편집 상태 | 400 `validation_failed`, 404 `file_not_found` |
| `GET /api/me/short-link/availability?slug=` | 크리에이터 | — | `{ available, reason? }` | — |
| `PUT /api/me/short-link/slug` | 크리에이터 | `{ slug }` | 편집 상태 | 400 `slug_invalid`·`slug_reserved`, 409 `slug_taken`, 429 `slug_change_too_soon` |
| `POST /api/me/links` | 크리에이터 | `{ title, url, description?, thumbnailFileId?, hidden? }` | 링크 | 400 `validation_failed`·`link_url_invalid`, 422 `link_domain_blocked`, 409 `link_limit_reached`·`link_total_limit_reached` |
| `PATCH /api/me/links/{id}` | 소유자 | 같은 필드 일부 | 링크 | 위와 같음, 404 `link_not_found` |
| `DELETE /api/me/links/{id}` | 소유자 | — | 204 | 404 |
| `PUT /api/me/links/order` | 크리에이터 | `{ ids }` | 링크 목록 | 400 `order_mismatch` |
| `PUT /api/me/socials` | 크리에이터 | `{ items: [{ platform, url }] }`(전체 교체) | 목록 | 400 |
| `POST·PATCH·DELETE /api/me/portfolio[/{id}]`, `PUT /api/me/portfolio/order` | 크리에이터 | `{ title, url?, imageFileId?, description? }` | 항목·목록 | 400, 404, 409 `portfolio_limit_reached` |
| `POST /api/me/files` | 크리에이터 | multipart `file`(jpeg·png·webp·gif, 4MB 이하 `[임시값]`) | `{ fileId, url }` | 400 `file_type_unsupported`·`file_too_large` |
| `GET /api/files/{id}` | 누구나 | — | 이미지 바이트 | 404 |
| `GET /api/public/landings/{publicId}?pass=` | 누구나 | `pass`(선택, 단축 주소 302가 붙인 통과 표시) | 공개 랜딩(보이는·차단 안 된 링크만, 각 링크의 `clickUrl`), `passAccepted`(이 랜딩에 대해 유효·미만료 표시면 true), `shortUrl`(현재 단축 주소) | 404 `landing_not_found`, 410 `creator_suspended` |
| `GET {SHORT}/{slug}` | 누구나 | — | 302 `{WEB}/p/{publicId}?pass=…` | 없는 주소·정지: 302 `{WEB}/notice?reason=…` |
| `GET {SHORT}/c/{linkPublicId}` | 누구나 | — | 302 외부 URL | 302 `{WEB}/notice?reason=link_unavailable` |
| `GET /api/admin/creators?query=&page=` | 운영자 | — | 목록(이메일, 이름, 단축 주소, 최근 30일 방문 수) | 403 `forbidden` |
| `GET /api/admin/creators/{userId}` | 운영자 | — | 상세(랜딩, 링크 전체, 슬롯, 정지 여부) | 404 |
| `GET /api/admin/creators/{userId}/stats?from=&to=` | 운영자 | 날짜 `YYYY-MM-DD` | 합계(방문·순 방문자·클릭), 일별 추이, 분포(유입 경로·기기·브라우저·OS·국가), 링크별 클릭 | 400 `date_range_invalid` |
| `PUT /api/admin/creators/{userId}/extra-slots` | 운영자 | `{ extraSlots }` | 상세 | 400 |
| `PUT /api/admin/creators/{userId}/suspension` | 운영자 | `{ suspended }` | 상세 | — |
| `PUT /api/admin/links/{linkId}/block` | 운영자 | `{ blocked, reason? }` | 링크 | 404 |
| `GET·POST /api/admin/blocked-domains`, `DELETE /api/admin/blocked-domains/{domain}` | 운영자 | `{ domain, reason? }` | 목록 | 400 `domain_invalid`, 409 `domain_exists` |

- 도메인을 차단 목록에 넣으면 그 도메인과 하위 도메인의 기존 링크도 `blocked_at`이 채워집니다. 목록에서 빼도 이미 차단된 링크는 운영자가 개별로 풉니다.
- 한도(R13): 보이는(숨기지 않은·차단 안 된) 링크 수 ≤ 5 + `extra_link_slots`. 숨긴 링크 포함 전체 50개 `[임시값]`(R13 숨긴 링크 상한 미정에 대한 안전 장치).
- 입력 길이 `[임시값]`: 링크 제목 60자, 설명 120자, URL 2048자(`http`·`https`만), 표시 이름 40자, 소개 300자, 포트폴리오 제목 60자·설명 200자.

## 화면 상태와 API 대응

| 화면 | 상태 | 조건 |
| --- | --- | --- |
| `/` | 로그인 전·후 | `GET /api/me` 401이면 구글 로그인 버튼, 로그인 상태면 `/me`·운영자는 `/admin` 링크 |
| `/auth/google/callback` | 성공·실패 | 성공 시 `/me`, `oauth_*`·`account_suspended`·`auth_not_configured`면 `/notice?reason=` |
| `/me` | 로딩·정상·오류·401 | 401이면 `/`로. 빈 프로필·링크 0개도 정상 화면. 한도 도달 시 추가 버튼 대신 안내. 차단된 링크는 차단 표시. 주소 변경은 입력 중 사용 가능 여부, 30일 제한 시 다음 변경 가능일 |
| `/p/{publicId}` | 정상·빈 랜딩·없음·정지·외부 진입 | 모든 항목이 비어도 크리링 표시와 함께 열림. 404·410은 안내 화면. 같은 출처도 유효한 통과 표시도 아니면 현재 단축 주소로 307 |
| `/notice` | 사유별 안내 | `link_not_found`, `link_unavailable`, `creator_suspended`, 로그인 오류 |
| `/privacy` | 고정 고지 | 수집 항목·목적·보관 기간(원본 1년)·쿠키 `cl_vid`. 법률 검토 전 문구임을 표시 |
| `/admin…` | 로딩·정상·403 | 403이면 권한 없음 안내 |

외부 링크 아이콘(R5): 방문자 브라우저가 `https://{host}/favicon.ico`를 직접 불러오고 실패하면 기본 아이콘을 씁니다. 서버가 임의 URL을 대신 가져오는 SSRF 위험을 피하는 대신, 방문자 브라우저가 링크된 사이트에 아이콘 요청을 보냅니다.

## 권한·보안·개인정보

- **세션**: `cl_session`(httpOnly, SameSite=Lax, 운영은 Secure)은 본 도메인. 상태 변경 요청은 같은 출처 BFF만 받고 BFF가 `Origin`을 확인합니다.
- **권한**: `/api/me/*`는 로그인 사용자 본인 데이터만. `/api/admin/*`는 `role='operator'`만. 정지된 사용자는 로그인·편집 불가, 랜딩·단축 URL은 안내로 바뀝니다.
- **방문자 쿠키**: `cl_vid`(UUID, httpOnly, SameSite=Lax, 1년)는 단축 도메인. 동의 창 없이 `/privacy`에 고지(R9 사용자 결정).
- **개인정보**: IP 원문·기기·위치·유입 경로를 1년 보관(R11). 운영자 화면만 조회. 집계 테이블에는 IP를 넣지 않습니다. 법률 검토는 PRD 위험에 남아 있습니다.
- **오류·성능 진단**: 운영 API·웹은 오류와 성능 추적 표본(10%)을 Sentry(미국)로 보냅니다. IP와 크리링 내부 사용자 ID만 넣고 이메일·이름·쿠키·인증 헤더·요청 본문은 보내지 않으며, `/privacy`에 국외 이전으로 고지합니다. 결정과 위험은 [ADR 0012](../adr/0012-error-monitoring-sentry.md)입니다. 무료 요금제의 로그·업무 지표·Cron·Uptime, 웹 오류 세션 리플레이(화면 가림)·브라우저 세션·관리 화면 의견 보내기는 [ADR 0014](../adr/0014-sentry-free-plan-features.md)입니다.
- **비밀값**(`apps/api/.env`, 사용자가 채움): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPERATOR_EMAILS`. 비어 있으면 로그인 API가 503 `auth_not_configured`. 구글 콘솔에 등록할 리디렉션 URI는 `{WEB_URL}/auth/google/callback`(로컬 `http://127.0.0.1:5193/auth/google/callback`).
- **열린 리디렉트 방지**: `/c/{id}`는 DB에 저장된 URL로만 보냅니다. 랜딩 302 대상은 `WEB_URL`로 고정합니다.

## 기술 선택 `[AI 제안]`

| 필요 | 후보 | 이유 |
| --- | --- | --- |
| 구글 ID 토큰 검증 | `google-auth-library` | 구글 공식 Node 라이브러리. 직접 JWKS 검증보다 실수 여지가 적음 |
| User-Agent 해석 | `bowser` | MIT. `ua-parser-js` v2는 AGPL이라 제외 |
| IP → 국가·도시 | `maxmind`(mmdb 리더) + DB-IP Lite City mmdb(CC BY 4.0, 출처 표시 필요) | 외부 API 호출 없이 로컬 조회. `GEOIP_MMDB_PATH`가 없으면 위치는 비워 두고 경고 로그 |
| 이미지 업로드 | NestJS 기본 multer(`@nestjs/platform-express`) | 추가 의존 없음 |

설치 전에 라이선스·유지보수 상태를 구현 티켓에서 확인합니다(`npm view <pkg> license`).

## 비기능 요구

- 단축 URL 302 응답은 방문 기록 저장을 기다리지 않습니다(기록은 비동기, 실패는 로그). 로컬에서 p95 50ms 이하 목표 `[임시값]`.
- 접근성: 의미 있는 HTML, 폼 레이블, 키보드로 순서 변경(위·아래 버튼). 390px·1280px 가로 넘침 없음(R16).
- 관측: 방문 기록 실패·보존 작업 결과를 API 로그에 남깁니다.

## 위험과 스파이크

| 질문 | 막는 티켓 | 스파이크 | 끝낼 조건 |
| --- | --- | --- | --- |
| 구글 로그인 실연동 | 0018 | 없음(사용자가 키 발급) | 키를 넣고 실제 구글 계정으로 `/me` 진입 |
| 인스타그램 인앱 브라우저에서 302 연쇄와 쿠키 | 0018 | 없음 | 실제 인스타 프로필 링크로 열어 확인(운영 도메인 필요, MVP 이후) |
| GeoIP DB 배포 | 0016 | 없음 | 내려받기 스크립트로 mmdb를 두고 공인 IP 표본에서 국가가 채워짐 |

## 티켓 분해

| 번호 | 단계 | 역할 | 선행 | 요구 | 수용 기준 요약(확인 방법) |
| --- | --- | --- | --- | --- | --- |
| 0015 | 티켓 | api | — | R1~R16 | 위 계약의 경로·DTO·오류 코드가 `packages/shared`에 있고 `pnpm typecheck` 통과 |
| 0016 | 티켓 | api | 0015 | R1~R15 | migration·엔드포인트·단축 도메인·보존 작업 구현, 통합 테스트(`pnpm verify`)로 성공·오류 응답 확인 |
| 0017 | 티켓 | web | 0015 | R1, R3~R5, R8~R10, R12~R16 | 화면·BFF 확장, 로딩·빈·오류 상태, 390px·1280px 확인 |
| 0018 | 티켓 | orchestrator | 0016, 0017 | R1~R16 | 실제 API로 E2E 시나리오 통과, 로컬 설정(`WEB_URL`·`SHORT_LINK_BASE_URL` 주입, GeoIP 내려받기) 정리 |

## 검증 계획

E2E(Playwright, 0018). 구글 로그인은 키가 들어오기 전에는 테스트 전용 세션 발급(테스트 DB에 직접 세션 행을 넣는 fixture)으로 대신하고, 실제 구글 로그인은 키가 들어온 뒤 수동으로 확인합니다.

1. 크리에이터: 로그인 → `/me`에서 단축 URL 확인·복사 → 프로필·SNS·포트폴리오 입력 → 외부 링크 6개 추가 시도(5개 뒤 한도 안내) → 숨기기·순서 변경·삭제 → 주소 변경(즉시 가능) → 다시 변경 시 30일 제한.
2. 방문자: 단축 URL 열기 → 랜딩 표시·주소창이 `/p/{publicId}`(통과 표시 없음) → 외부 링크 클릭 → 외부 URL 도착. 옛 주소로도 같은 랜딩. 랜딩 주소를 바로 열면 단축 주소를 거쳐 방문 1건이 기록되고, 관리 화면 미리보기는 기록되지 않음.
3. 운영자: `/admin`에서 크리에이터 통계(방문·순 방문자·클릭·분포) 확인 → 슬롯 1개 부여 후 크리에이터가 6번째 링크 추가 가능 → 도메인 차단 후 해당 링크가 랜딩에서 사라지고 편집 화면에 차단 표시 → 같은 도메인 링크 저장 거부.
4. 빈 랜딩·없는 주소·정지 크리에이터 안내 화면.

API 통합 테스트(0016): 가입 트랜잭션, 주소 규칙(예약어·중복·30일·90일 연결), 한도, 차단, 방문·클릭 기록 항목, 보존 작업(366일 전 원본이 집계로 옮겨지고 삭제됨), 권한(타인 링크 404, 크리에이터의 admin 403).

## 미정

사용자 결정(2026-10-06): 구현에 꼭 필요한 결정 말고는 위험과 미정 사항을 다음 phase로 넘깁니다. 다음 phase 대상은 PRD `위험과 미정 사항`의 세부 질문, 이 설계의 `[임시값]` 재검토, 운영 단축 도메인·본 도메인, 법률 검토(개인정보 고지)입니다. 그때까지는 이 설계의 `[임시값]`이 기준입니다.

## 검토 기록

- 2026-10-06: 빠른 MVP 요청에 따라 역할별 설계 검토(api·web·product)를 생략했습니다. 사용자가 설계를 수정 없이 진행하기로 하고(구현에 필요한 결정 외 미정 사항은 다음 phase) 승인했습니다.

## 변경 기록

- 2026-10-06: 이미지 한도를 5MB → 4MB로 낮춤. 운영에서 업로드·조회가 웹 BFF(Vercel Function 본문 4.5MB 한도)를 지나기 때문(`docs/work/web/0026-web-internal-token-vercel.md`, 설계 `crelink-prod-deploy.md`).
- 2026-10-06: 운영 웹을 Vercel이 아닌 배포 대상 서버의 컨테이너로 바꾸면서(`crelink-prod-deploy.md`) 위 4.5MB 근거는 없어짐. 이미지 한도 4MB는 MVP 임시값으로 유지하고, 운영 웹 호스트 본문 상한은 스택 Caddy의 `request_body` 6MB.
- 2026-10-07: 외부에서 랜딩 주소로 들어와도 단축 주소를 거치게 함(PRD R7 사용자 결정). 단축 주소 302에 통과 표시, 공개 랜딩 API에 `passAccepted`·`shortUrl`, 웹 진입 판정과 루트 `loading.tsx` 이동(`docs/work/orchestrator/0038-landing-entry-via-short-link.md`).
