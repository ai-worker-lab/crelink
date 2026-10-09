import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  LANDING_PASS_PARAM,
  PublicBannerSlotView,
  PublicLandingResponse,
  PublicLinkView,
  resolveBannerSlot,
  ResolveBannerSlotInput,
} from '@crelink/shared';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { FilesService } from '../files/files.service';
import { LandingPassService } from '../short-link/landing-pass.service';
import { TrackingService } from '../short-link/tracking.service';
import { BannerImageRow, CreatorService } from './creator.service';

/**
 * 방문자가 보는 공개 랜딩(R3, R5, R7, R12, R20, R21). 숨긴 링크와 차단된 링크는 빼고 내려 줍니다.
 * 웹이 외부 진입을 단축 주소로 보낼지 정하도록 통과 표시 검증 결과(`passAccepted`)와 현재 단축 주소(`shortUrl`)를 함께 줍니다.
 * 첫 list 구역에 광고 블록·배너 슬롯(`resolveBannerSlot`)을 붙이고, `passAccepted`이고 광고 블록이면 첫 장 노출을 1 올립니다(R20 ⑧, R7 ⑥).
 */
@Controller('public/landings')
export class PublicLandingController {
  constructor(
    private readonly database: Database,
    private readonly creator: CreatorService,
    private readonly files: FilesService,
    private readonly config: AppConfig,
    private readonly landingPass: LandingPassService,
    private readonly tracking: TrackingService,
  ) {}

  @Get(':publicId')
  async landing(
    @Param('publicId') publicId: string,
    @Query(LANDING_PASS_PARAM) pass: unknown,
  ): Promise<PublicLandingResponse> {
    const db = this.database.pool;
    const landing = await this.creator.publicLanding(db, publicId);
    const granted = landing.banner_slot_granted;
    const [blocks, links, socials, portfolio, shortLink, banners] = await Promise.all([
      db.query<{ id: string; type: string; slot_position: number | null }>(
        'SELECT id, type, slot_position FROM landing_blocks WHERE landing_id = $1 ORDER BY position',
        [landing.id],
      ),
      // 슬롯 위치(숨김·차단 포함 전체 순서 기준)를 계산하려고 모든 링크를 읽고 여기서 거릅니다.
      db.query<{
        block_id: string;
        public_id: string;
        title: string;
        description: string | null;
        thumbnail_file_id: string | null;
        host: string;
        position: number;
        visible: boolean;
      }>(
        `SELECT block_id, public_id, title, description, thumbnail_file_id, host, position,
                NOT hidden AND blocked_at IS NULL AS visible
         FROM links WHERE user_id = $1 ORDER BY position, created_at`,
        [landing.user_id],
      ),
      this.creator.socials(db, landing.id),
      this.creator.portfolio(db, landing.id),
      this.creator.shortLink(db, landing.user_id),
      // 부여됐으면 이 랜딩의 크리에이터 배너, 아니면 게시 중 크리링 배너(질의 1개).
      granted ? this.creator.visibleCreatorBanners(db, landing.id) : this.creator.liveAdBanners(db),
    ]);
    const passAccepted = this.landingPass.verify(publicId, pass);
    const slotBlockId = blocks.rows.find((block) => block.type === 'list')?.id;
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
      blocks: blocks.rows.map((block) => {
        const blockLinks = links.rows.filter((link) => link.block_id === block.id);
        const slotPosition = block.slot_position;
        return {
          type: 'list',
          links: blockLinks
            .filter((link) => link.visible)
            .map((link): PublicLinkView => ({
              id: link.public_id,
              title: link.title,
              description: link.description,
              thumbnailUrl: link.thumbnail_file_id ? this.files.imageUrl(link.thumbnail_file_id) : null,
              faviconUrl: `https://${link.host}/favicon.ico`,
              clickUrl: `${this.config.shortLinkBaseUrl}/c/${link.public_id}`,
            })),
          slot:
            block.id === slotBlockId
              ? this.slot(publicId, passAccepted, {
                  granted,
                  slotIndex:
                    slotPosition === null ? null : blockLinks.filter((link) => link.position < slotPosition).length,
                  linkVisible: blockLinks.map((link) => link.visible),
                  hasPortfolio: portfolio.length > 0,
                  adBanners: granted ? [] : banners,
                  creatorBanners: granted ? banners : [],
                })
              : null,
        };
      }),
      guestbookEnabled: landing.guestbook_enabled,
      passAccepted,
      shortUrl: shortLink.url,
    };
  }

  /**
   * 숨김 조건이면 null. 클릭 주소: 광고는 `passAccepted`일 때만 기록 주소 `{SHORT}/a/{배너}/{랜딩}`(아니면 저장된 URL),
   * 크리에이터 배너는 늘 `{SHORT}/b/{배너}`(링크 `/c/`와 같음, 연결 URL이 없으면 null).
   */
  private slot(
    landingPublicId: string,
    passAccepted: boolean,
    input: ResolveBannerSlotInput<BannerImageRow>,
  ): PublicBannerSlotView | null {
    const resolved = resolveBannerSlot(input);
    if (resolved.hidden !== null) return null;
    if (resolved.kind === 'ad' && passAccepted) {
      this.tracking.inBackground(
        '광고 노출',
        this.tracking.recordAdStat('impression', resolved.banners[0].id, landingPublicId),
      );
    }
    const short = this.config.shortLinkBaseUrl;
    const clickUrl = (banner: BannerImageRow): string | null => {
      if (resolved.kind === 'creator') return banner.url ? `${short}/b/${banner.public_id}` : null;
      return passAccepted ? `${short}/a/${banner.public_id}/${landingPublicId}` : banner.url;
    };
    return {
      kind: resolved.kind,
      afterLinkCount: resolved.afterLinkCount,
      banners: resolved.banners.map((banner) => this.creator.publicBannerView(banner, clickUrl(banner))),
    };
  }
}
