import { CanActivate, createParamDecorator, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { SessionUser, UserRole } from '@crelink/shared';
import { apiError } from '../common/http';
import type { AuthenticatedRequest } from './actor';
import { ActorPolicy } from './actor-policy';
import { AuthService } from './auth.service';

/**
 * 로그인(`cl_session` 쿠키 또는 AI `Authorization: Bearer` 토큰)이 유효해야 통과합니다. 없거나 만료·정지·잘못된 토큰이면 401 `unauthenticated`.
 * 인증 뒤 운영자 확인(OperatorGuard) → 행위자 규칙(`ActorPolicy`: 사람·AI 전용, 멈춤, 실행 헤더) 순서로 검사합니다.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly policy: ActorPolicy,
  ) {}

  /** 인증 직후·행위자 규칙 전에 확인할 역할(아니면 403 `forbidden`). null이면 묻지 않습니다. */
  protected readonly requiredRole: UserRole | null = null;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = await this.auth.authenticateRequest(request);
    if (!actor) throw apiError(HttpStatus.UNAUTHORIZED, 'unauthenticated', '로그인이 필요합니다.');
    if (this.requiredRole && request.sessionUser?.role !== this.requiredRole) {
      throw apiError(HttpStatus.FORBIDDEN, 'forbidden', '운영자만 사용할 수 있습니다.');
    }
    await this.policy.check(context, request, actor);
    return true;
  }
}

/** 로그인(401)과 `role='operator'`(403 `forbidden`)를 확인합니다. AI 계정은 `role='operator'`입니다. */
@Injectable()
export class OperatorGuard extends SessionGuard {
  protected readonly requiredRole: UserRole = 'operator';
}

/**
 * 로그인 선택. `cl_session`이 유효하면 그 사용자를 보는 사람으로 두고, 쿠키가 없거나 만료·정지면 비회원으로 통과합니다(401 아님).
 * 다만 `Authorization: Bearer`가 잘못됐으면 비회원으로 두지 않고 401입니다. 보는 사람은 `ViewerUser`로 읽습니다.
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly policy: ActorPolicy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = await this.auth.authenticateRequest(request);
    if (actor) await this.policy.check(context, request, actor);
    return true;
  }
}

/** 가드가 확인한 로그인 사용자. SessionGuard·OperatorGuard 뒤에서만 씁니다. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): SessionUser => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().sessionUser;
  if (!user) throw new Error('CurrentUser는 SessionGuard 뒤에서만 쓸 수 있습니다.');
  return user;
});

/** `OptionalSessionGuard` 뒤의 보는 사람. 비회원이면 null입니다. */
export const ViewerUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser | null =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().sessionUser ?? null,
);
