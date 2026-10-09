import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  AgentRunDetail,
  AgentRunPage,
  AgentRunView,
  AiOperatorMetrics,
  AiOperatorStatus,
  OperatorActionPage,
} from '@crelink/shared';
import { ActorKinds, AgentRunExempt, AllowWhilePaused, CurrentActor, RequestActor } from '../auth/actor';
import { OperatorGuard } from '../auth/session.guard';
import { AgentRunsService } from './agent-runs.service';
import { AiOperatorService } from './ai-operator.service';
import { MetricsService } from './metrics.service';
import { OperatorActionsService } from './operator-actions.service';

/**
 * AI 운영자 운영 API(R23). 로그인하지 않으면 401, 운영자가 아니면 403 `forbidden`.
 * 멈춤 스위치·토큰 폐기는 사람만, 실행 시작·갱신은 AI만(실행 헤더·멈춤 검사 예외). 근거: docs/specs/crelink-ai-operator.md `경로`.
 */
@Controller('admin')
@UseGuards(OperatorGuard)
export class AiOperatorController {
  constructor(
    private readonly operator: AiOperatorService,
    private readonly runs: AgentRunsService,
    private readonly actions: OperatorActionsService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get('ai-operator')
  status(): Promise<AiOperatorStatus> {
    return this.operator.status();
  }

  @Put('ai-operator/pause')
  @ActorKinds('human')
  setPause(@CurrentActor() actor: RequestActor, @Body() body: unknown): Promise<AiOperatorStatus> {
    return this.operator.setPause(actor, body);
  }

  @Put('ai-operator/tokens/:tokenId/revoke')
  @ActorKinds('human')
  revokeToken(@CurrentActor() actor: RequestActor, @Param('tokenId') tokenId: string): Promise<AiOperatorStatus> {
    return this.operator.revokeToken(actor, tokenId);
  }

  @Get('agent-runs')
  listRuns(@Query('cursor') cursor: unknown): Promise<AgentRunPage> {
    return this.runs.list(cursor);
  }

  @Get('agent-runs/:runId')
  run(@Param('runId') runId: string): Promise<AgentRunDetail> {
    return this.runs.detail(runId);
  }

  @Post('agent-runs')
  @ActorKinds('ai')
  @AgentRunExempt()
  @AllowWhilePaused()
  startRun(@CurrentActor() actor: RequestActor, @Body() body: unknown): Promise<AgentRunView> {
    return this.runs.start(actor, body);
  }

  @Patch('agent-runs/:runId')
  @ActorKinds('ai')
  @AgentRunExempt()
  @AllowWhilePaused()
  updateRun(
    @CurrentActor() actor: RequestActor,
    @Param('runId') runId: string,
    @Body() body: unknown,
  ): Promise<AgentRunView> {
    return this.runs.update(actor, runId, body);
  }

  @Get('actions')
  operatorActions(@Query('cursor') cursor: unknown, @Query('actor') actor: unknown): Promise<OperatorActionPage> {
    return this.actions.list(cursor, actor);
  }

  @Get('metrics')
  metrics(): Promise<AiOperatorMetrics> {
    return this.metricsService.metrics();
  }
}
