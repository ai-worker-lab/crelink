import { CurrentPage, PageAccessGuard } from '../pages/page-access.guard';
import { PageContext } from '@crelink/shared';
import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import type { AnalyticsReport } from '@crelink/shared';
import { OperatorGuard, SessionGuard } from '../auth/session.guard';
import { AnalyticsService } from './analytics.service';

@Controller('me')
@UseGuards(SessionGuard, PageAccessGuard)
export class CreatorAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics')
  @Header('Cache-Control', 'private, no-store')
  report(@CurrentPage() page: PageContext, @Query() query: Record<string, unknown>): Promise<AnalyticsReport> {
    return this.analytics.report(query, page.ownerUserId);
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
