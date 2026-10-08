import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CreatorLandingState,
  CRELINK_LIMITS,
  CRELINK_WEB_PATHS,
  LinkLimits,
  LinkView,
  PortfolioItemView,
  ShortLinkView,
  SocialLinkView,
} from '@crelink/shared';
import { AppConfig } from '../config.service';
import { Database, Queryable } from '../database';
import { apiError } from '../common/http';
import { FilesService } from '../files/files.service';

export interface LinkRow {
  id: string;
  title: string;
  url: string;
  host: string;
  description: string | null;
  thumbnail_file_id: string | null;
  hidden: boolean;
  blocked: boolean;
  blocked_reason: string | null;
  position: number;
}

/** LinkView로 바꿀 때 읽는 links 컬럼. */
export const LINK_COLUMNS =
  'id, title, url, host, description, thumbnail_file_id, hidden, blocked_at IS NOT NULL AS blocked, blocked_reason, position';

export interface PortfolioRow {
  id: string;
  title: string;
  url: string | null;
  image_file_id: string | null;
  description: string | null;
  position: number;
}

export const PORTFOLIO_COLUMNS = 'id, title, url, image_file_id, description, position';

/** 사용자의 랜딩·리스트 구역·단축 URL id. MVP는 사용자당 하나씩입니다. */
export interface CreatorContext {
  userId: string;
  landingId: string;
  blockId: string;
  shortLinkId: string;
}

/** 공개 랜딩 행. `publicLanding`이 없음(404)·정지(410)를 걸러 낸 뒤 돌려줍니다. */
export interface PublicLandingRow {
  id: string;
  user_id: string;
  display_name: string | null;
  bio: string | null;
  avatar_file_id: string | null;
  guestbook_enabled: boolean;
}

/** 편집 화면·운영자 화면이 함께 쓰는 조회와 응답 모양. */
@Injectable()
export class CreatorService {
  constructor(
    private readonly database: Database,
    private readonly files: FilesService,
    private readonly config: AppConfig,
  ) {}

  /** 방문자가 여는 랜딩. 형식이 틀리거나 없으면 404 `landing_not_found`, 크리에이터가 정지되었으면 410 `creator_suspended`. */
  async publicLanding(db: Queryable, publicId: string): Promise<PublicLandingRow> {
    const result = /^[a-z0-9]{10}$/.test(publicId)
      ? await db.query<PublicLandingRow & { suspended: boolean }>(
          `SELECT l.id, l.user_id, l.display_name, l.bio, l.avatar_file_id, l.guestbook_enabled,
                  u.suspended_at IS NOT NULL AS suspended
           FROM landings l JOIN users u ON u.id = l.user_id WHERE l.public_id = $1`,
          [publicId],
        )
      : null;
    const landing = result?.rows[0];
    if (!landing) throw apiError(HttpStatus.NOT_FOUND, 'landing_not_found', '랜딩페이지를 찾을 수 없습니다.');
    if (landing.suspended) {
      throw apiError(HttpStatus.GONE, 'creator_suspended', '운영 정책에 따라 지금은 볼 수 없는 페이지입니다.');
    }
    return landing;
  }

  async context(db: Queryable, userId: string): Promise<CreatorContext> {
    const result = await db.query<CreatorContext>(
      `SELECT l.user_id AS "userId", l.id AS "landingId", b.id AS "blockId", sl.id AS "shortLinkId"
       FROM landings l
       JOIN landing_blocks b ON b.landing_id = l.id AND b.type = 'list'
       JOIN short_links sl ON sl.user_id = l.user_id
       WHERE l.user_id = $1
       ORDER BY b.position LIMIT 1`,
      [userId],
    );
    if (!result.rowCount) {
      throw apiError(HttpStatus.NOT_FOUND, 'creator_not_found', '크리에이터를 찾을 수 없습니다.');
    }
    return result.rows[0];
  }

