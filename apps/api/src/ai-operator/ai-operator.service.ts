import { HttpStatus, Injectable } from '@nestjs/common';
import { AI_OPERATOR_LIMITS, AiAccountView, AiOperatorStatus } from '@crelink/shared';
import { apiError, UUID_PATTERN } from '../common/http';
import { bodyObject, optionalText } from '../common/input';
import { Database } from '../database';
import type { RequestActor } from '../auth/actor';
import { AgentRunsService } from './agent-runs.service';
import { recordOperatorAction } from './audit';
import { API_TOKEN_COLUMNS, ApiTokenRow, revokeApiToken } from './tokens';

/** 멈춤 스위치·AI 계정·토큰 상태(R23 ①⑥). 근거: docs/specs/crelink-ai-operator.md `경로`. */
@Injectable()
export class AiOperatorService {
  constructor(
    private readonly database: Database,
    private readonly runs: AgentRunsService,
  ) {}

  /** `GET /api/admin/ai-operator`. 계정은 만든 순서, 토큰은 최근 먼저(폐기 포함). */
  async status(): Promise<AiOperatorStatus> {
    const db = this.database.pool;
    const [settings, accounts, tokens, latest] = await Promise.all([
      db.query<{ paused: boolean; paused_reason: string | null; updated_at: Date; updated_by: string | null }>(
        `SELECT s.paused, s.paused_reason, s.updated_at, u.email AS updated_by
         FROM ai_operator_settings s LEFT JOIN users u ON u.id = s.updated_by`,
      ),
      db.query<{ id: string; email: string; created_at: Date; suspended: boolean }>(
        `SELECT id, email, created_at, suspended_at IS NOT NULL AS suspended FROM users
         WHERE kind = 'ai' ORDER BY created_at, id`,
      ),
      db.query<ApiTokenRow>(
        `SELECT ${API_TOKEN_COLUMNS} FROM api_tokens t
         WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id AND u.kind = 'ai')
         ORDER BY created_at DESC, id`,
      ),
      this.runs.latest(db),
    ]);
    const setting = settings.rows[0];
    const views: AiAccountView[] = accounts.rows.map((account) => ({
      userId: account.id,
      email: account.email,
      createdAt: account.created_at.toISOString(),
      suspended: account.suspended,
      tokens: tokens.rows
        .filter((token) => token.user_id === account.id)
        .map((token) => ({
          id: token.id,
          label: token.label,
          prefix: token.prefix,
          createdAt: token.created_at.toISOString(),
          lastUsedAt: token.last_used_at?.toISOString() ?? null,
          revokedAt: token.revoked_at?.toISOString() ?? null,
        })),
    }));
    return {
      paused: setting.paused,
      pausedReason: setting.paused_reason,
      updatedAt: setting.updated_at.toISOString(),
      updatedBy: setting.updated_by,
      accounts: views,
      ...latest,
    };
  }

  /**
   * `PUT /api/admin/ai-operator/pause`(사람만). 설정 행을 `FOR UPDATE`로 잡아 AI 쓰기의 `FOR SHARE` 재확인과 줄 세웁니다.
   * 사유는 멈출 때만 저장합니다. 값이 그대로면 바꾼 사람·시각도 그대로 두고(같은 멈춤의 paused 합치기 유지) 기록만 남깁니다.
   */
  async setPause(actor: RequestActor, body: unknown): Promise<AiOperatorStatus> {
    const input = bodyObject(body);
    if (typeof input.paused !== 'boolean') {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'paused는 true 또는 false여야 합니다.');
    }
    const paused = input.paused;
    const reason = paused
      ? (optionalText(input.reason, '멈춤 사유', AI_OPERATOR_LIMITS.pausedReasonMax) ?? null)
      : null;
    await this.database.transaction(async (client) => {
      const current = await client.query<{ paused: boolean; paused_reason: string | null }>(
        'SELECT paused, paused_reason FROM ai_operator_settings FOR UPDATE',
      );
      const before = current.rows[0];
      if (before.paused !== paused || before.paused_reason !== reason) {
        await client.query(
          'UPDATE ai_operator_settings SET paused = $1, paused_reason = $2, updated_at = now(), updated_by = $3',
          [paused, reason, actor.userId],
        );
      }
      await recordOperatorAction(client, actor, {
        action: 'ai_operator.pause',
        targetType: 'ai_operator',
        targetId: null,
        before: { paused: before.paused, reason: before.paused_reason },
        after: { paused, reason },
      });
    });
    return this.status();
  }

  /** `PUT /api/admin/ai-operator/tokens/{tokenId}/revoke`(사람만, 멱등). 없거나 형식이 틀리면 404 `api_token_not_found`. */
  async revokeToken(actor: RequestActor, tokenId: string): Promise<AiOperatorStatus> {
    const revoked = UUID_PATTERN.test(tokenId)
      ? await this.database.transaction((client) => revokeApiToken(client, actor, tokenId))
      : null;
    if (!revoked) {
      throw apiError(HttpStatus.NOT_FOUND, 'api_token_not_found', '토큰을 찾을 수 없습니다. 화면을 새로 고쳐 주세요.');
    }
    return this.status();
  }
}
