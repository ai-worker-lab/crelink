import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { PageContext, SessionUser } from '@crelink/shared';
import { ActorKinds } from '../auth/actor';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { apiError } from '../common/http';
import { CurrentPage, PageAccessGuard, PageOwnerOnly } from './page-access.guard';
import { PagesService } from './pages.service';

@Controller('me')
@UseGuards(SessionGuard)
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get('pages')
  @Header('Cache-Control', 'private, no-store')
  pages(@CurrentUser() user: SessionUser) {
    return this.pagesService.pages(user.id);
  }

  @Post('page-invites')
  @UseGuards(PageAccessGuard)
  @PageOwnerOnly()
  @Header('Cache-Control', 'private, no-store')
  create(@CurrentPage() page: PageContext) {
    return this.pagesService.createInvite(page.ownerUserId);
  }

  @Delete('page-invites')
  @HttpCode(204)
  @UseGuards(PageAccessGuard)
  @PageOwnerOnly()
  cancel(@CurrentPage() page: PageContext) {
    return this.pagesService.cancelInvite(page.ownerUserId);
  }

  @Get('page-members')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(PageAccessGuard)
  @PageOwnerOnly()
  members(@CurrentPage() page: PageContext) {
    return this.pagesService.members(page.ownerUserId);
  }

  @Delete('page-members/me')
  @HttpCode(204)
  @UseGuards(PageAccessGuard)
  leave(@CurrentPage() page: PageContext, @CurrentUser() user: SessionUser) {
    if (page.role !== 'editor') throw apiError(403, 'forbidden', '공유 페이지에서만 나갈 수 있습니다.');
    return this.pagesService.remove(page.ownerUserId, user.id);
  }

  @Delete('page-members/:userId')
  @HttpCode(204)
  @UseGuards(PageAccessGuard)
  @PageOwnerOnly()
  remove(@CurrentPage() page: PageContext, @Param('userId') userId: string) {
    return this.pagesService.remove(page.ownerUserId, userId);
  }
}

@Controller('page-invites')
@UseGuards(SessionGuard)
export class PageInvitesController {
  constructor(private readonly pages: PagesService) {}

  @Post('preview')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  preview(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return this.pages.preview(user.id, body);
  }

  @Post('accept')
  @HttpCode(200)
  @ActorKinds('human')
  accept(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    return this.pages.accept(user.id, body);
  }
}
