import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AgentRunDetail,
  AgentRunPage,
  AgentRunRef,
  AgentRunRefKind,
  AgentRunStatus,
  AgentRunTrigger,
  AgentRunView,
  AI_OPERATOR_LIMITS,
} from '@crelink/shared';
import type { PoolClient } from 'pg';
import { apiError, UUID_PATTERN } from '../common/http';
import { cursorAtSql, cursorBeforeSql, cursorPage, parseCursor } from '../common/cursor';
import { bodyObject, optionalText, parseHttpUrl, requiredText } from '../common/input';
import { Database, isUniqueViolation, Queryable } from '../database';
import type { RequestActor } from '../auth/actor';
import { OperatorActionsService } from './operator-actions.service';

interface RunRow {
  id: string;
  actor_user_id: string | null;
  status: AgentRunStatus;
  trigger: AgentRunTrigger;
  host: string | null;
  started_at: Date;
  ended_at: Date | null;
  paused_count: number;
  summary: string | null;
  actions: string[];
  next_steps: string[];
  refs: AgentRunRef[];
  model: string | null;
  /** numeric·bigint는 node-pg가 문자열로 줍니다. view에서 number로 바꿉니다. */
  cost_usd: string | null;
  input_tokens: string | null;
  output_tokens: string | null;
  cursor_at: string;
  actor_email: string | null;
  operator_action_count: number;
}

/** `r`(agent_runs)의 view 컬럼. 실행 계정 이메일과 이 실행의 행동 기록 수를 함께 읽습니다. */
const RUN_SELECT = `
  SELECT r.id, r.actor_user_id, r.status, r.trigger, r.host, r.started_at, r.ended_at, r.paused_count, r.summary,
         r.actions, r.next_steps, r.refs, r.model, r.cost_usd, r.input_tokens, r.output_tokens,
         ${cursorAtSql('r.started_at')} AS cursor_at, u.email AS actor_email,
         (SELECT count(*)::int FROM operator_actions a WHERE a.run_id = r.id) AS operator_action_count
  FROM agent_runs r LEFT JOIN users u ON u.id = r.actor_user_id`;
const RUN_ORDER = 'ORDER BY r.started_at DESC, r.id DESC';

const TRIGGERS: readonly AgentRunTrigger[] = ['schedule', 'manual'];
const CLOSE_STATUSES: readonly AgentRunStatus[] = ['succeeded', 'failed'];
const REF_KINDS: readonly AgentRunRefKind[] = ['pr', 'work_item', 'commit', 'deploy', 'other'];
/** `cost_usd numeric(10, 4)`의 상한(정수부 6자리). */
const COST_USD_MAX = 999_999.9999;

function runView(row: RunRow): AgentRunView {
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    host: row.host,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
    pausedCount: row.paused_count,
    summary: row.summary,
    actions: row.actions,
    nextSteps: row.next_steps,
    refs: row.refs,
    model: row.model,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    inputTokens: row.input_tokens === null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
    actorEmail: row.actor_email,
    operatorActionCount: row.operator_action_count,
  };
}

function runNotFound() {
  return apiError(HttpStatus.NOT_FOUND, 'agent_run_not_found', '실행 기록을 찾을 수 없습니다.');
}

function invalid(message: string) {
  return apiError(HttpStatus.BAD_REQUEST, 'validation_failed', message);
}

/** 글 목록(한 일·다음 할 일). 항목은 `listItemMax`자, 최대 `listItemsMax`개. */
function textList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > AI_OPERATOR_LIMITS.listItemsMax) {
    throw invalid(`${label}은(는) ${AI_OPERATOR_LIMITS.listItemsMax}개 이하의 문자열 배열이어야 합니다.`);
  }
  return value.map((item) => requiredText(item, label, AI_OPERATOR_LIMITS.listItemMax));
}

/** 관련 링크. url은 http·https만 받습니다(설계 `PATCH agent-runs`). */
function refList(value: unknown): AgentRunRef[] {
  if (!Array.isArray(value) || value.length > AI_OPERATOR_LIMITS.refsMax) {
    throw invalid(`관련 링크(refs)는 ${AI_OPERATOR_LIMITS.refsMax}개 이하의 배열이어야 합니다.`);
  }
  return value.map((item) => {
    const ref = bodyObject(item);
    if (!REF_KINDS.includes(ref.kind as AgentRunRefKind)) {
      throw invalid(`관련 링크 종류(kind)는 ${REF_KINDS.join(', ')} 중 하나여야 합니다.`);
    }
    const label = requiredText(ref.label, '관련 링크 이름', AI_OPERATOR_LIMITS.refLabelMax);
    if (ref.url === undefined || ref.url === null) return { kind: ref.kind as AgentRunRefKind, label, url: null };
    const url = typeof ref.url === 'string' ? parseHttpUrl(ref.url.trim()) : null;
    if (!url) throw invalid('관련 링크 주소(url)는 http:// 또는 https:// 주소여야 합니다.');
    return { kind: ref.kind as AgentRunRefKind, label, url: url.href };
  });
}

