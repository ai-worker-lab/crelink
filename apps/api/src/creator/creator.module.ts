import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { LandingPassModule } from '../short-link/landing-pass.module';
import { ShortLinkModule } from '../short-link/short-link.module';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';
import { CreatorController, LinksController, PortfolioController } from './creator.controller';
import { CreatorService } from './creator.service';
import { LinksService } from './links.service';
import { ProfileService } from './profile.service';
import { PublicLandingController } from './public-landing.controller';
import { SlugService } from './slug.service';

@Module({
  imports: [AuthModule, FilesModule, LandingPassModule, ShortLinkModule],
  controllers: [CreatorController, LinksController, PortfolioController, PublicLandingController, BannersController],
  providers: [CreatorService, LinksService, ProfileService, SlugService, BannersService],
  exports: [CreatorService],
})
export class CreatorModule {}
