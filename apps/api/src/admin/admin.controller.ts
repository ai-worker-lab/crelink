import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  BlockedDomainView,
  CreatorBannerView,
  LinkView,
  OperatorCreatorDetail,
  OperatorCreatorListResponse,
  OperatorCreatorStats,
} from '@crelink/shared';
import { ActorKinds, CurrentActor, RequestActor } from '../auth/actor';
import { OperatorGuard } from '../auth/session.guard';
import { AdminService } from './admin.service';

/**
 * 운영자 화면 API(R10, R13, R14, R23). 로그인하지 않으면 401, 운영자가 아니면 403 `forbidden`.
 * AI 운영자(토큰)의 쓰기는 가드가 멈춤(409 `ai_operator_paused`)·실행 헤더(409 `agent_run_required`)를 먼저 확인합니다.
 */
@Controller('admin')
@UseGuards(OperatorGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('creators')
  list(@Query('query') query: unknown, @Query('page') page: unknown): Promise<OperatorCreatorListResponse> {
    return this.admin.list(query, page);
  }

  @Get('creators/:userId')
  detail(@Param('userId') userId: string): Promise<OperatorCreatorDetail> {
    return this.admin.detail(userId);
  }

  @Get('creators/:userId/stats')
  stats(
    @Param('userId') userId: string,
    @Query('from') from: unknown,
    @Query('to') to: unknown,
  ): Promise<OperatorCreatorStats> {
    return this.admin.creatorStats(userId, from, to);
  }

  @Put('creators/:userId/extra-slots')
  setExtraSlots(
    @CurrentActor() actor: RequestActor,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<OperatorCreatorDetail> {
    return this.admin.setExtraSlots(actor, userId, body);
  }

  @Put('creators/:userId/suspension')
  setSuspension(
    @CurrentActor() actor: RequestActor,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<OperatorCreatorDetail> {
    return this.admin.setSuspension(actor, userId, body);
  }

  @Put('creators/:userId/banner-slot')
  setBannerSlot(
    @CurrentActor() actor: RequestActor,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<OperatorCreatorDetail> {
    return this.admin.setBannerSlot(actor, userId, body);
  }

  /** 사람 운영자만(AI면 403). AI가 시험 계정 표시로 지표를 바꾸지 못하게 합니다. */
  @Put('creators/:userId/metrics-exclusion')
  @ActorKinds('human')
  setMetricsExclusion(
    @CurrentActor() actor: RequestActor,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<OperatorCreatorDetail> {
    return this.admin.setMetricsExclusion(actor, userId, body);
  }

  @Put('links/:linkId/block')
  setLinkBlock(
    @CurrentActor() actor: RequestActor,
    @Param('linkId') linkId: string,
    @Body() body: unknown,
  ): Promise<LinkView> {
    return this.admin.setLinkBlock(actor, linkId, body);
  }

  @Put('banners/:bannerId/block')
  setBannerBlock(
    @CurrentActor() actor: RequestActor,
    @Param('bannerId') bannerId: string,
    @Body() body: unknown,
  ): Promise<CreatorBannerView> {
    return this.admin.setBannerBlock(actor, bannerId, body);
  }

  @Get('blocked-domains')
  blockedDomains(): Promise<BlockedDomainView[]> {
    return this.admin.blockedDomains();
  }

  @Post('blocked-domains')
  addBlockedDomain(@CurrentActor() actor: RequestActor, @Body() body: unknown): Promise<BlockedDomainView[]> {
    return this.admin.addBlockedDomain(actor, body);
  }

  @Delete('blocked-domains/:domain')
  @HttpCode(204)
  removeBlockedDomain(@CurrentActor() actor: RequestActor, @Param('domain') domain: string): Promise<void> {
    return this.admin.removeBlockedDomain(actor, domain);
  }
}
