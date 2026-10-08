import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { GuestbookEntryView, GuestbookPage, SessionUser } from '@crelink/shared';
import { CurrentUser, OptionalSessionGuard, SessionGuard, ViewerUser } from '../auth/session.guard';
import { GuestbookService } from './guestbook.service';

/** 랜딩 방명록(R19). 응답은 보는 사람마다 다르므로 캐시하지 않습니다. */
@Controller()
export class GuestbookController {
  constructor(private readonly guestbook: GuestbookService) {}

  /** 누구나. 세션이 유효하면 보는 사람으로 판정하고, 없거나 무효면 비회원으로 봅니다. */
  @Get('landings/:publicId/guestbook')
  @UseGuards(OptionalSessionGuard)
  @Header('Cache-Control', 'no-store')
  list(
    @Param('publicId') publicId: string,
    @ViewerUser() viewer: SessionUser | null,
    @Query('cursor') cursor: unknown,
  ): Promise<GuestbookPage> {
    return this.guestbook.list(publicId, viewer, cursor);
  }

  @Post('landings/:publicId/guestbook')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  create(
    @Param('publicId') publicId: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<GuestbookEntryView> {
    return this.guestbook.create(publicId, user, body);
  }

  @Delete('guestbook/:entryId')
  @UseGuards(SessionGuard)
  @HttpCode(204)
  remove(@Param('entryId') entryId: string, @CurrentUser() user: SessionUser): Promise<void> {
    return this.guestbook.remove(entryId, user);
  }

  @Put('guestbook/:entryId/hidden')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  setHidden(
    @Param('entryId') entryId: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<GuestbookEntryView> {
    return this.guestbook.setHidden(entryId, user, body);
  }
}
