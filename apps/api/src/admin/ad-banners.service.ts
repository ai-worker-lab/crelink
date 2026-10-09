import { HttpStatus, Injectable } from '@nestjs/common';
import { AdBannerListResponse, AdBannerStatus, AdBannerView, CRELINK_LIMITS } from '@crelink/shared';
import type { PoolClient } from 'pg';
import { Database, Queryable } from '../database';
import { apiError, insertWithRandomId, UUID_PATTERN } from '../common/http';
import { bodyObject, orderedIds, parseHttpUrl, requiredText, zonedTime } from '../common/input';
import { CreatorService } from '../creator/creator.service';
import { FilesService } from '../files/files.service';

/** 크리링 배너 등록·정렬·내리기를 줄 세우는 트랜잭션 advisory lock 키(보존 작업 931475211, migration 931475210과 다름). */
const AD_BANNERS_LOCK_KEY = 931475212;
/** 크리링 배너 공개 ID 길이. 클릭 주소 `{SHORT}/a/{publicId}/{landingPublicId}`에 씁니다. */
const AD_BANNER_PUBLIC_ID_LENGTH = 10;

/**
 * 크리링 배너 한 장과 상태·누적 노출·클릭. 상태 판정은 한 문장 안의 같은 `now()`이며, 공개 랜딩의 게시 중 조건
 * (`CreatorService.liveAdBanners`: `starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`)과 같습니다.
 * 합계는 node-pg가 bigint를 문자열로 주므로 `::int`로 바꿉니다.
 */
const AD_BANNER_SELECT = `
  SELECT b.id, b.image_file_id, b.still_file_id, b.alt, b.url, b.host, b.starts_at, b.ends_at, b.created_at,
         CASE WHEN b.starts_at > now() THEN 'scheduled'
              WHEN b.ends_at IS NOT NULL AND b.ends_at <= now() THEN 'ended'
              ELSE 'live' END AS status,
         coalesce(s.impressions, 0) AS impressions, coalesce(s.clicks, 0) AS clicks
  FROM ad_banners b
  LEFT JOIN LATERAL (
    SELECT sum(d.impressions)::int AS impressions, sum(d.clicks)::int AS clicks
    FROM ad_banner_daily_stats d WHERE d.ad_banner_id = b.id
  ) s ON true`;
const AD_BANNER_ORDER = 'ORDER BY b.sort_order, b.created_at';

interface AdBannerRow {
  id: string;
  image_file_id: string;
  still_file_id: string | null;
  alt: string;
  url: string;
  host: string;
  starts_at: Date;
  ends_at: Date | null;
  created_at: Date;
  status: AdBannerStatus;
  impressions: number;
  clicks: number;
}

interface StoredBanner {
  image_file_id: string;
  still_file_id: string | null;
  host: string;
  starts_at: Date;
  ends_at: Date | null;
  ended: boolean;
}

function bannerUrl(value: unknown): { url: string; host: string } {
  const url = typeof value === 'string' ? parseHttpUrl(value.trim()) : null;
  if (!url) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'link_url_invalid',
      'http:// 또는 https://로 시작하는 올바른 주소를 입력해 주세요.',
    );
  }
  return { url: url.href, host: url.hostname };
}

function assertPeriod(startsMs: number, endsMs: number | null): void {
  if (endsMs !== null && endsMs <= startsMs) {
    throw apiError(HttpStatus.BAD_REQUEST, 'banner_period_invalid', '게시 끝은 시작보다 뒤여야 합니다.');
  }
}

