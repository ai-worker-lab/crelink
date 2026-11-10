import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InstagramDmAudience, InstagramDmSettingsView } from '@crelink/shared';
import { OperatorActor, recordOperatorAction } from '../ai-operator/audit';
import { apiError, UUID_PATTERN } from '../common/http';
import { bodyObject, booleanField } from '../common/input';
import { Database, type Queryable } from '../database';

const AUDIENCES: readonly InstagramDmAudience[] = ['off', 'operators', 'everyone'];

function audienceField(body: unknown): InstagramDmAudience {
  const value = bodyObject(body).audience;
  if (!AUDIENCES.includes(value as InstagramDmAudience)) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'audience는 off, operators, everyone 중 하나여야 합니다.',
    );
  }
  return value as InstagramDmAudience;
}

/**
 * 새 `audience`로는 보낼 수 없는 `pending`을 취소합니다. 값이 그대로여도 실행하므로 `off`를 다시 누르면 남은 대기 건을 치웁니다.
 * `off`는 전부, `operators`는 운영자 역할이 아닌 계정의 것을 취소합니다(worker의 `SENDABLE_SQL`과 같은 기준).
 */
async function cancelDisallowedPending(client: Queryable, audience: InstagramDmAudience): Promise<number> {
  if (audience === 'everyone') return 0;
  const cancelled = await client.query(
    `UPDATE instagram_dm_deliveries d SET status = 'cancelled'
     FROM instagram_connections c JOIN users u ON u.id = c.user_id
     WHERE c.id = d.connection_id AND d.status = 'pending' AND ($1::text = 'off' OR u.role <> 'operator')`,
    [audience],
  );
  return cancelled.rowCount ?? 0;
}

/** 긴급 정지와 대기 건 취소. 근거: docs/specs/instagram-comment-dm.md#발송-경로 (`긴급 정지`). */
@Injectable()
export class InstagramAdminService {
  private readonly logger = new Logger(InstagramAdminService.name);

  constructor(private readonly database: Database) {}

  /** `GET /api/admin/instagram-dm`. */
  async setting(): Promise<InstagramDmSettingsView> {
    const result = await this.database.query<InstagramDmSettingsView>(
      'SELECT instagram_dm_audience AS audience FROM platform_settings',
    );
    return { audience: result.rows[0].audience };
  }

  /**
   * `PUT /api/admin/instagram-dm`. 설정 행을 `FOR UPDATE`로 잡아 웹훅 저장의 `FOR SHARE`와 줄 세우므로, 먼저 커밋된 저장은 아래 취소가 보고
   * 뒤늦은 저장은 새 값으로 다시 평가돼 들어오지 않습니다. `updated_at`·`updated_by`는 광고 블록 카드가 보여 주는 값이라 건드리지 않고,
   * 누가 언제 바꿨는지는 행동 기록에 남습니다.
   */
  async setAudience(actor: OperatorActor, body: unknown): Promise<InstagramDmSettingsView> {
    const audience = audienceField(body);
    const cancelled = await this.database.transaction(async (client) => {
      const current = await client.query<{ audience: InstagramDmAudience }>(
        'SELECT instagram_dm_audience AS audience FROM platform_settings FOR UPDATE',
      );
      const before = current.rows[0].audience;
      if (before !== audience) {
        await client.query('UPDATE platform_settings SET instagram_dm_audience = $1', [audience]);
      }
      const count = await cancelDisallowedPending(client, audience);
      await recordOperatorAction(client, actor, {
        action: 'instagram_dm.audience',
        targetType: 'platform_setting',
        targetId: 'instagram_dm_audience',
        subjectUserId: null,
        before: { audience: before },
        after: { audience },
      });
      return count;
    });
    if (cancelled > 0) this.logger.warn(`audience를 ${audience}로 바꾸며 대기 ${cancelled}건을 취소했습니다.`);
    return { audience };
  }

  /**
   * `PUT /api/admin/instagram-dm/connections/:userId/pause`. 크리에이터 정지(`dm_paused_at`)와 별개의 열이라 크리에이터가 풀 수 없고,
   * 운영자가 풀어도 크리에이터 정지는 그대로입니다. 연결 행을 먼저 잠가 크리에이터 정지·웹훅 저장과 순서를 맞춥니다.
   */
  async setConnectionPause(actor: OperatorActor, userId: string, body: unknown): Promise<void> {
    const paused = booleanField(body, 'paused');
    const cancelled = await this.database.transaction(async (client) => {
      const current = UUID_PATTERN.test(userId)
        ? await client.query<{ id: string; operator_paused_at: Date | null }>(
            'SELECT id, operator_paused_at FROM instagram_connections WHERE user_id = $1 FOR UPDATE',
            [userId],
          )
        : null;
      const row = current?.rows[0];
      if (!row) throw apiError(HttpStatus.NOT_FOUND, 'creator_not_found', '연결된 인스타그램 계정을 찾을 수 없습니다.');
      const before = row.operator_paused_at !== null;
      if (before !== paused) {
        await client.query(
          `UPDATE instagram_connections
           SET operator_paused_at = CASE WHEN $2 THEN now() END, updated_at = now()
           WHERE id = $1`,
          [row.id, paused],
        );
      }
      const pending = paused
        ? await client.query(
            "UPDATE instagram_dm_deliveries SET status = 'cancelled' WHERE connection_id = $1 AND status = 'pending'",
            [row.id],
          )
        : null;
      await recordOperatorAction(client, actor, {
        action: 'instagram_dm.connection_pause',
        targetType: 'user',
        targetId: userId,
        subjectUserId: userId,
        before: { operatorPaused: before },
        after: { operatorPaused: paused },
      });
      return pending?.rowCount ?? 0;
    });
    if (cancelled > 0) this.logger.warn(`운영자 정지로 대기 ${cancelled}건을 취소했습니다.`);
  }
}
