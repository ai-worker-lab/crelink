import { AI_TOKEN_PREFIX } from '@crelink/shared';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../auth/token-hash';
import type { Queryable } from '../database';
import { OperatorActor, recordOperatorAction } from './audit';

/** 화면에서 토큰을 구별하는 원문 앞부분 길이(`crl_ai_` + 5자). */
const TOKEN_PREFIX_LENGTH = AI_TOKEN_PREFIX.length + 5;

export interface ApiTokenRow {
  id: string;
  user_id: string;
  label: string;
  prefix: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

export const API_TOKEN_COLUMNS = 'id, user_id, label, prefix, created_at, last_used_at, revoked_at';

/**
 * AI 계정 토큰 발급. 원문(`crl_ai_` + 256비트 base64url 43자)은 돌려주기만 하고 DB에는 SHA-256 해시만 둡니다.
 * 같은 트랜잭션에서 `ai_operator.token_issue`를 기록합니다(원문·해시 없음). label은 호출하는 쪽이 검사합니다(1~60자).
 */
export async function issueApiToken(
  client: Queryable,
  actor: OperatorActor,
  input: { userId: string; label: string },
): Promise<{ token: string; row: ApiTokenRow }> {
  const token = `${AI_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const inserted = await client.query<ApiTokenRow>(
    `INSERT INTO api_tokens (user_id, label, token_hash, prefix) VALUES ($1, $2, $3, $4) RETURNING ${API_TOKEN_COLUMNS}`,
    [input.userId, input.label, hashToken(token), token.slice(0, TOKEN_PREFIX_LENGTH)],
  );
  const row = inserted.rows[0];
  await recordOperatorAction(client, actor, {
    action: 'ai_operator.token_issue',
    targetType: 'api_token',
    targetId: row.id,
    subjectUserId: row.user_id,
    after: { id: row.id, label: row.label, prefix: row.prefix },
  });
  return { token, row };
}

/**
 * 토큰 폐기. 없는 id면 null(호출하는 쪽이 404·종료 1). 이미 폐기된 토큰은 그대로 두고(멱등) 기록만 남깁니다.
 * `FOR UPDATE`로 같은 토큰의 동시 폐기를 줄 세웁니다. HTTP(`PUT …/tokens/{id}/revoke`)와 CLI `revoke-token`이 함께 씁니다.
 */
export async function revokeApiToken(
  client: Queryable,
  actor: OperatorActor,
  tokenId: string,
): Promise<ApiTokenRow | null> {
  const found = await client.query<ApiTokenRow>(
    `SELECT ${API_TOKEN_COLUMNS} FROM api_tokens WHERE id = $1 FOR UPDATE`,
    [tokenId],
  );
  const existing = found.rows[0];
  if (!existing) return null;
  const updated = await client.query<ApiTokenRow>(
    `UPDATE api_tokens SET revoked_at = coalesce(revoked_at, now()) WHERE id = $1 RETURNING ${API_TOKEN_COLUMNS}`,
    [tokenId],
  );
  const row = updated.rows[0];
  await recordOperatorAction(client, actor, {
    action: 'ai_operator.token_revoke',
    targetType: 'api_token',
    targetId: row.id,
    subjectUserId: row.user_id,
    before: { id: row.id, label: row.label, prefix: row.prefix, revoked: existing.revoked_at !== null },
    after: { id: row.id, label: row.label, prefix: row.prefix, revoked: true },
  });
  return row;
}
