import { INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from './common/http';
import { sentryRequestUser } from './monitoring/request-user';
import { SHORT_DOMAIN_ROUTES } from './short-link/short-link.controller';

/** 실행(main.ts)과 통합 테스트가 같은 HTTP 설정을 쓰도록 한곳에 둡니다. */
export function configureApp(app: INestApplication): void {
  // Sentry 요청 user의 IP(방문 기록과 같은 clientIp 기준). 본문 파서 오류까지 덮도록 Nest가 붙이는 미들웨어보다 먼저 둡니다.
  app.use(sentryRequestUser);
  // 단축 도메인(`GET /{slug}`, `GET /c/{linkPublicId}`)만 `/api` 밖에서 처리합니다.
  app.setGlobalPrefix('api', { exclude: SHORT_DOMAIN_ROUTES });
  app.useGlobalFilters(new ApiExceptionFilter());
}
