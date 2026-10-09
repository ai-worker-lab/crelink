import { HttpStatus, Injectable } from '@nestjs/common';
import { AI_OPERATOR_LIMITS, OperatorActionPage, OperatorActionView, OperatorActorKind } from '@crelink/shared';
import { apiError } from '../common/http';
import { cursorAtSql, cursorBeforeSql, cursorPage, parseCursor } from '../common/cursor';
import { Database, Queryable } from '../database';

interface ActionRow {
  id: string;
  created_at: Date;
  cursor_at: string;
  actor_kind: OperatorActorKind;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  subject_user_id: string | null;
  before: unknown;
  after: unknown;
  run_id: string | null;
}

const ACTION_SELECT = `
  SELECT a.id, a.created_at, ${cursorAtSql('a.created_at')} AS cursor_at, a.actor_kind, a.actor_user_id, a.actor_email,
         a.action, a.target_type, a.target_id, a.subject_user_id, a.before, a.after, a.run_id
  FROM operator_actions a`;
const ACTION_ORDER = 'ORDER BY a.created_at DESC, a.id DESC';

const ACTOR_KINDS: readonly OperatorActorKind[] = ['human', 'ai', 'system'];

function view(row: ActionRow): OperatorActionView {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    actor: { kind: row.actor_kind, userId: row.actor_user_id, email: row.actor_email },
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    subjectUserId: row.subject_user_id,
    before: row.before,
    after: row.after,
    runId: row.run_id,
  };
}

/** 운영자 행동 기록 조회(R23 ③). 기록은 `recordOperatorAction`이 쓰기와 같은 트랜잭션에서 남깁니다. */
@Injectable()
export class OperatorActionsService {
  constructor(private readonly database: Database) {}

  /** `GET /api/admin/actions?cursor=&actor=`: 최신순 `actionPageSize`개. actor는 `human`·`ai`·`system`, 아니면 400. */
  async list(cursorValue: unknown, actorValue: unknown): Promise<OperatorActionPage> {
    const cursor = parseCursor(cursorValue, '운영 기록 목록 위치가 올바르지 않습니다. 처음부터 다시 불러와 주세요.');
    const pageSize = AI_OPERATOR_LIMITS.actionPageSize;
    if (actorValue !== undefined && !ACTOR_KINDS.includes(actorValue as OperatorActorKind)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'actor는 human, ai, system 중 하나여야 합니다.');
    }
    const actor = (actorValue as OperatorActorKind | undefined) ?? null;
    const result = await this.database.query<ActionRow>(
      `${ACTION_SELECT}
       WHERE ($1::text IS NULL OR a.actor_kind = $1) AND ${cursorBeforeSql('a.created_at', 'a.id', 2, 3)}
       ${ACTION_ORDER} LIMIT $4`,
      [actor, cursor?.at ?? null, cursor?.id ?? null, pageSize + 1],
    );
    return cursorPage(result.rows, pageSize, view);
  }

  /** 한 실행에서 남긴 행동 기록 전부(최신순). 실행 상세가 씁니다. */
  async forRun(db: Queryable, runId: string): Promise<OperatorActionView[]> {
    const result = await db.query<ActionRow>(`${ACTION_SELECT} WHERE a.run_id = $1 ${ACTION_ORDER}`, [runId]);
    return result.rows.map(view);
  }
}
