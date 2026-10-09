import { Controller, Get, Param, Query } from '@nestjs/common';
import { LANDING_PASS_PARAM, PublicLandingResponse, PublicLinkView } from '@crelink/shared';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { FilesService } from '../files/files.service';
import { LandingPassService } from '../short-link/landing-pass.service';
import { CreatorService } from './creator.service';

/**
 * 방문자가 보는 공개 랜딩(R3, R5, R7, R12). 숨긴 링크와 차단된 링크는 빼고 내려 줍니다.
 * 웹이 외부 진입을 단축 주소로 보낼지 정하도록 통과 표시 검증 결과(`passAccepted`)와 현재 단축 주소(`shortUrl`)를 함께 줍니다.
 */
@Controller('public/landings')
export class PublicLandingController {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly files: FilesService,
    private readonly config: AppConfig,
    private readonly landingPass: LandingPassService,
  ) {}

  @Get(':publicId')
  async landing(
    @Param('publicId') publicId: string,
    @Query(LANDING_PASS_PARAM) pass: unknown,
  ): Promise<PublicLandingResponse> {
    const db = this.database.pool;
    const landing = await this.creator.publicLanding(db, publicId);
    const [blocks, links, socials, portfolio, shortLink] = await Promise.all([
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
      this.creator.shortLink(db, landing.user_id),
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
        // 광고 블록·배너 슬롯(resolveBannerSlot, 첫 list 구역)은 0068(위치·공개 랜딩)이 채웁니다. 웹은 null이면 그리지 않습니다.
        slot: null,
      })),
      guestbookEnabled: landing.guestbook_enabled,
      passAccepted: this.landingPass.verify(publicId, pass),
      shortUrl: shortLink.url,
    };
  }
}
