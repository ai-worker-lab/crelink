import { Module } from '@nestjs/common';
import { HealthModule } from './health.module';
import { DatabaseModule } from './database.module';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './files/files.module';
import { CreatorModule } from './creator/creator.module';
import { AdminModule } from './admin/admin.module';
import { RetentionModule } from './retention/retention.module';
import { ShortLinkModule } from './short-link/short-link.module';

// ShortLinkModule의 `GET /:slug`가 다른 경로를 가리지 않게 마지막에 둡니다.
@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AuthModule,
    FilesModule,
    CreatorModule,
    AdminModule,
    RetentionModule,
    ShortLinkModule,
  ],
})
export class AppModule {}
