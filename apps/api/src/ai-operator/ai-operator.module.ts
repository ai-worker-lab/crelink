import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentRunsService } from './agent-runs.service';
import { AiOperatorController } from './ai-operator.controller';
import { AiOperatorService } from './ai-operator.service';
import { MetricsService } from './metrics.service';
import { OperatorActionsService } from './operator-actions.service';

/** AI 운영자(R23): 실행 기록·멈춤 스위치·토큰 폐기·운영자 행동 기록 조회·지표. */
@Module({
  imports: [AuthModule],
  controllers: [AiOperatorController],
  providers: [AiOperatorService, AgentRunsService, OperatorActionsService, MetricsService],
})
export class AiOperatorModule {}
