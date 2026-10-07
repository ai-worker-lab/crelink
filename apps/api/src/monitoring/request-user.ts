import type { NextFunction, Request, Response } from 'express';
import { parseTrustedProxyHops } from '../config.service';
import { clientIp } from '../short-link/tracking.service';
import { setRequestUser } from './sentry';

/**
 * 요청마다 Sentry 요청 격리 스코프의 `user.ip_address`를 방문·클릭 기록과 같은 기준(`clientIp`, `TRUSTED_PROXY_HOPS`)의 IP로 정합니다.
 * SDK의 헤더 기반 IP 추론은 끄므로(`sentryOptions`의 `userInfo: false`) 위조한 `X-Forwarded-For` 첫 값이 이벤트에 들어가지 않습니다.
 * Sentry가 꺼져 있으면(`SENTRY_DSN` 없음) 아무것도 보내지 않습니다. `configureApp`이 다른 미들웨어보다 먼저 붙입니다.
 */
export function sentryRequestUser(request: Request, _response: Response, next: NextFunction): void {
  setRequestUser(
    clientIp(
      request.socket.remoteAddress,
      request.headers['x-forwarded-for'],
      parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS),
    ),
  );
  next();
}
