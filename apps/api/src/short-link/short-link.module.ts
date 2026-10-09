import { Module } from '@nestjs/common';
import { LandingPassModule } from './landing-pass.module';
import { ShortLinkController } from './short-link.controller';
import { GeoIpService, TrackingService } from './tracking.service';

@Module({
  imports: [LandingPassModule],
  controllers: [ShortLinkController],
  providers: [GeoIpService, TrackingService],
  exports: [TrackingService],
})
export class ShortLinkModule {}
