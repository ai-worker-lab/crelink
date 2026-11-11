import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PageContext } from '@crelink/shared';
import { ActorKinds } from '../auth/actor';
import { SessionGuard } from '../auth/session.guard';
import { CurrentPage, PageAccessGuard, PageOwnerOnly } from '../pages/page-access.guard';
import { InstagramRulesService } from './rules.service';

/** Instagram 규칙·게시물은 페이지 소유자인 사람만 다룹니다. */
@Controller('me/instagram')
@UseGuards(SessionGuard, PageAccessGuard)
@PageOwnerOnly()
@ActorKinds('human')
export class InstagramRulesController {
  constructor(private readonly rules: InstagramRulesService) {}

  @Get('rules')
  list(@CurrentPage() page: PageContext) {
    return this.rules.list(page.ownerUserId);
  }

  @Post('rules')
  create(@CurrentPage() page: PageContext, @Body() body: unknown) {
    return this.rules.create(page.ownerUserId, body);
  }

  @Patch('rules/:publicId')
  update(@CurrentPage() page: PageContext, @Param('publicId') publicId: string, @Body() body: unknown) {
    return this.rules.update(page.ownerUserId, publicId, body);
  }

  @Delete('rules/:publicId')
  @HttpCode(204)
  archive(@CurrentPage() page: PageContext, @Param('publicId') publicId: string) {
    return this.rules.archive(page.ownerUserId, publicId);
  }

  @Get('media')
  media(@CurrentPage() page: PageContext, @Query('after') after?: unknown) {
    return this.rules.media(page.ownerUserId, after);
  }
}
