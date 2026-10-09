import { HttpStatus } from '@nestjs/common';
import { OperatorActionTargetType, OperatorActionType, OperatorActorKind } from '@crelink/shared';
import { apiError } from '../common/http';
import type { Queryable } from '../database';

/** 행동 기록의 행위자. HTTP는 `RequestActor`(사람·AI)를, 서버 CLI는 `SYSTEM_ACTOR`를 넘깁니다. */
export interface OperatorActor {
  kind: OperatorActorKind;
  userId: string | null;
  email: string | null;
  /** AI 쓰기의 진행 중 실행 id(가드가 확인한 실행 헤더). */
  runId: string | null;
}

export const SYSTEM_ACTOR: OperatorActor = { kind: 'system', userId: null, email: null, runId: null };

export interface OperatorActionEntry {
  action: OperatorActionType;
  targetType: OperatorActionTargetType;
  targetId: string | null;
  /** 행동이 걸린 크리에이터(`creator.*`는 대상 계정, 링크·배너 차단은 소유자). */
  subjectUserId?: string | null;
  /** 바뀐 필드만. 이메일·토큰 원문·해시는 넣지 않습니다. 없으면 NULL. */
  before?: unknown;
  after?: unknown;
}

/**
 * 운영자 행동 기록(설계 `행동 기록 규칙`). 쓰기와 같은 트랜잭션에서 부르므로 쓰기가 실패하면 기록도 남지 않습니다.
 * 행위자가 AI이면 같은 트랜잭션에서 멈춤을 `FOR SHARE`로 다시 확인합니다(켜져 있으면 409 `ai_operator_paused`, 쓰기도 되돌려짐).
 * `PUT /api/admin/ai-operator/pause`는 같은 행을 `FOR UPDATE`로 잡으므로 가드 검사 뒤 멈춤이 켜지는 경쟁도 원자적으로 막힙니다.
 */
export async function recordOperatorAction(
  client: Queryable,
  actor: OperatorActor,
  entry: OperatorActionEntry,
): Promise<void> {
  if (actor.kind === 'ai') {
    const settings = await client.query<{ paused: boolean }>('SELECT paused FROM ai_operator_settings FOR SHARE');
    if (settings.rows[0]?.paused) {
      throw apiError(HttpStatus.CONFLICT, 'ai_operator_paused', 'AI 운영자가 멈춤 상태입니다.');
    }
  }
  await client.query(
    `INSERT INTO operator_actions
       (actor_kind, actor_user_id, actor_email, action, target_type, target_id, subject_user_id, before, after, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      actor.kind,
      actor.userId,
      actor.email,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.subjectUserId ?? null,
      entry.before == null ? null : JSON.stringify(entry.before),
      entry.after == null ? null : JSON.stringify(entry.after),
      actor.runId,
    ],
  );
}

/** 두 상태에서 값이 다른 필드만 골라 행동 기록의 이전·이후 값으로 씁니다(JSON 값 비교). */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T> } {
  const changed: { before: Partial<T>; after: Partial<T> } = { before: {}, after: {} };
  for (const key of Object.keys(after) as Array<keyof T>) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    changed.before[key] = before[key];
    changed.after[key] = after[key];
  }
  return changed;
}
