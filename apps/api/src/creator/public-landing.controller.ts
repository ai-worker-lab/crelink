import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import { PublicLandingResponse, PublicLinkView } from '@crelink/shared';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { apiError } from '../common/http';
import { FilesService } from '../files/files.service';
import { CreatorService } from './creator.service';

/** 방문자가 보는 공개 랜딩(R3, R5, R12). 숨긴 링크와 차단된 링크는 빼고 내려 줍니다. */
@Controller('public/landings')
export class PublicLandingController {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly files: FilesService,
    private readonly config: AppConfig,
  ) {}

  @Get(':publicId')
  async landing(@Param('publicId') publicId: string): Promise<PublicLandingResponse> {
    const result = /^[a-z0-9]{10}$/.test(publicId)
      ? await this.database.query<{
          id: string;
          user_id: string;
          display_name: string | null;
          bio: string | null;
          avatar_file_id: string | null;
          suspended: boolean;
        }>(
          `SELECT l.id, l.user_id, l.display_name, l.bio, l.avatar_file_id, u.suspended_at IS NOT NULL AS suspended
           FROM landings l JOIN users u ON u.id = l.user_id WHERE l.public_id = $1`,
          [publicId],
        )
      : null;
    const landing = result?.rows[0];
    if (!landing) throw apiError(HttpStatus.NOT_FOUND, 'landing_not_found', '랜딩페이지를 찾을 수 없습니다.');
    if (landing.suspended) {
      throw apiError(HttpStatus.GONE, 'creator_suspended', '운영 정책에 따라 지금은 볼 수 없는 페이지입니다.');
    }
    const db = this.database.pool;
    const [blocks, links, socials, portfolio] = await Promise.all([
      db.query<{ id: string }>('SELECT id FROM landing_blocks WHERE landing_id = $1 ORDER BY position', [landing.id]),
      db.query<{
        block_id: string;
        public_id: string;
        title: string;
        description: string | null;
        thumbnail_file_id: string | null;
        host: string;
      }>(
        `SELECT block_id, public_id, title, description, thumbnail_file_id, host FROM links
         WHERE user_id = $1 AND NOT hidden AND blocked_at IS NULL ORDER BY position, created_at`,
        [landing.user_id],
      ),
      this.creator.socials(db, landing.id),
      this.creator.portfolio(db, landing.id),
    ]);
    return {
      publicId,
      displayName: landing.display_name,
      bio: landing.bio,
      avatarUrl: landing.avatar_file_id ? this.files.imageUrl(landing.avatar_file_id) : null,
      socials,
      portfolio: portfolio.map(({ id, title, url, image, description }) => ({
        id,
        title,
        url,
        description,
        imageUrl: image?.url ?? null,
      })),
      blocks: blocks.rows.map((block) => ({
        type: 'list',
        links: links.rows
          .filter((link) => link.block_id === block.id)
          .map((link): PublicLinkView => ({
            id: link.public_id,
            title: link.title,
            description: link.description,
            thumbnailUrl: link.thumbnail_file_id ? this.files.imageUrl(link.thumbnail_file_id) : null,
            faviconUrl: `https://${link.host}/favicon.ico`,
            clickUrl: `${this.config.shortLinkBaseUrl}/c/${link.public_id}`,
          })),
      })),
    };
  }
}
