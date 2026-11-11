import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { LandingPassModule } from '../short-link/landing-pass.module';
import { ShortLinkModule } from '../short-link/short-link.module';
import { SignupFunnelModule } from '../telemetry/signup-funnel.module';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';
import { ChannelLinksService } from './channel-links.service';
import { ChannelLinksController, CreatorController, LinksController, PortfolioController } from './creator.controller';
import { CreatorService } from './creator.service';
import { InstabioSource } from './instabio-source';
import { InstabioImportService } from './instabio-import.service';
import { InstabioImportController } from './instabio-import.controller';
import { LinksService } from './links.service';
import { ProfileService } from './profile.service';
import { PublicLandingController } from './public-landing.controller';
import { SlugService } from './slug.service';

@Module({
  imports: [AuthModule, FilesModule, LandingPassModule, ShortLinkModule, SignupFunnelModule],
  controllers: [
    InstabioImportController,
    CreatorController,
    LinksController,
    ChannelLinksController,
    PortfolioController,
    PublicLandingController,
    BannersController,
  ],
  providers: [
    InstabioSource,
    InstabioImportService,
    CreatorService,
    LinksService,
    ChannelLinksService,
    ProfileService,
    SlugService,
    BannersService,
  ],
  exports: [CreatorService, ChannelLinksService],
})
export class CreatorModule {}
