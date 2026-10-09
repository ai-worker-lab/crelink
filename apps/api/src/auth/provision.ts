import { AccountKind, CRELINK_LIMITS, RESERVED_SLUGS, UserRole } from '@crelink/shared';
import { insertWithRandomId } from '../common/http';
import type { Queryable } from '../database';

/**
 * 새 계정: users → landings → landing_blocks(list) → short_links → short_slugs(자동). 호출하는 쪽의 트랜잭션 안에서 부릅니다.
 * 구글 첫 로그인(`AuthService`, 이어서 user_identities)과 AI 계정 CLI(`src/cli/ai-operator.ts`)가 함께 씁니다.
 * AI 계정은 `role='operator'`여야 합니다(DB CHECK `users_ai_is_operator`).
 */
export async function provisionAccount(
  client: Queryable,
  account: { email: string; role: UserRole; kind: AccountKind },
): Promise<string> {
  const user = await client.query<{ id: string }>(
    'INSERT INTO users (email, role, kind) VALUES ($1, $2, $3) RETURNING id',
    [account.email, account.role, account.kind],
  );
  const userId = user.rows[0].id;
  const landingId = await insertWithRandomId(CRELINK_LIMITS.landingPublicIdLength, async (publicId) => {
    const landing = await client.query<{ id: string }>(
      'INSERT INTO landings (user_id, public_id) VALUES ($1, $2) ON CONFLICT (public_id) DO NOTHING RETURNING id',
      [userId, publicId],
    );
    return landing.rows[0]?.id;
  });
  await client.query("INSERT INTO landing_blocks (landing_id, type, position) VALUES ($1, 'list', 0)", [landingId]);
  const shortLink = await client.query<{ id: string }>(
    'INSERT INTO short_links (user_id, landing_id) VALUES ($1, $2) RETURNING id',
    [userId, landingId],
  );
  await insertWithRandomId(CRELINK_LIMITS.autoSlugLength, async (slug) => {
    if (RESERVED_SLUGS.includes(slug)) return undefined;
    const inserted = await client.query(
      'INSERT INTO short_slugs (slug, short_link_id, is_auto) VALUES ($1, $2, true) ON CONFLICT (slug) DO NOTHING',
      [slug, shortLink.rows[0].id],
    );
    return inserted.rowCount ? slug : undefined;
  });
  return userId;
}