/** 0 이상 정수(토큰 수) 또는 null. */
function optionalCount(value: unknown, label: string): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalid(`${label}은(는) 0 이상의 정수여야 합니다.`);
  }
  return value;
}

/**
 * AI 실행 기록(R23 ④⑤). 실행 시작은 겹침을 DB에서 원자적으로 막고(부분 유니크 인덱스), 멈춤이면 `paused` 기록만 남깁니다.
 * 근거: docs/specs/crelink-ai-operator.md `경로`(`POST agent-runs`·`PATCH agent-runs`).
 */
@Injectable()
export class AgentRunsService {
  constructor(
    private readonly database: Database,
    private readonly actions: OperatorActionsService,
  ) {}

  private async one(db: Queryable, runId: string): Promise<AgentRunView> {
    const result = await db.query<RunRow>(`${RUN_SELECT} WHERE r.id = $1`, [runId]);
    return runView(result.rows[0]);
  }

  /** 진행 중 실행과 마지막으로 닫힌 실행(`GET /api/admin/ai-operator`). */
  async latest(db: Queryable): Promise<{ runningRun: AgentRunView | null; lastRun: AgentRunView | null }> {
    const [running, last] = await Promise.all([
      db.query<RunRow>(`${RUN_SELECT} WHERE r.status = 'running' ${RUN_ORDER} LIMIT 1`),
      db.query<RunRow>(`${RUN_SELECT} WHERE r.status <> 'running' ${RUN_ORDER} LIMIT 1`),
    ]);
    return {
      runningRun: running.rows[0] ? runView(running.rows[0]) : null,
      lastRun: last.rows[0] ? runView(last.rows[0]) : null,
    };
  }

  /** `GET /api/admin/agent-runs?cursor=`: 최신순 `runPageSize`개. */
  async list(cursorValue: unknown): Promise<AgentRunPage> {
    const cursor = parseCursor(cursorValue, '실행 기록 목록 위치가 올바르지 않습니다. 처음부터 다시 불러와 주세요.');
    const pageSize = AI_OPERATOR_LIMITS.runPageSize;
    const result = await this.database.query<RunRow>(
      `${RUN_SELECT} WHERE ${cursorBeforeSql('r.started_at', 'r.id', 1, 2)} ${RUN_ORDER} LIMIT $3`,
      [cursor?.at ?? null, cursor?.id ?? null, pageSize + 1],
    );
    return cursorPage(result.rows, pageSize, runView);
  }

  /** `GET /api/admin/agent-runs/{runId}`: 실행과 그 실행의 행동 기록. 없거나 형식이 틀리면 404 `agent_run_not_found`. */
  async detail(runId: string): Promise<AgentRunDetail> {
    if (!UUID_PATTERN.test(runId)) throw runNotFound();
    const db = this.database.pool;
    const [result, operatorActions] = await Promise.all([
      db.query<RunRow>(`${RUN_SELECT} WHERE r.id = $1`, [runId]),
      this.actions.forRun(db, runId),
    ]);
    if (!result.rowCount) throw runNotFound();
    return { ...runView(result.rows[0]), operatorActions };
  }

