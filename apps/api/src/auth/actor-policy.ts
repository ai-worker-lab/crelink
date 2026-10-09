import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountKind, AGENT_RUN_HEADER, AI_OPERATOR_LIMITS } from '@crelink/shared';
import { apiError, UUID_PATTERN } from '../common/http';
import { Database } from '../database';
import {
  ACTOR_KINDS_KEY,
  AGENT_RUN_EXEMPT_KEY,
  ALLOW_WHILE_PAUSED_KEY,
  AuthenticatedRequest,
  RequestActor,
} from './actor';

/** 상태를 바꾸지 않는 메서드. AI도 실행 헤더·멈춤 검사 없이 씁니다. */
const SAFE_METHODS: Record<string, true> = { GET: true, HEAD: true, OPTIONS: true };

/**
 * 인증 직후 가드가 부르는 행위자 규칙(설계 `인증·권한 규칙`). 파이프·업로드보다 먼저 거절합니다.
 * 순서: 403 `forbidden`(`@ActorKinds`) → 409 `ai_operator_paused`(`@AllowWhilePaused` 밖) → 409 `agent_run_required`(`@AgentRunExempt` 밖).
 * 실행 헤더는 이 계정의 `running` 실행이고 시작 뒤 `staleRunMinutes` 안이어야 하며, 통과하면 `actor.runId`에 넣습니다.
 * 가드 검사 뒤 쓰기까지의 멈춤 경쟁은 `recordOperatorAction`의 `FOR SHARE` 재확인이 막습니다.
 */
@Injectable()
export class ActorPolicy {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: Database,
  ) {}

  async check(context: ExecutionContext, request: AuthenticatedRequest, actor: RequestActor): Promise<void> {
    const targets = [context.getHandler(), context.getClass()];
    const kinds = this.reflector.getAllAndOverride<AccountKind[] | undefined>(ACTOR_KINDS_KEY, targets);
    if (kinds && !kinds.includes(actor.kind)) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'forbidden',
        actor.kind === 'ai' ? '사람 운영자만 사용할 수 있습니다.' : 'AI 운영자 계정만 사용할 수 있습니다.',
      );
    }
    if (actor.kind !== 'ai' || SAFE_METHODS[request.method] === true) return;
    const allowWhilePaused = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHILE_PAUSED_KEY, targets);
    const runExempt = this.reflector.getAllAndOverride<boolean | undefined>(AGENT_RUN_EXEMPT_KEY, targets);
    if (allowWhilePaused && runExempt) return;
    const header = request.headers[AGENT_RUN_HEADER.toLowerCase()];
    const runId = typeof header === 'string' && UUID_PATTERN.test(header.trim()) ? header.trim().toLowerCase() : null;
    const state = await this.database.query<{ paused: boolean; running: boolean }>(
      `SELECT coalesce((SELECT paused FROM ai_operator_settings), false) AS paused,
              EXISTS (SELECT 1 FROM agent_runs
                      WHERE id = $1 AND actor_user_id = $2 AND status = 'running'
                        AND started_at > now() - make_interval(mins => $3)) AS running`,
      [runId, actor.userId, AI_OPERATOR_LIMITS.staleRunMinutes],
    );
    if (!allowWhilePaused && state.rows[0].paused) {
      throw apiError(HttpStatus.CONFLICT, 'ai_operator_paused', 'AI 운영자가 멈춤 상태입니다.');
    }
    if (runExempt) return;
    if (!state.rows[0].running) {
      throw apiError(
        HttpStatus.CONFLICT,
        'agent_run_required',
        `진행 중인 AI 실행 기록이 필요합니다(${AGENT_RUN_HEADER} 헤더에 시작 뒤 ${AI_OPERATOR_LIMITS.staleRunMinutes}분 안의 자기 실행 id).`,
      );
    }
    actor.runId = runId;
  }
}
