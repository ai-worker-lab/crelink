import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreatorModule } from '../creator/creator.module';
import { InstagramAdminController } from './admin.controller';
import { InstagramAdminService } from './admin.service';
import { InstagramConnectionController } from './connection.controller';
import { InstagramConnectionService } from './connection.service';
import { InstagramDeliveriesController } from './deliveries.controller';
import { InstagramDeliveriesService } from './deliveries.service';
import { FetchInstagramGraph, InstagramGraph } from './graph';
import { InstagramOptOutController } from './opt-out.controller';
import { InstagramOptOutService } from './opt-out.service';
import { InstagramRulesController } from './rules.controller';
import { InstagramRulesService } from './rules.service';
import { InstagramTokenHealthService } from './token-health.service';
import { InstagramWebhookController } from './webhook.controller';
import { InstagramWebhookService } from './webhook.service';
import { InstagramWorkerService } from './worker.service';

// 뒤 티켓(0256~0261, 0271)이 이 파일을 고치지 않고 각자의 파일 내용만 채우도록 모든 controller·provider를 미리 등록합니다.
// 설계: docs/specs/instagram-comment-dm.md#티켓-분해. 소유자 가드는 AuthModule, 채널 주소 코드는 CreatorModule에서 옵니다.
@Module({
  imports: [AuthModule, CreatorModule],
  controllers: [
    InstagramConnectionController,
    InstagramRulesController,
    InstagramDeliveriesController,
    InstagramWebhookController,
    InstagramAdminController,
    InstagramOptOutController,
  ],
  providers: [
    { provide: InstagramGraph, useClass: FetchInstagramGraph },
    InstagramConnectionService,
    InstagramTokenHealthService,
    InstagramRulesService,
    InstagramDeliveriesService,
    InstagramWebhookService,
    InstagramWorkerService,
    InstagramAdminService,
    InstagramOptOutService,
  ],
})
export class InstagramModule {}
