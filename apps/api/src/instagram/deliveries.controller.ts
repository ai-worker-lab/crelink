import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PageContext } from '@crelink/shared';
import { ActorKinds } from '../auth/actor';
import { SessionGuard } from '../auth/session.guard';
import { CurrentPage, PageAccessGuard, PageOwnerOnly } from '../pages/page-access.guard';
import { InstagramDeliveriesService } from './deliveries.service';

/** 발송 내역은 페이지 소유자인 사람만 조회합니다. */
@Controller('me/instagram/deliveries')
@UseGuards(SessionGuard, PageAccessGuard)
@PageOwnerOnly()
@ActorKinds('human')
export class InstagramDeliveriesController {
  constructor(private readonly deliveries: InstagramDeliveriesService) {}

  @Get()
  list(@CurrentPage() page: PageContext, @Query('cursor') cursor?: unknown, @Query('rule') rule?: unknown) {
    return this.deliveries.list(page.ownerUserId, cursor, rule);
  }
}
