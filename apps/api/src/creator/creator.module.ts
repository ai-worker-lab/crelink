import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { LandingPassModule } from '../short-link/landing-pass.module';
import { CreatorController, LinksController, PortfolioController } from './creator.controller';
import { CreatorService } from './creator.service';
import { LinksService } from './links.service';
import { ProfileService } from './profile.service';
import { PublicLandingController } from './public-landing.controller';
import { SlugService } from './slug.service';

@Module({
  imports: [AuthModule, FilesModule, LandingPassModule],
  controllers: [CreatorController, LinksController, PortfolioController, PublicLandingController],
  providers: [CreatorService, LinksService, ProfileService, SlugService],
  exports: [CreatorService],
})
export class CreatorModule {}
