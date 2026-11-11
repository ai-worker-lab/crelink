import { CurrentPage, PageAccessGuard } from '../pages/page-access.guard';
import { PageContext } from '@crelink/shared';
import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CreatorBannerView } from '@crelink/shared';
import { SessionGuard } from '../auth/session.guard';
import { BannersService } from './banners.service';

/** 크리에이터 배너 쓰기(R21 ②). 부여 확인은 서비스가 트랜잭션 안에서 합니다(403 `banner_slot_not_granted`). */
@Controller('me/banners')
@UseGuards(SessionGuard, PageAccessGuard)
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Post()
  create(@CurrentPage() page: PageContext, @Body() body: unknown): Promise<CreatorBannerView> {
    return this.banners.create(page.ownerUserId, body);
  }

  @Put('order')
  reorder(@CurrentPage() page: PageContext, @Body() body: unknown): Promise<CreatorBannerView[]> {
    return this.banners.reorder(page.ownerUserId, body);
  }

  @Patch(':id')
  update(@CurrentPage() page: PageContext, @Param('id') id: string, @Body() body: unknown): Promise<CreatorBannerView> {
    return this.banners.update(page.ownerUserId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentPage() page: PageContext, @Param('id') id: string): Promise<void> {
    return this.banners.remove(page.ownerUserId, id);
  }
}
