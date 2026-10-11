-- AI 실행 기록에 실행 주체(에이전트) 식별자를 추가한다.
-- 기존 실행은 당시 에이전트를 확정할 수 없으므로 NULL을 유지하고, 새 운영자 스크립트는 orchestrator를 기록한다.
ALTER TABLE agent_runs
  ADD COLUMN agent text CHECK (char_length(agent) <= 100);
