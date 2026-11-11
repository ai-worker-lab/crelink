# Instagram 댓글 자동 DM 기술 설계

- 상태: 초안
- 작성일: 2026-11-11
- 에픽: `docs/work/epics/0251-instagram-comment-dm.md`
- 입력: PRD R30(`docs/product/crelink.md`), 0252 결과(`docs/references/instagram-comment-dm.md`, 작성 예정)
- 표시 범례: `[문서]`는 Meta 공식 문서로 확인한 사실, `[M?]`는 실측 전 미확인입니다. 표시가 없는 Meta 동작 서술은 없습니다. `[미정]`은 사용자 결정이 필요한 항목입니다.

작성 절차와 분해 규칙은 [기술 설계와 티켓 분해](README.md)를 따릅니다. 요구 번호 R30은 PRD에 확정되어 있습니다.

## 개요와 사용자 결정

저장소 구조상 새 인프라 없이 만들 수 있습니다(Postgres outbox와 API 프로세스 worker). Meta 동작은 실측 전이므로 구현과 migration은 스파이크 0252 통과 뒤에 시작합니다. 이 설계는 읽기 전용 검토로 작성했고 웹 조회는 하지 않았으며, Meta 사실 `[문서]`는 조정자가 전달한 문서 내용입니다.

2026-11-11 사용자 결정은 다음과 같습니다.

- "사업자 없이 일단 개발까지 진행한다." 따라서 일반 크리에이터 공개, 비즈니스 인증(BV), 앱 검수 제출은 이번 에픽 범위 밖입니다. 티켓 0270과 승인 항목 A5, A6, A8은 사업자 확보 후 재개합니다.
- A3a(실제 웹훅을 검증하지 못한 상태로 구현을 시작할지)는 "구현 진행, 스위치 `off` 유지"로 결정됐습니다. 이 경우 완료 보고에 실제 Meta 연동을 검증하지 못했다는 점을 명시합니다.

## 근거

아래 번호를 본문에서 E로 인용합니다. 경로는 저장소 기준입니다.

| # | 사실 | 위치 |
| --- | --- | --- |
| E1 | 웹훅이 닿을 공개 경로가 없다. 단축 호스트의 `/api/*`는 404이고 본 도메인은 전부 web으로 간다 | `infra/prod/Caddyfile:38`, `:81-83`, `:92-99` |
| E2 | raw body를 보존하지 않는다. `configureApp`은 실행과 시험이 공유한다 | `apps/api/src/main.ts:21`, `apps/api/src/app.setup.ts:7-13` |
| E3 | 스트림을 먼저 읽으면 body-parser는 건너뛴다. API에 `express` 직접 의존은 없다 | `node_modules/body-parser/lib/read.js:40`, `apps/api/package.json:13-25` |
| E4 | 두 색이 겹친다. 20초 drain 뒤 `docker stop -t 30`으로 멈춘다 | `infra/prod/lib.sh:36`, `:296-298` |
| E5 | `onModuleDestroy`는 가까운 모듈부터 순서대로 await하고, Global인 `Database`는 맨 뒤다 | `node_modules/@nestjs/core/nest-application-context.js:265-271`, `node_modules/@nestjs/core/scanner.js:36`, `apps/api/src/database.module.ts:5` |
| E6 | migration은 기동 시 파일별 트랜잭션으로 돌고 pool 기본값은 15다 | `apps/api/src/database.ts:87-98`, `:117`, `:128` |
| E7 | 보존 작업은 일 1회, 한 트랜잭션, Sentry Cron 감시다 | `apps/api/src/retention/retention.service.ts:39-47`, `:56-57`, `:160` |
| E8 | 소유자 전용 패턴이 있다. PRD R29 ②의 편집 범위에 자동화는 없다 | `apps/api/src/pages/page-access.guard.ts:53-58`, `apps/api/src/creator/creator.controller.ts:158-160`, `apps/web/src/components/manage/ManagerShell.tsx:84`, `docs/product/crelink.md:111` |
| E9 | 외부 OAuth 경계와 시험용 교체 패턴이 있다 | `apps/api/src/auth/google-oauth.ts:20-24`, `apps/api/test/test-app.ts:38-45`, `apps/web/src/app/auth/google/callback/route.ts:27-61` |
| E10 | `PRODUCTION_REQUIRED_KEYS`에 넣으면 시크릿 등록 전 배포가 기동 거부된다. 선택 기능은 getter가 null을 돌려주는 패턴이다 | `apps/api/src/config.service.ts:5-13`, `:225-230` |
| E11 | 운영 비밀 원본은 SOPS다 | `docs/development/environment-secrets.md:39`, `.sops.yaml:13` |
| E12 | Sentry는 `code`·`state`·`pass`만 쿼리에서 지운다. `access_token`, 서명 헤더, Meta 토큰 형식은 대상이 아니다 | `apps/api/src/monitoring/sentry.ts:13-23`, `:38-39` |
| E13 | `instagram`/`dm` 프리셋과 UTM 저장이 있다. 한도는 50/200이고 같은 조합은 기존 주소를 돌려준다. `ChannelLinksService`는 export되지 않았다 | `packages/shared/src/channel-links.ts:9-11`, `:47`, `:112-125`, `apps/api/src/creator/channel-links.service.ts:88-93`, `apps/api/src/creator/creator.module.ts:41`, `apps/api/src/short-link/short-link.controller.ts:179-216` |
| E14 | 통계에 `utm_id` 분포가 있고 봇은 UA로 뺀다 | `apps/api/src/analytics/dimensions.ts:11`, `apps/api/src/analytics/analytics.service.ts:126-127`, `packages/shared/src/bot-user-agent.ts:11` |
| E15 | 플랫폼 스위치와 감사 기록 패턴이 있고, 새 운영자 쓰기 경로는 커버리지 시험을 통과해야 한다 | `apps/api/migrations/0007_ad_block_toggle.sql:14-21`, `apps/api/src/admin/ad-block.service.ts:29-52`, `apps/api/test/operator-audit-coverage.e2e-spec.ts:24-30` |
| E16 | 운영은 api+web만 있고 큐용 서비스가 없다. 서버는 home-server 1대, DB는 Supabase 세션 풀러다 | `infra/prod/compose.yaml:18-75`, `:42`, `infra/prod/targets.json:4-9`, `apps/api/docs/README.md:68` |
| E17 | 처리방침에 해당 항목이 없고, 약관은 자동화된 대량 요청을 금지한다 | `apps/web/src/app/(public)/privacy/page.tsx:59-65`, `:146-170`, `:205-238`, `apps/web/src/app/(public)/terms/page.tsx:50` |
| E18 | 망법 제50조 위험과 "SNS 계정 인증" 제외 범위가 PRD에 있다 | `docs/product/crelink.md:58`, `:105`, `:175` |
| E19 | 외부 발송·자격 증명 변경·데이터 파괴는 사용자 승인 대상이고, main 머지는 곧 운영 배포다. migration은 되돌리지 않는다 | `docs/adr/0016-devoffice-takeover.md:16-18`, `AGENTS.md:13` |
| E20 | 최신 migration은 0015다. 로컬·원격 브랜치에 0016 이상은 없고, 시험의 목록을 같이 고쳐야 한다 | `apps/api/migrations/0015_channel_links.sql`, `apps/api/test/health.e2e-spec.ts:89`, `:138` |
| E21 | BFF는 허용 목록과 같은 출처 검사를 거친다 | `apps/web/src/app/api/backend/[...path]/route.ts:37-42`, `apps/web/src/lib/api/backend-rules.ts:29-31` |

## 요구 대응

| 요구 | 화면 | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| R30-1 계정 연결·해제 | 연결 | `/api/me/instagram*`, OAuth 콜백 | `instagram_connections` | 0256, 0263, 0264 |
| R30-2 게시물·키워드 규칙 | 규칙 설정 | `/rules`, `/media` | `instagram_dm_rules` | 0255, 0260, 0264 |
| R30-3 키워드 댓글에 링크 DM 1건 | 없음 | 웹훅, worker | `instagram_dm_deliveries` | 0257, 0258, 0262 |
| R30-4 발송 내역 | 발송 내역 | `/deliveries` | 위와 같음 | 0261, 0265 |
| R30-5 긴급 정지 | 연결 화면, 운영자 카드 | `/pause`, `/api/admin/instagram-dm*` | `platform_settings` 열, 정지 열 | 0259, 0264, 0266 |
| R30-6 삭제·파기 | 삭제 확인 페이지 | 데이터 삭제 콜백 | `instagram_deletion_requests`, 보존 작업 | 0257, 0259, 0267 |
| R30-7 DM 수신 거부 | 수신 거부 페이지 | `POST /api/public/instagram-dm-opt-outs` | `instagram_dm_opt_outs` | 0271, 0272 |

이번 에픽에서 다루지 않는 PRD 항목은 일반 크리에이터 공개(R30 ⑥의 스위치 `everyone` 전환)입니다. 사업자 확보와 Meta 검수 뒤에 다시 정합니다.

## 구성과 전제

- 인증은 Unified Login입니다. 앱은 Business 포트폴리오 소유이고 Facebook Login for Business 구성을 씁니다 `[문서]`.
- 권한은 `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`입니다 `[문서]`. 추가 권한(`pages_*`, `business_management` 등) 필요 여부는 S7로 확정합니다 `[M?]`.
- API 호스트는 `graph.facebook.com/v27.0`입니다. 버전은 `graph.ts` 상수로 두고 env로 만들지 않습니다.
- 설정 키는 `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN`, `INSTAGRAM_TOKEN_KEYS`, `INSTAGRAM_TOKEN_KEY_CURRENT`, `INSTAGRAM_COMMENTER_HASH_KEY`, `INSTAGRAM_OPT_OUT_KEY`입니다.
- Sentry 스크럽 정규식은 Meta 토큰 형식(`EAA…`)을 대상으로 합니다.
- 기존에 Instagram Login 앱이 있다고 확인되면 이 전제를 다시 봅니다.

## 구성과 흐름

