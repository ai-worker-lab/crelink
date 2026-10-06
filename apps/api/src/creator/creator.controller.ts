import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  CreatorLandingState,
  LinkView,
  PortfolioItemView,
  SessionUser,
  SlugAvailabilityResponse,
  SocialLinkView,
} from '@crelink/shared';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { CreatorService } from './creator.service';
import { LinksService } from './links.service';
import { ProfileService } from './profile.service';
import { SlugService } from './slug.service';
import { bodyObject } from '../common/input';

@Controller('me')
@UseGuards(SessionGuard)
export class CreatorController {
  constructor(
    private readonly creator: CreatorService,
    private readonly profile: ProfileService,
    private readonly slugs: SlugService,
  ) {}

  @Get('landing')
  landing(@CurrentUser() user: SessionUser): Promise<CreatorLandingState> {
    return this.creator.landingState(user.id);
  }

  @Patch('landing')
  async updateLanding(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<CreatorLandingState> {
    await this.profile.updateLanding(user.id, body);
    return this.creator.landingState(user.id);
  }

  @Get('short-link/availability')
  availability(@CurrentUser() user: SessionUser, @Query('slug') slug: unknown): Promise<SlugAvailabilityResponse> {
    return this.slugs.availability(user.id, slug);
  }

  @Put('short-link/slug')
  async changeSlug(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<CreatorLandingState> {
    await this.slugs.change(user.id, bodyObject(body).slug);
    return this.creator.landingState(user.id);
  }

  @Put('socials')
  replaceSocials(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<SocialLinkView[]> {
    return this.profile.replaceSocials(user.id, body);
  }
}

@Controller('me/links')
@UseGuards(SessionGuard)
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<LinkView> {
    return this.links.create(user.id, body);
  }

  @Put('order')
  reorder(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<LinkView[]> {
    return this.links.reorder(user.id, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<LinkView> {
    return this.links.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.links.remove(user.id, id);
  }
}

@Controller('me/portfolio')
@UseGuards(SessionGuard)
export class PortfolioController {
  constructor(private readonly profile: ProfileService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<PortfolioItemView> {
    return this.profile.createPortfolioItem(user.id, body);
  }

  @Put('order')
  reorder(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<PortfolioItemView[]> {
    return this.profile.reorderPortfolio(user.id, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<PortfolioItemView> {
    return this.profile.updatePortfolioItem(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.profile.deletePortfolioItem(user.id, id);
  }
}
