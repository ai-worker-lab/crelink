import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminSlotEventController, PublicSlotEventController, SlotEventEntryController } from './slot-event.controller';
import { SlotEventService } from './slot-event.service';

/** 링크 슬롯 이벤트(R24). 편집 상태(`CreatorModule`)와 운영자 상세(`AdminModule`)가 `SlotEventService`를 가져갑니다. */
@Module({
  imports: [AuthModule],
  controllers: [PublicSlotEventController, SlotEventEntryController, AdminSlotEventController],
  providers: [SlotEventService],
  exports: [SlotEventService],
})
export class SlotEventModule {}