```text
[연결] 브라우저 → BFF → POST /api/me/instagram/connect → Facebook Login 동의
       → {WEB}/me/integrations/instagram/callback → POST /api/me/instagram/callback → 암호화 저장·구독

[수신] Meta → Cloudflare → Caddy(웹 호스트의 웹훅 경로만 API로) → raw 미들웨어 → 서명 검증
       → 규칙 조회 1회 → 키워드 일치분만 INSERT ON CONFLICT DO NOTHING → 커밋 뒤 200

[발송] worker(2초 tick, 두 색 동시 가능) → 빈 슬롯 수만큼 SKIP LOCKED로 sending 선점 → 커밋
       → 호출 직전 재확인 → Graph POST(트랜잭션 밖) → status='sending' 조건으로 결과 기록

[수신 거부] 수신자 → {WEB}/dm-opt-out#t={token} → 확인 버튼(페이지 JS) → BFF → POST /api/public/instagram-dm-opt-outs {token}
       → 수신 거부 기록과 그 사람의 pending 취소를 한 트랜잭션으로
```

## 데이터 모델

`apps/api/migrations/0016_instagram_dm.sql` 1건으로 만듭니다. 추가만 하므로 두 색이 겹쳐도 안전합니다(E4, E6). 되돌림 주석은 0014 형식을 따르고, 운영 데이터가 생긴 뒤에는 다음 migration으로 고칩니다(E19). 0252 뒤에 작성하므로 실측 결과를 반영합니다.

