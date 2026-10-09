import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BannerLimits,
  CreatorBannerView,
  CreatorLandingState,
  CRELINK_LIMITS,
  CRELINK_WEB_PATHS,
  LinkLimits,
  LinkView,
  PortfolioItemView,
  PublicBannerView,
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

/**
 * 구역 `b`(landing_blocks 별칭)의 슬롯 앞 링크 수(숨김·차단 포함). `slot_position`이 NULL(맨 뒤)이면 NULL.
 * 편집 상태의 `slot.slotIndex`와 `PUT /api/me/links/order`의 위치 유지(slotIndex 생략)가 같은 식을 씁니다.
 */
export const SLOT_INDEX_SQL = `CASE WHEN b.slot_position IS NULL THEN NULL
  ELSE (SELECT count(*)::int FROM links sl_l WHERE sl_l.block_id = b.id AND sl_l.position < b.slot_position) END`;

/** 공개 랜딩·미리보기에 그리는 배너 한 장의 원본 행(크리링 배너·크리에이터 배너 공통). */
export interface BannerImageRow {
  /** uuid. 노출 기록(`recordAdStat`)에 씁니다. */
  id: string;
  public_id: string;
  image_file_id: string;
  still_file_id: string | null;
  alt: string;
  /** 저장된 연결 URL. 크리에이터 배너는 없을 수 있습니다. */
  url: string | null;
}

const BANNER_IMAGE_COLUMNS = 'id, public_id, image_file_id, still_file_id, alt, url';

export interface CreatorBannerRow {
  id: string;
  image_file_id: string;
  still_file_id: string | null;
  alt: string;
  url: string | null;
  hidden: boolean;
  blocked: boolean;
  blocked_reason: string | null;
  position: number;
}

/** CreatorBannerView로 바꿀 때 읽는 creator_banners 컬럼. */
export const CREATOR_BANNER_COLUMNS =
  'id, image_file_id, still_file_id, alt, url, hidden, blocked_at IS NOT NULL AS blocked, blocked_reason, position';

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
  /** 계정에 배너 슬롯이 부여됐는지(`users.banner_slot_granted_at IS NOT NULL`, R21 ①). */
  banner_slot_granted: boolean;
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
                  u.banner_slot_granted_at IS NOT NULL AS banner_slot_granted, u.suspended_at IS NOT NULL AS suspended
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

  /** 편집 상태의 슬롯 위치·종류·부여일(R20 ①②, R21 ①). 슬롯은 `position`이 가장 앞인 list 구역에만 붙습니다(`context()`와 같은 기준). */
  async bannerSlot(db: Queryable, landingId: string): Promise<CreatorLandingState['slot']> {
    const result = await db.query<{ granted_at: Date | null; slot_index: number | null }>(
      `SELECT u.banner_slot_granted_at AS granted_at, ${SLOT_INDEX_SQL} AS slot_index
       FROM landings la
       JOIN users u ON u.id = la.user_id
       JOIN landing_blocks b ON b.landing_id = la.id AND b.type = 'list'
       WHERE la.id = $1
       ORDER BY b.position LIMIT 1`,
      [landingId],
    );
    const row = result.rows[0];
    return {
      kind: row.granted_at ? 'creator' : 'ad',
      slotIndex: row.slot_index,
      grantedAt: row.granted_at?.toISOString() ?? null,
    };
  }

  /** 지금 게시 중인 크리링 배너(`starts_at <= now() < ends_at`, 끝 없음 포함), 순서대로. */
  async liveAdBanners(db: Queryable): Promise<BannerImageRow[]> {
    const result = await db.query<BannerImageRow>(
      `SELECT ${BANNER_IMAGE_COLUMNS} FROM ad_banners
       WHERE starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
       ORDER BY sort_order, created_at`,
    );
    return result.rows;
  }

  /** 이 랜딩의 방문자에게 보이는(숨김·차단 아님) 크리에이터 배너, 순서대로. 부여 여부는 호출하는 쪽이 봅니다. */
  async visibleCreatorBanners(db: Queryable, landingId: string): Promise<BannerImageRow[]> {
    const result = await db.query<BannerImageRow>(
      `SELECT ${BANNER_IMAGE_COLUMNS} FROM creator_banners
       WHERE landing_id = $1 AND NOT hidden AND blocked_at IS NULL
       ORDER BY position, created_at`,
      [landingId],
    );
    return result.rows;
  }

  /** 배너 한 장의 공개·미리보기 모양. clickUrl 규칙은 호출하는 쪽이 정합니다(공개 API는 기록 주소, 미리보기는 저장된 URL). */
  publicBannerView(row: BannerImageRow, clickUrl: string | null): PublicBannerView {
    return {
      id: row.public_id,
      imageUrl: this.files.imageUrl(row.image_file_id),
      stillImageUrl: row.still_file_id ? this.files.imageUrl(row.still_file_id) : null,
      alt: row.alt,
      clickUrl,
    };
  }

  creatorBannerView(row: CreatorBannerRow): CreatorBannerView {
    return {
      id: row.id,
      image: { fileId: row.image_file_id, url: this.files.imageUrl(row.image_file_id) },
      stillImage: this.files.imageRef(row.still_file_id),
      alt: row.alt,
      url: row.url,
      hidden: row.hidden,
      blocked: row.blocked,
      blockedReason: row.blocked_reason,
      position: row.position,
    };
  }

  /** 이 랜딩의 크리에이터 배너 전체(숨김·차단·회수 뒤 보관분 포함), 순서대로. */
  async creatorBanners(db: Queryable, landingId: string): Promise<CreatorBannerView[]> {
    const result = await db.query<CreatorBannerRow>(
      `SELECT ${CREATOR_BANNER_COLUMNS} FROM creator_banners WHERE landing_id = $1 ORDER BY position, created_at`,
      [landingId],
    );
    return result.rows.map((row) => this.creatorBannerView(row));
  }

  /** 크리에이터 배너 한도(R21 ②): 랜딩마다 보이는(숨김·차단 아님) 배너 ≤ `BANNER_SLOT_MAX`, 전체 ≤ `BANNER_SLOT_TOTAL_MAX`. */
  async bannerLimits(db: Queryable, landingId: string): Promise<BannerLimits> {
    const result = await db.query<{ visible: number; total: number }>(
      `SELECT count(*) FILTER (WHERE NOT hidden AND blocked_at IS NULL)::int AS visible, count(*)::int AS total
       FROM creator_banners WHERE landing_id = $1`,
      [landingId],
    );
    const { visibleMax, totalMax } = this.config.bannerSlotLimits;
    return { visibleMax, visibleUsed: result.rows[0].visible, totalMax, totalUsed: result.rows[0].total };
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
    const [shortLink, links, socials, portfolio, limits, slot, adBanners, banners, bannerLimits] = await Promise.all([
      this.shortLink(db, userId),
      this.links(db, userId),
      this.socials(db, row.id),
      this.portfolio(db, row.id),
      this.limits(db, userId),
      this.bannerSlot(db, row.id),
      this.liveAdBanners(db),
      this.creatorBanners(db, row.id),
      this.bannerLimits(db, row.id),
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
      slot,
      // 미리보기용이라 클릭 주소는 저장된 URL입니다(기록 주소 아님, R7 ⑥).
      adBanners: adBanners.map((banner) => this.publicBannerView(banner, banner.url)),
      banners,
      bannerLimits,
    };
  }
}
