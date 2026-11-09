import { Module } from '@nestjs/common';
import { SignupFunnelController } from './signup-funnel.controller';
import { SignupFunnelService } from './signup-funnel.service';

@Module({
  controllers: [SignupFunnelController],
  providers: [SignupFunnelService],
  exports: [SignupFunnelService],
})
export class SignupFunnelModule {}