```sql
SET LOCAL lock_timeout = '5s';
ALTER TABLE platform_settings ADD COLUMN instagram_dm_audience text NOT NULL DEFAULT 'off'
  CHECK (instagram_dm_audience IN ('off','operators','everyone'));

CREATE TABLE instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  ig_user_id text NOT NULL,            -- /<IG_ID>/messages, 웹훅 entry.id
  meta_user_id text,                   -- signed_request user_id 대조용(S9)
  ig_username text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','messages_access_required','reauth_required')),
  token_ciphertext bytea,              -- iv || tag || ct, reauth_required면 NULL
  token_key_version smallint,
  token_expires_at timestamptz,        -- NULL이면 무기한
  token_revision int NOT NULL DEFAULT 1,  -- 토큰 교체마다 올림
  token_checked_at timestamptz NOT NULL DEFAULT now(),
  dm_paused_at timestamptz,            -- 크리에이터 정지
  operator_paused_at timestamptz,      -- 운영자 정지(크리에이터가 풀 수 없음)
  rate_window_started_at timestamptz NOT NULL DEFAULT now(),
  rate_window_count int NOT NULL DEFAULT 0,
  rate_limited_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'reauth_required') = (token_ciphertext IS NULL))
);
CREATE UNIQUE INDEX instagram_connections_ig_live
  ON instagram_connections (ig_user_id) WHERE status <> 'reauth_required';
CREATE INDEX instagram_connections_check
  ON instagram_connections (token_checked_at) WHERE status <> 'reauth_required';
CREATE INDEX instagram_connections_meta_user
  ON instagram_connections (meta_user_id) WHERE meta_user_id IS NOT NULL;

CREATE TABLE instagram_dm_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]{10}$'),
  connection_id uuid NOT NULL REFERENCES instagram_connections (id) ON DELETE CASCADE,
  ig_media_id text NOT NULL,
  ig_media_child_ids text[] NOT NULL DEFAULT '{}',  -- S5 결과에 따라 쓰거나 뺀다
  version int NOT NULL DEFAULT 1,      -- keyword·message 수정, 비활성화, 보관마다 올림
  media_permalink text NOT NULL,
  media_caption_preview text NOT NULL DEFAULT '',
  keyword text NOT NULL CHECK (char_length(keyword) BETWEEN 1 AND 30),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 250),  -- 단위는 S11로 확정
  channel_link_code text NOT NULL REFERENCES channel_link_codes (code),
  enabled boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, connection_id)
);
CREATE UNIQUE INDEX instagram_dm_rules_one_per_media
  ON instagram_dm_rules (connection_id, ig_media_id) WHERE archived_at IS NULL;
CREATE INDEX instagram_dm_rules_active
  ON instagram_dm_rules (connection_id) WHERE archived_at IS NULL AND enabled;

CREATE TABLE instagram_dm_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES instagram_connections (id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  rule_version int NOT NULL,           -- 저장 시점의 규칙 version. 다르면 옛 문구이므로 보내지 않는다
  comment_id text NOT NULL,
  commenter_hash bytea NOT NULL CHECK (octet_length(commenter_hash) = 32),
  commented_at timestamptz NOT NULL,   -- 웹훅의 댓글 시각, 24시간 규칙의 기준
  message_body text NOT NULL,          -- 저장 시점의 최종 본문, 발송은 이 값으로만 한다
  status text NOT NULL CHECK (status IN
    ('pending','sending','sent','failed','unknown','expired','cancelled')),
  failure_code text,
  attempts smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, comment_id),
  FOREIGN KEY (rule_id, connection_id)
    REFERENCES instagram_dm_rules (id, connection_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX instagram_dm_deliveries_one_per_person ON instagram_dm_deliveries (rule_id, commenter_hash)
  WHERE status IN ('pending','sending','sent','unknown');
CREATE INDEX instagram_dm_deliveries_due ON instagram_dm_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX instagram_dm_deliveries_lease ON instagram_dm_deliveries (lease_until) WHERE status = 'sending';
CREATE INDEX instagram_dm_deliveries_history ON instagram_dm_deliveries (connection_id, created_at DESC, id DESC);
CREATE INDEX instagram_dm_deliveries_retention ON instagram_dm_deliveries (created_at);

CREATE TABLE instagram_dm_opt_outs (
  ig_user_id text NOT NULL,            -- 연결 FK 없음: 재연결·재인증에도 유지
  commenter_hash bytea NOT NULL CHECK (octet_length(commenter_hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ig_user_id, commenter_hash)
);

CREATE TABLE instagram_opt_out_owners (
  ig_user_id text PRIMARY KEY,         -- Meta 데이터 삭제 콜백이 일반 해제 뒤에도 수신 거부 기록을 찾게 하는 대응표
  meta_user_id text NOT NULL
);
CREATE INDEX instagram_opt_out_owners_meta_user ON instagram_opt_out_owners (meta_user_id);

CREATE TABLE instagram_deletion_requests (
  confirmation_code text PRIMARY KEY CHECK (confirmation_code ~ '^[a-z0-9]{16}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**댓글 작성자 식별자.**

- 원문 댓글, 사용자명, 원본 작성자 ID는 저장하지 않습니다.
- 핸들러가 `HMAC-SHA256(키, ig_user_id || from.id)`만 저장합니다. 연결이 아니라 IG 계정 기준이라 재연결해도 값이 같습니다. 사람별 1건 제한과 수신 거부에 필요한 값이 이것뿐입니다. 발송은 `comment_id`로 하므로 원본 ID가 필요 없습니다.
- 키워드에 맞지 않는 댓글은 행을 만들지 않습니다.

**보관과 파기.**

| 대상 | 기간·시점 | 수단 |
| --- | --- | --- |
| `instagram_dm_deliveries` 전체(해시, 댓글 ID, 최종 본문 포함) | 생성 후 90일 | 보존 작업 DELETE(E7) |
| 연결 해제 | 즉시 | 연결 행 삭제, CASCADE. 운영자 정지 중이면 행을 남기고 토큰 파기·대기 취소·규칙 보관(아래 `해제`). 이때 발송 내역은 90일 보존 작업으로 지운다 |
| 토큰 무효 | 즉시 | 토큰 파기, `reauth_required`, 대기 건 취소 |
| 데이터 삭제 콜백 | 즉시 | 연결 행 삭제, 소유 대응표 파기, 확인 코드만 남김 |
| 수신 거부 소유 대응표(`instagram_opt_out_owners`) | Meta 데이터 삭제 요청 때 즉시 | 연결 때 `(ig_user_id, meta_user_id)`를 upsert하고 일반 해제 뒤에도 남긴다. `signed_request`는 `meta_user_id`만 주므로 연결 행이 사라진 뒤 `ig_user_id`를 찾는 유일한 근거다 |
| 확인 코드 | 90일 | 보존 작업 DELETE |
| 수신 거부 기록(`instagram_dm_opt_outs`) | 크리링 회원 탈퇴·Meta 데이터 삭제 요청 때 해당 `ig_user_id`분 즉시 | 90일 파기 대상이 아님. 일반 해제·재연결·재인증에서는 유지. FK가 없으므로 데이터 삭제 콜백(0257)이 같은 트랜잭션에서 소유 대응표와 연결 행으로 찾은 `ig_user_id`로 직접 DELETE. 현재 API에 회원 탈퇴 경로가 없어 이번 티켓은 없고, 탈퇴 기능을 만들 때 같은 파기를 넣는다 |

90일이 지나면 같은 사람이 같은 규칙으로 다시 DM을 받을 수 있습니다. 수용합니다. 다만 수신 거부 의사가 90일 뒤 사라지면 안 되므로 거부 기록은 90일 파기에서 뺍니다. 수신 거부 링크는 서버에 저장하지 않는 서명 토큰이라 90일 뒤에도 옛 링크가 동작합니다.

**객체 권한.** 규칙·내역의 모든 조회·변경은 연결 소유자 조건(`connection.user_id = 세션 사용자`)을 SQL에 포함합니다. 다른 크리에이터의 `publicId` 요청은 404입니다. `instagram_dm_rules`의 `UNIQUE (id, connection_id)`와 발송 행의 복합 FK `(rule_id, connection_id)`로 규칙과 발송 행의 연결이 어긋나지 않게 합니다.

**규칙 변경 경합.** keyword·message 수정, 비활성화, 보관은 `version`을 올리고 같은 트랜잭션에서 그 규칙의 `pending`을 `cancelled`로 바꿉니다. 발송 행의 `message_body`가 저장 시점의 최종 본문이라 발송은 이 값으로만 합니다. 저장 때 규칙 `version`을 `rule_version`에 함께 기록해, 선점·호출 직전 재확인·재시도 복귀 어디서든 현재 `version`과 다르면 옛 문구이므로 보내지 않고 `cancelled`로 끝냅니다.

**한도.** 연결당 활성 규칙 10개, 보관 포함 100개(E13의 총 200개 안). 게시물당 활성 규칙 1개.

**충돌 규칙.**

- 크리링 페이지 1개에 IG 계정 1개, IG 계정 1개에 살아 있는 연결 1개(`instagram_connections_ig_live`, `status <> 'reauth_required'`)입니다. 웹훅의 `entry.id`가 정확히 한 소유자로 풀리므로 중복 DM 방지 조건이기도 합니다.
- 같은 `ig_user_id`의 다른 크리링 계정 행에 `operator_paused_at`이 있으면(상태 무관, 재인증 대기 행 포함) 구독·저장 전에 409 `instagram_operator_paused`입니다. 저장 트랜잭션이 내 행과 그 행들을 id 순으로 잠그고 다시 봅니다. 그 행의 소유자가 같은 계정을 재연결하는 것은 행을 갱신할 뿐이라 허용하고 정지는 유지됩니다.
- 다른 페이지가 같은 계정을 연결하려 하고 기존 행이 살아 있으면, 콜백이 **기존 토큰을 1회 점검**합니다. 무효이면(`token_revision`이 같을 때만) 재인증 전이 함수로 기존 행을 `reauth_required`로 바꾸고 연결을 진행합니다. 유효이면 409 `instagram_account_in_use`이며 어느 페이지인지는 밝히지 않습니다. 해제 콜백의 존재가 미확인이라 자동 해소를 전제하지 않습니다.
- 새 연결은 OAuth로 계정 권한을 증명한 뒤에만 가능합니다.
- 소유자 이전은 없습니다.
- 구독 호출 전에 충돌을 검사합니다. 먼저 구독하면 다른 페이지의 연결에 영향을 줄 수 있습니다.

**R29 공동 관리자.** 연결과 규칙의 모든 경로를 `@PageOwnerOnly()`로 막습니다(E8). 편집자는 403이고 메뉴도 숨깁니다. 이 기능은 소유자 Instagram 명의로 타인에게 메시지를 보내는 일이고 R29 ②의 허용 목록에 없습니다. AI 행위자는 `@ActorKinds('human')`로 막습니다.

## 웹훅 수신 경로

1. **공개 경로(E1).** Caddy 웹 호스트에 `/api/webhooks/instagram`과 `/api/webhooks/instagram/data-deletion` 2개만 API 업스트림으로 보냅니다. BFF는 거치지 않습니다. 바이트 보존과 지연 때문입니다. 해제(Deauthorize) 콜백은 존재가 미확인이라 만들지 않으며, S9에서 존재가 확인되면 추가합니다.
2. **raw body와 파싱(E2, E3).** `configureApp`에 이 경로 전용 미들웨어를 둡니다. 스트림을 6MB까지 읽어 `Buffer`로 보관합니다. 상한은 Caddy 웹 호스트 상한(`infra/prod/Caddyfile:89-91`)과 맞춘 값이고, 배치가 최대 1000건이라 `[문서]` 작은 상한은 413으로 배치 전체를 잃습니다. 본문 크기를 지표로 남깁니다. 서명 통과 뒤 JSON은 raw 미들웨어가 넘긴 `Buffer`를 웹훅 핸들러가 직접 파싱합니다. 항목별로 필드와 타입을 검사해 불량 항목은 건너뛰고 지표만 남기며, 유효 항목만 한 INSERT에 넣습니다. 전역 `rawBody: true`는 실행과 시험 두 곳을 고쳐야 하고 다른 경로까지 원문을 보관하므로 쓰지 않습니다. 새 의존성은 없습니다. 삭제 콜백은 폼 본문이라 기존 파서를 쓰고 그 안의 `signed_request`를 검증합니다.
3. **서명.** `X-Hub-Signature-256`를 raw 바이트의 HMAC-SHA256과 비교합니다. 길이 확인 뒤 `timingSafeEqual`을 씁니다. 어떤 시크릿으로 서명하는지는 S1로 확정합니다 `[M?]`. 실패하면 403이고 metric만 남깁니다.
4. **GET 검증.** `hub.verify_token`(`META_WEBHOOK_VERIFY_TOKEN`)을 상수 시간으로 비교하고, `hub.challenge`는 형식 검사 뒤 `text/plain`으로 돌려줍니다.
5. **빠른 200.** 한 배치(최대 1000건 `[문서]`)에 규칙 조회 1회(`ig_user_id = ANY`)와 저장 트랜잭션 1회입니다. 트랜잭션은 [잠금 순서](#잠금-순서)대로 설정 → 연결 → 규칙을 `FOR SHARE`로 잡은 뒤 다중 행 `INSERT ... SELECT` 1회를 실행합니다. INSERT는 규칙의 현재 `version`·`enabled`·`archived_at`을 다시 검사합니다. 외부 호출은 없습니다. 제외 조건은 다음과 같습니다.
   - `field≠comments`
   - `from.id=entry.id`(본인 댓글) `[M?]`
   - `parent_id` 있음(답글) `[M?]`
   - 댓글 시각(`commented_at`)이 24시간을 넘었거나 규칙 생성 전
   - `audience=off`, 정지 계정, 정지 사용자, `status≠'active'`
   - 수신 거부 대상(`(ig_user_id, commenter_hash)`가 `instagram_dm_opt_outs`에 있으면 INSERT 문의 `NOT EXISTS`로 뺌)
   - `commented_at`은 `entry.time`을 쓰고, 없거나 잘못되면 수신 시각을 씁니다. 필드 존재 여부는 S5로 확정합니다.
   - 위 필드명과 시각 필드는 S5의 필드표로 확정합니다.
6. **유실 방지.** 커밋 뒤에만 200입니다. DB 오류면 503을 돌려 Meta 재전송에 맡깁니다. 재시도는 36시간입니다 `[문서]`. 배포 중에는 옛 색이 진행 중 요청을 마치고(E4), 전환 순간의 연결 실패는 Caddy `lb_try_duration`이 덮습니다.
7. **멱등성.** 중복 제거가 필수입니다 `[문서]`. `ON CONFLICT DO NOTHING`은 두 유니크 제약(`(connection_id, comment_id)`, `(rule_id, commenter_hash)`)만 처리하고, 이 둘로 충분하므로 같은 웹훅 재전송과 같은 사람의 반복 댓글은 행이 생기지 않습니다.

**댓글·게시물 ID.**

- 댓글 ID는 `value.id ?? value.comment_id`로 받습니다 `[문서]`. 둘 다 없으면 버리고 지표를 남깁니다.
- 게시물 ID는 `value.media.id`입니다 `[문서]`. 규칙 일치는 `rule.ig_media_id = media.id` 또는 `media.id = ANY(rule.ig_media_child_ids)`이고, 규칙은 연결당 10개 이하라 메모리에서 비교합니다.
- 앨범 ID는 웹훅에 없습니다 `[문서]`. 댓글마다 조회하는 방식은 750 calls/시간 한도 `[문서]`를 깎아 먹으므로 기본안에서 뺐습니다. S5 결과에 따라 다음 중 하나로 정합니다.

| S5 결과 | 처리 |
| --- | --- |
| 캐러셀 댓글의 `media.id`가 앨범 ID | 추가 작업 없음, `ig_media_child_ids` 삭제 |
| 자식 ID | 규칙 생성 때 자식 목록을 1회 조회해 저장 |
| 그 외 | MVP의 게시물 선택 목록에서 캐러셀 제외, 후속으로 미룸 |

**구독.** 계정별 구독은 연결 시 `POST /<IG_ID>/subscribed_apps?subscribed_fields=comments`입니다 `[문서]`. 공개 계정만 동작합니다 `[문서]`.

**큐 선택.**

| 안 | 판단 | 이유 |
| --- | --- | --- |
| Postgres 테이블 + `FOR UPDATE SKIP LOCKED`, API 프로세스 worker | **추천** | 새 인프라 0, 두 색 동시 실행 안전, 트랜잭션과 멱등 제약을 한 곳에서 처리 |
| pg-boss | 버림 | 새 의존성과 별도 스키마 대비 필요한 기능이 적다 |
| BullMQ + Valkey | 버림 | 운영에 서비스가 없어 인프라 추가가 필요하다(E16) |
| 핸들러에서 바로 발송 | 버림 | 빠른 200과 레이트 제한을 함께 지킬 수 없다 |

재검토 조건은 worker tick이 지속적으로 밀리는 경우입니다. 규모를 가정하지는 않습니다. 현재 크리에이터 수와 목표가 작기 때문입니다(`docs/product/crelink.md:38`, `:48`).

## 발송 경로

**Worker.** `RetentionService`처럼 앱 기동 시 시작합니다. 설정이 없으면 시작하지 않고, 시험은 `runOnce`를 직접 부릅니다.

- **선점(짧은 트랜잭션).** 프로세스의 빈 발송 슬롯 수만큼만 `sending`으로 바꾸고 커밋한 뒤 바로 호출합니다. 메모리 대기열을 두지 않습니다. 조건은 `audience≠off`, 연결 `status='active'`, `token_expires_at IS NULL OR token_expires_at > now()`, 정지 아님, `rate_limited_until` 경과, 사용자 정지 아님, 규칙 `enabled`이고 보관 아님, 수신 거부 없음이며 `SKIP LOCKED`로 잡습니다. 연결별 시간당 예산을 넘기지 않습니다.
- **호출 직전 재확인.** 전체 스위치, 연결 정지, 규칙 활성과 저장 시점 `version` 일치, 수신 거부 없음, 자기 lease가 유효한지 다시 확인합니다. 선점·재확인·재시도 복귀가 같은 조건(`SENDABLE_SQL`)을 씁니다.
- **발송은 트랜잭션 밖**에서 프로세스당 동시 5건(두 색 합쳐 최대 10건), 요청 타임아웃 10초로 합니다. DB 연결을 물고 외부 호출을 하지 않습니다(E6). 본문은 발송 행의 `message_body`입니다.
- **기록.** `WHERE id=$1 AND status='sending'` 조건으로 결과를 씁니다.
- **종료.** `onModuleDestroy`에서 claim을 멈추고 진행 중 호출을 기다립니다. Database가 마지막에 닫히므로 순서가 보장되고(E5), 최악 10초는 30초 유예 안입니다(E4).
- **Lease(2분) 만료**: `sending`을 `unknown`으로 바꾸고 재시도하지 않습니다.

**DM 본문.** `{규칙 문구}\n\n{/s/ 링크}\n\n자동 발송 메시지 · 수신 거부: {WEB}/dm-opt-out#t={token}`입니다. 토큰은 웹훅 저장 시점에 만들어 `message_body`에 포함합니다. 고정 줄은 크리에이터가 뺄 수 없습니다. 규칙 문구 상한 250자는 링크와 고정 줄을 더해도 Graph 메시지 길이 안에 들게 하기 위한 값이며, 바이트·글자 기준은 S11로 확정합니다 `[M?]`. 자동 발송 표시는 이 수신 거부 안내 줄에 합쳤습니다.

