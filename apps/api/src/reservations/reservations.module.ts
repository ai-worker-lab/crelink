import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LandingPassModule } from '../short-link/landing-pass.module';
import { MeReservationsController, PublicReservationsController } from './reservations.controller';
import { ReservationsEnabledGuard } from './reservations.guard';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [AuthModule, LandingPassModule],
  controllers: [PublicReservationsController, MeReservationsController],
  providers: [ReservationsEnabledGuard, ReservationsService],
})
export class ReservationsModule {}
