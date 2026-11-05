import { Body, Controller, Header, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LandingEventsService } from './landing-events.service';

@Controller('landings')
export class LandingEventsController {
  constructor(private readonly events: LandingEventsService) {}

  @Post(':publicId/events')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async record(@Param('publicId') publicId: string, @Body() body: unknown, @Req() request: Request): Promise<void> {
    await this.events.record(publicId, body, request);
  }
}