**오류 분류.** 코드 확정은 S4·S8에서 합니다.

| 결과 | 처리 |
| --- | --- |
| 200 | `sent` |
| 연결 전 네트워크 실패 | 재시도(30초·2분·10분·1시간, 최대 4회). 정지·비활성이면 아래 `긴급 정지`대로 취소 |
| 613·서브코드 2534040, BUC 80002, 429 `[문서]` | `X-Business-Use-Case-Usage`의 대기 시간으로 `rate_limited_until` 설정(값이 없으면 1시간). 시도 횟수 미차감. 정지·비활성이면 아래 `긴급 정지`대로 취소 |
| 타임아웃, 5xx, 응답 전 끊김 | **`unknown`, 재시도 안 함** |
| 토큰 무효 `[문서]`(190 계열 `[M?]`) | **재시도 금지.** 읽었던 `token_revision`이 그대로일 때만 재인증 전이 함수 호출(아래) |
| 메시지 접근 꺼짐(코드는 S8) | `messages_access_required`, `pending`을 `cancelled`로. 토큰 유지 |
| 잘못된 대상, 삭제된 댓글, 수신 불가, 이미 응답 | `failed`, 재시도 없음 |
| 정책 제재 코드 | 계정 자동 정지, 운영 알림 |

S4에서 같은 `comment_id` 재호출이 구분되는 오류로 거부된다고 실측되면, `unknown` 재시도를 허용하고 그 오류를 `sent`로 처리할 수 있습니다. 실측 전에는 재시도 금지가 기본값입니다.

**신선도.** 댓글 시각(`commented_at`)으로부터 24시간이 지나면 `expired`로 끝냅니다. 플랫폼 한도 7일 안에서 재개 후 몰아 보내기를 막기 위한 값입니다.

**레이트 제한.** 연결당 시간 고정 창이고 기본값은 `INSTAGRAM_DM_HOURLY_LIMIT=700`입니다(한도 750 `[문서]`에서 여유분을 뺀 값). 오류 코드와 헤더 형식은 S8로 확정합니다.

**긴급 정지.**

| 범위 | 스위치 | 동작 |
| --- | --- | --- |
| 전체 | `instagram_dm_audience=off`(운영자 카드) | 다음 tick부터 claim 없음, 웹훅 저장 중단, `pending`은 같은 트랜잭션에서 `cancelled`. 감사 기록 |
| 계정 | `dm_paused_at`(크리에이터), `operator_paused_at`(운영자) | 같은 동작을 해당 계정에만 적용 |
| 기능 전체 | 설정 키 없음 | API 503 `instagram_not_configured`, worker 미시작 |

진행 중이던 호출은 프로세스당 최대 5건이며 회수할 수 없습니다. 재개해도 취소된 건은 보내지 않습니다. 호출이 연결 전 실패나 레이트 제한으로 끝났을 때 이미 정지·비활성·규칙 수정·수신 거부 상태면(`SENDABLE_SQL`이 거짓) `pending`으로 되돌리지 않고 `cancelled`(`stopped_before_send`)로 끝냅니다. 이 판정은 설정·연결·규칙 행을 잠가 진행 중인 정지 트랜잭션을 기다립니다.

`audience`는 출시 제어도 겸합니다. `off`(기본), `operators`(회사 계정 시범, 운영자 역할만), `everyone`(사업자 확보와 검수 통과 뒤, 이번 에픽 범위 밖)입니다. 그래서 main에 머지되어도 켜기 전까지 동작하지 않습니다(E19).

### 잠금 순서

웹훅 저장·규칙 변경·worker·관리자·연결이 모두 같은 순서로 잠가 교착(40P01)을 막습니다. 근거는 `apps/api/src/instagram/lock-order.ts`입니다.

`platform_settings` → `instagram_connections`(여러 행이면 id 순) → `users` → `instagram_dm_rules`(여러 행이면 id 순) → `instagram_dm_deliveries`

- 여러 발송 행을 바꾸는 트랜잭션은 먼저 그 행들의 연결 행을 잡습니다(규칙 변경·정지·재인증·해제는 이미 잡고, `audience` 변경은 전체 연결을 id 순으로, 수신 거부는 그 IG 계정의 연결을 잡습니다). 연결 행을 잡지 않는 일괄 변경(worker `sweep`)은 `SKIP LOCKED`로 기다리지 않습니다.
- 웹훅은 단일 INSERT의 잠금 절에 순서를 맡기지 않고 트랜잭션에서 위 순서로 잠근 뒤 저장합니다. 트랜잭션이 실패하면(40P01 포함) 503입니다.
- worker 선점은 `SKIP LOCKED`라 기다리지 않습니다. 재시도 복귀의 재확인은 `FOR SHARE OF s FOR NO KEY UPDATE OF c FOR SHARE OF r`로 같은 순서를 지킵니다.

## OAuth·토큰·삭제

**연결.** 엔드포인트와 파라미터(`config_id` 등)는 S7로 확정합니다 `[M?]`.

1. `POST /api/me/instagram/connect`: 소유자·사람·`audience` 검사 후 `state`를 만들고 Facebook Login 동의 URL을 돌려줍니다. `state`는 `{uid, exp 10분, nonce}`에 HMAC으로 서명하며 테이블을 만들지 않습니다. 새 쿠키 `cl_ig_oauth_state`로 내려 Google 로그인 state와 섞이지 않게 합니다.
2. 동의는 브라우저에서 열리고 비밀번호가 필요합니다 `[문서]`. 시작과 콜백이 같은 브라우저여야 쿠키가 맞습니다. 인앱 브라우저이면(기존 `inAppKindOfUserAgent`, `apps/web/src/app/api/backend/[...path]/route.ts:6`, `:56`) 시작 전에 기본 브라우저 안내 화면을 보입니다.
3. 콜백 페이지(web 전용 route)는 세션 쿠키와 state 쿠키를 API에 전달합니다(E9). `code`·`state`는 Sentry에서 이미 지웁니다(E12).
4. `POST /api/me/instagram/callback`은 쿠키 일치, 서명, 만료, `uid=세션 사용자`를 검증합니다. 다음으로 code 교환, IG 계정 조회, 프로페셔널 계정 확인, **충돌 검사**, `subscribed_apps` 구독, 암호화 저장 순서로 진행하고 저장은 한 트랜잭션에 합니다.
5. 동의 화면에서 거부하면 콜백 route가 Meta의 `error` 값을 옮기지 않고 `instagram_access_denied`로 화면에 돌려보냅니다.
6. 동의 결과 IG 계정이 정확히 1개가 아니면 409 `instagram_account_selection_required`입니다. 선택 화면은 만들지 않고 하나만 골라 다시 연결하도록 안내합니다.

**토큰 암호화와 키.**

- AES-256-GCM을 쓰고, 행 ID를 AAD로 묶어 다른 행으로 복사해도 복호화되지 않게 합니다.
- 키는 SOPS로 주입합니다(E11). `INSTAGRAM_TOKEN_KEYS=1:<b64>,2:<b64>`와 `INSTAGRAM_TOKEN_KEY_CURRENT`로 회전합니다. 일일 점검 때 `token_key_version`이 현재 키와 다르면 현재 키로 다시 암호화하며, `token_revision`이 같을 때만 적용합니다.
- 작성자 해시 키 `INSTAGRAM_COMMENTER_HASH_KEY`와 수신 거부 토큰 키 `INSTAGRAM_OPT_OUT_KEY`(만료 없음)는 다른 키와 분리합니다. 토큰 키를 회전해도 사람별 제한과 수신 거부가 깨지지 않아야 합니다.
- 설정은 전부 있거나 전부 없어야 합니다(`parseFileStorageConfig` 방식, `apps/api/src/config.service.ts:47-51`). `PRODUCTION_REQUIRED_KEYS`에는 넣지 않습니다(E10).

**로그 차단(E12).** `SCRUBBED_QUERY_PARAMS`에 `access_token`, 헤더 목록에 `x-hub-signature-256`, 로그 정규식에 Meta 토큰 형식(`EAA…`)을 더합니다. 토큰은 가능하면 `Authorization` 헤더로 보냅니다 `[M?]`. `comment_id`와 작성자 ID는 로그에 쓰지 않습니다. Graph 경계에서 허용된 오류 코드와 서브코드만 남기고 원문 오류는 버립니다. 수신 거부 토큰은 URL 프래그먼트와 요청 본문으로만 다니므로 경로·쿼리 로그에 남지 않으며, 본문을 로그·Sentry에 넣지 않습니다.

**토큰 수명.** 토큰 교체 작업은 MVP에 없습니다. Facebook Login for Business의 기본은 무기한이고 `[문서]`, 구성도 무기한으로 잡습니다.

| 만료 값 | 동작 |
| --- | --- |
| 없음 | 무기한으로 처리, 무효 오류와 일일 점검으로만 감지 |
| 있음 | 14일 전 화면 경고, 지나면 `reauth_required`(재연결로 복구) |

S7에서 토큰이 만료되고 갱신 수단이 있다고 확인되면 후속 migration으로 추가합니다.

