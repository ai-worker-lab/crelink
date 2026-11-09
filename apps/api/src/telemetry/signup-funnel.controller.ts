import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SignupFunnelService } from './signup-funnel.service';

@Controller('signup-funnel')
export class SignupFunnelController {
  constructor(private readonly funnel: SignupFunnelService) {}

  @Post('events')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async record(@Body() body: unknown, @Req() request: Request): Promise<void> {
    await this.funnel.recordClientEvent(body, request);
  }
}
