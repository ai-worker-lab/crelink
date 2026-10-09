import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AccountKind, SessionUser } from '@crelink/shared';
import type { Request } from 'express';

/**
 * 요청의 행위자. 쿠키 세션(사람)과 API 토큰(AI) 모두 `authenticateRequest`가 채웁니다.
 * `runId`는 AI의 상태 변경 요청에서 가드가 확인한 진행 중 실행 id이고, 그 밖(사람·조회·실행 헤더 예외 경로)은 null입니다.
 */
export interface RequestActor {
  userId: string;
  email: string;
  kind: AccountKind;
  runId: string | null;
}

/** 가드가 채우는 요청 필드. `sessionUser`는 기존 `CurrentUser`·`ViewerUser`가, `actor`는 `CurrentActor`가 읽습니다. */
export type AuthenticatedRequest = Request & { sessionUser?: SessionUser; actor?: RequestActor };

export const ACTOR_KINDS_KEY = 'crelink:actorKinds';
export const AGENT_RUN_EXEMPT_KEY = 'crelink:agentRunExempt';
export const ALLOW_WHILE_PAUSED_KEY = 'crelink:allowWhilePaused';

/** 이 경로를 쓸 수 있는 계정 종류. 아니면 403 `forbidden`(예: `@ActorKinds('human')` 멈춤 스위치·토큰 폐기·지표 제외). */
export const ActorKinds = (...kinds: AccountKind[]) => SetMetadata(ACTOR_KINDS_KEY, kinds);

/** AI의 상태 변경 요청이어도 실행 헤더(`X-Crelink-Agent-Run`)를 요구하지 않습니다(실행 시작·갱신). */
export const AgentRunExempt = () => SetMetadata(AGENT_RUN_EXEMPT_KEY, true);

/** 멈춤 중에도 AI의 상태 변경 요청을 받습니다(실행 시작·갱신). */
export const AllowWhilePaused = () => SetMetadata(ALLOW_WHILE_PAUSED_KEY, true);

/** 가드가 확인한 행위자. SessionGuard·OperatorGuard 뒤에서만 씁니다. */
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): RequestActor => {
  const actor = context.switchToHttp().getRequest<AuthenticatedRequest>().actor;
  if (!actor) throw new Error('CurrentActor는 SessionGuard 뒤에서만 쓸 수 있습니다.');
  return actor;
});
