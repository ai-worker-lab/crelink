import { Controller, Get, Param, Req, RequestMethod, Res } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';
import {
  CHANNEL_LINK_CODE_PATTERN,
  channelLinkUtm,
  COOKIE_NAMES,
  CRELINK_LIMITS,
  CRELINK_WEB_PATHS,
  NoticeReason,
  readLandingUtm,
  withLandingUtm,
} from '@crelink/shared';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { readCookie, serializeCookie, UUID_PATTERN } from '../common/http';
import { VISIBLE_LINK_CONDITION } from '../creator/creator.service';
import { countBusinessMetric } from '../monitoring/metrics';
import { LandingPassService } from './landing-pass.service';
import { requestFacts, TrackingService } from './tracking.service';

/**
 * `/api` 접두사를 붙이지 않는 단축 도메인 경로. Nest는 exclude 패턴을 요청 URL이 아니라 "라우트 정의 경로"에 맞춰 봅니다.
 * 그냥 `:slug`라고 쓰면 `/me`, `/health` 같은 한 단계 API 정의도 걸려 접두사가 빠지므로, `:`를 이스케이프해 아래 정의
 * (`/:slug`, `/c/:linkPublicId`, `/a/:bannerPublicId/:landingPublicId`, `/b/:bannerPublicId`, `/s/:code`)와 글자 그대로 같은 경로만 제외합니다.
 * 운영 edge(Caddy 단축 호스트)는 `^/(c/[a-z0-9]{10}|a/[a-z0-9]{10}/[a-z0-9]{10}|b/[a-z0-9]{10}|s/[a-z0-9]{7,10})$`과 단축 주소만 API로 넘깁니다.
 */
export const SHORT_DOMAIN_ROUTES: RouteInfo[] = [
  { path: '\\:slug', method: RequestMethod.GET },
  { path: 'c/\\:linkPublicId', method: RequestMethod.GET },
  { path: 'a/\\:bannerPublicId/\\:landingPublicId', method: RequestMethod.GET },
  { path: 'b/\\:bannerPublicId', method: RequestMethod.GET },
  { path: 's/\\:code', method: RequestMethod.GET },
];

/** 배너·랜딩 공개 ID(`randomId(10)`, migration CHECK). Caddy 단축 호스트 정규식의 세그먼트와 같습니다. */
const PUBLIC_ID_PATTERN = /^[a-z0-9]{10}$/;

const VISITOR_COOKIE_SECONDS = 365 * 24 * 60 * 60;

/** 단축 도메인(R2, R7, R8, R9). 같은 API 프로세스가 `/api` 밖에서 처리합니다. */
@Controller()
export class ShortLinkController {
  constructor(
    private readonly database: Database,
    private readonly tracking: TrackingService,
    private readonly config: AppConfig,
    private readonly landingPass: LandingPassService,
  ) {}

  /** 방문자 쿠키 `cl_vid`. 없거나 형식이 틀릴 때만 새로 발급합니다. */
  private visitorId(request: Request, response: Response): string {
    const existing = readCookie(request, COOKIE_NAMES.visitor);
    if (existing && UUID_PATTERN.test(existing)) return existing.toLowerCase();
    const visitorId = randomUUID();
    response.setHeader(
      'Set-Cookie',
      serializeCookie(COOKIE_NAMES.visitor, visitorId, VISITOR_COOKIE_SECONDS, this.config.shortCookieSecure),
    );
    return visitorId;
  }

  private redirect(response: Response, url: string): void {
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(302, url);
  }

  private notice(response: Response, reason: NoticeReason): void {
    this.redirect(response, `${this.config.webUrl}${CRELINK_WEB_PATHS.notice(reason)}`);
  }

