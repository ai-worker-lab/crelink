import { Body, Controller, Delete, Get, Header, HttpCode, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { InstagramConnectionView, InstagramIntegrationView, PageContext, SessionUser } from '@crelink/shared';
import type { Request, Response } from 'express';
import { ActorKinds } from '../auth/actor';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { readCookie, serializeCookie } from '../common/http';
import { AppConfig } from '../config.service';
import { CurrentPage, PageAccessGuard, PageOwnerOnly } from '../pages/page-access.guard';
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  INSTAGRAM_OAUTH_STATE_SECONDS,
  InstagramConnectionService,
} from './connection.service';

/**
 * OAuth 연결·해제·정지 경로(`/api/me/instagram*`). 소유자 명의로 타인에게 메시지를 보내는 기능이라 편집자와 AI는 막습니다.
 * 근거: docs/specs/instagram-comment-dm.md (`API 계약 초안`, `R29 공동 관리자`).
 */
@Controller('me/instagram')
@UseGuards(SessionGuard, PageAccessGuard)
@PageOwnerOnly()
@ActorKinds('human')
export class InstagramConnectionController {
  constructor(
    private readonly connections: InstagramConnectionService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  view(@CurrentUser() user: SessionUser): Promise<InstagramIntegrationView> {
    return this.connections.view(user);
  }

  @Post('connect')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async connect(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ authorizationUrl: string }> {
    const { authorizationUrl, state } = await this.connections.start(user);
    response.setHeader(
      'Set-Cookie',
      serializeCookie(INSTAGRAM_OAUTH_STATE_COOKIE, state, INSTAGRAM_OAUTH_STATE_SECONDS, this.config.webCookieSecure),
    );
    return { authorizationUrl };
  }

  @Post('callback')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  callback(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<InstagramConnectionView> {
    // state는 한 번만 씁니다. 성공·실패와 관계없이 지웁니다.
    response.setHeader('Set-Cookie', serializeCookie(INSTAGRAM_OAUTH_STATE_COOKIE, '', 0, this.config.webCookieSecure));
    const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    return this.connections.complete(user, input.code, input.state, readCookie(request, INSTAGRAM_OAUTH_STATE_COOKIE));
  }

  @Post('recheck')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  recheck(@CurrentPage() page: PageContext): Promise<InstagramConnectionView> {
    return this.connections.recheck(page.ownerUserId);
  }

  @Delete()
  @HttpCode(204)
  disconnect(@CurrentPage() page: PageContext): Promise<void> {
    return this.connections.disconnect(page.ownerUserId);
  }

  @Put('pause')
  @Header('Cache-Control', 'no-store')
  setPaused(@CurrentPage() page: PageContext, @Body() body: unknown): Promise<InstagramConnectionView> {
    return this.connections.setPaused(page.ownerUserId, body);
  }
}
