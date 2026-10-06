import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreatorModule } from '../creator/creator.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { StatsService } from './stats.service';

@Module({
  imports: [AuthModule, CreatorModule],
  controllers: [AdminController],
  providers: [AdminService, StatsService],
})
export class AdminModule {}
