import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CreatorBannerView, SessionUser } from '@crelink/shared';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { BannersService } from './banners.service';

/** 크리에이터 배너 쓰기(R21 ②). 부여 확인은 서비스가 트랜잭션 안에서 합니다(403 `banner_slot_not_granted`). */
@Controller('me/banners')
@UseGuards(SessionGuard)
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<CreatorBannerView> {
    return this.banners.create(user.id, body);
  }

  @Put('order')
  reorder(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<CreatorBannerView[]> {
    return this.banners.reorder(user.id, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<CreatorBannerView> {
    return this.banners.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.banners.remove(user.id, id);
  }
}