**일일 점검.** 1시간 tick에서 `token_checked_at`이 24시간 지난 연결을 최대 100개 처리합니다. 조건부 UPDATE로 단일 승자를 고르고 트랜잭션 밖에서 `GET /<IG_ID>?fields=id`를 부릅니다. `token_key_version`이 현재 키와 다르면 재암호화도 합니다. 무효이면 재인증 전이 함수를 호출합니다(`token_revision`이 같을 때만). 해제 콜백이 없을 때의 대체 신호이며 최대 24시간 지연을 수용합니다.

**재인증 전이.** 모든 `reauth_required` 전이(만료, 충돌 점검, 발송 오류, 일일 점검)는 공통 함수 하나로 처리합니다. 한 트랜잭션에서 상태 변경, `token_ciphertext`·`token_key_version` NULL 처리, 그 연결의 `pending`을 `cancelled`로 바꾸는 일을 함께 합니다. `CHECK ((status = 'reauth_required') = (token_ciphertext IS NULL))` 제약은 유지합니다.

**토큰 세대.** `token_revision`은 새 토큰을 저장할 때와 재인증 전이로 토큰을 파기할 때 올립니다. 같은 토큰을 다시 암호화할 때는 올리지 않습니다. 외부 호출 결과(일일 점검, 충돌 점검, worker의 토큰 무효)는 읽었던 `token_revision`이 그대로일 때만 적용하고 다르면 버립니다. 외부 호출 중에는 DB 잠금을 잡지 않습니다. 규칙 생성의 게시물 소유 확인도 연결 행 잠금 밖에서 부르고(페이지 순회 최대 10쪽), 호출 뒤 연결 행을 잠가 한도·중복과 계정을 다시 검사한 다음 채널 주소 생성과 규칙 저장을 같은 트랜잭션으로 합니다.

**해제.** `DELETE /api/me/instagram`은 구독 해제를 시도하고(실패 무시) 연결 행을 삭제합니다. 규칙과 내역도 함께 지워지며 화면에 그렇게 안내합니다. 운영자 정지(`operator_paused_at`)가 있으면 행을 지우지 않습니다. 재인증 전이(토큰 파기·`pending` 취소)를 하고 규칙을 보관한 뒤 행을 남기며, 구독 해제 뒤에 행을 잠그고 다시 읽어 호출 중에 걸린 정지도 놓치지 않습니다. 재연결(같은 `user_id`)은 그 행을 갱신하므로 정지가 유지됩니다. 응답은 똑같이 204이고, 데이터 삭제 콜백은 운영자 정지와 관계없이 행을 지웁니다.

**데이터 삭제 콜백.** HTTPS, `signed_request` 검증, `{url, confirmation_code}` 응답입니다 `[문서]`. `meta_user_id`로 연결을 찾아 삭제하고, 일반 해제로 연결 행이 없어도 소유 대응표(`instagram_opt_out_owners`)로 `ig_user_id`를 찾아 그 수신 거부 기록과 대응표 행을 같은 트랜잭션에서 파기합니다. 못 찾아도 같은 응답을 줍니다. 응답 `url`은 `{WEB}/privacy/instagram-deletion/{code}`입니다. `user_id` 대응이 안 되면(S9) 콜백 대신 안내 URL과 제품 내 해제로 바꿉니다. 확인 페이지는 코드 존재 여부만 표시합니다. 댓글 작성자는 앱을 승인한 적이 없어 콜백이 오지 않습니다 `[M?]`. 90일 자동 파기와 처리방침의 문의 경로로 대응합니다.

## DM 링크와 측정

**측정할 수 있습니다.** 규칙을 만들 때 `instagram`/`dm` 프리셋(E13)으로 규칙 전용 코드를 만들고, DM에는 `{SHORT}/s/{code}`만 넣습니다.

- 임의 URL을 받지 않아 피싱 표면이 없고, 도착지는 R14 검사를 받는 랜딩입니다.
- `utm_campaign`은 `dm-<키워드>-<public_id 앞 6자>`로 정규화합니다.
- `/s/{code}` 처리로 UTM이 저장되고(E13), 기존 통계의 `utm_id` 분포에서 코드별로 봅니다(E14). 봇 UA는 제외되며 `facebookexternalhit`도 포함됩니다.
- 규칙이 한도(50/200)를 소모합니다. 초과하면 기존 409를 그대로 돌려줍니다.
- 규칙 생성은 코드 생성과 규칙 저장을 한 트랜잭션으로 묶습니다. 저장이 실패하면 코드도 되돌아가므로 실패한 시도가 주소를 소모하지 않고, 같은 조합은 기존 코드를 돌려줍니다.
- 수신자별 클릭은 측정하지 않습니다. 수신자별 코드는 개인 추적이 되므로 만들지 않습니다.
- 새 집계 쿼리를 만들지 않습니다. 화면에서는 규칙의 코드와 통계 화면 링크만 보여 줍니다.
- 1회 탭이 1회로 세어지는지, 미리보기 크롤러가 잡히는지는 S6으로 확인합니다.

## API 계약 초안

`packages/shared/src/instagram-dm.ts`와 `CRELINK_API_PATHS`, 오류 코드로 확정합니다. 공통 오류는 401, 403 `page_owner_only`, 503 `instagram_not_configured`입니다.

| 메서드·경로 | 권한 | 요청 | 성공 | 오류 |
| --- | --- | --- | --- | --- |
| `GET /api/me/instagram` | 소유자 | 없음 | `{ available, connection: null \| { igUsername, status, paused, operatorPaused, connectedAt, tokenExpiresAt }, limits }`. `status`는 `active`·`messages_access_required`·`reauth_required`, `tokenExpiresAt`은 null 허용 | 공통 |
| `POST /api/me/instagram/connect` | 소유자·사람 | 없음 | `{ authorizationUrl }`, state 쿠키 | 403 `instagram_unavailable` |
| `POST /api/me/instagram/callback` | 로그인·사람 | `{ code, state }` | `InstagramConnectionView` | 400 `oauth_state_invalid`, 409 `instagram_account_in_use`, 409 `instagram_account_selection_required`, 409 `instagram_operator_paused`, 422 `instagram_account_not_professional`, 502 `instagram_upstream_failed` |
| `POST /api/me/instagram/recheck` | 소유자 | 없음 | 연결 뷰. `messages_access_required`를 `active`로 되돌림. 다음 발송 결과가 실제 확인이다 | 공통 |
| `DELETE /api/me/instagram` | 소유자 | 없음 | 204(운영자 정지 중이면 행 유지, `해제` 참고) | 공통 |
| `PUT /api/me/instagram/pause` | 소유자 | `{ paused }` | 연결 뷰 | 409 `instagram_operator_paused` |
| `GET /api/me/instagram/media` | 소유자 | `?after=` | `{ items: [{ id, caption, permalink, thumbnailUrl, timestamp }], nextCursor }` 25건 | 409 `instagram_reauth_required`, 502 |
| `GET /api/me/instagram/rules` | 소유자 | 없음 | `{ rules: [InstagramDmRuleView] }` 상한 10 | 공통 |
| `POST /api/me/instagram/rules` | 소유자 | `{ mediaId, keyword, message }`. `message` 상한 250자 | 201 규칙 뷰 | 400 `validation_failed`, 409 `instagram_rule_limit_reached`, 409 `instagram_rule_media_taken`, 409 `channel_link_*` |
| `PATCH /api/me/instagram/rules/:publicId` | 소유자 | `{ keyword?, message?, enabled? }`. `message` 상한 250자 | 규칙 뷰 | 400, 404 `instagram_rule_not_found` |
| `DELETE /api/me/instagram/rules/:publicId` | 소유자 | 없음 | 204(보관) | 404 |
| `GET /api/me/instagram/deliveries` | 소유자 | `?cursor=&rule=` | `{ items: [{ id, ruleId, keyword, mediaPreview, status, createdAt, sentAt }], nextCursor }` 20건, keyset(`common/cursor.ts`) | 400 |
| `GET·PUT /api/admin/instagram-dm` | 운영자 | `{ audience }` | 설정 뷰 | 400, 감사 기록 |
| `PUT /api/admin/instagram-dm/connections/:userId/pause` | 운영자 | `{ paused }` | 204 | 404, 감사 기록 |
| `GET·POST /api/webhooks/instagram` | 서명 | Meta 형식 | 200 | 403, 503 |
| `POST /api/webhooks/instagram/data-deletion` | `signed_request` | 폼 | `{ url, confirmation_code }` | 403 |
| `GET /api/public/instagram-deletions/:code` | 공개 | 없음 | `{ processedAt }` | 404 |
| `POST /api/public/instagram-dm-opt-outs` | 공개, BFF의 같은 출처 검사 사용, 기존 공개 쓰기 경로(`apps/api/src/telemetry/landing-events.service.ts`)와 같은 수준의 IP 요청 한도 | `{ token }` | 204, 멱등. 수신 거부 기록과 그 사람의 `pending` 취소를 한 트랜잭션으로 | 400 `opt_out_invalid`, 429 |

- 수신 거부 토큰은 서버에 저장하지 않는 서명 토큰입니다(`ig_user_id`, `commenter_hash`, MAC 앞 16바이트, 키는 `INSTAGRAM_OPT_OUT_KEY`, 만료 없음). `commenter_hash` 32바이트를 포함해 base64url 약 90자이며, 이 길이를 더한 `message_body` 전체가 S11의 상한 안에 드는지 0253의 시험으로 확인합니다. 경로가 아니라 URL 프래그먼트(`#t=`)로 보내 서버 로그에 남지 않습니다.
- 수신 거부는 GET으로 처리하지 않습니다. 링크 미리보기 크롤러가 거부를 일으키면 안 되기 때문입니다.
- 응답에는 `commenter_hash`, `comment_id`, 토큰, `failure_code` 원문을 넣지 않습니다. 화면에는 `status`만 보입니다.
- `CreatorLandingState`에 `instagramDmAvailable`을 더합니다. 메뉴 표시 전용이고 `platform_settings` 조회에 합칠 수 있습니다(`apps/api/src/creator/creator.service.ts:133`).
- `OperatorActionType`에 값을 더하고 커버리지 시험을 갱신합니다(E15).