  /** `GET {SHORT}/c/{linkPublicId}` → 클릭 기록 + 저장된 외부 URL. 숨김·차단·삭제·정지면 안내 화면. */
  @Get('c/:linkPublicId')
  async click(
    @Param('linkPublicId') linkPublicId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.database.query<{
      id: string;
      url: string;
      short_link_id: string;
      available: boolean;
    }>(
      `SELECT l.id, l.url, sl.id AS short_link_id,
              (${VISIBLE_LINK_CONDITION} AND u.suspended_at IS NULL) AS available
       FROM links l JOIN users u ON u.id = l.user_id JOIN short_links sl ON sl.user_id = l.user_id
       WHERE l.public_id = $1`,
      [linkPublicId],
    );
    const link = result.rows[0];
    if (!link?.available) return this.notice(response, 'link_unavailable');
    const visitorId = this.visitorId(request, response);
    this.tracking.inBackground(
      '링크 클릭',
      this.tracking.recordClick(
        { id: link.id, publicId: linkPublicId, shortLinkId: link.short_link_id },
        visitorId,
        requestFacts(request, this.config.trustedProxyHops),
      ),
    );
    countBusinessMetric('crelink.link.click');
    // 열린 리디렉트 방지: DB에 저장된(저장 시 http·https만 허용한) URL로만 보냅니다.
    this.redirect(response, link.url);
  }

  /**
   * `GET {SHORT}/a/{bannerPublicId}/{landingPublicId}` → 크리링 배너 클릭 카운터 +1(날짜·배너·랜딩, R20 ⑧) + 저장된 URL.
   * 배너가 지금 게시 중(`starts_at <= now() < ends_at`)이고 랜딩이 있고 크리에이터가 정지가 아닐 때만 보냅니다. 끝났거나
   * 예약·없는 배너, 없는 랜딩, 정지면 안내 화면입니다. 개인 식별 정보를 남기지 않으므로 방문자 쿠키를 읽거나 발급하지 않습니다.
   */
  @Get('a/:bannerPublicId/:landingPublicId')
  async adBannerClick(
    @Param('bannerPublicId') bannerPublicId: string,
    @Param('landingPublicId') landingPublicId: string,
    @Res() response: Response,
  ): Promise<void> {
    if (!PUBLIC_ID_PATTERN.test(bannerPublicId) || !PUBLIC_ID_PATTERN.test(landingPublicId)) {
      return this.notice(response, 'link_unavailable');
    }
    const result = await this.database.query<{ id: string; url: string }>(
      `SELECT b.id, b.url
       FROM ad_banners b
       JOIN landings l ON l.public_id = $2
       JOIN users u ON u.id = l.user_id
       WHERE b.public_id = $1 AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now())
         AND u.suspended_at IS NULL`,
      [bannerPublicId, landingPublicId],
    );
    const banner = result.rows[0];
    if (!banner) return this.notice(response, 'link_unavailable');
    this.tracking.inBackground('광고 클릭', this.tracking.recordAdStat('click', banner.id, landingPublicId));
    // 열린 리디렉트 방지: DB에 저장된(저장 시 http·https만 허용한) URL로만 보냅니다.
    this.redirect(response, banner.url);
  }

