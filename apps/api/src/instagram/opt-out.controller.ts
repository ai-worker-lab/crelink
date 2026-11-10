import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { InstagramOptOutService } from './opt-out.service';

/** DM 수신 거부. 링크 미리보기 크롤러가 거부를 일으키면 안 되므로 POST만 둡니다. 근거: docs/specs/instagram-comment-dm.md `API 계약 초안`. */
@Controller('public/instagram-dm-opt-outs')
export class InstagramOptOutController {
  constructor(private readonly optOuts: InstagramOptOutService) {}

  @Post()
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async optOut(@Body() body: unknown, @Req() request: Request): Promise<void> {
    await this.optOuts.optOut(body, request);
  }
}
