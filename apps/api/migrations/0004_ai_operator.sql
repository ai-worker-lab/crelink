SET LOCAL lock_timeout = '5s';
-- AI 운영자(R23): AI 계정·API 토큰·실행 기록·운영자 행동 기록·멈춤 스위치·지표 제외. 근거: docs/specs/crelink-ai-operator.md (데이터 모델).
-- NULL 허용·상수 기본값 컬럼과 새 테이블만 추가합니다(expand). 옛 API는 이 컬럼·테이블을 모르고 그대로 동작합니다(Bearer를 몰라 AI만 401).
-- 첫 줄의 lock_timeout: users ALTER가 5초 안에 잠금을 잡지 못하면 이 파일 전체가 되돌려지고 새 색이 기동에 실패합니다(활성 색 유지).
-- 되돌리기(운영 데이터가 생기기 전, 운영 DB는 명시적 승인 뒤 손으로):
--   DROP TABLE operator_actions, agent_runs, api_tokens, ai_operator_settings;
--   DROP INDEX users_ai_email_idx;
--   ALTER TABLE users DROP CONSTRAINT users_ai_is_operator, DROP COLUMN metrics_excluded_at, DROP COLUMN kind;
--   DELETE FROM schema_migrations WHERE version = '0004_ai_operator';
-- 운영 데이터가 생긴 뒤에는 지우지 않고 다음 migration으로 고칩니다.

-- users ALTER는 한 문장으로 잠금을 한 번만 잡습니다.
ALTER TABLE users
  ADD COLUMN kind text NOT NULL DEFAULT 'human' CHECK (kind IN ('human', 'ai')),
  -- 운영자가 시험 계정을 지표에서 뺀 시각. NULL이면 포함.
  ADD COLUMN metrics_excluded_at timestamptz,
  ADD CONSTRAINT users_ai_is_operator CHECK (kind <> 'ai' OR role = 'operator');
-- AI 계정은 이메일당 1개(ensure-account 동시 실행 방지).
CREATE UNIQUE INDEX users_ai_email_idx ON users (lower(email)) WHERE kind = 'ai';

-- AI 계정 API 토큰. 원문은 발급 때 한 번만 출력하고 SHA-256 해시만 저장합니다.
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

-- AI 실행 기록(R23 ④). 지우지 않습니다(운영 감사 기록).
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

-- 운영자 행동 기록(R23 ③). 지우지 않습니다. 전후 값에는 바뀐 필드만 담고 이메일·토큰을 넣지 않습니다.
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

-- 멈춤 스위치(R23 ⑥). 행은 항상 1개(id = true)입니다.
CREATE TABLE ai_operator_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  paused boolean NOT NULL DEFAULT false,
  paused_reason text CHECK (char_length(paused_reason) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL
);
INSERT INTO ai_operator_settings DEFAULT VALUES;
