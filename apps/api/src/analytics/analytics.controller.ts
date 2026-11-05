import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import type { AnalyticsReport, SessionUser } from '@crelink/shared';
import { CurrentUser, OperatorGuard, SessionGuard } from '../auth/session.guard';
import { AnalyticsService } from './analytics.service';

@Controller('me')
@UseGuards(SessionGuard)
export class CreatorAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics')
  @Header('Cache-Control', 'private, no-store')
  report(@CurrentUser() user: SessionUser, @Query() query: Record<string, unknown>): Promise<AnalyticsReport> {
    return this.analytics.report(query, user.id);
  }
}

@Controller('admin')
@UseGuards(OperatorGuard)
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics')
  @Header('Cache-Control', 'private, no-store')
  report(@Query() query: Record<string, unknown>): Promise<AnalyticsReport> {
    return this.analytics.report(query);
  }
}
