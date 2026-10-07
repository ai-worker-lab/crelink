import { CanActivate, createParamDecorator, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { COOKIE_NAMES, SessionUser } from '@crelink/shared';
import type { Request } from 'express';
import { apiError, readCookie } from '../common/http';
import { setUserId } from '../monitoring/sentry';
import { AuthService } from './auth.service';

type SessionRequest = Request & { sessionUser?: SessionUser };

/** `cl_session` 쿠키의 세션이 유효해야 통과합니다. 없거나 만료·정지면 401 `unauthenticated`. 통과하면 Sentry 요청 user에 내부 ID를 넣습니다. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const token = readCookie(request, COOKIE_NAMES.session);
    const user = token ? await this.auth.sessionUser(token) : null;
    if (!user) throw apiError(HttpStatus.UNAUTHORIZED, 'unauthenticated', '로그인이 필요합니다.');
    request.sessionUser = user;
    setUserId(user.id);
    return true;
  }
}

/** 로그인(401)과 `role='operator'`(403 `forbidden`)를 확인합니다. */
@Injectable()
export class OperatorGuard extends SessionGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    if (context.switchToHttp().getRequest<SessionRequest>().sessionUser?.role !== 'operator') {
      throw apiError(HttpStatus.FORBIDDEN, 'forbidden', '운영자만 사용할 수 있습니다.');
    }
    return true;
  }
}

/** 가드가 확인한 로그인 사용자. SessionGuard·OperatorGuard 뒤에서만 씁니다. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): SessionUser => {
  const user = context.switchToHttp().getRequest<SessionRequest>().sessionUser;
  if (!user) throw new Error('CurrentUser는 SessionGuard 뒤에서만 쓸 수 있습니다.');
  return user;
});
