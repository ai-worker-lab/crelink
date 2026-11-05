import { Module } from '@nestjs/common';
import { LandingPassModule } from './landing-pass.module';
import { ShortLinkController } from './short-link.controller';
import { GeoIpService, TrackingService } from './tracking.service';
import { LandingEventsController } from '../telemetry/landing-events.controller';
import { LandingEventsService } from '../telemetry/landing-events.service';

@Module({
  imports: [LandingPassModule],
  controllers: [ShortLinkController, LandingEventsController],
  providers: [GeoIpService, TrackingService, LandingEventsService],
  exports: [TrackingService],
})
export class ShortLinkModule {}
