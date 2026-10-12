import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdBlockSettingView } from '@crelink/shared';
import { CurrentActor, RequestActor } from '../auth/actor';
import { OperatorGuard } from '../auth/session.guard';
import { AdBlockService } from './ad-block.service';

/**
 * 플랫폼 광고 블록 스위치(R20 ⑩). 로그인하지 않으면 401, 운영자가 아니면 403 `forbidden`.
 * AI 운영자(토큰)의 쓰기는 크리링 배너 쓰기와 같이 가드가 멈춤(409 `ai_operator_paused`)·실행 헤더(409 `agent_run_required`)를 먼저 확인합니다.
 */
@Controller('admin/ad-block')
@UseGuards(OperatorGuard)
export class AdBlockController {
  constructor(private readonly adBlock: AdBlockService) {}

  @Get()
  setting(): Promise<AdBlockSettingView> {
    return this.adBlock.setting();
  }

  @Put()
  set(@CurrentActor() actor: RequestActor, @Body() body: unknown): Promise<AdBlockSettingView> {
    return this.adBlock.set(actor, body);
  }
}
