import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateReservationResponse, LinkReservationSetting, ReservationPage, SessionUser } from '@crelink/shared';
import type { Request } from 'express';
import { ActorKinds } from '../auth/actor';
import { CurrentUser, SessionGuard } from '../auth/session.guard';
import { ReservationsEnabledGuard } from './reservations.guard';
import { ReservationsService } from './reservations.service';

/** 방문자의 사전 신청 제출(R29). 로그인 없이 Origin·서명 토큰으로 받습니다. */
@Controller('landings')
@UseGuards(ReservationsEnabledGuard)
export class PublicReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post(':publicId/links/:linkPublicId/reservations')
  @Header('Cache-Control', 'no-store')
  submit(
    @Param('publicId') publicId: string,
    @Param('linkPublicId') linkPublicId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<CreateReservationResponse> {
    return this.reservations.submit(publicId, linkPublicId, body, request);
  }
}

/** 크리에이터의 사전 신청 설정·조회·삭제(R29, R30). 사람 세션만 쓰고, 남의 링크·신청은 모두 404로 답합니다. */
@Controller('me')
@UseGuards(ReservationsEnabledGuard, SessionGuard)
@ActorKinds('human')
export class MeReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Put('links/:id/reservation')
  @Header('Cache-Control', 'no-store')
  setLinkReservation(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<LinkReservationSetting> {
    return this.reservations.setLinkReservation(user.id, id, body);
  }

  @Get('reservations')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() user: SessionUser,
    @Query('linkId') linkId: unknown,
    @Query('cursor') cursor: unknown,
  ): Promise<ReservationPage> {
    return this.reservations.list(user.id, linkId, cursor);
  }

  @Get('reservations/export')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="crelink-reservations.csv"')
  exportCsv(@CurrentUser() user: SessionUser, @Query('linkId') linkId: unknown): Promise<string> {
    return this.reservations.exportCsv(user.id, linkId);
  }

  @Delete('reservations/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.reservations.remove(user.id, id);
  }

  @Delete('links/:id/reservations')
  @HttpCode(204)
  removeForLink(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.reservations.removeForLink(user.id, id);
  }
}
