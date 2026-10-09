# AI 운영자 기술 설계

- 상태: 승인 (2026-10-10, 사용자 위임(2026-10-10, 에픽 0088 진행 기록)에 따른 AI 승인. 근거는 [검토 기록](#검토-기록))
- 작성일: 2026-10-10
- 에픽: `docs/work/epics/0088-ai-operator.md`
- 입력: [PRD](../product/crelink.md) `목표`·R23(①~⑧)·R24, 2026-10-10 사용자 결정(에픽 0088 진행 기록), [초기 사용자 모집 조사](../product/research/initial-user-acquisition.md), 기존 설계 [MVP](crelink-mvp.md)·[운영 배포](crelink-prod-deploy.md)·[광고 블록](crelink-ad-banner.md)·[방명록](crelink-guestbook.md), [작업 실행기](../development/agent-runner.md), 결정 [ADR 0015](../adr/0015-ai-operator.md)
- 설계 티켓: `docs/work/orchestrator/0091-ai-operator-design.md`

작성 절차와 분해 규칙은 [기술 설계와 티켓 분해](README.md)를 따릅니다. 사용자는 이 에픽의 설계·디자인 승인을 AI에 위임했습니다(2026-10-10). `[AI 결정]`은 그 위임에 따라 이 설계가 고른 안입니다. 디자인 산출물(`design/`)은 만들지 않습니다. 새 화면은 운영자 화면뿐이고 기존 운영자 화면의 구성 요소·토큰만 씁니다. `[AI 결정]`

## 핵심 결정

1. **AI 전용 계정**: `users.kind`(`human`·`ai`)로 사람과 구별합니다. AI 계정은 `role='operator'`이고 Google 신원이 없습니다. 로그인은 `Authorization: Bearer <토큰>`뿐이며, 토큰은 `api_tokens`에 SHA-256 해시만 저장하고 폐기·마지막 사용 시각을 둡니다. 토큰 발급은 운영 서버 API 컨테이너 안 CLI로만 합니다(사람 로그인·HTTP 발급 경로 없음).
2. **토큰 요청 경로**: 운영 API는 외부에 공개되지 않습니다(웹 BFF 뒤, [운영 배포 설계](crelink-prod-deploy.md)). 토큰 요청은 웹의 새 route handler `/api/agent/[...path]`를 지납니다. 이 경로는 쿠키를 넘기지도 돌려주지도 않고 `Authorization: Bearer`·`X-Crelink-Agent-Run`만 넘깁니다. 브라우저 BFF(`/api/backend`)와 그 Origin 검사는 바꾸지 않습니다. 쿠키를 쓰지 않으므로 CSRF 대상이 아니고, 교차 출처 브라우저는 `Authorization` 헤더를 붙인 요청을 CORS preflight 없이 보낼 수 없으며 이 경로는 CORS 허용 헤더를 내지 않습니다. 다층 방어로 `Origin` 헤더가 있는 요청(브라우저)은 거절합니다. `[AI 결정]`
3. **운영자 행동 기록**: 모든 `/api/admin/*` 쓰기와 토큰 발급·폐기는 같은 트랜잭션에서 `operator_actions`에 행위자(사람·AI·시스템), 행동, 대상, 관련 크리에이터, 전후 값, 실행 id, 시각을 남깁니다.
4. **AI 실행 기록**: `agent_runs`에 실행마다 시작·끝·상태·요약·한 일·다음 할 일·관련 PR/work item·모델/비용을 남깁니다. 실행 중 AI 쓰기는 `X-Crelink-Agent-Run` 헤더(진행 중인 자기 실행 id)가 있어야 합니다. 다음 실행은 직전 실행 기록을 읽어 이어 갑니다.
5. **멈춤 스위치**: `ai_operator_settings.paused`. 사람 운영자만 바꿉니다. 켜져 있으면 실행 시작이 `paused` 기록만 남기고 끝나며, 진행 중인 실행의 AI 쓰기도 즉시 409 `ai_operator_paused`입니다(실행 닫기만 허용).
6. **겹침 금지**: 실행 시작이 DB에서 원자적으로 확인합니다(진행 중 실행은 부분 유니크 인덱스로 최대 1개). 진행 중 실행이 있으면 409 `agent_run_in_progress`, 시작 뒤 90분이 지난 진행 중 실행은 `abandoned`로 닫습니다. 실행 호스트의 프리체크도 같은 상태를 먼저 봅니다.
7. **30분 트리거**: 운영자 Mac의 Orca 자동화가 `*/30 * * * *`(`Asia/Seoul`)에 프리체크(`scripts/ai-operator.mjs precheck`)를 돌리고, 통과하면 omp 에이전트를 `origin/main` 기준 새 worktree에서 실행합니다. 프롬프트는 [AI 운영자 헌장](../ops/ai-operator.md)을 읽게 합니다. 자동화 생성 명령은 스크립트가 출력합니다(`automation-command`). 기존 작업 실행기(`pnpm work:run`)는 work item을 하나씩 맡기는 도구이고, AI 운영자는 그 위에서 무엇을 할지 고르는 주기 실행입니다. AI 운영자가 실행기를 부를 필요는 없습니다. `[AI 결정]`
8. **지표**: `GET /api/admin/metrics`가 실사용자 수(PRD `목표` 정의)와 가입·방문·클릭·광고 배너 성과를 돌려줍니다. 이벤트 수치(0089)는 `events` 배열에 붙입니다.
9. **정책**: AI 운영자는 저장소 정책의 "배포·외부 공개 명시 요청", "main 머지 전 알림", "제품 방향은 사용자 결정", "운영 확인 전 알림"에서 헌장 범위만큼 예외입니다([ADR 0015](../adr/0015-ai-operator.md)). 사용자 데이터 파기·비밀값 노출·법·약관 위반은 예외가 없습니다.
10. **통합 브랜치**: 모든 티켓을 `work/0091-ai-operator-design` 한 브랜치·PR로 통합합니다([작업 관리](../work/README.md) `여러 역할을 한 브랜치에 묶을 때`).

## 요구 대응

| 요구 | 화면·상태 | API | 데이터 | 티켓 |
| --- | --- | --- | --- | --- |
| R23 ① 전용 계정·토큰·구별·폐기 | `/admin/agent-runs` `AI 계정` 절(토큰 목록·폐기), 크리에이터 목록·상세 `AI` 배지, 행동 기록의 행위자 배지 | Bearer 인증(모든 로그인 API), `PUT /api/admin/ai-operator/tokens/{id}/revoke`, CLI `issue-token` | `users.kind`, `api_tokens` | 0100, 0101, 0103, 0104, 0105, 0106, 0107 |
| R23 ② 권한 위임·AI 승인 근거 | — | — | — | 헌장·ADR(0108, 0091) |
| R23 ③ 행동 기록 | `/admin/actions`, 실행 상세의 행동 목록 | 모든 `/api/admin/*` 쓰기, `GET /api/admin/actions` | `operator_actions` | 0100, 0102, 0106 |
| R23 ④ 실행 기록(390px) | `/admin/agent-runs`, `/admin/agent-runs/{id}` | `POST·PATCH·GET /api/admin/agent-runs` | `agent_runs` | 0100, 0103, 0105, 0108 |
| R23 ⑤ 30분 트리거·겹침 금지 | — | `POST /api/admin/agent-runs` 409 | `agent_runs_one_running_idx` | 0103, 0108 |
| R23 ⑥ 멈춤 스위치 | `/admin/agent-runs` 멈춤 스위치 | `PUT /api/admin/ai-operator/pause`, 쓰기 409 `ai_operator_paused` | `ai_operator_settings` | 0101, 0103, 0105, 0108 |
| R23 ⑦ 법·약관 | — | — | — | 헌장(0108) |
| R23 ⑧ 실사용자 지표 | `/admin/agent-runs` 지표 카드, 크리에이터 상세 `지표 제외` | `GET /api/admin/metrics`, `PUT /api/admin/creators/{id}/metrics-exclusion` | `users.metrics_excluded_at` | 0100, 0102, 0103, 0105, 0106 |
| PRD `목표` | 지표 카드 `n / 100` | `AiOperatorMetrics.goal` | — | 0103, 0105 |
| R24 이벤트 지표 | 지표 카드(0089가 채움) | `AiOperatorMetrics.events`(확장 지점) | 0089 | 0089 계열 |

## 구성과 흐름

```text
Orca(운영자 Mac, */30, Asia/Seoul)
  ├─ precheck: git -C <기준 checkout> fetch → git show origin/main:scripts/ai-operator.mjs > 임시 파일 → node 임시 파일 precheck
  │     토큰 파일(600) 확인 → GET /api/agent/api/admin/ai-operator
  │       멈춤 → POST agent-runs(=paused 기록) → 종료 1(Orca가 건너뜀으로 기록)
  │       진행 중 실행(90분 안) → 종료 1
  │       연결 실패·Cloudflare 차단·설정 오류 → 종료 1
  │       그 밖 → 종료 0
  └─ omp 에이전트(새 worktree, origin/main 기준)
        헌장 읽기 → ai-operator.mjs start(POST agent-runs → run id 저장)
        → ai-operator.mjs context(직전 실행·지표) + work item·PR·Deploy 확인
        → 일 1개(운영 API는 ai-operator.mjs api …, 개발은 work 브랜치·PR·머지)
        → ai-operator.mjs finish(PATCH agent-runs: 상태·요약·한 일·다음 할 일·PR)

토큰 요청: ai-operator.mjs ─HTTPS─▶ Cloudflare ─▶ cloudflared(Tunnel) ─▶ edge Caddy ─▶ web `/api/agent/…`
           (Authorization·X-Crelink-Agent-Run만 전달) ─▶ api-<색> `/api/…` ─▶ PostgreSQL
사람 운영자: 브라우저 ─▶ web 서버 렌더·BFF(`cl_session`, Origin 검사) ─▶ API
```

### 웹 토큰 경로 `/api/agent/[...path]`

- 허용 경로(조각 경계 고정): `api/health`, `api/me`(정확 일치), `api/me/…`, `api/files/…`, `api/admin/…`. 그 밖은 404 `route_not_allowed`(웹 전용 코드, `CrelinkErrorCode`에 넣지 않음).
- 경로 조각이 비었거나 `.`·`..`(디코드 뒤)이면 404. 대상 URL을 만든 뒤 `target.pathname`을 허용 정규식 `^/api/(health|me)$|^/api/(me|files|admin)/`로 다시 검사합니다(점 조각 우회 방지).
- `Authorization`이 `Bearer ` 스킴이 아니면 401 `unauthenticated`로 API에 보내지 않습니다(`api/health` 포함). `Origin` 헤더가 있으면 403 `forbidden`.
- 요청 헤더는 `apiRequestHeaders({ Accept })`로 새로 만들고 `Authorization`·`X-Crelink-Agent-Run`만 복사합니다. 쿠키는 넘기지 않습니다. 상태 변경 요청 본문은 `arrayBuffer()`와 원래 `Content-Type`을 그대로 넘깁니다(multipart 포함).
- 응답은 상태·본문과 `content-type`·`cache-control`·`etag`·`last-modified`만 넘기고 `Set-Cookie`는 넘기지 않습니다. 오류 응답·헤더 고르기·upstream fetch는 기존 BFF와 공용 모듈로 뺍니다.
- 판정(허용 경로, 점 조각, Bearer 스킴, Origin, 넘길 헤더)은 `next`·`server-only`를 부르지 않는 순수 모듈 `src/lib/api/agent-proxy.ts`에 두고 `agent-proxy.spec.ts`로 시험합니다.

### 실행 사이 기억

`agent_runs`(요약·다음 할 일·관련 링크)가 원본이고, 긴 개발 작업의 상태는 work item `진행 기록`과 `work/NNNN-*` 브랜치에 둡니다. `context` 명령이 직전 실행 5개, 지표, 멈춤 상태를 한 번에 출력합니다.

## 데이터 모델

migration `apps/api/migrations/0004_ai_operator.sql`. 첫 줄 `SET LOCAL lock_timeout = '5s'`, 머리말에 잠금 실패 동작과 되돌리기 SQL 주석(0003 형식). NULL 허용·상수 기본값 컬럼과 새 테이블만 추가합니다(expand, [DB migration 운영 규칙](crelink-prod-deploy.md#db-migration-운영-규칙)).

```sql
-- users ALTER는 한 문장으로 잠금을 한 번만 잡습니다.
ALTER TABLE users
  ADD COLUMN kind text NOT NULL DEFAULT 'human' CHECK (kind IN ('human', 'ai')),
  -- 운영자가 시험 계정을 지표에서 뺀 시각. NULL이면 포함.
  ADD COLUMN metrics_excluded_at timestamptz,
  ADD CONSTRAINT users_ai_is_operator CHECK (kind <> 'ai' OR role = 'operator');
-- AI 계정은 이메일당 1개(ensure-account 동시 실행 방지).
CREATE UNIQUE INDEX users_ai_email_idx ON users (lower(email)) WHERE kind = 'ai';

CREATE TABLE api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- 원문 앞 12자(`crl_ai_` + 5자). 화면에서 토큰을 구별하는 데만 씁니다.
  prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX api_tokens_user_id_idx ON api_tokens (user_id);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'paused', 'abandoned')),
  trigger text NOT NULL CHECK (trigger IN ('schedule', 'manual')),
  host text CHECK (char_length(host) <= 60),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  -- 같은 멈춤 동안 이어진 paused 기록을 한 행으로 합친 횟수(1부터).
  paused_count integer NOT NULL DEFAULT 1 CHECK (paused_count >= 1),
  summary text CHECK (char_length(summary) <= 2000),
  actions jsonb NOT NULL DEFAULT '[]',
  next_steps jsonb NOT NULL DEFAULT '[]',
  refs jsonb NOT NULL DEFAULT '[]',
  model text CHECK (char_length(model) <= 100),
  cost_usd numeric(10, 4) CHECK (cost_usd >= 0),
  input_tokens bigint CHECK (input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens >= 0),
  CHECK ((status = 'running') = (ended_at IS NULL))
);
CREATE INDEX agent_runs_started_at_idx ON agent_runs (started_at DESC, id DESC);
-- 진행 중 실행은 최대 1개(겹침 금지의 DB 보장).
CREATE UNIQUE INDEX agent_runs_one_running_idx ON agent_runs ((true)) WHERE status = 'running';

CREATE TABLE operator_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_kind text NOT NULL CHECK (actor_kind IN ('human', 'ai', 'system')),
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  -- 행위자 이메일 사본(계정을 지워도 누가 했는지 남김). 운영자 화면에서만 보입니다.
  actor_email text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  -- 행동이 걸린 크리에이터(링크·배너 차단 등). 웹이 크리에이터 상세로 연결합니다.
  subject_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  run_id uuid REFERENCES agent_runs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operator_actions_created_at_idx ON operator_actions (created_at DESC, id DESC);
CREATE INDEX operator_actions_run_id_idx ON operator_actions (run_id) WHERE run_id IS NOT NULL;

CREATE TABLE ai_operator_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  paused boolean NOT NULL DEFAULT false,
  paused_reason text CHECK (char_length(paused_reason) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL
);
INSERT INTO ai_operator_settings DEFAULT VALUES;
```

- 보존: `agent_runs`·`operator_actions`는 지우지 않습니다(운영 감사 기록). 행동 기록의 전후 값에는 바뀐 필드만 담고 이메일·토큰을 넣지 않습니다. 사용자 계정을 지우면 `actor_user_id`·`subject_user_id`만 NULL이 됩니다.
- expand 안전성: 옛 API가 사용자를 만들면 `kind`는 기본값 `human`입니다. 롤백 뒤 옛 API는 Bearer를 모르므로 AI만 401입니다. 두 색이 함께 도는 배포 구간과 롤백 뒤에는 옛 API가 처리한 운영자 쓰기에 행동 기록이 남지 않습니다(위험 절).
- 되돌리기(운영 데이터가 생기기 전, 운영 DB는 명시적 승인 뒤 손으로): `DROP TABLE operator_actions, agent_runs, api_tokens, ai_operator_settings; DROP INDEX users_ai_email_idx; ALTER TABLE users DROP CONSTRAINT users_ai_is_operator, DROP COLUMN metrics_excluded_at, DROP COLUMN kind; DELETE FROM schema_migrations WHERE version = '0004_ai_operator';`.

## API 계약 초안

공유 타입은 `packages/shared/src/crelink.ts`의 새 절 `// ---------- AI 운영자 (R23) ----------`에 모읍니다(0089와 충돌을 줄이기 위해 한 절). 오류 형식은 기존 `ApiError`입니다.

### 인증·권한 규칙

- **공용 인증**: 세 가드(`SessionGuard`·`OperatorGuard`·`OptionalSessionGuard`)가 공용 `authenticateRequest(request)`를 씁니다. `Authorization: Bearer`가 있으면 쿠키를 보지 않고 토큰으로만 인증합니다. 형식 `^crl_ai_[A-Za-z0-9_-]{43}$`가 아니거나, 토큰이 없거나 폐기됐거나, 계정이 정지됐거나 `kind != 'ai'`면 401 `unauthenticated`입니다. `OptionalSessionGuard`도 잘못된 Bearer를 비회원으로 통과시키지 않고 401입니다. `last_used_at`은 1분에 한 번만 갱신합니다.
- **행위자**: 두 경로 모두 `request.sessionUser`(`{ id, email, role }`)를 채워 기존 `CurrentUser`를 그대로 씁니다. 행위자는 `request.actor = { userId, email, kind: 'human' | 'ai', runId }`와 새 `@CurrentActor()`로 따로 둡니다. `SessionUser`·`MeResponse` 계약은 바꾸지 않습니다.
- **메타데이터**: 예외는 Reflector 데코레이터로 표시하고 검사는 인증 직후 가드에서 합니다(파이프·업로드 전에 거절). `@ActorKinds('human')`·`@ActorKinds('ai')`, `@AgentRunExempt()`, `@AllowWhilePaused()`. 이 검사에 쓰는 provider는 `AuthModule`에서 export합니다.
- **오류 우선순위**: 401 `unauthenticated` → 403 `forbidden`(운영자 아님) → 403 `forbidden`(사람·AI 전용) → 409 `ai_operator_paused` → 409 `agent_run_required`.
- **실행 헤더**: AI의 상태 변경 요청(GET·HEAD 밖)은 `X-Crelink-Agent-Run: <uuid>`가 있어야 하고, 그 실행이 이 계정의 `running`이며 시작 뒤 90분 안이어야 합니다. 아니면 409 `agent_run_required`. 운영자 API와 크리에이터 API(`/api/me/*`) 모두 적용합니다. 예외(`@AgentRunExempt`): `POST /api/admin/agent-runs`, `PATCH /api/admin/agent-runs/{id}`(서비스가 소유자·running을 확인).
- **멈춤**: 멈춤이 켜져 있으면 AI의 상태 변경 요청은 409 `ai_operator_paused`. 예외(`@AllowWhilePaused`): `POST·PATCH /api/admin/agent-runs`. 가드 검사 뒤 쓰기까지의 짧은 경쟁은 행동 기록에서 막습니다: 행위자가 AI이면 `recordOperatorAction`이 같은 트랜잭션에서 `SELECT paused FROM ai_operator_settings FOR SHARE`로 다시 확인하고, `PUT pause`는 `FOR UPDATE`로 잡습니다. 그래서 운영자 쓰기는 원자적으로 막히고, `/api/me/*` 쓰기는 가드 검사로 막습니다.
- **사람 전용**(`@ActorKinds('human')`, AI면 403): 멈춤 스위치, 토큰 폐기, 지표 제외. AI가 스스로 멈춤을 풀거나 시험 계정 표시로 지표를 바꾸지 못하게 합니다.
- **AI가 운영자·AI 계정을 건드리지 못함**: 행위자가 AI이고 대상 계정이 `role='operator'` 또는 `kind='ai'`면 `creator.*` 쓰기(추가 슬롯, 정지, 배너 슬롯)는 403 `forbidden`. AI가 사람 운영자를 정지해 멈춤·토큰 폐기를 못 쓰게 만드는 일을 막습니다.
- **AI 전용**(`@ActorKinds('ai')`, 사람이면 403): 실행 시작·갱신.

### 경로

모든 경로는 로그인하지 않으면 401, 운영자가 아니면 403입니다(표에서는 생략).

| 메서드·경로 | 권한 | 요청 | 성공 응답 | 오류 |
| --- | --- | --- | --- | --- |
| `GET /api/admin/ai-operator` | 운영자 | — | `AiOperatorStatus` | — |
| `PUT /api/admin/ai-operator/pause` | 사람 | `SetAiOperatorPauseRequest` | `AiOperatorStatus` | 400 `validation_failed` |
| `PUT /api/admin/ai-operator/tokens/{tokenId}/revoke` | 사람 | — | `AiOperatorStatus`(멱등) | 404 `api_token_not_found`(형식 오류 포함) |
| `GET /api/admin/agent-runs?cursor=` | 운영자 | — | `AgentRunPage`(20개, 최신순) | 400 `validation_failed`(커서) |
| `GET /api/admin/agent-runs/{runId}` | 운영자 | — | `AgentRunDetail` | 404 `agent_run_not_found`(형식 오류 포함) |
| `POST /api/admin/agent-runs` | AI | `StartAgentRunRequest` | 201 `AgentRunView`(`running` 또는 `paused`) | 400, 409 `agent_run_in_progress` |
| `PATCH /api/admin/agent-runs/{runId}` | AI(자기 실행) | `UpdateAgentRunRequest` | `AgentRunView` | 400, 403(다른 계정의 실행), 404, 409 `agent_run_closed` |
| `GET /api/admin/actions?cursor=&actor=` | 운영자 | — | `OperatorActionPage`(50개, 최신순) | 400 `validation_failed`(`actor`는 `human`·`ai`·`system`, 커서) |
| `GET /api/admin/metrics` | 운영자 | — | `AiOperatorMetrics` | — |
| `PUT /api/admin/creators/{userId}/metrics-exclusion` | 사람 | `SetMetricsExclusionRequest` | `OperatorCreatorDetail` | 400, 404 `creator_not_found` |

- **`POST agent-runs`**: 한 트랜잭션에서 먼저 시작 뒤 90분(`AI_OPERATOR_LIMITS.staleRunMinutes`)이 지난 `running`을 `abandoned`(`ended_at = now()`)로 닫습니다(멈춤과 관계없이). 그다음 `ai_operator_settings`를 `FOR UPDATE`로 읽습니다. 멈춤이면 직전 실행이 같은 멈춤 동안(`started_at >= settings.updated_at`)의 `paused`일 때 그 행의 `ended_at = now()`, `paused_count + 1`로 바꾸고, 아니면 `paused` 행을 새로 만듭니다(`ended_at = started_at`). 멈춤이 아니면 남은 `running`이 있을 때 409, 없으면 `running` 행을 만듭니다. 유니크 부분 인덱스 위반도 409입니다.
- **`PATCH agent-runs`**: 서비스가 `SELECT … FOR UPDATE`로 실행을 잠그고 소유자(아니면 403)와 `running`(아니면 409 `agent_run_closed`)을 확인합니다. `status`는 `succeeded`·`failed`만 받고, 주면 `ended_at = now()`로 닫습니다. 요약·한 일·다음 할 일·관련 링크·모델·비용·토큰 수는 닫기 전까지 여러 번 고칠 수 있습니다. 행동 기록 대상이 아닙니다(실행 기록 자체가 기록). 입력 검사: 글은 `requiredText`와 `AI_OPERATOR_LIMITS` 길이, `refs[].url`은 `parseHttpUrl`(http·https만, 아니면 400).
- **커서**: 방명록과 같은 방식입니다. `?cursor=`, 응답 `nextCursor`, 원문 `{epoch 마이크로초}.{id}`의 base64url, `(started_at, id) <`·`(created_at, id) <` 비교. 방명록의 `parseCursor`를 `common`으로 옮겨 함께 씁니다.
- **지표 정의**(`GET /api/admin/metrics`)
  - 지표 대상 계정: `u.role = 'creator' AND u.kind = 'human' AND u.metrics_excluded_at IS NULL`.
  - **실사용자**: 지표 대상이고 `u.suspended_at IS NULL`이며 `EXISTS (SELECT 1 FROM links l WHERE l.user_id = u.id AND <보이는 링크>) OR EXISTS (SELECT 1 FROM portfolio_items p JOIN landings la ON la.id = p.landing_id WHERE la.user_id = u.id)`. `<보이는 링크>`는 공개 랜딩과 같은 `NOT l.hidden AND l.blocked_at IS NULL`이고, 상수 `VISIBLE_LINK_CONDITION`(`creator.service.ts`)으로 뽑아 공개 랜딩·관리 상태·단축 주소·지표가 함께 씁니다. 차단 도메인은 쓸 때 `links.blocked_at`에 반영되므로 따로 보지 않습니다.
  - **크리에이터**: `total`은 `role='creator' AND kind='human'` 수, `excluded`는 그중 `metrics_excluded_at IS NOT NULL` 수.
  - **가입**: 지표 대상 계정의 `created_at`이 지금부터 24시간·7일·30일 안.
  - **방문·링크 클릭**: 지표 대상 계정 단축 주소의 `visits`·링크 클릭, 지금부터 7일·30일. 기간으로 먼저 거른 뒤 계정 조건을 join합니다.
  - **광고 배너**: 게시 중 수는 `starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`. 노출·클릭은 `ad_banner_daily_stats`가 서울 날짜 단위라 "서울 날짜 오늘 포함 7일"(`day > (now() AT TIME ZONE 'Asia/Seoul')::date - 7`)입니다.
  - **이벤트**: `events: []`. 0089가 `{ key: 'slot_event_applications', label, value }`를 더합니다.

### 공유 타입 초안

```ts
export type AccountKind = 'human' | 'ai';
export type OperatorActorKind = 'human' | 'ai' | 'system';
export const AI_OPERATOR_LIMITS = { staleRunMinutes: 90, runPageSize: 20, actionPageSize: 50, summaryMax: 2000,
  listItemMax: 300, listItemsMax: 30, refsMax: 20, refLabelMax: 100, pausedReasonMax: 200, hostMax: 60,
  modelMax: 100, tokenLabelMax: 60, realUserGoal: 100 } as const;
export const AGENT_RUN_HEADER = 'X-Crelink-Agent-Run';
export const AI_TOKEN_PREFIX = 'crl_ai_';

export interface ApiTokenView { id; label; prefix; createdAt; lastUsedAt: string | null; revokedAt: string | null }
export interface AiAccountView { userId; email; createdAt; suspended: boolean; tokens: ApiTokenView[] }
export interface AiOperatorStatus { paused; pausedReason: string | null; updatedAt; updatedBy: string | null(이메일);
  accounts: AiAccountView[]; runningRun: AgentRunView | null; lastRun: AgentRunView | null }
export interface SetAiOperatorPauseRequest { paused: boolean; reason?: string | null }

export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'paused' | 'abandoned';
export type AgentRunTrigger = 'schedule' | 'manual';
export type AgentRunRefKind = 'pr' | 'work_item' | 'commit' | 'deploy' | 'other';
export interface AgentRunRef { kind: AgentRunRefKind; label: string; url: string | null }
export interface AgentRunView { id; status; trigger; host: string | null; startedAt; endedAt: string | null;
  pausedCount: number; summary: string | null; actions: string[]; nextSteps: string[]; refs: AgentRunRef[];
  model: string | null; costUsd: number | null; inputTokens: number | null; outputTokens: number | null;
  actorEmail: string | null; operatorActionCount: number }
export interface AgentRunPage { items: AgentRunView[]; nextCursor: string | null }
export interface AgentRunDetail extends AgentRunView { operatorActions: OperatorActionView[] }
export interface StartAgentRunRequest { trigger: AgentRunTrigger; host?: string | null; model?: string | null }
export interface UpdateAgentRunRequest { status?: 'succeeded' | 'failed'; summary?; actions?; nextSteps?;
  refs?: Array<{ kind; label; url?: string | null }>; model?; costUsd?; inputTokens?; outputTokens? }

export type OperatorActionType = 'creator.extra_slots' | 'creator.suspension' | 'creator.banner_slot'
  | 'creator.metrics_exclusion' | 'link.block' | 'banner.block' | 'blocked_domain.add' | 'blocked_domain.remove'
  | 'ad_banner.create' | 'ad_banner.update' | 'ad_banner.reorder' | 'ad_banner.end'
  | 'ai_operator.pause' | 'ai_operator.token_issue' | 'ai_operator.token_revoke';
export type OperatorActionTargetType = 'user' | 'link' | 'creator_banner' | 'blocked_domain' | 'ad_banner'
  | 'ai_operator' | 'api_token';
export interface OperatorActionView { id; createdAt; actor: { kind: OperatorActorKind; userId: string | null; email: string | null };
  /** OperatorActionType. 다른 에픽이 더한 행동도 오므로 string으로 받고, 모르는 값은 원래 키로 보여 줍니다. */
  action: string; targetType: string; targetId: string | null; subjectUserId: string | null;
  before: unknown; after: unknown; runId: string | null }
export interface OperatorActionPage { items: OperatorActionView[]; nextCursor: string | null }

export interface AiOperatorMetricEvent { key: string; label: string; value: number }
export interface AiOperatorMetrics { generatedAt; goal: { realUsers: number }; realUsers: number;
  creators: { total: number; excluded: number }; signups: { last24Hours; last7Days; last30Days };
  visits: { last7Days; last30Days }; linkClicks: { last7Days; last30Days };
  adBanners: { live: number; impressionsLast7Days: number; clicksLast7Days: number }; events: AiOperatorMetricEvent[] }
export interface SetMetricsExclusionRequest { excluded: boolean }
```

- `OperatorCreatorSummary`에 `accountKind: AccountKind`, `metricsExcluded: boolean`을 더합니다.
- 경로 상수(`CRELINK_API_PATHS`): `adminAiOperator`, `adminAiOperatorPause`, `adminApiTokenRevoke(id)`, `adminAgentRuns`, `adminAgentRun(id)`, `adminActions`, `adminMetrics`, `adminCreatorMetricsExclusion(id)`. 웹 경로 `CRELINK_WEB_PATHS.adminAgentRuns`·`adminAgentRun(id)`·`adminActions`와 토큰 경로 접두사 `AI_AGENT_PROXY_PATH = '/api/agent'`.

### 오류 코드

| 코드 | 상태 | 웹 문구(`apps/web/src/lib/api/errors.ts`) |
| --- | --- | --- |
| `agent_run_not_found` | 404 | 실행 기록을 찾을 수 없어요. |
| `agent_run_in_progress` | 409 | 다른 AI 실행이 진행 중이에요. |
| `agent_run_closed` | 409 | 이미 끝난 실행 기록이에요. |
| `agent_run_required` | 409 | 진행 중인 AI 실행 기록이 필요해요. |
| `ai_operator_paused` | 409 | AI 운영자가 멈춤 상태예요. |
| `api_token_not_found` | 404 | 토큰을 찾을 수 없어요. 화면을 새로 고쳐 주세요. |

`errors.ts`는 모든 `CrelinkErrorCode`를 요구하므로 계약 티켓 0100이 웹 문구까지 함께 넣습니다(0067 선례).

### 행동 기록 규칙

- 상태가 없는 자유 함수 `recordOperatorAction(client, actor, { action, targetType, targetId, subjectUserId, before, after })`(`src/ai-operator/audit.ts`)를 쓰기와 같은 트랜잭션에서 부릅니다. CLI도 같은 함수를 씁니다(`actor.kind = 'system'`). 쓰기가 실패하면 기록도 없습니다. 값이 바뀌지 않은 멱등 요청(예: 이미 끝난 배너 `end`)도 기록합니다.
- 트랜잭션: 지금 트랜잭션 없이 쓰는 `setExtraSlots`·`setBannerSlot`·`setLinkBlock`·`setBannerBlock`·`removeBlockedDomain`을 `database.transaction`으로 감싸고, 안에서 `SELECT … FOR UPDATE`로 이전 값을 읽습니다. `setBannerSlot`은 users 행을 먼저 잠그는 순서를 지킵니다. `removeBlockedDomain`은 `DELETE … RETURNING domain, reason`입니다. 모든 admin 쓰기 핸들러가 `@CurrentActor()`를 받습니다.
- 대상·전후 값: `creator.*`는 `user`·userId(=subject)와 바뀐 필드(`extraSlots`, `suspended`, `bannerSlotGranted`, `metricsExcluded`), `link.block`·`banner.block`은 `link`·`creator_banner`와 `blocked`·`reason`(subject는 소유자), `blocked_domain.*`은 `domain`·`reason`(추가의 after에는 함께 차단·종료된 링크·배너·크리링 배너 수), `ad_banner.*`은 바뀐 필드(이미지 id·alt·url·기간·순서), `ai_operator.pause`는 `paused`·`reason`, `ai_operator.token_*`은 토큰 id·label·prefix(원문·해시 없음).
- 0089처럼 나중에 더하는 운영자 쓰기도 같은 함수를 씁니다(0089: `slot_event.period_update`).

## CLI(토큰 발급)

`apps/api/src/cli/ai-operator.ts` → 빌드 `apps/api/dist/cli/ai-operator.js`(반드시 `src` 아래. 밖에 두면 `nest build`의 rootDir이 바뀌어 `dist/main.js` 경로가 깨짐). 진입은 `if (require.main === module)`로 감싸 jest가 명령 함수를 직접 시험합니다.

- DB: `loadLocalEnvironment(<apps/api/.env 절대 경로>)` 뒤 `new Pool({ ...databaseConnectionConfig(process.env), max: 1, application_name: 'crelink-ai-operator-cli', connectionTimeoutMillis: 5000 })`. `AppConfig`·`instrument.ts`(Sentry)·Nest 앱은 부르지 않고 migration도 돌리지 않습니다. 테이블이 없으면(42P01) "0004가 적용된 API를 먼저 배포" 안내와 종료 1. 끝나면 `pool.end()`. 오류 메시지에 DATABASE_URL을 넣지 않습니다. `loadLocalEnvironment`는 파일 경로를 인자로 받게 고칩니다(기본값은 지금 경로).
- 계정 만들기: `AuthService.provision`을 자유 함수 `provisionAccount(client, { email, role, kind })`로 꺼내 로그인과 CLI가 함께 씁니다. 같은 이메일의 `kind='human'` 계정이 있으면 바꾸지 않고 실패합니다.
- 토큰 발급·폐기도 `issueApiToken`·`revokeApiToken(client, actor, …)` 함수로 두어 HTTP 폐기와 CLI가 함께 씁니다.
- 표준 출력에는 결과만(토큰은 원문 한 줄만), 진단은 stderr, 실패는 종료 코드 1.

| 명령 | 하는 일 |
| --- | --- |
| `ensure-account [--email ai-operator@crelink.invalid]` | AI 계정(`kind='ai'`, `role='operator'`)과 랜딩·단축 주소를 만들고(없을 때만) userId를 출력 |
| `issue-token --label <이름> [--email …]` | 계정이 없으면 만들고, 토큰을 만들어 **원문을 표준 출력 한 줄로만** 냄(해시만 저장). `ai_operator.token_issue`(`system`) 기록 |
| `list-tokens [--email …]` | 토큰 id·label·prefix·생성·마지막 사용·폐기(원문 없음), 탭 구분 |
| `revoke-token <id>` | 폐기(`ai_operator.token_revoke`, `system`), 멱등 |

- 로컬: `pnpm --filter @crelink/shared build && pnpm --filter @crelink/api build` 뒤 `node apps/api/dist/cli/ai-operator.js <명령>`(apps/api/.env의 이 worktree DB). API 패키지 스크립트 `pnpm --filter @crelink/api ai-operator <명령>`으로도 부릅니다.
- 운영: [런북 17](../../infra/docs/prod-runbook.md#17-ai-운영자-토큰). 활성 색 API 컨테이너에서 `sudo -n docker exec`(`-t` 없음)로 실행하고 출력을 바로 운영자 Mac `~/.config/crelink/ai-operator.env`(권한 600)로 옮깁니다. 연결 1개라 DB pool 여유(런북 12) 안입니다. 실패하면 `list-tokens`로 확인하고 남은 토큰을 `revoke-token`합니다. 토큰을 저장소·채팅·작업 로그·실행 기록에 쓰지 않습니다.
- 계정 이메일 `ai-operator@crelink.invalid`는 예약 최상위 도메인이라 실제로 메일이 가지 않습니다. `[AI 결정]`

## 실행 호스트 도구 `scripts/ai-operator.mjs`

Node 내장 모듈만 쓰는 단일 파일입니다(프리체크가 `git show origin/main:scripts/ai-operator.mjs`로 꺼내 실행). 설정은 `~/.config/crelink/ai-operator.env`(`CRELINK_AI_BASE_URL`(예: `https://links.shaul.kr/api/agent`), `CRELINK_AI_TOKEN`, 선택 `CRELINK_AI_HOST`·`CRELINK_AI_MODEL`)이고 환경변수가 우선합니다. 파일 권한이 600이 아니면 실패합니다. 진행 중 실행 id는 `~/.local/state/crelink/ai-operator/current-run`에 둡니다. User-Agent는 `crelink-ai-operator/1`입니다. 응답에 `cf-mitigated` 헤더가 있거나 403인데 JSON이 아니면 "실행 호스트가 Cloudflare에 차단됨(VPN·exit node 확인)"으로 종료 1입니다.

| 명령 | 동작 | 종료 코드 |
| --- | --- | --- |
| `precheck` | 설정·권한 확인 → `GET ai-operator`. 멈춤이면 `POST agent-runs`(paused 기록), 90분 안의 진행 중 실행이면 그대로 | 진행 가능 0, 그 밖 1 |
| `start [--trigger manual]` | `POST agent-runs` → 실행 id 저장·출력(커밋 트레일러 포함). paused·409면 1 | 0·1 |
| `context` | 멈춤 상태, 지표, 직전 실행 5개(요약·다음 할 일·링크)를 글로 출력 | 0·1 |
| `api <METHOD> <경로> [JSON\|@파일\|file=@이미지]` | 토큰·실행 헤더를 붙여 호출하고 응답 JSON 출력. `file=@`은 `POST /api/me/files` multipart | 2xx 0, 그 밖 1 |
| `finish --status succeeded\|failed --summary … [--action …]… [--next …]… [--ref kind=이름=URL]… [--cost …]` | `PATCH agent-runs/{id}` 후 실행 id 파일 삭제 | 0·1 |
| `automation-command [--repo <경로>]` | Orca 자동화 생성 명령 출력(프롬프트는 `docs/ops/ai-operator-prompt.md`) | 0 |

## 화면 상태와 API 대응

운영자 화면은 기존 `AdminShell`·표·카드 스타일과 디자인 토큰만 씁니다. 조회는 서버 렌더(`loadSignedIn`), 쓰기는 BFF(`browserApi`·`useAction`·`ActionStatus`·`router.refresh()`)입니다. 시각은 `lib/format.ts`의 `formatDateTime`(`Asia/Seoul`)이고, 걸린 시간·"진행 중 n분째"는 새 `formatDuration`으로 서버 컴포넌트에서 계산합니다. 지표 기간은 "최근 24시간·7일·30일"로 표기하고 `generatedAt`을 보입니다.

- **390px**: 실행 목록은 모든 폭에서 `<details>`/`<summary>` 카드 목록입니다(서버 컴포넌트만으로 펼치기). 행동 기록은 광고 배너 표의 쌓기 규칙(`styles.css` `.ad-banners-table`)을 공용 클래스 `.data-table.is-stacked`로 빼서 함께 씁니다(두 번째 방식을 만들지 않음).
- **페이지 이동**: 서버 렌더 링크 `이전 기록`(`?cursor=`)과 `처음으로`(커서 없음), 기존 `nav.pagination`을 씁니다.

| 화면 | 상태 | 조건(API) | 웹 |
| --- | --- | --- | --- |
| `/admin/agent-runs` | 로딩 | 서버 렌더 | 기존 `app/admin/loading.tsx` |
| | 정상(첫 쪽) | `AiOperatorStatus`·`AiOperatorMetrics`·`AgentRunPage` | 위: 멈춤 스위치(상태·사유·바꾼 사람(null이면 `—`)·시각), 진행 중 실행 표시(90분이 지났으면 "다음 실행 때 포기 처리됨"). 지표 카드(`stat-tiles`, 실사용자 `n / 100`, 가입·방문·클릭·광고, 이벤트). 실행 카드 목록(상태 배지·시작 시각·걸린 시간·요약, 펼치면 한 일·다음 할 일·관련 링크·모델·비용·토큰 수·행동 수, 상세 링크). 아래 `AI 계정` 절 |
| | 둘째 쪽부터 | `?cursor=` | 실행 목록만 그림(멈춤·지표·AI 계정 절 없음) |
| | 빈 상태 | `items` 0개 | "아직 AI 실행 기록이 없어요" + 헌장 설치 안내 |
| | 오류 | 상태·목록 실패 | `AdminShell` 오류(`retryHref='/admin/agent-runs'`). 잘못된 커서(400)도 커서 없는 주소로 |
| | 부분 오류 | 지표만 실패 | 지표 카드 자리에 `form-error role=alert`, 나머지는 그림 |
| | 멈춤 켜기·끄기 | `PUT pause` | `BlockControl` 방식(선택 사유 입력란, `maxLength = pausedReasonMax`, 확인). 진행 중 실행이 있을 때 켜면 확인 문구에 "진행 중 실행의 쓰기는 바로 막히고 기록 닫기만 됩니다". 실패는 오류 문구 |
| | AI 계정 없음 | `accounts` 0개 | "아직 AI 계정이 없어요" + 런북 17 안내 |
| | 유효 토큰 없음 | 계정의 `revokedAt` 없는 토큰 0개 | "쓸 수 있는 토큰이 없어요. 다음 실행부터 멈춥니다" |
| | 토큰 폐기 | `PUT revoke` | 유효 토큰마다 `폐기` 버튼(`window.confirm`). 마지막 유효 토큰이면 확인 문구에 "다음 실행부터 멈춥니다". 폐기된 토큰은 폐기 시각만. 404 `api_token_not_found`면 오류 문구와 `router.refresh()` |
| `/admin/agent-runs/{runId}` | 정상 | `AgentRunDetail` | 실행 전체 내용 + 그 실행의 행동 기록(아래 행 형식) |
| | 404 | `agent_run_not_found` | "실행 기록을 찾을 수 없어요" + `AI 실행 기록으로` 돌아가기(`AdminShell`에 `backHref`·`backLabel` prop) |
| `/admin/actions` | 정상·빈·오류 | `OperatorActionPage` | 걸러보기 링크(`?actor=` 전체·사람·AI·시스템, `aria-pressed`). 행: 시각·행위자 배지·행동 이름(`Record<OperatorActionType, string>` 한국어, 모르는 값은 원래 키)·대상·관련 크리에이터(`subjectUserId`가 있으면 상세 링크)·전후 값(JSON 글자, HTML로 해석하지 않음)·실행 링크. 빈 상태 "운영 기록이 없어요". 잘못된 커서·actor는 커서·걸러보기 없는 주소로 |
| `/admin` 목록 | 추가 | `accountKind`·`metricsExcluded` | 상태 칸에 `AI`·`지표 제외` 배지 |
| `/admin/creators/{userId}` | 추가 | 같은 필드 | `AI 계정` 배지. 사람 계정은 `지표 제외` 켜기·끄기(확인). AI 계정은 조작 대신 "AI 계정은 지표에 들어가지 않아요". AI 계정 정지 확인 문구에 "AI 토큰 인증도 막힙니다" |
| 운영자 메뉴 | — | — | `AI 실행 기록`·`운영 기록` 링크(390px에서 줄바꿈만, 가로 넘침 없음) |

- 관련 링크(`refs[].url`)는 http(s)일 때만 `<a target="_blank" rel="noopener noreferrer">`, 그 밖은 글자로 그립니다(API도 http(s)만 받음).
- BFF 허용 목록 추가: `PUT api/admin/ai-operator/pause`, `PUT api/admin/ai-operator/tokens/{ID}/revoke`, 기존 `(extra-slots|suspension|banner-slot)` 정규식에 `metrics-exclusion`. 조회 GET은 서버 렌더만 부르므로 넣지 않습니다.

## 권한·보안·개인정보

- 토큰: 256비트 무작위, 원문은 발급 때 한 번만 출력. DB에는 SHA-256 해시. 폐기 즉시 401. 유출 의심 시 런북 17의 폐기 → 재발급. 토큰은 로그·Sentry·응답에 쓰지 않습니다(API·웹 Sentry가 `authorization` 헤더를 이미 지움, ADR 0014).
- 비밀값 위치: 토큰 원문은 운영자 Mac `~/.config/crelink/ai-operator.env`(600)에만 둡니다. SOPS 암호문·CI·GitHub secret에 넣지 않습니다([환경과 비밀값 관리](../development/environment-secrets.md)에 적음).
- 웹 `/api/agent`: 위 [웹 토큰 경로](#웹-토큰-경로-apiagentpath). 요청 본문 한도는 edge Caddy 6MB(기존). Caddy 변경은 없습니다.
- AI 권한 범위: 운영자와 같은 API 권한(위임)에서 멈춤·토큰·지표 제외, 운영자·AI 계정 대상 `creator.*` 쓰기를 뺀 것. 계정 삭제·데이터 파기 API는 원래 없습니다.
- 행동 기록 열람은 운영자만. 전후 값은 바뀐 필드만.
- `/privacy`: 새 개인정보 수집 항목이 없어 고치지 않습니다(운영자 행동 기록은 운영자 계정의 서비스 운영 기록이고 크리에이터 정보는 이미 처리 중인 값의 변경 이력). `[AI 결정]`

## 비기능 요구

- 지표 질의는 운영자 화면·`context` 한 번에 1회, 사용자 수천 명에서 100ms 안(인덱스 `links_user_id_position_idx`, `landings.user_id` UNIQUE, `portfolio_items_landing_id_idx`, `visits_occurred_at_idx`, 링크 클릭 기간 인덱스). 넘으면 캐시 티켓을 따로 만듭니다.
- 토큰 인증은 요청마다 인덱스 조회 1회(`token_hash` UNIQUE) + 1분마다 `last_used_at` 갱신(`… AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`).
- `cost_usd`(numeric)는 node-pg가 문자열로 주므로 view에서 number로 바꿉니다.
- 실행 기록 화면은 390px에서 가로 넘침 없음.
- 관측: 실행 실패·포기는 운영자 화면에서 봅니다. 알림 채널은 두지 않습니다(헌장).
- 운영 주소 검사(`infra/prod/verify.sh`)에 `{WEB}/api/agent/api/health`(토큰 없음) 401을 더해 새 경로가 배포마다 살아 있는지 봅니다.

## 위험과 스파이크

| 질문·위험 | 막는 티켓 | 대응 | 끝낼 조건 |
| --- | --- | --- | --- |
| Orca `--precheck`의 작업 디렉터리·환경 | 0108 | 절대 경로·`git -C`로 디렉터리에 기대지 않게 함(스파이크 없음) | 프리체크가 어느 디렉터리에서도 같게 동작(로컬 실행) |
| `--provider omp` 실행이 프롬프트·권한(파일 쓰기·네트워크·`gh`)을 받는지 | 운영 적용 | 부모가 자동화를 만든 뒤 `orca automations run`으로 1회 | 실행 기록이 `succeeded`로 닫힘 |
| Cloudflare가 실행 호스트 요청을 막음 | — | 운영자 Mac(집 회선)에서 Authorization 헤더 요청이 200임을 실측(인프라 검토, 2026-10-10). VPN·데이터센터 IP면 막힐 수 있어 프리체크가 구분해 알림 | — |
| 배포 중 두 색 공존·롤백 뒤 옛 API의 운영자 쓰기에 행동 기록 없음 | — | 그 구간에는 AI 실행이 쓰기 전에 Deploy 완료를 확인(헌장 배포 절) | — |
| 운영자 Mac이 꺼지거나 네트워크가 바뀌면 실행이 빠짐 | — | 헌장에 적음. 빠진 실행은 다음 주기에 이어 감 | — |
| AI가 운영 쓰기를 잘못함 | — | 행동 기록·멈춤·토큰 폐기·자동화 끄기로 되돌림(ADR 0015) | — |

## 디자인 검토 의견

디자인 산출물 없음. 운영자 화면은 기존 구성 요소로 만들고 390px·1280px를 E2E 화면 확인으로 봅니다. `[AI 결정]`

## 티켓 분해

| 번호 | 단계 | 역할 | 선행 | 요구 | 수용 기준 요약(확인 방법) |
| --- | --- | --- | --- | --- | --- |
| 0100 | 티켓 | api | — | R23 ①③④⑥⑧ | 공유 타입·상수·오류 코드·경로가 `packages/shared`에 있고, 웹 `errors.ts` 문구까지 넣어 `pnpm typecheck` 통과 |
| 0101 | 티켓 | api | 0100 | R23 ①⑥ | migration 0004, 공용 Bearer 인증·행위자·메타데이터 데코레이터·실행 헤더·멈춤 규칙, `provisionAccount` 분리, CLI 4명령. API 통합 테스트(유효·폐기·정지·사람 계정 토큰 401, 형식 오류 401, OptionalSessionGuard 401, 실행 헤더 409, 멈춤 409, CLI 명령 함수) |
| 0102 | 티켓 | api | 0101 | R23 ③⑧ | 모든 `/api/admin/*` 쓰기가 트랜잭션 안에서 행동 기록을 남김, AI의 운영자·AI 계정 대상 쓰기 403, `GET actions`, 지표 제외. 통합 테스트(각 쓰기 1건 이상, 사람·AI 행위자, run_id, subject, 멈춤 경쟁 재확인) |
| 0103 | 티켓 | api | 0101 | R23 ④⑤⑥⑧ | 실행 시작·갱신·목록·상세, 상태·멈춤·토큰 폐기, 지표. 통합 테스트(겹침 409, 90분 포기, paused 합치기, 닫힌 실행 409, 다른 계정 403, refs URL 400, 지표 정의 각 조건) |
| 0104 | 티켓 | web | 0100 | R23 ① | `/api/agent/[...path]`(위 규칙), 공용 프록시 모듈, BFF 허용 목록. `agent-proxy.spec.ts`(점 조각·허용 경로·Bearer 스킴·Origin·헤더) |
| 0105 | 티켓 | web | 0100 | R23 ①④⑥⑧ | `/admin/agent-runs`·상세, 멈춤 스위치, 토큰 폐기, 지표 카드, 위 상태 전부. 390px·1280px 확인 |
| 0106 | 티켓 | web | 0100 | R23 ①③⑧ | `/admin/actions`, 크리에이터 목록·상세 `AI` 배지·지표 제외, 운영자 메뉴, `.data-table.is-stacked`. 390px·1280px 확인 |
| 0107 | 티켓 | infra | 0101, 0104 | R23 ① | 런북 17(발급·확인·폐기·회전·실패 처리), `verify.sh` `/api/agent` 401 검사, `caddy-routing.sh` 헤더 전달 회귀 시험, 운영 배포 설계 공개 경로·검사 수, 비밀값 문서 |
| 0108 | 티켓 | orchestrator | 0100 | R23 ②④⑤⑥⑦ | `scripts/ai-operator.mjs`, 헌장 `docs/ops/ai-operator.md`, 프롬프트. 로컬 인스턴스에서 precheck·start·context·api·finish·멈춤·automation-command 실제 실행 |
| 0091 | 티켓(통합) | orchestrator | 0101~0108 | R23 전부 | ADR 0015·정책 반영, E2E `tests/e2e/ai-operator.spec.ts`, `pnpm verify`·`pnpm smoke`·`pnpm e2e`, PR |

0101~0103은 같은 API 모듈을 고치므로 한 담당이 차례로 합니다. 웹 0104~0106도 한 담당입니다. API와 웹은 계약(0100) 뒤 병렬입니다.

## 검증 계획

에픽 0088 수용 기준과 확인 방법:

1. **전용 계정·토큰**: API 통합 테스트(0101)와 로컬에서 CLI `issue-token` 실제 실행 → 토큰으로 `/api/agent/api/admin/ai-operator` 200, 폐기 뒤 401. 저장소에 실제 토큰 없음(`git grep -E 'crl_ai_[A-Za-z0-9_-]{43}'`).
2. **행동 기록**: API 통합 테스트(0102) + E2E: AI가 실행 헤더로 시험 크리에이터의 추가 슬롯을 바꾸면 `/admin/actions`와 실행 상세에 `AI`·행동·전후 값·실행 링크가 보임.
3. **실행 기록·겹침**: E2E: `start` → 두 번째 `start` 409 → `finish` → `/admin/agent-runs`(390px)에 요약·한 일·다음 할 일·PR 링크가 보임.
4. **멈춤**: E2E: 사람 운영자가 화면에서 멈춤을 켬 → AI 쓰기 409 `ai_operator_paused` → `precheck`가 종료 1이고 `paused` 기록을 남김 → 화면에 `멈춤` 실행. 끄면 `precheck` 0.
5. **헌장·프롬프트**: `automation-command` 출력이 프롬프트 파일을 쓰고, 프롬프트가 헌장을 읽게 함. `pnpm docs:check`.
6. **정책**: ADR 0015 `승인`, `AGENTS.md`·저장소 공통 정책 반영, `pnpm docs:check`.
7. 전체: `pnpm verify`, `make up` 후 `pnpm smoke`, `pnpm e2e`.
8. 운영(머지 뒤, 부모): 운영 주소 검사 `/api/agent` 401 통과, 런북 17로 토큰 발급 → `precheck` 0 → 자동화 생성 → `orca automations run` 1회.

## 미정

없음. 사용자 위임에 따라 이 설계의 선택은 모두 `[AI 결정]`으로 확정합니다.

## 검토 기록

- 2026-10-10 api: 고칠것 9건, 참고 9건. 반영: PATCH를 실행 헤더 검사에서 빼고 서비스가 소유자·running 확인, 오류 우선순위, AI의 운영자·AI 계정 대상 `creator.*` 쓰기 403, 실사용자 SQL을 공개 랜딩 조건(`VISIBLE_LINK_CONDITION`)으로(차단 도메인 조건 삭제), 커서를 방명록 방식(`?cursor=`, µs, DESC 인덱스)으로, admin 쓰기 트랜잭션·`FOR UPDATE`·`@CurrentActor`, `subject_user_id`·`OperatorActionTargetType`, CLI의 DB 설정 근거(`databaseConnectionConfig`)와 `provisionAccount` 분리·AI 이메일 부분 유니크, CLI 위치(`src/cli`)·`require.main`, 공용 인증 함수·메타데이터 데코레이터, 멈춤 경쟁 재확인(`FOR SHARE`), 90분 포기를 멈춤과 관계없이 먼저, 자유 함수 `recordOperatorAction`·토큰 함수, refs URL 검사·`cost_usd` 변환, 광고 7일 서울 날짜, 되돌리기 주석과 행동 기록 공백 구간 위험.
- 2026-10-10 web: 고칠것 12건, 참고 8건. 반영: 점 조각 거부와 `target.pathname` 재검사, 허용 경로 정확 표기(`api/me`·`api/health`도 Bearer 필요), 본문 원본 전달·헤더 고르기·공용 모듈·`Set-Cookie` 미전달, 390px 방식(실행은 `details` 카드, 행동 기록은 공용 `.data-table.is-stacked`), 부분 오류·둘째 쪽 범위, 멈춤·토큰 상태 7가지, `pausedReasonMax`, `actor` 값·잘못된 커서, 상세 404 돌아가기(`backHref`), 오류 코드 웹 문구를 0100에, refs 링크 http(s)만·`rel`, AI 계정 상세의 지표 제외·정지 문구, `formatDuration`, 페이지 이동 문구, Bearer 스킴 검사, 순수 모듈 시험, Origin 거절(다층 방어).
- 2026-10-10 infra: 고칠것 6건, 참고 6건. 반영: 런북 절 번호 17, 운영 발급 한 줄 명령(런북 17), CLI DB 설정·로컬 `.env` 경로, `verify.sh` `/api/agent` 401 검사(0107 선행에 0104), 비밀값 문서·공개 경로 설명, Cloudflare 실측 결과와 프리체크의 차단 구분·User-Agent, 흐름도에 cloudflared, `caddy-routing.sh` 헤더 전달 회귀 시험, users ALTER 한 문장, Mac 꺼짐 위험. Cloudflare 규칙·Caddyfile 변경 없음.
- 2026-10-10 orchestrator: 위 반영으로 막는 문제와 미정이 없어 사용자 위임(2026-10-10, 에픽 0088 진행 기록)에 따라 AI가 승인했습니다. 근거: 세 역할 검토 모두 "막는 문제 없음", 결정이 기존 패턴(ApiError, 가드, expand migration, 서버 렌더 + BFF, 방명록 커서)을 따르고, 되돌림 수단(멈춤·토큰 폐기·행동 기록·자동화 끄기)이 있음.

## 변경 기록

- 2026-10-10: 구현 중 세부 결정(형태 변경 없음, 근거 각 티켓 진행 기록). `AiOperatorStatus.runningRun`은 status `running` 실행(90분이 지나도 다음 시작 전까지 남음), `lastRun`은 `running` 밖에서 가장 최근에 시작한 실행. `PUT pause`는 값이 그대로면 `updated_at`·`updated_by`를 바꾸지 않고(같은 멈춤의 paused 합치기 유지) 행동 기록만 남기며, 멈춤을 끌 때 사유는 저장하지 않음. `ad_banner.reorder`는 `targetId: null`, 전후 값 `{ order }`. CLI는 0004 전 DB(42P01·42703)를 같은 안내로 끝내고, `list-tokens` 첫 줄은 머리글. 경로 상수 `adminAgentRuns`는 `cursor`를 받는 함수. 영향 티켓: 0100, 0101, 0103(모두 완료).
