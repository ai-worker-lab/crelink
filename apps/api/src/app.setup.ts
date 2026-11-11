import { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApiExceptionFilter } from './common/http';
import { instagramWebhookRawBody } from './instagram/raw-body';
import { sentryRequestUser } from './monitoring/request-user';
import { SHORT_DOMAIN_ROUTES } from './short-link/short-link.controller';

/** 실행(main.ts)과 통합 테스트가 같은 HTTP 설정을 쓰도록 한곳에 둡니다. */
export function configureApp(app: INestApplication): void {
  // Sentry 요청 user의 IP(방문 기록과 같은 clientIp 기준). 본문 파서 오류까지 덮도록 Nest가 붙이는 미들웨어보다 먼저 둡니다.
  app.use(sentryRequestUser);
  // Instagram 웹훅 POST만 서명 검증용 원문을 보관합니다. Nest의 본문 파서보다 먼저 스트림을 읽어야 합니다.
  app.use(instagramWebhookRawBody);
  // 터널(HTTPS)로 들어온 Instagram OAuth 콜백을 로컬 웹(HTTP)으로 릴레이합니다.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/me/integrations/instagram/callback') {
      const target = `${process.env.WEB_URL || 'http://localhost:6393'}${req.originalUrl}`;
      return res.redirect(302, target);
    }
    next();
  });
  // 단축 도메인(`GET /{slug}`, `GET /c/…`, `GET /a/…/…`, `GET /b/…`, `SHORT_DOMAIN_ROUTES`)만 `/api` 밖에서 처리합니다.
  app.setGlobalPrefix('api', { exclude: SHORT_DOMAIN_ROUTES });
  app.useGlobalFilters(new ApiExceptionFilter());
}
