import { INestApplication } from '@nestjs/common';

/** 실행(main.ts)과 통합 테스트가 같은 HTTP 설정을 쓰도록 한곳에 둡니다. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
}