  /**
   * `POST /api/admin/agent-runs`(AI만). 한 트랜잭션에서 ① 시작 뒤 `staleRunMinutes`가 지난 `running`을 `abandoned`로 닫고(멈춤과 관계없이)
   * ② 멈춤 설정을 `FOR UPDATE`로 읽어 ③ 멈춤이면 같은 멈춤 동안의 직전 `paused` 기록에 합치거나 새 `paused` 기록을 만들고
   * ④ 아니면 남은 `running`이 있을 때 409 `agent_run_in_progress`, 없으면 `running`을 만듭니다(유니크 위반도 409).
   */
  async start(actor: RequestActor, body: unknown): Promise<AgentRunView> {
    const input = bodyObject(body);
    if (!TRIGGERS.includes(input.trigger as AgentRunTrigger)) {
      throw invalid('trigger는 schedule 또는 manual이어야 합니다.');
    }
    const trigger = input.trigger as AgentRunTrigger;
    const host = optionalText(input.host, '실행 호스트(host)', AI_OPERATOR_LIMITS.hostMax) ?? null;
    const model = optionalText(input.model, '모델(model)', AI_OPERATOR_LIMITS.modelMax) ?? null;
    const inProgress = () =>
      apiError(
        HttpStatus.CONFLICT,
        'agent_run_in_progress',
        '다른 AI 실행이 진행 중입니다. 끝난 뒤 다시 시작해 주세요.',
      );
    try {
      return await this.database.transaction(async (client) => {
        await client.query(
          `UPDATE agent_runs SET status = 'abandoned', ended_at = now()
           WHERE status = 'running' AND started_at <= now() - make_interval(mins => $1)`,
          [AI_OPERATOR_LIMITS.staleRunMinutes],
        );
        const settings = await client.query<{ paused: boolean; updated_at: Date }>(
          'SELECT paused, updated_at FROM ai_operator_settings FOR UPDATE',
        );
        const runId = settings.rows[0]?.paused
          ? await this.recordPaused(client, actor, { trigger, host, model }, settings.rows[0].updated_at)
          : await this.startRunning(client, actor, { trigger, host, model }, inProgress);
        return this.one(client, runId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw inProgress();
      throw error;
    }
  }

  /** 멈춤 중 시작: 직전 실행이 같은 멈춤 동안(`started_at >= settings.updated_at`)의 `paused`면 합치고, 아니면 새로 만듭니다. */
  private async recordPaused(
    client: PoolClient,
    actor: RequestActor,
    input: { trigger: AgentRunTrigger; host: string | null; model: string | null },
    pausedSince: Date,
  ): Promise<string> {
    const merged = await client.query<{ id: string }>(
      `UPDATE agent_runs SET ended_at = now(), paused_count = paused_count + 1
       WHERE id = (SELECT id FROM agent_runs ORDER BY started_at DESC, id DESC LIMIT 1)
         AND status = 'paused' AND started_at >= $1
       RETURNING id`,
      [pausedSince],
    );
    if (merged.rows[0]) return merged.rows[0].id;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO agent_runs (actor_user_id, status, trigger, host, model, ended_at)
       VALUES ($1, 'paused', $2, $3, $4, now()) RETURNING id`,
      [actor.userId, input.trigger, input.host, input.model],
    );
    return inserted.rows[0].id;
  }

  private async startRunning(
    client: PoolClient,
    actor: RequestActor,
    input: { trigger: AgentRunTrigger; host: string | null; model: string | null },
    inProgress: () => Error,
  ): Promise<string> {
    const running = await client.query("SELECT 1 FROM agent_runs WHERE status = 'running'");
    if (running.rowCount) throw inProgress();
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO agent_runs (actor_user_id, status, trigger, host, model) VALUES ($1, 'running', $2, $3, $4) RETURNING id`,
      [actor.userId, input.trigger, input.host, input.model],
    );
    return inserted.rows[0].id;
  }

  /**
   * `PATCH /api/admin/agent-runs/{runId}`(AI만, 자기 실행). 바뀐 필드만 저장하고 status(`succeeded`·`failed`)를 주면 닫습니다.
   * 순서: 400(입력) → 404 → 403 `forbidden`(다른 계정의 실행) → 409 `agent_run_closed`. 행동 기록 대상이 아닙니다(실행 기록 자체가 기록).
   */
  async update(actor: RequestActor, runId: string, body: unknown): Promise<AgentRunView> {
    const input = bodyObject(body);
    const changes: Record<string, unknown> = {};
    if (input.status !== undefined) {
      if (!CLOSE_STATUSES.includes(input.status as AgentRunStatus)) {
        throw invalid('status는 succeeded 또는 failed여야 합니다.');
      }
      changes.status = input.status;
    }
    const summary = optionalText(input.summary, '요약(summary)', AI_OPERATOR_LIMITS.summaryMax);
    if (summary !== undefined) changes.summary = summary;
    if (input.actions !== undefined) changes.actions = JSON.stringify(textList(input.actions, '한 일(actions)'));
    if (input.nextSteps !== undefined) {
      changes.next_steps = JSON.stringify(textList(input.nextSteps, '다음 할 일(nextSteps)'));
    }
    if (input.refs !== undefined) changes.refs = JSON.stringify(refList(input.refs));
    const model = optionalText(input.model, '모델(model)', AI_OPERATOR_LIMITS.modelMax);
    if (model !== undefined) changes.model = model;
    if (input.costUsd !== undefined) {
      const cost = input.costUsd;
      if (cost !== null && (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0 || cost > COST_USD_MAX)) {
        throw invalid(`비용(costUsd)은 0~${COST_USD_MAX} 사이의 숫자여야 합니다.`);
      }
      changes.cost_usd = cost;
    }
    const inputTokens = optionalCount(input.inputTokens, '입력 토큰 수(inputTokens)');
    if (inputTokens !== undefined) changes.input_tokens = inputTokens;
    const outputTokens = optionalCount(input.outputTokens, '출력 토큰 수(outputTokens)');
    if (outputTokens !== undefined) changes.output_tokens = outputTokens;
    if (!UUID_PATTERN.test(runId)) throw runNotFound();

    return this.database.transaction(async (client) => {
      const found = await client.query<{ actor_user_id: string | null; status: AgentRunStatus }>(
        'SELECT actor_user_id, status FROM agent_runs WHERE id = $1 FOR UPDATE',
        [runId],
      );
      const run = found.rows[0];
      if (!run) throw runNotFound();
      if (run.actor_user_id !== actor.userId) {
        throw apiError(HttpStatus.FORBIDDEN, 'forbidden', '다른 AI 계정의 실행 기록은 고칠 수 없습니다.');
      }
      if (run.status !== 'running') {
        throw apiError(HttpStatus.CONFLICT, 'agent_run_closed', '이미 끝난 실행 기록입니다.');
      }
      const columns = Object.keys(changes);
      if (columns.length) {
        const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
        if (changes.status) assignments.push('ended_at = now()');
        await client.query(`UPDATE agent_runs SET ${assignments.join(', ')} WHERE id = $1`, [
          runId,
          ...columns.map((column) => changes[column]),
        ]);
      }
      return this.one(client, runId);
    });
  }
}
