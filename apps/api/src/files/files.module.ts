import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FileStorage, LocalDiskFileStorage } from './file-storage';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [FilesService, { provide: FileStorage, useClass: LocalDiskFileStorage }],
  exports: [FilesService],
})
export class FilesModule {}