  linkView(row: LinkRow): LinkView {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      description: row.description,
      thumbnail: this.files.imageRef(row.thumbnail_file_id),
      faviconUrl: `https://${row.host}/favicon.ico`,
      hidden: row.hidden,
      blocked: row.blocked,
      blockedReason: row.blocked_reason,
      position: row.position,
    };
  }

  async links(db: Queryable, userId: string): Promise<LinkView[]> {
    const rows = await db.query<LinkRow>(
      `SELECT ${LINK_COLUMNS} FROM links WHERE user_id = $1 ORDER BY position, created_at`,
      [userId],
    );
    return rows.rows.map((row) => this.linkView(row));
  }

  /** 한도(R13): 보이는(숨기지 않고 차단되지 않은) 링크 ≤ 5 + 추가 슬롯, 전체 ≤ 50. */
  async limits(db: Queryable, userId: string): Promise<LinkLimits & { extraLinkSlots: number }> {
    const result = await db.query<{ extra_link_slots: number; visible: number; total: number }>(
      `SELECT u.extra_link_slots,
              count(l.id) FILTER (WHERE NOT l.hidden AND l.blocked_at IS NULL)::int AS visible,
              count(l.id)::int AS total
       FROM users u LEFT JOIN links l ON l.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
      [userId],
    );
    const row = result.rows[0];
    return {
      extraLinkSlots: row.extra_link_slots,
      visibleMax: CRELINK_LIMITS.freeVisibleLinks + row.extra_link_slots,
      visibleUsed: row.visible,
      totalMax: CRELINK_LIMITS.totalLinks,
      totalUsed: row.total,
    };
  }

  /** 링크 호스트가 차단 도메인이거나 그 하위 도메인이면 차단 도메인을, 아니면 null. */
  async blockedDomainFor(db: Queryable, host: string): Promise<string | null> {
    const result = await db.query<{ domain: string }>(
      `SELECT domain FROM blocked_domains WHERE $1 = domain OR right($1, length(domain) + 1) = '.' || domain LIMIT 1`,
      [host],
    );
    return result.rows[0]?.domain ?? null;
  }

  async shortLink(db: Queryable, userId: string): Promise<ShortLinkView> {
    const result = await db.query<{ slug: string; is_auto: boolean; next_change: Date | null }>(
      `SELECT s.slug, s.is_auto,
              CASE WHEN sl.slug_changed_at + make_interval(days => $2) > now()
                   THEN sl.slug_changed_at + make_interval(days => $2) END AS next_change
       FROM short_links sl JOIN short_slugs s ON s.short_link_id = sl.id AND s.retired_at IS NULL
       WHERE sl.user_id = $1`,
      [userId, CRELINK_LIMITS.slugChangeIntervalDays],
    );
    const row = result.rows[0];
    return {
      url: `${this.config.shortLinkBaseUrl}/${row.slug}`,
      slug: row.slug,
      isAutoSlug: row.is_auto,
      nextChangeAvailableAt: row.next_change?.toISOString() ?? null,
    };
  }

  landingUrl(publicId: string): string {
    return `${this.config.webUrl}${CRELINK_WEB_PATHS.landing(publicId)}`;
  }

  async socials(db: Queryable, landingId: string): Promise<SocialLinkView[]> {
    const result = await db.query<SocialLinkView>(
      'SELECT platform, url FROM social_links WHERE landing_id = $1 ORDER BY position',
      [landingId],
    );
    return result.rows;
  }

  async portfolio(db: Queryable, landingId: string): Promise<PortfolioItemView[]> {
    const result = await db.query<PortfolioRow>(
      `SELECT ${PORTFOLIO_COLUMNS} FROM portfolio_items WHERE landing_id = $1 ORDER BY position, created_at`,
      [landingId],
    );
    return result.rows.map((row) => this.portfolioView(row));
  }

  portfolioView(row: PortfolioRow): PortfolioItemView {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      image: this.files.imageRef(row.image_file_id),
      description: row.description,
      position: row.position,
    };
  }

  /** `GET /api/me/landing` 응답. */
  async landingState(userId: string): Promise<CreatorLandingState> {
    const db = this.database.pool;
    const landing = await db.query<{
      id: string;
      public_id: string;
      display_name: string | null;
      bio: string | null;
      avatar_file_id: string | null;
      guestbook_enabled: boolean;
    }>('SELECT id, public_id, display_name, bio, avatar_file_id, guestbook_enabled FROM landings WHERE user_id = $1', [
      userId,
    ]);
    const row = landing.rows[0];
    const [shortLink, links, socials, portfolio, limits] = await Promise.all([
      this.shortLink(db, userId),
      this.links(db, userId),
      this.socials(db, row.id),
      this.portfolio(db, row.id),
      this.limits(db, userId),
    ]);
    const { visibleMax, visibleUsed, totalMax, totalUsed } = limits;
    return {
      landing: {
        publicId: row.public_id,
        url: this.landingUrl(row.public_id),
        displayName: row.display_name,
        bio: row.bio,
        avatar: this.files.imageRef(row.avatar_file_id),
        guestbookEnabled: row.guestbook_enabled,
      },
      shortLink,
      links,
      socials,
      portfolio,
      limits: { visibleMax, visibleUsed, totalMax, totalUsed },
    };
  }
}
