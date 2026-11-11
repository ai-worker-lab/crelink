import { Body, Controller, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { InstagramDmSettingsView } from '@crelink/shared';
import { ActorKinds, CurrentActor, RequestActor } from '../auth/actor';
import { OperatorGuard } from '../auth/session.guard';
import { InstagramAdminService } from './admin.service';

/**
 * Instagram DM 운영자 스위치와 계정 정지. 로그인하지 않으면 401, 운영자가 아니면 403 `forbidden`.
 * 설정 키가 없어도 스위치는 내릴 수 있어야 하므로 503을 내지 않습니다. 쓰기는 멈춤 스위치와 같이 사람 운영자만 합니다.
 */
@Controller('admin/instagram-dm')
@UseGuards(OperatorGuard)
export class InstagramAdminController {
  constructor(private readonly admin: InstagramAdminService) {}

  @Get()
  setting(): Promise<InstagramDmSettingsView> {
    return this.admin.setting();
  }

  @Put()
  @ActorKinds('human')
  setAudience(@CurrentActor() actor: RequestActor, @Body() body: unknown): Promise<InstagramDmSettingsView> {
    return this.admin.setAudience(actor, body);
  }

  @Put('connections/:userId/pause')
  @ActorKinds('human')
  @HttpCode(204)
  setConnectionPause(
    @CurrentActor() actor: RequestActor,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ): Promise<void> {
    return this.admin.setConnectionPause(actor, userId, body);
  }
}
