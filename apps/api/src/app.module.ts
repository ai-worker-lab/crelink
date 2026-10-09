import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { HealthModule } from './health.module';
import { DatabaseModule } from './database.module';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './files/files.module';
import { CreatorModule } from './creator/creator.module';
import { GuestbookModule } from './guestbook/guestbook.module';
import { AdminModule } from './admin/admin.module';
import { RetentionModule } from './retention/retention.module';
import { ShortLinkModule } from './short-link/short-link.module';
import { SlotEventModule } from './slot-event/slot-event.module';

// SentryModule은 공식 안내대로 맨 앞에 둡니다(SENTRY_DSN이 비면 아무것도 보내지 않음, src/instrument.ts).
// ShortLinkModule의 `GET /:slug`가 다른 경로를 가리지 않게 마지막에 둡니다.
@Module({
  imports: [
    SentryModule.forRoot(),
    DatabaseModule,
    HealthModule,
    AuthModule,
    FilesModule,
    CreatorModule,
    GuestbookModule,
    AdminModule,
    SlotEventModule,
    RetentionModule,
    ShortLinkModule,
  ],
})
export class AppModule {}
