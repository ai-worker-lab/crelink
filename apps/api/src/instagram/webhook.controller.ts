import { Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { InstagramWebhookService } from './webhook.service';

/** 웹훅 수신과 데이터 삭제 콜백. Meta가 부르는 공개 경로라 세션 대신 서명으로 인증합니다. 근거: docs/specs/instagram-comment-dm.md `웹훅 수신 경로`. */
@Controller()
export class InstagramWebhookController {
  constructor(private readonly webhooks: InstagramWebhookService) {}

  @Get('webhooks/instagram')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('X-Content-Type-Options', 'nosniff')
  verify(
    @Query('hub.mode') mode: unknown,
    @Query('hub.verify_token') token: unknown,
    @Query('hub.challenge') challenge: unknown,
  ): string {
    return this.webhooks.verifySubscription(mode, token, challenge);
  }

  /** 커밋 뒤에만 200입니다. DB 오류면 503으로 돌려 Meta 재전송에 맡깁니다. */
  @Post('webhooks/instagram')
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: unknown,
  ): Promise<void> {
    await this.webhooks.receive(request.rawBody, signature);
  }

  /** 폼 본문이라 기존 파서를 쓰고, 그 안의 `signed_request`를 검증합니다. */
  @Post('webhooks/instagram/data-deletion')
  @HttpCode(200)
  dataDeletion(@Body() body: { signed_request?: unknown } | undefined) {
    return this.webhooks.handleDataDeletion(body?.signed_request);
  }

  @Get('public/instagram-deletions/:code')
  deletionStatus(@Param('code') code: string) {
    return this.webhooks.deletionStatus(code);
  }
}
