import { HttpStatus, Injectable } from '@nestjs/common';
import { CreatorBannerView, CRELINK_LIMITS } from '@crelink/shared';
import type { PoolClient } from 'pg';
import { Database } from '../database';
import { apiError, insertWithRandomId, UUID_PATTERN } from '../common/http';
import { bodyObject, optionalBoolean, orderedIds, requiredText } from '../common/input';
import { FilesService } from '../files/files.service';
import { CREATOR_BANNER_COLUMNS, CreatorBannerRow, CreatorService } from './creator.service';
import { linkUrl } from './links.service';

/** 배너 공개 ID 길이. 클릭 주소 `{SHORT}/b/{publicId}`와 Caddy 정규식 `[a-z0-9]{10}`에 씁니다. */
const BANNER_PUBLIC_ID_LENGTH = 10;

/** 소유 확인 뒤 정지 이미지 규칙에 쓰는 기존 행. */
type OwnedBannerRow = CreatorBannerRow & { landing_id: string };

/** 선택 연결 URL. undefined는 "바꾸지 않음", null·빈 문자열은 "연결 없음", 그 밖에는 http·https(아니면 400 `link_url_invalid`). */
function bannerUrl(value: unknown): { url: string | null; host: string | null } | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return { url: null, host: null };
  return linkUrl(value);
}

/** 이미지 필드. 필수라 null·빈 값은 400 `validation_failed`, 그 밖의 값은 소유 확인(`FilesService.ownedFileId`)으로 넘깁니다. */
function requiredImage(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', '배너 이미지를 올려 주세요.');
  }
  return value;
}

function invalidStill(message: string) {
  return apiError(HttpStatus.BAD_REQUEST, 'validation_failed', message);
}

/**
 * 크리에이터 배너 쓰기(R21 ②④⑤⑥, R14). 근거: docs/specs/crelink-ad-banner.md `서버 규칙`.
 * 모든 쓰기는 한 트랜잭션에서 사용자 잠금 → 부여 확인 → 배너·파일 소유 확인 → 한도 순서로 합니다.
 * 회수(`UPDATE users SET banner_slot_granted_at = NULL`)가 같은 행 잠금으로 줄을 서므로, 회수 뒤에 끝나는 쓰기는 403입니다.
 */