/** 운영자 크리링 배너 운영(R20 ④⑨, R14). 설계: docs/specs/crelink-ad-banner.md `서버 규칙`·`운영자 표 누적 집계`. */
@Injectable()
export class AdBannersService {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly files: FilesService,
  ) {}

  private view(row: AdBannerRow): AdBannerView {
    return {
      id: row.id,
      image: { fileId: row.image_file_id, url: this.files.imageUrl(row.image_file_id) },
      stillImage: this.files.imageRef(row.still_file_id),
      alt: row.alt,
      url: row.url,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at?.toISOString() ?? null,
      status: row.status,
      impressions: row.impressions,
      clicks: row.clicks,
      createdAt: row.created_at.toISOString(),
    };
  }

  private async one(db: Queryable, id: string): Promise<AdBannerView> {
    const result = await db.query<AdBannerRow>(`${AD_BANNER_SELECT} WHERE b.id = $1`, [id]);
    return this.view(result.rows[0]);
  }

  private async lock(client: PoolClient): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [AD_BANNERS_LOCK_KEY]);
  }

  /** 행 잠금으로 같은 배너의 수정·내리기를 줄 세웁니다. 없거나 uuid가 아니면 404 `ad_banner_not_found`. */
  private async stored(client: PoolClient, id: string): Promise<StoredBanner> {
    const found = UUID_PATTERN.test(id)
      ? await client.query<StoredBanner>(
          `SELECT image_file_id, still_file_id, host, starts_at, ends_at,
                  ends_at IS NOT NULL AND ends_at <= now() AS ended
           FROM ad_banners WHERE id = $1 FOR UPDATE`,
          [id],
        )
      : null;
    if (!found?.rowCount) throw apiError(HttpStatus.NOT_FOUND, 'ad_banner_not_found', '광고 배너를 찾을 수 없습니다.');
    return found.rows[0];
  }

  /** 새 이미지는 운영자(`users.role = 'operator'`)가 올린 파일이어야 합니다. 운영자 여럿이 함께 관리하므로 올린 사람은 묻지 않습니다. */
  private async operatorFileId(db: Queryable, value: unknown): Promise<string> {
    if (typeof value === 'string' && UUID_PATTERN.test(value)) {
      const owned = await db.query(
        `SELECT 1 FROM files f JOIN users u ON u.id = f.owner_user_id WHERE f.id = $1 AND u.role = 'operator'`,
        [value],
      );
      if (owned.rowCount) return value;
    }
    throw apiError(HttpStatus.NOT_FOUND, 'file_not_found', '이미지를 찾을 수 없습니다. 다시 올려 주세요.');
  }

  /**
   * 이미지 필드. 저장된 값과 같으면 소유 검사를 건너뜁니다(다른 운영자가 올린 이미지를 그대로 둔 수정).
   * 필수 이미지에 null·빈 값이 오면 400 `validation_failed`.
   */
  private async imageFileId(db: Queryable, value: unknown, storedId: string | null): Promise<string> {
    if (value === null || value === undefined || value === '') {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '이미지를 올려 주세요.');
    }
    return value === storedId ? storedId : this.operatorFileId(db, value);
  }

  private async stillFileId(db: Queryable, value: unknown, storedId: string | null): Promise<string | null> {
    if (value === null || value === undefined) return null;
    return value === storedId ? storedId : this.operatorFileId(db, value);
  }

  /** 정지 이미지 규칙: 이미지가 움직이면 움직이지 않는 정지 이미지가 필요하고, 움직이지 않으면 정지 이미지를 두지 않습니다. */
  private async assertStillRule(db: Queryable, imageId: string, stillId: string | null): Promise<void> {
    const animated = await this.files.isAnimated(db, imageId);
    if (animated && !stillId) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '움직이는 이미지는 정지 이미지를 함께 올려 주세요.');
    }
    if (!animated && stillId) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        '움직이지 않는 이미지에는 정지 이미지를 두지 않습니다.',
      );
    }
    if (stillId && (await this.files.isAnimated(db, stillId))) {
      throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '정지 이미지는 움직이지 않는 이미지여야 합니다.');
    }
  }

  private async assertDomainAllowed(db: Queryable, host: string): Promise<void> {
    if (await this.creator.blockedDomainFor(db, host)) {
      throw apiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'link_domain_blocked',
        '운영 정책으로 차단된 도메인이라 저장할 수 없습니다.',
      );
    }
  }

  /** `GET /api/admin/ad-banners`: 전체를 순서대로, `counts`는 같은 문장의 결과에서 셉니다. 시험이 트랜잭션 안에서 부를 수 있게 db를 받습니다. */
  async list(db: Queryable = this.database.pool): Promise<AdBannerListResponse> {
    const result = await db.query<AdBannerRow>(`${AD_BANNER_SELECT} ${AD_BANNER_ORDER}`);
    const items = result.rows.map((row) => this.view(row));
    const counts = { all: items.length, live: 0, scheduled: 0, ended: 0 };
    for (const item of items) counts[item.status] += 1;
    return { items, counts };
  }

  /** `POST /api/admin/ad-banners`: 맨 뒤 순서(`coalesce(max(sort_order) + 1, 0)`)로 등록합니다. */
  async create(operatorId: string, body: unknown): Promise<AdBannerView> {
    const input = bodyObject(body);
    const alt = requiredText(input.alt, '대체 문구', CRELINK_LIMITS.bannerAltMax);
    const { url, host } = bannerUrl(input.url);
    const startsAt = zonedTime(input.startsAt, '게시 시작');
    const endsAt = input.endsAt === undefined || input.endsAt === null ? null : zonedTime(input.endsAt, '게시 끝');
    assertPeriod(startsAt.ms, endsAt?.ms ?? null);
    return this.database.transaction(async (client) => {
      const imageId = await this.imageFileId(client, input.imageFileId, null);
      const stillId = await this.stillFileId(client, input.stillImageFileId, null);
      await this.assertStillRule(client, imageId, stillId);
      await this.assertDomainAllowed(client, host);
      await this.lock(client);
      const id = await insertWithRandomId(AD_BANNER_PUBLIC_ID_LENGTH, async (publicId) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO ad_banners (public_id, image_file_id, still_file_id, alt, url, host, starts_at, ends_at, sort_order, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT coalesce(max(sort_order) + 1, 0) FROM ad_banners), $9)
           ON CONFLICT (public_id) DO NOTHING
           RETURNING id`,
          [publicId, imageId, stillId, alt, url, host, startsAt.text, endsAt?.text ?? null, operatorId],
        );
        return inserted.rows[0]?.id;
      });
      return this.one(client, id);
    });
  }

  /**
   * `PATCH /api/admin/ad-banners/{id}`: 바뀐 필드만. 다른 운영자가 등록한 배너도 고칠 수 있습니다.
   * 결과가 게시 중·예약이면 저장된(또는 새) 호스트를 차단 도메인으로 다시 검사합니다(차단으로 내려간 배너를 기간만 고쳐 다시 여는 길을 막음).
   */
  async update(id: string, body: unknown): Promise<AdBannerView> {
    const input = bodyObject(body);
    const changes: Record<string, unknown> = {};
    if (input.alt !== undefined) changes.alt = requiredText(input.alt, '대체 문구', CRELINK_LIMITS.bannerAltMax);
    if (input.url !== undefined) Object.assign(changes, bannerUrl(input.url));
    const startsAt = input.startsAt === undefined ? undefined : zonedTime(input.startsAt, '게시 시작');
    const endsAt =
      input.endsAt === undefined ? undefined : input.endsAt === null ? null : zonedTime(input.endsAt, '게시 끝');
    return this.database.transaction(async (client) => {
      const existing = await this.stored(client, id);

      if (startsAt !== undefined || endsAt !== undefined) {
        const startsMs = startsAt?.ms ?? existing.starts_at.getTime();
        const endsMs = endsAt === undefined ? (existing.ends_at?.getTime() ?? null) : (endsAt?.ms ?? null);
        assertPeriod(startsMs, endsMs);
        if (startsAt !== undefined) changes.starts_at = startsAt.text;
        if (endsAt !== undefined) changes.ends_at = endsAt?.text ?? null;
      }

      const imageChanged = input.imageFileId !== undefined && input.imageFileId !== existing.image_file_id;
      if (imageChanged && input.stillImageFileId === undefined) {
        throw apiError(
          HttpStatus.BAD_REQUEST,
          'validation_failed',
          '이미지를 바꾸면 정지 이미지(움직이지 않으면 null)도 함께 보내 주세요.',
        );
      }
      if (input.imageFileId !== undefined || input.stillImageFileId !== undefined) {
        const imageId =
          input.imageFileId === undefined
            ? existing.image_file_id
            : await this.imageFileId(client, input.imageFileId, existing.image_file_id);
        const stillId =
          input.stillImageFileId === undefined
            ? existing.still_file_id
            : await this.stillFileId(client, input.stillImageFileId, existing.still_file_id);
        await this.assertStillRule(client, imageId, stillId);
        changes.image_file_id = imageId;
        changes.still_file_id = stillId;
      }

      const columns = Object.keys(changes);
      if (!columns.length) return this.one(client, id);
      // 결과가 게시 중·예약(끝이 없거나 지금보다 뒤)이면 최종 호스트를 다시 검사합니다.
      const host = typeof changes.host === 'string' ? changes.host : existing.host;
      const finalEnds = 'ends_at' in changes ? changes.ends_at : existing.ends_at;
      const open = await client.query<{ open: boolean }>(
        'SELECT $1::timestamptz IS NULL OR $1::timestamptz > now() AS open',
        [finalEnds],
      );
      if (open.rows[0].open) await this.assertDomainAllowed(client, host);
      await client.query(
        `UPDATE ad_banners SET ${[...columns.map((column, index) => `${column} = $${index + 2}`), 'updated_at = now()'].join(', ')}
         WHERE id = $1`,
        [id, ...columns.map((column) => changes[column])],
      );
      return this.one(client, id);
    });
  }

  /**
   * `PUT /api/admin/ad-banners/{id}/end`: 게시 끝을 지금으로(이미 더 이르면 그대로), 예약 배너는 시작도 지금으로 당겨 CHECK를 지킵니다.
   * 이미 끝난 배너는 바꾸지 않고 그대로 돌려줍니다(멱등).
   */
  async end(id: string): Promise<AdBannerView> {
    return this.database.transaction(async (client) => {
      await this.lock(client);
      const existing = await this.stored(client, id);
      if (!existing.ended) {
        await client.query(
          `UPDATE ad_banners SET ends_at = least(coalesce(ends_at, now()), now()), starts_at = least(starts_at, now()),
                                 updated_at = now()
           WHERE id = $1`,
          [id],
        );
      }
      return this.one(client, id);
    });
  }

  /** `PUT /api/admin/ad-banners/order`: 잠금 뒤 전체 id를 검사(400 `order_mismatch`)하고 0..n-1로 다시 매깁니다. */
  async reorder(body: unknown): Promise<AdBannerView[]> {
    return this.database.transaction(async (client) => {
      await this.lock(client);
      const current = await client.query<{ id: string }>('SELECT id FROM ad_banners');
      const ids = orderedIds(
        body,
        current.rows.map((row) => row.id),
      );
      await client.query(
        `UPDATE ad_banners b SET sort_order = o.ordinality - 1, updated_at = now()
         FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ordinality)
         WHERE b.id = o.id AND b.sort_order IS DISTINCT FROM o.ordinality - 1`,
        [ids],
      );
      return (await this.list(client)).items;
    });
  }
}
