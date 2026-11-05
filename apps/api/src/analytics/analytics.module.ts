import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAnalyticsController, CreatorAnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [AuthModule],
  controllers: [CreatorAnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
