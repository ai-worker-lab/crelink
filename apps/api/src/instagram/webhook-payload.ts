/**
 * 웹훅 본문을 댓글 후보로 바꿉니다. 항목별로 필드와 타입을 검사하고 불량 항목은 건너뜁니다. 한 건 때문에 배치 전체가 재전송되면 안 되기 때문입니다.
 * 근거: docs/specs/instagram-comment-dm.md `웹훅 수신 경로`. 필드명의 실제 형식은 스파이크 S5 실측 전입니다 [M?].
 */

export interface WebhookComment {
  igUserId: string;
  mediaId: string;
  commentId: string;
  fromId: string;
  text: string;
  commentedAt: Date;
}

export type WebhookSkipReason = 'malformed' | 'ignored_field' | 'reply' | 'own_comment';

export interface ParsedWebhook {
  comments: WebhookComment[];
  skipped: Record<WebhookSkipReason, number>;
}

/** `\u0000`처럼 Postgres text에 넣을 수 없는 값이 배치 전체를 503으로 만들지 않도록 ID 형식을 제한합니다. */
const ID_PATTERN = /^[\w.:-]{1,128}$/;
/** 이보다 작은 `entry.time`은 초, 크면 밀리초입니다(1e11초는 서기 5138년, 1e11밀리초는 1973년). */
const SECONDS_UPPER_BOUND = 1e11;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value);

/** `commented_at`은 `entry.time`이고, 없거나 잘못되면 수신 시각입니다. [M?] 문서 예시에 초와 밀리초가 섞여 있어 둘 다 받습니다. */
function commentTime(time: unknown, receivedAt: Date): Date {
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return receivedAt;
  const milliseconds = time < SECONDS_UPPER_BOUND ? time * 1000 : time;
  // 미래 시각을 받으면 24시간 규칙을 늦출 수 있습니다.
  return milliseconds > receivedAt.getTime() + FUTURE_TOLERANCE_MS ? receivedAt : new Date(milliseconds);
}

export function parseWebhookPayload(payload: unknown, receivedAt: Date): ParsedWebhook {
  const parsed: ParsedWebhook = {
    comments: [],
    skipped: { malformed: 0, ignored_field: 0, reply: 0, own_comment: 0 },
  };
  const skip = (reason: WebhookSkipReason) => {
    parsed.skipped[reason] += 1;
  };
  if (!isRecord(payload) || !Array.isArray(payload.entry)) {
    skip('malformed');
    return parsed;
  }
  for (const entry of payload.entry as unknown[]) {
    if (!isRecord(entry) || !isId(entry.id) || !Array.isArray(entry.changes)) {
      skip('malformed');
      continue;
    }
    const commentedAt = commentTime(entry.time, receivedAt);
    for (const change of entry.changes as unknown[]) {
      if (!isRecord(change)) {
        skip('malformed');
        continue;
      }
      if (change.field !== 'comments') {
        skip('ignored_field');
        continue;
      }
      const value = change.value;
      if (!isRecord(value)) {
        skip('malformed');
        continue;
      }
      const commentId = value.id ?? value.comment_id;
      const mediaId = isRecord(value.media) ? value.media.id : undefined;
      const fromId = isRecord(value.from) ? value.from.id : undefined;
      if (!isId(commentId) || !isId(mediaId) || !isId(fromId) || typeof value.text !== 'string') {
        skip('malformed');
        continue;
      }
      if (value.parent_id !== undefined && value.parent_id !== null) {
        skip('reply');
        continue;
      }
      if (fromId === entry.id) {
        skip('own_comment');
        continue;
      }
      parsed.comments.push({ igUserId: entry.id, mediaId, commentId, fromId, text: value.text, commentedAt });
    }
  }
  return parsed;
}
