import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AdBannerListResponse, AdBannerView } from '@crelink/shared';
import { CurrentActor, RequestActor } from '../auth/actor';
import { OperatorGuard } from '../auth/session.guard';
import { AdBannersService } from './ad-banners.service';

/** 크리링 배너 운영(R20 ④). 로그인하지 않으면 401, 운영자가 아니면 403 `forbidden`. 삭제 경로는 없고 내리기만 있습니다. */
@Controller('admin/ad-banners')
@UseGuards(OperatorGuard)
export class AdBannersController {
  constructor(private readonly adBanners: AdBannersService) {}

  @Get()
  list(): Promise<AdBannerListResponse> {
    return this.adBanners.list();
  }

  @Post()
  create(@CurrentActor() actor: RequestActor, @Body() body: unknown): Promise<AdBannerView> {
    return this.adBanners.create(actor, body);
  }

  @Put('order')
  reorder(@CurrentActor() actor: RequestActor, @Body() body: unknown): Promise<AdBannerView[]> {
    return this.adBanners.reorder(actor, body);
  }

  @Patch(':id')
  update(@CurrentActor() actor: RequestActor, @Param('id') id: string, @Body() body: unknown): Promise<AdBannerView> {
    return this.adBanners.update(actor, id, body);
  }

  @Put(':id/end')
  end(@CurrentActor() actor: RequestActor, @Param('id') id: string): Promise<AdBannerView> {
    return this.adBanners.end(actor, id);
  }
}
