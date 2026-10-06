import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { assertProductionConfig } from './config.service';
import { loadLocalEnvironment } from './database';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { enableGracefulShutdown } from './shutdown';

async function bootstrap() {
  loadLocalEnvironment();
  assertProductionConfig(process.env);
  const port = process.env.PORT;
  if (!port) {
    throw new Error(
      'PORT is required: 저장소 루트에서 pnpm instance로 apps/api/.env를 만들거나(make api-up은 자동) PORT 환경변수를 지정하세요. 이 checkout의 API 포트: pnpm instance --get API_PORT',
    );
  }
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // SIGTERM·SIGINT: 새 연결 거부 → 진행 중 요청 완료 → onModuleDestroy(pool 종료 등) → 종료 코드 0. 근거: src/shutdown.ts
  enableGracefulShutdown(app);
  await app.listen(Number(port), '0.0.0.0');
  console.log(`crelink API listening on http://localhost:${port}/api/health`);
}

void bootstrap();
