import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  BlockedDomainView,
  LinkView,
  OperatorCreatorDetail,
  OperatorCreatorListResponse,
  OperatorCreatorStats,
  SessionUser,
} from '@crelink/shared';
import { CurrentUser, OperatorGuard } from '../auth/session.guard';
import { AdminService } from './admin.service';

/** 운영자 화면 API(R10, R13, R14). 로그인하지 않으면 401, 운영자가 아니면 403 `forbidden`. */
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
  setExtraSlots(@Param('userId') userId: string, @Body() body: unknown): Promise<OperatorCreatorDetail> {
    return this.admin.setExtraSlots(userId, body);
  }

  @Put('creators/:userId/suspension')
  setSuspension(@Param('userId') userId: string, @Body() body: unknown): Promise<OperatorCreatorDetail> {
    return this.admin.setSuspension(userId, body);
  }

  @Put('links/:linkId/block')
  setLinkBlock(@Param('linkId') linkId: string, @Body() body: unknown): Promise<LinkView> {
    return this.admin.setLinkBlock(linkId, body);
  }

  @Get('blocked-domains')
  blockedDomains(): Promise<BlockedDomainView[]> {
    return this.admin.blockedDomains();
  }

  @Post('blocked-domains')
  addBlockedDomain(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<BlockedDomainView[]> {
    return this.admin.addBlockedDomain(user.id, body);
  }

  @Delete('blocked-domains/:domain')
  @HttpCode(204)
  removeBlockedDomain(@Param('domain') domain: string): Promise<void> {
    return this.admin.removeBlockedDomain(domain);
  }
}
