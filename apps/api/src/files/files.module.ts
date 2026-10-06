import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppConfig } from '../config.service';
import { FileStorage, LocalDiskFileStorage } from './file-storage';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { S3FileStorage } from './s3-file-storage';

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      // FILE_STORAGE(기본 disk)로 구현을 고릅니다. 값이 틀리면 여기서 기동을 거부합니다.
      provide: FileStorage,
      inject: [AppConfig],
      useFactory: (config: AppConfig): FileStorage => {
        const storage = config.fileStorage;
        return storage.kind === 's3' ? new S3FileStorage(storage) : new LocalDiskFileStorage(config);
      },
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
