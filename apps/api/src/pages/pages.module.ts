import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { PagesController, PageInvitesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [PagesController, PageInvitesController],
  providers: [PagesService],
})
export class PagesModule {}