## 화면 상태와 API 대응

화면은 메뉴 1개 아래 연결·규칙 1화면과 발송 내역 1화면, 운영자 스위치 카드 1개, 공개 수신 거부 페이지 1개가 상한입니다. 새 디자인 문서 없이 기존 컴포넌트를 씁니다. 앱 열은 범위 밖이라 뺐습니다.

| 화면 상태 | 조건 | 웹 |
| --- | --- | --- |
| 메뉴 숨김 | 편집자이거나 `instagramDmAvailable=false` | `MANAGER_MENU` 필터(E8) |
| 인앱 브라우저 | UA 판정 | "기본 브라우저에서 열어 주세요"와 주소 복사, 연결 버튼 비활성 |
| 미연결 | `connection=null` | 설명과 `인스타그램 연결` 버튼 |
| 연결 전 안내 | 미연결 | 프로페셔널·공개 계정 필요, 브라우저 로그인과 비밀번호 필요, `Allow access to messages` 켜기 안내 |
| 연결됨 | `status=active` | 계정명, 정지 스위치, 규칙 영역, 해제(EditSheet 확인, 첫 초점 취소) |
| 메시지 접근 꺼짐 | `messages_access_required` | 켜는 방법과 `다시 확인` 버튼 |
| 재연결 필요 | `reauth_required` | "연결이 끊겼어요. 다시 연결해 주세요", 자동 재시도 없음 안내, 규칙 읽기 전용 |
| 만료 임박 | `tokenExpiresAt` 14일 이내 | 재연결 안내(값이 없으면 표시 없음) |
| 연결 실패 | 409 `in_use`, 422, 502, 400 state, 동의 거부 `instagram_access_denied`(콜백 route가 `?instagram_error=`로 전달) | 코드별 문구, `ActionStatus` |
| 계정 선택 오류 | 409 selection | 하나만 골라 다시 연결 안내 |
| 운영자 정지 | `operatorPaused=true` | 스위치 비활성, 안내 |
| 규칙 없음 | `rules=[]` | 안내와 `규칙 추가` |
| 게시물 선택 | `/media` | 목록과 더 보기, 빈 상태, 502 재시도 |
| 규칙 편집 | 입력 | 키워드, 메시지(글자 수, 상한 250), 한도 안내, 코드와 통계 링크 |
| 내역 로딩·빈·오류 | `/deliveries` | 스켈레톤, 빈 안내, 재시도 |
| 내역 행 | `status` | `대기`, `보냄`, `실패`, `확인 필요`(`unknown`), `시간 초과`, `취소` |
| 수신 거부 페이지 `/dm-opt-out` | 공개, 프래그먼트 `#t` 토큰 | 확인 버튼, 완료, 유효하지 않음(400 `opt_out_invalid`). `ROBOTS_DISALLOW`에 `/dm-opt-out` 추가 |

규칙 화면의 기본 문구, placeholder, 예시에 "댓글해야만 받는 독점 콘텐츠" 표현과 팔로우 조건을 넣지 않습니다 `[문서]`. 서버 문구 검사는 만들지 않습니다.

390px·1280px에서 가로 넘침이 없어야 합니다.

## 권한·보안·개인정보

소유자 전용, 토큰 암호화, 작성자 HMAC 저장, 로그 차단은 위 절에 있습니다. 여기서는 처리방침·약관 변경 항목을 정리합니다.

**처리방침·약관 변경 항목(E17, A7, 같은 배포).**

1. 크리에이터 수집 항목: Instagram 계정 ID·사용자명·계정 유형, 암호화한 토큰, 지정 게시물 ID·캡션 일부
2. 새 절 `인스타그램 댓글 자동 DM`: 키워드가 일치한 댓글의 ID와 작성자 식별값의 해시. 원문과 사용자명은 저장하지 않음
3. 이용 목적: 크리에이터 지정 링크 DM 발송, 중복 발송 방지
4. 보관: 90일, 연결 해제와 삭제 요청 시 즉시
5. 제공·국외 이전: Meta로 전송되는 DM 내용과 댓글 ID. 이전받는 자·국가·표현은 법률 검토 대상
6. 크리에이터와 크리링의 처리 관계(위탁 여부)는 법률 검토 대상
7. 열람 권한: 소유자만, 공동 관리자 제외
8. 삭제 요청 경로와 Meta 콜백, 확인 페이지 주소
9. 약관 금지 조항과의 관계 정리, 크리에이터의 메시지 내용 책임
10. 토큰이 Meta Business 포트폴리오에 연결되는 시스템 사용자 토큰이라는 점
11. DM 수신 거부 수단과 처리. 수신 거부 기록은 일반 해제·재연결 뒤에도 유지하고, 크리링 회원 탈퇴와 Meta 데이터 삭제 요청 때 즉시 파기한다는 점
12. 약관에 크리에이터가 팔로우 조건을 붙이거나 수신 거부를 우회하지 못한다는 조항

## 비기능 요구

- 웹훅은 외부 호출 없이 규칙 조회 1회와 짧은 저장 트랜잭션 1회입니다. 목표는 p95 500ms 이내(0269에서 측정)이고 Cloudflare 경유 제외값입니다.
- 모든 목록에 상한이 있습니다(`/media` 25, `/deliveries` 20 keyset, 규칙 10/100). 규칙 조회와 claim에 N+1이 없습니다.
- 지표는 `crelink.instagram.webhook{result}`, `crelink.instagram.dm{result}`이고 웹훅 본문 크기를 남깁니다. 속성은 낮은 카디널리티만 씁니다. 정책 제재와 `reauth_required`는 Sentry에 경고를 남깁니다.

## 위험과 스파이크

**위험.**

1. **크리에이터 온보딩이 더 무거워질 수 있습니다.** 토큰이 고객 포트폴리오에 묶이고 `[문서]`, 로그인은 브라우저와 비밀번호를 요구합니다. PRD 대상은 "인스타그램 계정을 가진 사람"입니다. 포트폴리오나 Facebook 페이지가 필수이면 대상 사용자가 줄어듭니다 `[M?]`. S10으로 확인하고, 필수로 확인되면 사용자가 계속 진행할지 정합니다(K6).
2. **실제 웹훅을 검수 전에 못 볼 수 있습니다.** 문서가 충돌합니다 `[문서]`. S2가 안 되면 사용자 결정(A3a)에 따라 실제 웹훅 없이 구현하고 스위치는 `off`를 유지합니다.
3. **토큰 무효를 늦게 알 수 있습니다.** 해제 콜백이 미확인이므로 이벤트가 없으면 오류도 없습니다. 일 1회 토큰 점검으로 덮고, 최대 24시간 지연을 수용합니다.
4. **자동 DM이 망법 제50조의 광고성 정보에 해당할 수 있습니다(E18).** 키워드 댓글을 수신 동의로 볼 수 있는지 법률 검토 전입니다. `[미정]`에 올렸습니다.
5. **중복 0건을 지키면 일부는 미발송이 됩니다.** 결과를 모르는 호출은 재시도하지 않기 때문입니다. 플랫폼이 같은 `comment_id` 재호출을 거부한다고 실측되면 완화합니다(S4).
6. **서버가 1대입니다(E16).** 장애는 36시간 재전송 `[문서]`으로 받지만 24시간 지난 댓글은 보내지 않습니다. 대응은 다중화가 아니라 24시간 신선도 규칙입니다.
7. **토큰 키가 유출되면 모든 연결이 위험합니다.** 키를 잃으면 재연결이 필요하지만 데이터 손실은 아닙니다.

**스파이크 0252.** 회사 계정, Standard Access 범위에서 저장소 밖 임시 코드와 로컬 터널로 실행합니다. 운영 DB와 운영 도메인은 쓰지 않습니다. 토큰은 문서에 적지 않고 시험 뒤 앱 시크릿 회전 여부를 보고합니다. 토큰 패턴 grep은 `EAA\|IGAA`입니다.

| # | 질문 | 막는 티켓 | 끝낼 조건 |
| --- | --- | --- | --- |
| **S1 (①)** | 대시보드 Test 샘플 수신, `X-Hub-Signature-256` 검증 | 0257 | 로컬 터널에서 raw 바이트 검증 통과, 샘플 형식 기록 |
| **S2 (②)** | 앱 역할 보유 계정의 실제 댓글로 웹훅이 오는가 | 전체 판단 | 공개 게시물에 역할 보유·미보유 계정이 각각 댓글. Dev/Live 각각 수신 여부와 Advanced Access 상태 기록 |
| **S3 (③)** | `comment_id` 비공개 답장 호출. S2와 독립 | 0258 | `GET /<media>/comments`로 얻은 ID로 호출, 수신 계정 화면 확인 |
| S4 | 같은 `comment_id` 재호출 결과 | 0258 | 두 번째 응답 코드 기록 |
| S5 | 실제 원문의 `value.id`/`value.comment_id`, 캐러셀의 `media.id` | 0254, 0257, 0260 | 필드표와 캐러셀 처리 결정. S2 실패 시 Advanced 뒤로 이월 |
| S6 | `/s/{code}`와 수신 거부 링크 포함 DM의 전달, 크롤러, 탭 1회 기록 | 0260 | visits·page_view 건수, 수신 거부 링크의 `#t=` 프래그먼트 유지 여부 |
| S7 | Unified 토큰 발급, 추가 권한, 만료 값, IG ID 조회, 계정 복수 | 0254, 0256 | 응답 형식표 |
| S8 | 메시지 접근 꺼짐과 토큰 무효의 오류 코드, BUC 헤더 형식 | 0258 | 코드표 |
| S9 | 데이터 삭제 콜백 `user_id`와 해제 콜백 존재 여부 | 0257 | 호출 원문(비식별) 또는 문서 근거 |
| S10 | 크리에이터에게 포트폴리오나 Facebook 페이지가 필요한가 | 제품 판단 | 빈 계정으로 실측 |
| S11 | 메시지 길이 단위와 상한 | 0253, 0260 | 경계값 실측 |

