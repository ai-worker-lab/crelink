import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CRELINK_LIMITS,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  SlugAvailabilityResponse,
  SlugUnavailableReason,
} from '@crelink/shared';
import { Database, isUniqueViolation, Queryable } from '../database';
import { apiError } from '../common/http';

const SLUG_MESSAGES: Record<'slug_invalid' | 'slug_reserved' | 'slug_taken', string> = {
  slug_invalid: '주소는 영소문자·숫자·하이픈(-)으로 3~30자이며 하이픈으로 시작하거나 끝날 수 없습니다.',
  slug_reserved: '서비스에서 쓰는 주소라 사용할 수 없습니다.',
  slug_taken: '이미 사용 중인 주소입니다.',
};

/**
 * 단축 주소 규칙(R8). 형식·예약어 → 현재 주소와 같은지 → 다른 단축 URL이 쓰거나 예약 중인지(옛 주소는 retired_at + 90일까지 예약)를 봅니다.
 * 자기 옛 주소는 예약 기간 안이어도 되돌릴 수 있습니다.
 */
@Injectable()
export class SlugService {
  constructor(private readonly database: Database) {}

  private async check(
    db: Queryable,
    userId: string,
    raw: unknown,
  ): Promise<{ slug: string; shortLinkId: string; reason: SlugUnavailableReason | null }> {
    const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    const current = await db.query<{ short_link_id: string; slug: string }>(
      `SELECT sl.id AS short_link_id, s.slug FROM short_links sl
       JOIN short_slugs s ON s.short_link_id = sl.id AND s.retired_at IS NULL WHERE sl.user_id = $1`,
      [userId],
    );
    const shortLinkId = current.rows[0].short_link_id;
    if (slug.length < CRELINK_LIMITS.slugMinLength || slug.length > CRELINK_LIMITS.slugMaxLength) {
      return { slug, shortLinkId, reason: 'slug_invalid' };
    }
    if (!SLUG_PATTERN.test(slug)) return { slug, shortLinkId, reason: 'slug_invalid' };
    if (RESERVED_SLUGS.includes(slug)) return { slug, shortLinkId, reason: 'slug_reserved' };
    if (current.rows[0].slug === slug) return { slug, shortLinkId, reason: 'same_as_current' };
    const taken = await db.query(
      `SELECT 1 FROM short_slugs WHERE slug = $1 AND short_link_id <> $2
         AND (retired_at IS NULL OR retired_at > now() - make_interval(days => $3))`,
      [slug, shortLinkId, CRELINK_LIMITS.retiredSlugGraceDays],
    );
    return { slug, shortLinkId, reason: taken.rowCount ? 'slug_taken' : null };
  }

  async availability(userId: string, raw: unknown): Promise<SlugAvailabilityResponse> {
    const { slug, reason } = await this.check(this.database.pool, userId, raw);
    return { slug, available: reason === null, reason };
  }

  /** 주소 변경. 같은 주소면 아무것도 바꾸지 않습니다. */
  async change(userId: string, raw: unknown): Promise<void> {
    try {
      await this.database.transaction(async (client) => {
        const locked = await client.query<{ next_change: Date | null }>(
          `SELECT CASE WHEN slug_changed_at + make_interval(days => $2) > now()
                       THEN slug_changed_at + make_interval(days => $2) END AS next_change
           FROM short_links WHERE user_id = $1 FOR UPDATE`,
          [userId, CRELINK_LIMITS.slugChangeIntervalDays],
        );
        const { slug, shortLinkId, reason } = await this.check(client, userId, raw);
        if (reason === 'same_as_current') return;
        if (reason)
          throw apiError(
            reason === 'slug_taken' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST,
            reason,
            SLUG_MESSAGES[reason],
          );
        const nextChange = locked.rows[0].next_change;
        if (nextChange) {
          throw apiError(
            HttpStatus.TOO_MANY_REQUESTS,
            'slug_change_too_soon',
            `주소는 30일에 한 번 바꿀 수 있습니다. ${nextChange.toISOString().slice(0, 10)} 이후에 다시 시도해 주세요.`,
          );
        }
        await client.query(
          'UPDATE short_slugs SET retired_at = now() WHERE short_link_id = $1 AND retired_at IS NULL',
          [shortLinkId],
        );
        // 자기 옛 주소면 되살리고, 예약 기간이 끝난 남의 옛 주소는 지운 뒤 새로 만듭니다.
        const revived = await client.query(
          'UPDATE short_slugs SET retired_at = NULL WHERE slug = $1 AND short_link_id = $2',
          [slug, shortLinkId],
        );
        if (!revived.rowCount) {
          await client.query('DELETE FROM short_slugs WHERE slug = $1 AND retired_at IS NOT NULL', [slug]);
          await client.query('INSERT INTO short_slugs (slug, short_link_id, is_auto) VALUES ($1, $2, false)', [
            slug,
            shortLinkId,
          ]);
        }
        await client.query('UPDATE short_links SET slug_changed_at = now() WHERE id = $1', [shortLinkId]);
      });
    } catch (error) {
      // 다른 사용자가 같은 주소를 동시에 가져간 경우.
      if (isUniqueViolation(error)) throw apiError(HttpStatus.CONFLICT, 'slug_taken', SLUG_MESSAGES.slug_taken);
      throw error;
    }
  }
}
