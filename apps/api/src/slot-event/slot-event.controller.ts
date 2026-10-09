import { Body, Controller, Get, Header, HttpStatus, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import {
  CreatorSlotEventState,
  OperatorSlotEventResponse,
  PublicSlotEventResponse,
  SessionUser,
} from '@crelink/shared';
import type { Response } from 'express';
import { CurrentUser, OperatorGuard, SessionGuard } from '../auth/session.guard';
import { SlotEventService } from './slot-event.service';

/** 홈 이벤트 안내(R24 ④). 누구나 읽고, 기간이 바뀌면 바로 보이도록 캐시하지 않습니다. */
@Controller('public/slot-event')
export class PublicSlotEventController {
  constructor(private readonly slotEvents: SlotEventService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async event(): Promise<PublicSlotEventResponse> {
    return { event: await this.slotEvents.publicEvent() };
  }
}

/** 이벤트 신청(R24 ①). 세션 본인만 신청하며 본문은 읽지 않습니다. */
@Controller('me/slot-event')
@UseGuards(SessionGuard)
export class SlotEventEntryController {
  constructor(private readonly slotEvents: SlotEventService) {}

  /** 새로 신청하면 201, 이미 신청했으면 200(같은 모양). */
  @Post('entry')
  async apply(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreatorSlotEventState> {
    const { created, state } = await this.slotEvents.apply(user.id);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return state;
  }
}

/** 운영자 이벤트 화면(R24 ⑤). 로그인하지 않으면 401, 운영자가 아니면 403 `forbidden`. 이벤트를 만들거나 지우는 경로는 없습니다. */
@Controller('admin/slot-event')
@UseGuards(OperatorGuard)
export class AdminSlotEventController {
  constructor(private readonly slotEvents: SlotEventService) {}

  @Get()
  view(@Query('page') page: unknown): Promise<OperatorSlotEventResponse> {
    return this.slotEvents.operatorView(page);
  }

  @Put()
  setPeriod(@Body() body: unknown): Promise<OperatorSlotEventResponse> {
    return this.slotEvents.setPeriod(body);
  }
}
