import { Controller, Get, Param, Req, RequestMethod, Res } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';
import { COOKIE_NAMES, CRELINK_LIMITS, CRELINK_WEB_PATHS, NoticeReason } from '@crelink/shared';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config.service';
import { Database } from '../database';
import { readCookie, serializeCookie, UUID_PATTERN } from '../common/http';
import { LandingPassService } from './landing-pass.service';
import { requestFacts, TrackingService } from './tracking.service';

/**
 * `/api` 접두사를 붙이지 않는 단축 도메인 경로. Nest는 exclude 패턴을 요청 URL이 아니라 "라우트 정의 경로"에 맞춰 봅니다.
 * 그냥 `:slug`라고 쓰면 `/me`, `/health` 같은 한 단계 API 정의도 걸려 접두사가 빠지므로, `:`를 이스케이프해 아래 두 정의
 * (`/:slug`, `/c/:linkPublicId`)와 글자 그대로 같은 경로만 제외합니다.
 */
export const SHORT_DOMAIN_ROUTES: RouteInfo[] = [
  { path: '\\:slug', method: RequestMethod.GET },
  { path: 'c/\\:linkPublicId', method: RequestMethod.GET },
];

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
              (NOT l.hidden AND l.blocked_at IS NULL AND u.suspended_at IS NULL) AS available
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
    // 열린 리디렉트 방지: DB에 저장된(저장 시 http·https만 허용한) URL로만 보냅니다.
    this.redirect(response, link.url);
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
    this.redirect(
      response,
      `${this.config.webUrl}${CRELINK_WEB_PATHS.landing(target.public_id, this.landingPass.issue(target.public_id))}`,
    );
  }
}