**S2가 안 될 때의 경로.** S1·S3이 통과했으면 멈추지 않고 다음 순서를 따릅니다.

1. "실제 웹훅은 Advanced Access 필요"로 기록합니다. S5는 이월합니다.
2. A3a는 사용자 결정(2026-11-11)으로 "구현 진행, 스위치 `off` 유지"입니다. 실제 웹훅은 검증하지 못한 채 진행합니다.
   - 파서는 두 ID(`value.id`, `value.comment_id`)를 모두 받고 시험은 S1 샘플을 재사용합니다.
   - migration은 추가 전용이며 스위치는 `off`로 둡니다.
   - 완료 보고에 실제 Meta 연동 미검증을 명시합니다.
3. 0269까지 완료하되 A4(실발송)는 Advanced 뒤로 미룹니다. BV, Review, Advanced, Live를 진행하는 0270은 보류입니다(사업자 확보 후 재개).
4. 사업자 확보와 승인 뒤 S2·S5를 재실행합니다. 이것이 `operators` 전환의 관문입니다.

버린 대안은 두 가지입니다. 검수를 구현보다 먼저 하는 안은 동작하는 제품 없이 심사를 통과하기 어렵다고 판단했습니다 `[M?]`. 댓글 폴링 대체는 구조가 달라지고 한도를 소모합니다.

**멈출 조건.**

- **K1:** S1 실패, 서명 검증 불가 → 중단.
- **K2:** S3 실패 → 중단.
- **K3:** S6에서 단축 도메인과 본 도메인 모두 차단 → 중단.
- **K4:** Advanced 승인 뒤에도 S2 실패 → 출시 중단, 조사. 스위치는 `off` 유지. 사업자 확보 후 해당합니다.
- **K5:** BV 또는 App Review 거절이 해소되지 않음 → 회사 계정 전용으로 남길지 사용자 결정. 사업자 확보 후 해당합니다.
- **K6:** S10에서 대상 크리에이터 대부분이 연결 불가 → 사용자 결정.
- 멈추지 않음: S2 실패(위 경로), S4 중복 허용(`unknown` 재시도 금지 고정), 캐러셀 불일치(후속으로).

## 디자인 검토 의견

새 시각 요소는 없고 기존 컴포넌트를 재사용합니다(0241·0246과 같음). `/media` 썸네일의 CDN 표시 가능 여부와 CSP는 0264에서 확인합니다(웹 설정의 CSP 유무를 이번에 확정하지 못했습니다).

## 티켓 분해

배치는 요청 분담을 따르며 고친 점은 표 뒤에 적었습니다. 시험 명령은 `make up` 후 실행합니다. `pnpm --filter @crelink/api test -- <패턴>`은 해당 시험 파일을 대상으로 하며, `pnpm work:scope NNNN`은 모든 티켓의 공통 조건입니다.

| 번호 | 역할 | 내용 | 위험 | 담당 | 선행 | 소유 경로 | 수용 기준(명령 → 기대) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0251 | 에픽 | 댓글 자동 DM MVP | R3 | 메인 세션 | A0 | `docs/work/epics/0251-*` | `pnpm work:check` 통과 |
| 0252 | orchestrator | 스파이크(S1~S11, S2 실패 경로 포함) | R3 | Opus high | A0~A3 | `docs/references/instagram-comment-dm.md` | S1~S11 실측·날짜, 토큰 패턴(`EAA\|IGAA`) grep 0건, `pnpm docs:check` 통과 |
| 0253 | api | 공유 계약: 새 상태, recheck, 수신 거부, 250자, 새 오류 코드 | R1 | Luna high | 0252 | `packages/shared/src/instagram-dm.ts`, `index.ts`, `crelink.ts`(경로·오류·행동 타입만) | `pnpm --filter @crelink/shared test`, `pnpm typecheck` 통과 |
| 0254 | api | migration(위 스키마)·모듈 뼈대·설정(`META_*` 키)·암호화·v27.0 상수·Sentry(`EAA` 스크럽) | R3 | Opus high | 0252 | `apps/api/migrations/0016_instagram_dm.sql`, `apps/api/src/instagram/{instagram.module,crypto,graph,빈 controller·service}.ts`, `config.service.ts`, `app.module.ts`, `monitoring/sentry.ts`, `.env.example`, `docs/**`, `test/health.e2e-spec.ts` | `pnpm --filter @crelink/api test -- "health\|migrations\|instagram-crypto\|sentry"` 통과. 복호화 AAD 위조 실패, 부분 설정 기동 거부, 토큰 스크럽 시험; Graph 오류 코드·서브코드만 로그에 남고 원문 오류는 버려지는 시험; `INSTAGRAM_OPT_OUT_KEY`를 포함한 부분 설정 기동 거부 |
| 0255 | api | 키워드 매칭 순수 함수 | R2 | Sol medium | 0252 | `apps/api/src/instagram/keyword{,.spec}.ts` | `... test -- keyword` 통과. NFC·공백·대소문자·포함·빈 입력 |
| 0256 | api | OAuth·Unified 연결·일일 토큰 점검 | R3 | Opus high | 0253, 0254 | `instagram/connection*.ts`, `token-health*.ts`, `test/instagram-connection.e2e-spec.ts` | `... test -- instagram-connection` 통과. state 위조·타 세션·재사용 거부, 이중 연결 409, 편집자·AI 거부, 토큰이 DB 평문·응답에 없음, 만료 값 있음·없음, 무효 시 토큰 파기·취소, 충돌 시 기존 토큰 점검, 계정 복수 409; 모든 `reauth_required` 전이가 공통 함수 하나로 상태·토큰 NULL·`pending` 취소를 한 트랜잭션에서 처리, 외부 호출 중 `token_revision`이 바뀌면 결과 버림, 키 버전 불일치 재암호화 |
| 0257 | api | 웹훅 수신·서명·데이터 삭제 콜백 | R3 | Opus high | 0253, 0254, 0255 | `instagram/webhook*.ts`, `raw-body.ts`, `signed-request.ts`, `app.setup.ts`, `test/instagram-webhook.e2e-spec.ts` | `... test -- instagram-webhook` 통과. 위조 403, 1바이트 변조 403, 커밋 전 응답 없음(DB 실패 503), 같은 웹훅 동시 20회에 행 1개, 미매칭 저장 0, 원문·`from.id` 저장 0, `value.id`·`value.comment_id` 양쪽, 1000건 배치 1회 INSERT, 수신 거부 대상 미저장, 24시간 초과 미저장; 불량 항목은 건너뛰고 유효 항목만 한 INSERT, 규칙 `version`·`enabled`·`archived_at` 재검사, `commented_at` 대체(`entry.time` 없음), 해시가 `ig_user_id` 기준, 삭제 콜백 때 `ig_user_id` 수신 거부 기록 파기 |
| 0258 | api | 발송 worker·재시도·레이트 | R3 | Opus high | 0253, 0254 | `instagram/worker*.ts`, `test/instagram-worker.e2e-spec.ts` | `... test -- instagram-worker` 통과. worker 2개 동시 실행에 fake Graph 1회, 불명 응답 재시도 0, 613/2534040·80002 레이트 대기와 헤더 대기, 메시지 접근 상태 전이, 토큰 무효 재시도 0과 `reauth_required` 전이, lease 만료 `unknown`, 종료 대기; 빈 슬롯 수만큼만 선점(프로세스당 5건), 호출 직전 재확인(스위치·정지·규칙 활성·lease), `message_body`로만 발송, 토큰 무효 결과는 `token_revision`이 같을 때만 적용, Graph 오류 원문이 로그에 없음 |
| 0259 | api | 긴급 정지 API·보존·파기 | R3 | Opus high | 0253, 0254 | `instagram/admin*.ts`, `retention/retention.service.ts`, `test/instagram-admin.e2e-spec.ts`, `test/operator-audit-coverage.e2e-spec.ts` | `... test -- "instagram-admin\|operator-audit"` 통과. off 시 대기 건 취소·claim 0, 운영자 정지는 크리에이터가 못 풂, 90일 초과 행 삭제, 수신 거부 기록은 90일 파기에서 빠짐, 일반 해제·재연결에서는 유지 |
| 0260 | api | 규칙 API·게시물 목록 | R2 | Sol medium | 0253, 0254 | `instagram/rules*.ts`, `creator/creator.module.ts`(export 1줄), `test/instagram-rules.e2e-spec.ts` | `... test -- instagram-rules` 통과. 한도, 250자, 게시물 중복 409, 소유자 전용, `/s/` 코드 연결, 캐러셀 처리(S5 결과), 문구 제약 없음; 규칙 수정·비활성화·보관이 `version`을 올리고 `pending`을 취소, 다른 크리에이터의 `publicId`는 404(조회·변경 모두 SQL에 소유자 조건) |
| 0261 | api | 발송 내역 API·가용 여부 | R2 | Sol medium | 0253, 0254 | `instagram/deliveries*.ts`, `creator/creator.controller.ts`, `test/instagram-deliveries.e2e-spec.ts` | `... test -- instagram-deliveries` 통과. 커서, 응답 키에 해시·comment_id 없음; 다른 크리에이터의 `rule` 필터와 내역은 404(SQL에 소유자 조건) |
| 0262 | infra | 공개 경로(2개만) | R3 | Opus high | 0252 | `infra/prod/Caddyfile`, `infra/prod/tests/caddy-routing.sh`, `infra/prod/verify.sh` | `bash infra/prod/tests/caddy-routing.sh` 통과. 새 경로 2개의 GET·POST만 API로, 그 밖은 기존과 같음 |
| 0263 | web | OAuth 콜백 route(Facebook 로그인 기준)·BFF 규칙(공개 수신 거부 규칙 포함) | R3 | Opus high | 0253 | `apps/web/src/app/me/integrations/instagram/callback/route.ts`, `lib/api/backend-rules.ts`, 해당 spec | `pnpm --filter @crelink/web test` 통과. 소유자 경로만 허용, 쿠키 전달 |
| 0264 | web | 연결·규칙 설정 화면, 메뉴 | R2 | Sonnet medium | 0253(mock 가능) | `apps/web/src/app/me/landings/[publicId]/instagram/page.tsx`, `components/manage/instagram/**`, `menu.tsx`, `ManagerShell.tsx` | `pnpm --filter @crelink/web test`, 390·1280에서 ego-browser로 상태표 확인, 기본 문구에 금지 표현 없음 |
| 0265 | web | 발송 내역 화면 | R2 | Sol medium | 0253(mock 가능) | `.../instagram/deliveries/page.tsx`, `components/manage/instagram-deliveries/**` | 위와 같음, 빈·오류·더 보기 |
| 0266 | web | 운영자 정지 카드 | R2 | Sonnet medium | 0253(mock 가능) | `components/admin/InstagramDmSetting.tsx`, `app/admin/ad-banners/page.tsx` | `pnpm --filter @crelink/web test`, off 전환 확인 |
| 0267 | web | 처리방침·약관·삭제 확인 페이지 | R2 | Sonnet medium | 0253, 0271, A7 | `app/(public)/privacy/**`, `app/(public)/terms/page.tsx` | `pnpm --filter @crelink/web test`, 위 12개 항목 대조 |
| 0268 | api | 계약·경계 시험 보강 | R1 | Luna high | 0257, 0258, 0260 | `apps/api/test/instagram-contract.e2e-spec.ts`, `packages/shared/src/instagram-dm.spec.ts` | `... test -- instagram-contract` 통과. 대상 경계값에 두 ID 필드 포함 |
| 0269 | orchestrator | 통합·독립 QA·꺼진 상태 배포 확인 | R3 | Opus high(`crelink-qa` 별도) | 0253~0268, 0271, 0272 | `tests/e2e/**`, `docs/reviews/**` | `pnpm ci:local --report` 통과, QA 합격, 수신 거부 시나리오, 배포 후 `audience=off`에서 웹훅 GET 응답. A2·A4 뒤 회사 계정 1건 실발송 확인(A4는 S2 재검증 뒤) |
| 0270 | orchestrator | **보류**(사업자 확보 후 재개): BV, Review, Advanced, Live 자료 | R3 | Opus high | 0269, A5 | `docs/references/instagram-app-review.md` | 사용 사례·영상·URL 목록 완성, `pnpm docs:check` 통과, 권한별 30일 이내 성공 호출 1건 이상 기록(`instagram_manage_comments`는 런타임에 안 쓰므로 `GET /<media>/comments` 1회 근거 필요), Data Use Checkup 일정 |
| 0271 | api | 수신 거부 API(서명 토큰 `POST { token }`) | R3 | Opus high | 0253, 0254 | `apps/api/src/instagram/opt-out*.ts`, `apps/api/test/instagram-opt-out.e2e-spec.ts` | `pnpm --filter @crelink/api test -- instagram-opt-out` 통과. 거부 뒤 해당 사람 `pending` 취소·재저장 0, GET으로 거부되지 않음; 서명 위조·변조 토큰은 400 `opt_out_invalid`, 같은 토큰 재요청은 204 멱등, 90일 뒤 토큰도 동작, 기록 저장과 `pending` 취소가 한 트랜잭션, 요청 한도 적용, 토큰·요청 본문이 로그·Sentry에 없음 |
| 0272 | web | `/dm-opt-out` 화면(프래그먼트 `#t` 토큰을 읽어 POST) | R2 | Sonnet medium | 0253 | `apps/web/src/app/(public)/dm-opt-out/**` | `pnpm --filter @crelink/web test` 통과, 390·1280 확인 |

