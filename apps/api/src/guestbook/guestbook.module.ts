import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreatorModule } from '../creator/creator.module';
import { FilesModule } from '../files/files.module';
import { GuestbookController } from './guestbook.controller';
import { GuestbookService } from './guestbook.service';

@Module({
  imports: [AuthModule, CreatorModule, FilesModule],
  controllers: [GuestbookController],
  providers: [GuestbookService],
})
export class GuestbookModule {}
