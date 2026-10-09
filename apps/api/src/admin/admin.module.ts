import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreatorModule } from '../creator/creator.module';
import { FilesModule } from '../files/files.module';
import { AdBannersController } from './ad-banners.controller';
import { AdBannersService } from './ad-banners.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { StatsService } from './stats.service';

@Module({
  imports: [AuthModule, CreatorModule, FilesModule],
  controllers: [AdminController, AdBannersController],
  providers: [AdminService, StatsService, AdBannersService],
})
export class AdminModule {}
