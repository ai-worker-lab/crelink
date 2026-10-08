// Sentry 초기화가 다른 모든 모듈보다 먼저 실행돼야 합니다(SENTRY_DSN이 비면 아무것도 하지 않음). 근거: src/instrument.ts
import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { assertProductionConfig } from './config.service';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { SentryConsoleLogger } from './monitoring/sentry-logger';
import { enableGracefulShutdown } from './shutdown';

async function bootstrap() {
  // apps/api/.env는 src/instrument.ts가 이미 읽었습니다(loadLocalEnvironment).
  assertProductionConfig(process.env);
  const port = process.env.PORT;
  if (!port) {
    throw new Error(
      'PORT is required: 저장소 루트에서 pnpm instance로 apps/api/.env를 만들거나(make api-up은 자동) PORT 환경변수를 지정하세요. 이 checkout의 API 포트: pnpm instance --get API_PORT',
    );
  }
  // 콘솔 출력은 Nest 기본과 같고, log·warn·error·fatal을 Sentry Logs로도 보냅니다(SENTRY_DSN이 비면 보내지 않음). 근거: src/monitoring/sentry-logger.ts
  const app = await NestFactory.create(AppModule, { logger: new SentryConsoleLogger() });
  configureApp(app);
  // SIGTERM·SIGINT: 새 연결 거부 → 진행 중 요청 완료 → onModuleDestroy(pool 종료 등) → Sentry 남은 이벤트 전송 → 종료 코드 0. 근거: src/shutdown.ts
  enableGracefulShutdown(app);
  await app.listen(Number(port), '0.0.0.0');
  console.log(`crelink API listening on http://localhost:${port}/api/health`);
}

void bootstrap();
