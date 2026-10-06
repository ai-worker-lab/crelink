import { HttpStatus, Injectable } from '@nestjs/common';
import { CRELINK_LIMITS, PortfolioItemView, SOCIAL_PLATFORMS, SocialLinkView } from '@crelink/shared';
import type { PoolClient } from 'pg';
import { Database } from '../database';
import { apiError, UUID_PATTERN } from '../common/http';
import { bodyObject, optionalText, orderedIds, parseHttpUrl, requiredText } from '../common/input';
import { FilesService } from '../files/files.service';
import { CreatorService, PORTFOLIO_COLUMNS, PortfolioRow } from './creator.service';

/** 선택 URL 필드(http·https). undefined는 "바꾸지 않음", null·빈 문자열은 "비움". */
function optionalUrl(value: unknown, label: string): string | null | undefined {
  const text = optionalText(value, label, CRELINK_LIMITS.urlMax);
  if (!text) return text;
  const url = parseHttpUrl(text);
  if (!url) {
    throw apiError(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      `${label}은(는) http:// 또는 https://로 시작하는 주소여야 합니다.`,
    );
  }
  return url.href;
}

/** 프로필(R12), SNS, 포트폴리오. */
@Injectable()
export class ProfileService {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly files: FilesService,
  ) {}

  async updateLanding(userId: string, body: unknown): Promise<void> {
    const input = bodyObject(body);
    const changes: Record<string, unknown> = {};
    const displayName = optionalText(input.displayName, '표시 이름', CRELINK_LIMITS.displayNameMax);
    if (displayName !== undefined) changes.display_name = displayName;
    const bio = optionalText(input.bio, '소개', CRELINK_LIMITS.bioMax);
    if (bio !== undefined) changes.bio = bio;
    const avatar = await this.files.ownedFileId(this.database.pool, userId, input.avatarFileId);
    if (avatar !== undefined) changes.avatar_file_id = avatar;
    const columns = Object.keys(changes);
    if (!columns.length) return;
    await this.database.query(
      `UPDATE landings SET ${[...columns.map((column, index) => `${column} = $${index + 2}`), 'updated_at = now()'].join(', ')}
       WHERE user_id = $1`,
      [userId, ...columns.map((column) => changes[column])],
    );
  }

  /** SNS 전체 교체. */
  async replaceSocials(userId: string, body: unknown): Promise<SocialLinkView[]> {
    const items = bodyObject(body).items;
    if (!Array.isArray(items) || items.length > CRELINK_LIMITS.socialLinks) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        `SNS는 ${CRELINK_LIMITS.socialLinks}개까지 등록할 수 있습니다.`,
      );
    }
    const socials = items.map((item: unknown): SocialLinkView => {
      const entry = bodyObject(item);
      const platform = SOCIAL_PLATFORMS.find((candidate) => candidate === entry.platform);
      if (!platform) throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'SNS 종류가 올바르지 않습니다.');
      const url = optionalUrl(entry.url, 'SNS 주소');
      if (!url) throw apiError(HttpStatus.BAD_REQUEST, 'validation_failed', 'SNS 주소를 입력해 주세요.');
      return { platform, url };
    });
    return this.database.transaction(async (client) => {
      const { landingId } = await this.creator.context(client, userId);
      await client.query('DELETE FROM social_links WHERE landing_id = $1', [landingId]);
      await client.query(
        `INSERT INTO social_links (landing_id, platform, url, position)
         SELECT $1, platform, url, ord - 1 FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS s(platform, url, ord)`,
        [landingId, socials.map((social) => social.platform), socials.map((social) => social.url)],
      );
      return this.creator.socials(client, landingId);
    });
  }

  async createPortfolioItem(userId: string, body: unknown): Promise<PortfolioItemView> {
    const input = bodyObject(body);
    const title = requiredText(input.title, '포트폴리오 제목', CRELINK_LIMITS.portfolioTitleMax);
    const url = optionalUrl(input.url, '포트폴리오 링크') ?? null;
    const description = optionalText(input.description, '설명', CRELINK_LIMITS.portfolioDescriptionMax) ?? null;
    return this.database.transaction(async (client) => {
      const { landingId } = await this.lockLanding(client, userId);
      const image = (await this.files.ownedFileId(client, userId, input.imageFileId)) ?? null;
      const count = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM portfolio_items WHERE landing_id = $1',
        [landingId],
      );
      if (count.rows[0].count >= CRELINK_LIMITS.portfolioItems) {
        throw apiError(
          HttpStatus.CONFLICT,
          'portfolio_limit_reached',
          `포트폴리오는 ${CRELINK_LIMITS.portfolioItems}개까지 등록할 수 있습니다.`,
        );
      }
      const inserted = await client.query<PortfolioRow>(
        `INSERT INTO portfolio_items (landing_id, title, url, image_file_id, description, position)
         VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(position) + 1, 0) FROM portfolio_items WHERE landing_id = $1))
         RETURNING ${PORTFOLIO_COLUMNS}`,
        [landingId, title, url, image, description],
      );
      return this.creator.portfolioView(inserted.rows[0]);
    });
  }

  async updatePortfolioItem(userId: string, itemId: string, body: unknown): Promise<PortfolioItemView> {
    const input = bodyObject(body);
    const changes: Record<string, unknown> = {};
    if (input.title !== undefined) {
      changes.title = requiredText(input.title, '포트폴리오 제목', CRELINK_LIMITS.portfolioTitleMax);
    }
    const url = optionalUrl(input.url, '포트폴리오 링크');
    if (url !== undefined) changes.url = url;
    const description = optionalText(input.description, '설명', CRELINK_LIMITS.portfolioDescriptionMax);
    if (description !== undefined) changes.description = description;
    return this.database.transaction(async (client) => {
      const { landingId } = await this.lockLanding(client, userId);
      const image = await this.files.ownedFileId(client, userId, input.imageFileId);
      if (image !== undefined) changes.image_file_id = image;
      const columns = Object.keys(changes);
      const updated = UUID_PATTERN.test(itemId)
        ? await client.query<PortfolioRow>(
            `UPDATE portfolio_items
             SET ${[...columns.map((column, index) => `${column} = $${index + 3}`), 'updated_at = now()'].join(', ')}
             WHERE id = $1 AND landing_id = $2 RETURNING ${PORTFOLIO_COLUMNS}`,
            [itemId, landingId, ...columns.map((column) => changes[column])],
          )
        : null;
      if (!updated?.rowCount) {
        throw apiError(HttpStatus.NOT_FOUND, 'portfolio_item_not_found', '포트폴리오 항목을 찾을 수 없습니다.');
      }
      return this.creator.portfolioView(updated.rows[0]);
    });
  }

  async deletePortfolioItem(userId: string, itemId: string): Promise<void> {
    const deleted = UUID_PATTERN.test(itemId)
      ? await this.database.query(
          'DELETE FROM portfolio_items p USING landings l WHERE p.id = $1 AND p.landing_id = l.id AND l.user_id = $2',
          [itemId, userId],
        )
      : null;
    if (!deleted?.rowCount) {
      throw apiError(HttpStatus.NOT_FOUND, 'portfolio_item_not_found', '포트폴리오 항목을 찾을 수 없습니다.');
    }
  }

  async reorderPortfolio(userId: string, body: unknown): Promise<PortfolioItemView[]> {
    return this.database.transaction(async (client) => {
      const { landingId } = await this.lockLanding(client, userId);
      const current = await client.query<{ id: string }>('SELECT id FROM portfolio_items WHERE landing_id = $1', [
        landingId,
      ]);
      const ids = orderedIds(
        body,
        current.rows.map((row) => row.id),
      );
      await client.query(
        `UPDATE portfolio_items SET position = o.ord - 1, updated_at = now()
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
         WHERE portfolio_items.id = o.id AND portfolio_items.landing_id = $1`,
        [landingId, ids],
      );
      return this.creator.portfolio(client, landingId);
    });
  }

  /** 포트폴리오 개수·순서 검사가 동시 요청에 뚫리지 않게 랜딩 행을 잠급니다. */
  private async lockLanding(client: PoolClient, userId: string): Promise<{ landingId: string }> {
    const landing = await client.query<{ id: string }>('SELECT id FROM landings WHERE user_id = $1 FOR UPDATE', [
      userId,
    ]);
    return { landingId: landing.rows[0].id };
  }
}