**병렬 묶음.**

| 묶음 | 티켓 | 조건 |
| --- | --- | --- |
| G0 | 0252 단독. 메인 세션의 PRD·설계 정리와 동시 진행 | A0~A3 |
| G1 | 0253, 0254, 0255, 0262 | 0252 통과. 경로가 겹치지 않음 |
| G2 | 0256, 0257, 0258, 0259, 0260, 0261, 0263, 0264, 0265, 0266, 0271, 0272 | G1 머지. 공용 파일은 표의 한 티켓만 수정(`instagram.module.ts`는 0254가 미리 등록) |
| G3 | 0267(A7과 0271 계약 확정 뒤), 0268 | G2 일부 완료 |
| G4 | 0269 → 0270(보류) | 전체 완료 |

변경 기록 파일만 끝부분 충돌이 날 수 있고 병합 때 합칩니다. `backend-rules.ts`의 공개 수신 거부 규칙은 0263이 함께 넣습니다.

**배치에서 고친 점.**

1. **Luna의 "시험 보강"을 범위 축소.** 서명 위조, 중복 0건, 토큰 비노출 시험은 R3의 인수 기준이므로 구현과 같은 Opus 티켓에 둡니다. Luna(0268)는 DTO 형태와 경계값만 맡습니다.
2. **매칭 로직 분리.** 순수 함수만 Sol(0255)이고, 웹훅 필터 조건은 R3 경로라 Opus(0257, 0258)입니다.
3. **연결 UI와 콜백 분리.** 화면은 Sonnet(0264), 콜백 route와 BFF 허용 목록은 토큰·코드가 지나므로 Opus(0263)입니다.
4. **요청에 없던 작업 배정.** 발송 내역 API는 Sol(0261)입니다. 공개 경로는 Opus(0262)이고 운영자 카드와 처리방침은 Sonnet(0266, 0267)입니다. 공개 경로는 외부 노출이어서 R3로 봤습니다.
5. **스파이크를 묶음 맨 앞에 단독으로 뒀습니다.** 병렬화보다 우선합니다. K1~K3이면 migration과 구현이 모두 낭비되고, migration은 되돌리지 않기 때문입니다(E19).

R 등급의 정의 문서는 `docs/development`, `docs/alm`, `WORKFLOW.md`, `docs/work/TEMPLATE.md`, `.omp/skills`에서 찾지 못했습니다(저장소 전체를 본 것은 아닙니다). 그래서 지시문의 분담을 기준으로 적었습니다.

## 검증 계획

- **API e2e**: fake Graph(`GoogleOAuth`와 같은 경계, E9)로 전 경로를 확인합니다. 시나리오는 재전송 20회, 1000건 배치, 두 worker 동시 실행, 응답 불명, 토큰 무효, 정지, 삭제 콜백, 수신 거부, 공동 관리자 거부입니다.
- **Caddy**: `infra/prod/tests/caddy-routing.sh`를 Docker로 직접 실행합니다(CI에 없음).
- **화면**: 상태표 전부를 390·1280에서 확인합니다.
- **독립 QA 범위**: 서명 위조, 중복 0건, 원문 미저장, 토큰 비노출, 공동 관리자·AI 차단, 정지 즉시성, 파기, 수신 거부, 공개 랜딩과 `/s/` 회귀.
- **운영**: 머지 뒤 `audience=off`로 Deploy와 웹훅 GET을 확인합니다. 실제 발송은 A4 뒤 회사 계정 1건만 합니다.
- **미검증 범위**: S2가 실패한 채 진행하면 실제 Meta 웹훅 수신은 검증하지 못합니다. 완료 보고에 명시합니다.

## 승인 항목

사용자(이사회) 승인이 필요한 항목입니다.

| # | 시점 | 항목 |
| --- | --- | --- |
| A0 | 지금 | 설계 승인, PRD 수정, `미정` 결정 |
| A1 | 0252 전 | Business 포트폴리오 소유 Meta 앱 생성, Facebook Login for Business 구성. 사용자 본인이 로그인 |
| A2 | 0252 전 | 앱 시크릿 로컬 사용. 운영 SOPS 등록은 0269 전 별도 승인 |
| A3 | 0252 중 | 테스트 DM 최대 5건(재호출 1건 포함), 수신 계정 지정 |
| A3a | S2 실패 시 | 결정됨(2026-11-11): 구현 진행, 스위치 `off` 유지. 완료 보고에 실제 Meta 연동 미검증을 명시 |
| A4 | 0269 | 운영 `audience=operators`, 회사 계정 실발송 |
| A5 | 0270 | Business Verification, App Review, Advanced Access 요청, 앱 Live 전환. 사업자 확보 후 재개 |
| A6 | 검수 통과 후 | `audience=everyone`. 사업자 확보 후 재개 |
| A7 | 0267 전 | 처리방침·약관 문구, 법률 검토 여부 |
| A8 | 운영 시작 후 | 연 1회 Data Use Checkup 담당과 일정 지정. 사업자 확보 후 재개 |

## 미정

| 질문 | 선택지 | 추천 |
| --- | --- | --- |
| 망법 제50조 해당 여부와 DM 문구 | 법률 검토 / 크리에이터 책임 고지만 | 전체 공개(A6) 전 법률 검토 |
| 키워드 일치 방식 | 포함 / 완전 일치 | 포함(한국어 조사 때문). 오발송 위험은 수용 |

## 검토 기록

- 2026-11-11 Codex Sol xhigh 반대 의견 10건 검토, 전부 반영(6번으로 10번 해소). api·web·product 검토 전

## 변경 기록

- 승인 전 없음
- 2026-11-11 0269 통합 보정: 운영자 정지 중 해제 동작, 정지 중 재시도 복귀 취소, `instagram_access_denied`, 삭제 확인 주소 `/privacy/instagram-deletion/{code}` 반영
- 2026-11-11 0269 QA 결함 수정: `rule_version`, 다른 계정 재연결의 운영자 정지 유지, 호출 직전 수신 거부 판정, [잠금 순서](#잠금-순서) 고정, `instagram_opt_out_owners`, 규칙 생성의 트랜잭션 묶음과 외부 호출 중 잠금 제거 반영

## 나중으로 미룬 항목

- 일반 크리에이터 공개, 비즈니스 인증, 앱 검수 제출(사업자 확보 후)
- Advanced Access 후 다수 크리에이터 공개 운영 지표
- 규칙별 클릭 수 전용 화면
- 자동 정지 임계값(연속 실패 차단)
- 다중 키워드, 규칙 복제, 다중 서버 운영
- 편집자에게 읽기 권한 부여
- 연결 소유권 이전
