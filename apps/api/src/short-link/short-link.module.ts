import { Module } from '@nestjs/common';
import { ShortLinkController } from './short-link.controller';
import { GeoIpService, TrackingService } from './tracking.service';

@Module({
  controllers: [ShortLinkController],
  providers: [GeoIpService, TrackingService],
})
export class ShortLinkModule {}
