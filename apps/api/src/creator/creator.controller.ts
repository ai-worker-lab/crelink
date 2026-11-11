import { CurrentPage, PageAccessGuard, PageOwnerOnly } from '../pages/page-access.guard';
import { PageContext } from '@crelink/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ChannelLinkView,
  CreatorLandingState,
  LinkView,
  parseSignupContextHeader,
  PortfolioItemView,
  SIGNUP_CONTEXT_HEADER,
  SlugAvailabilityResponse,
  SocialLinkView,
  SessionUser,
} from '@crelink/shared';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ChannelLinksService } from './channel-links.service';
import { CreatorService } from './creator.service';
import { LinksService } from './links.service';
import { ProfileService } from './profile.service';
import { SlugService } from './slug.service';
import { bodyObject } from '../common/input';

@Controller('me')
@UseGuards(SessionGuard, PageAccessGuard)
export class CreatorController {
  constructor(
    private readonly creator: CreatorService,
    private readonly profile: ProfileService,
    private readonly slugs: SlugService,
  ) {}

  @Get('landing')
  async landing(@CurrentPage() page: PageContext, @CurrentUser() user: SessionUser): Promise<CreatorLandingState> {
    return {
      ...(await this.creator.landingState(page.ownerUserId, user.role === 'operator')),
      pageAccess: { role: page.role, shared: page.shared },
    };
  }

  @Patch('landing')
  async updateLanding(
    @CurrentPage() page: PageContext,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<CreatorLandingState> {
    await this.profile.updateLanding(page.ownerUserId, body);
    return {
      ...(await this.creator.landingState(page.ownerUserId, user.role === 'operator')),
      pageAccess: { role: page.role, shared: page.shared },
    };
  }

  /** 광고 블록 켜고 끄기(R20 ⑩). 400 `validation_failed`, 플랫폼 스위치가 꺼져 있으면 409 `ad_block_unavailable`. */
  @Put('ad-block')
  @PageOwnerOnly()
  async setAdBlock(
    @CurrentPage() page: PageContext,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<CreatorLandingState> {
    await this.profile.setAdBlock(page.ownerUserId, body);
    return {
      ...(await this.creator.landingState(page.ownerUserId, user.role === 'operator')),
      pageAccess: { role: page.role, shared: page.shared },
    };
  }

  @Get('short-link/availability')
  @PageOwnerOnly()
  availability(@CurrentPage() page: PageContext, @Query('slug') slug: unknown): Promise<SlugAvailabilityResponse> {
    return this.slugs.availability(page.ownerUserId, slug);
  }

  @Put('short-link/slug')
  @PageOwnerOnly()
  async changeSlug(
    @CurrentPage() page: PageContext,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<CreatorLandingState> {
    await this.slugs.change(page.ownerUserId, bodyObject(body).slug);
    return {
      ...(await this.creator.landingState(page.ownerUserId, user.role === 'operator')),
      pageAccess: { role: page.role, shared: page.shared },
    };
  }

  @Put('socials')
  replaceSocials(@CurrentPage() page: PageContext, @Body() body: unknown): Promise<SocialLinkView[]> {
    return this.profile.replaceSocials(page.ownerUserId, body);
  }
}

@Controller('me/links')
@UseGuards(SessionGuard, PageAccessGuard)
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Post()
  create(
    @CurrentPage() page: PageContext,
    @Body() body: unknown,
    @Headers(SIGNUP_CONTEXT_HEADER) signupContext: unknown,
  ): Promise<LinkView> {
    return this.links.create(page.ownerUserId, body, parseSignupContextHeader(signupContext).inAppKind);
  }

  @Put('order')
  reorder(@CurrentPage() page: PageContext, @Body() body: unknown): Promise<LinkView[]> {
    return this.links.reorder(page.ownerUserId, body);
  }

  @Patch(':id')
  update(@CurrentPage() page: PageContext, @Param('id') id: string, @Body() body: unknown): Promise<LinkView> {
    return this.links.update(page.ownerUserId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentPage() page: PageContext, @Param('id') id: string): Promise<void> {
    return this.links.remove(page.ownerUserId, id);
  }
}

@Controller('me/portfolio')
@UseGuards(SessionGuard, PageAccessGuard)
export class PortfolioController {
  constructor(private readonly profile: ProfileService) {}

  @Post()
  create(@CurrentPage() page: PageContext, @Body() body: unknown): Promise<PortfolioItemView> {
    return this.profile.createPortfolioItem(page.ownerUserId, body);
  }

  @Put('order')
  reorder(@CurrentPage() page: PageContext, @Body() body: unknown): Promise<PortfolioItemView[]> {
    return this.profile.reorderPortfolio(page.ownerUserId, body);
  }

  @Patch(':id')
  update(@CurrentPage() page: PageContext, @Param('id') id: string, @Body() body: unknown): Promise<PortfolioItemView> {
    return this.profile.updatePortfolioItem(page.ownerUserId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentPage() page: PageContext, @Param('id') id: string): Promise<void> {
    return this.profile.deletePortfolioItem(page.ownerUserId, id);
  }
}

/**
 * 채널별 짧은 주소(docs/specs/channel-links.md). 소유자 전용입니다(`@PageOwnerOnly()`): 대상 페이지는 `X-Crelink-Page`(없으면 본인 페이지)로
 * 정해지고 멤버(편집자)는 목록·생성·보관이 모두 403입니다. 운영자 대행 경로는 없습니다.
 */
@Controller('me/channel-links')
@UseGuards(SessionGuard, PageAccessGuard)
@PageOwnerOnly()
export class ChannelLinksController {
  constructor(private readonly channelLinks: ChannelLinksService) {}

  @Get()
  list(@CurrentPage() page: PageContext): Promise<ChannelLinkView[]> {
    return this.channelLinks.list(page.ownerUserId);
  }

  /** 같은 조합의 보관되지 않은 주소가 이미 있으면 200으로 그것을, 새로 만들면 201. */
  @Post()
  async create(
    @CurrentPage() page: PageContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ChannelLinkView> {
    const { view, created } = await this.channelLinks.create(page.ownerUserId, body);
    response.status(created ? 201 : 200);
    return view;
  }

  @Post(':code/archive')
  @HttpCode(204)
  archive(@CurrentPage() page: PageContext, @Param('code') code: string): Promise<void> {
    return this.channelLinks.archive(page.ownerUserId, code);
  }
}