@Injectable()
export class BannersService {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly files: FilesService,
  ) {}

  /** 사용자 행을 잠그고 배너 슬롯이 부여되지 않았으면 403 `banner_slot_not_granted`(보관 배너를 고치는 길 없음, R21 ⑤). */
  private async lockGranted(client: PoolClient, userId: string): Promise<void> {
    const user = await client.query<{ granted: boolean }>(
      'SELECT banner_slot_granted_at IS NOT NULL AS granted FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (!user.rows[0]?.granted) {
      throw apiError(
        HttpStatus.FORBIDDEN,
        'banner_slot_not_granted',
        '배너 슬롯이 부여되지 않아 배너를 바꿀 수 없습니다. 새로고침해 주세요.',
      );
    }
  }

  private async ownBanner(client: PoolClient, userId: string, bannerId: string): Promise<OwnedBannerRow> {
    const found = UUID_PATTERN.test(bannerId)
      ? await client.query<OwnedBannerRow>(
          `SELECT ${CREATOR_BANNER_COLUMNS}, landing_id FROM creator_banners WHERE id = $1 AND user_id = $2 FOR UPDATE`,
          [bannerId, userId],
        )
      : null;
    if (!found?.rowCount) throw apiError(HttpStatus.NOT_FOUND, 'banner_not_found', '배너를 찾을 수 없습니다.');
    return found.rows[0];
  }

  private async assertDomainAllowed(client: PoolClient, host: string | null): Promise<void> {
    if (host && (await this.creator.blockedDomainFor(client, host))) {
      throw apiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'link_domain_blocked',
        '운영 정책으로 차단된 도메인이라 추가할 수 없습니다.',
      );
    }
  }

  /** 보이는 배너가 하나 늘어날 때만 부릅니다. 설정값을 지금 장수보다 낮춰도 있는 배너는 그대로 둡니다. */
  private async assertVisibleSlot(client: PoolClient, landingId: string): Promise<void> {
    const limits = await this.creator.bannerLimits(client, landingId);
    if (limits.visibleUsed >= limits.visibleMax) {
      throw apiError(
        HttpStatus.CONFLICT,
        'banner_limit_reached',
        `보이는 배너는 ${limits.visibleMax}장까지예요. 다른 배너를 숨기면 이 배너를 보이게 할 수 있어요.`,
      );
    }
  }

  /**
   * 정지 이미지 규칙(미정 1 C): 이미지가 움직이면 정지 이미지가 필요하고 정지 이미지 자신은 움직이지 않아야 합니다.
   * 움직이지 않는 이미지에는 정지 이미지를 두지 않습니다. 어기면 400 `validation_failed`.
   */
  private async assertStillPair(client: PoolClient, imageFileId: string, stillFileId: string | null): Promise<void> {
    if (await this.files.isAnimated(client, imageFileId)) {
      if (!stillFileId) throw invalidStill('움직이는 이미지에는 첫 장면 정지 이미지가 함께 필요해요.');
      if (await this.files.isAnimated(client, stillFileId)) throw invalidStill('정지 이미지는 움직이지 않아야 해요.');
    } else if (stillFileId) {
      throw invalidStill('움직이지 않는 이미지에는 정지 이미지를 두지 않아요.');
    }
  }

  async create(userId: string, body: unknown): Promise<CreatorBannerView> {
    const input = bodyObject(body);
    const imageValue = requiredImage(input.imageFileId);
    const alt = requiredText(input.alt, '대체 문구', CRELINK_LIMITS.bannerAltMax);
    const { url, host } = bannerUrl(input.url) ?? { url: null, host: null };
    const hidden = optionalBoolean(input.hidden, '숨김') ?? false;
    return this.database.transaction(async (client) => {
      await this.lockGranted(client, userId);
      const { landingId } = await this.creator.context(client, userId);
      const image = (await this.files.ownedFileId(client, userId, imageValue)) as string;
      const still = (await this.files.ownedFileId(client, userId, input.stillImageFileId)) ?? null;
      await this.assertStillPair(client, image, still);
      await this.assertDomainAllowed(client, host);
      const limits = await this.creator.bannerLimits(client, landingId);
      if (limits.totalUsed >= limits.totalMax) {
        throw apiError(
          HttpStatus.CONFLICT,
          'banner_total_limit_reached',
          `배너는 숨긴 것까지 ${limits.totalMax}장까지 둘 수 있어요. 쓰지 않는 배너를 지워 주세요.`,
        );
      }
      if (!hidden) await this.assertVisibleSlot(client, landingId);
      const row = await insertWithRandomId(BANNER_PUBLIC_ID_LENGTH, async (publicId) => {
        const inserted = await client.query<CreatorBannerRow>(
          `INSERT INTO creator_banners (public_id, user_id, landing_id, image_file_id, still_file_id, alt, url, host, hidden, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   (SELECT coalesce(max(position) + 1, 0) FROM creator_banners WHERE landing_id = $3))
           ON CONFLICT (public_id) DO NOTHING
           RETURNING ${CREATOR_BANNER_COLUMNS}`,
          [publicId, userId, landingId, image, still, alt, url, host, hidden],
        );
        return inserted.rows[0];
      });
      return this.creator.creatorBannerView(row);
    });
  }

  /** 바뀐 필드만 고칩니다. 차단(`blocked_at`)은 주소를 바꿔도 그대로입니다(R21 ④). */
  async update(userId: string, bannerId: string, body: unknown): Promise<CreatorBannerView> {
    const input = bodyObject(body);
    const changes: Record<string, unknown> = {};
    if (input.alt !== undefined) changes.alt = requiredText(input.alt, '대체 문구', CRELINK_LIMITS.bannerAltMax);
    const link = bannerUrl(input.url);
    if (link) Object.assign(changes, link);
    const hidden = optionalBoolean(input.hidden, '숨김');
    if (hidden !== undefined) changes.hidden = hidden;
    const imageValue = input.imageFileId === undefined ? undefined : requiredImage(input.imageFileId);
    if (imageValue !== undefined && input.stillImageFileId === undefined) {
      throw invalidStill('이미지를 바꾸면 정지 이미지(움직이지 않으면 null)도 함께 보내 주세요.');
    }
    return this.database.transaction(async (client) => {
      await this.lockGranted(client, userId);
      const existing = await this.ownBanner(client, userId, bannerId);
      const image = await this.files.ownedFileId(client, userId, imageValue);
      const still = await this.files.ownedFileId(client, userId, input.stillImageFileId);
      if (image !== undefined || still !== undefined) {
        // 이미지만 바꾸는 요청은 위에서 막았으므로, 여기서는 정지 이미지만 바꾸거나 둘 다 바꿉니다.
        const nextImage = (image as string | undefined) ?? existing.image_file_id;
        await this.assertStillPair(client, nextImage, still ?? null);
        if (image !== undefined) changes.image_file_id = image;
        changes.still_file_id = still ?? null;
      }
      if (link) await this.assertDomainAllowed(client, link.host);
      // 숨김을 풀어 보이는 배너가 늘어날 때만 한도를 봅니다. 차단된 배너는 숨김을 풀어도 보이지 않습니다.
      if (existing.hidden && hidden === false && !existing.blocked) {
        await this.assertVisibleSlot(client, existing.landing_id);
      }
      const columns = Object.keys(changes);
      const updated = await client.query<CreatorBannerRow>(
        `UPDATE creator_banners
         SET ${[...columns.map((column, index) => `${column} = $${index + 2}`), 'updated_at = now()'].join(', ')}
         WHERE id = $1 RETURNING ${CREATOR_BANNER_COLUMNS}`,
        [bannerId, ...columns.map((column) => changes[column])],
      );
      return this.creator.creatorBannerView(updated.rows[0]);
    });
  }

  async remove(userId: string, bannerId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await this.lockGranted(client, userId);
      await this.ownBanner(client, userId, bannerId);
      await client.query('DELETE FROM creator_banners WHERE id = $1', [bannerId]);
    });
  }

  /** 이 랜딩 배너 전체(숨김·차단 포함)를 0..n-1로 다시 매깁니다. id 집합이 다르면 400 `order_mismatch`. */
  async reorder(userId: string, body: unknown): Promise<CreatorBannerView[]> {
    return this.database.transaction(async (client) => {
      await this.lockGranted(client, userId);
      const { landingId } = await this.creator.context(client, userId);
      const current = await client.query<{ id: string }>('SELECT id FROM creator_banners WHERE landing_id = $1', [
        landingId,
      ]);
      const ids = orderedIds(
        body,
        current.rows.map((row) => row.id),
      );
      await client.query(
        `UPDATE creator_banners SET position = o.ord - 1, updated_at = now()
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
         WHERE creator_banners.id = o.id AND creator_banners.landing_id = $1`,
        [landingId, ids],
      );
      return this.creator.creatorBanners(client, landingId);
    });
  }
}