  /**
   * `GET {SHORT}/b/{bannerPublicId}` → 크리에이터 배너 클릭 원본 기록(R21 ④, 링크 클릭과 같은 항목) + 저장된 URL.
   * 연결 URL이 없거나 숨김·차단·삭제, 슬롯 회수, 정지면 안내 화면입니다. 단축 URL은 배너의 랜딩으로 찾습니다.
   */
  @Get('b/:bannerPublicId')
  async creatorBannerClick(
    @Param('bannerPublicId') bannerPublicId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!PUBLIC_ID_PATTERN.test(bannerPublicId)) return this.notice(response, 'link_unavailable');
    const result = await this.database.query<{ id: string; url: string; short_link_id: string }>(
      `SELECT cb.id, cb.url, sl.id AS short_link_id
       FROM creator_banners cb
       JOIN users u ON u.id = cb.user_id
       JOIN short_links sl ON sl.landing_id = cb.landing_id
       WHERE cb.public_id = $1 AND cb.url IS NOT NULL AND NOT cb.hidden AND cb.blocked_at IS NULL
         AND u.banner_slot_granted_at IS NOT NULL AND u.suspended_at IS NULL`,
      [bannerPublicId],
    );
    const banner = result.rows[0];
    if (!banner) return this.notice(response, 'link_unavailable');
    const visitorId = this.visitorId(request, response);
    this.tracking.inBackground(
      '배너 클릭',
      this.tracking.recordBannerClick(
        { id: banner.id, publicId: bannerPublicId, shortLinkId: banner.short_link_id },
        visitorId,
        requestFacts(request, this.config.trustedProxyHops),
      ),
    );
    countBusinessMetric('crelink.creator_banner.click');
    // 열린 리디렉트 방지: DB에 저장된(저장 시 http·https만 허용한) URL로만 보냅니다.
    this.redirect(response, banner.url);
  }

  /**
   * `GET {SHORT}/s/{code}` → 채널별 짧은 주소(docs/specs/channel-links.md). 방문을 기록하고 `/p/{publicId}?pass=…&via={code}`로 보냅니다.
   * 방문의 UTM은 저장된 프리셋만 쓰고 요청 쿼리의 `utm_*`는 무시합니다. 최종 주소창에는 UTM 대신 `via`만 남습니다.
   * 보관한 주소도 계속 동작합니다. 없는 code·삭제된 페이지는 `link_not_found`, 정지 계정은 `creator_suspended` 안내입니다.
   */
  @Get('s/:code')
  async channelVisit(@Param('code') code: string, @Req() request: Request, @Res() response: Response): Promise<void> {
    if (!CHANNEL_LINK_CODE_PATTERN.test(code)) return this.notice(response, 'link_not_found');
    const result = await this.database.query<{
      channel: string;
      placement: string;
      campaign: string;
      short_link_id: string;
      slug: string;
      public_id: string;
      suspended: boolean;
    }>(
      `SELECT cl.channel, cl.placement, cl.campaign, sl.id AS short_link_id, s.slug, l.public_id,
              u.suspended_at IS NOT NULL AS suspended
       FROM channel_links cl
       JOIN landings l ON l.id = cl.landing_id
       JOIN users u ON u.id = l.user_id
       JOIN short_links sl ON sl.landing_id = l.id
       JOIN short_slugs s ON s.short_link_id = sl.id AND s.retired_at IS NULL
       WHERE cl.code = $1`,
      [code],
    );
    const target = result.rows[0];
    if (!target) return this.notice(response, 'link_not_found');
    if (target.suspended) return this.notice(response, 'creator_suspended');
    const visitorId = this.visitorId(request, response);
    this.tracking.inBackground(
      '방문',
      this.tracking.recordVisit(target.short_link_id, target.slug, visitorId, {
        ...requestFacts(request, this.config.trustedProxyHops),
        utm: channelLinkUtm({ code, ...target }),
      }),
    );
    countBusinessMetric('crelink.short_link.visit');
    this.redirect(
      response,
      `${this.config.webUrl}${CRELINK_WEB_PATHS.landing(target.public_id, this.landingPass.issue(target.public_id, Date.now(), visitorId), code)}`,
    );
  }

  /**
   * `GET {SHORT}/{slug}` → 방문 기록 + 랜딩. 옛 주소는 바꾼 뒤 90일까지 같은 랜딩으로 보냅니다.
   * 랜딩 주소에 통과 표시(`?pass=`)를 붙여, 웹이 이 리디렉트로 온 요청만 외부 진입으로 그대로 그리게 합니다(PRD R7).
   */
  @Get(':slug')
  async visit(@Param('slug') rawSlug: string, @Req() request: Request, @Res() response: Response): Promise<void> {
    const slug = rawSlug.toLowerCase();
    const result = await this.database.query<{ short_link_id: string; public_id: string; suspended: boolean }>(
      `SELECT s.short_link_id, l.public_id, u.suspended_at IS NOT NULL AS suspended
       FROM short_slugs s
       JOIN short_links sl ON sl.id = s.short_link_id
       JOIN landings l ON l.id = sl.landing_id
       JOIN users u ON u.id = sl.user_id
       WHERE s.slug = $1 AND (s.retired_at IS NULL OR s.retired_at > now() - make_interval(days => $2))`,
      [slug, CRELINK_LIMITS.retiredSlugGraceDays],
    );
    const target = result.rows[0];
    if (!target) return this.notice(response, 'link_not_found');
    if (target.suspended) return this.notice(response, 'creator_suspended');
    const visitorId = this.visitorId(request, response);
    this.tracking.inBackground(
      '방문',
      this.tracking.recordVisit(
        target.short_link_id,
        slug,
        visitorId,
        requestFacts(request, this.config.trustedProxyHops),
      ),
    );
    countBusinessMetric('crelink.short_link.visit');
    this.redirect(
      response,
      withLandingUtm(
        `${this.config.webUrl}${CRELINK_WEB_PATHS.landing(target.public_id, this.landingPass.issue(target.public_id, Date.now(), visitorId))}`,
        readLandingUtm(request.query),
      ),
    );
  }
}
