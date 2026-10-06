import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { createTestDatabase, TestDatabase } from './test-database';

describe('API 기동과 health', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    process.env.DATABASE_URL = database.url;
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await database?.drop();
  });

  it('GET /api/health는 200과 { status: "ok" }를 반환한다', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('prefix 없는 /health는 존재하지 않는다', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(404);
  });

  it('기동 시 빈 데이터베이스에 migration 기록 테이블을 만든다', async () => {
    const client = new Client({ connectionString: database.url });
    await client.connect();
    try {
      const result = await client.query("SELECT to_regclass('public.schema_migrations') AS table_name");
      expect(result.rows[0].table_name).toBe('schema_migrations');
    } finally {
      await client.end();
    }
  });
});

describe('readiness', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    process.env.DATABASE_URL = database.url;
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await database?.drop();
  });

  it('DB에 질의할 수 있으면 GET /api/health/ready는 200과 { status: "ready" }를 반환한다', async () => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
  });

  it('실행 중 DB가 사라지면 readiness는 503과 ApiError를 반환하고 liveness는 200을 유지한다', async () => {
    // 데이터베이스를 강제로 지워 API의 기존 연결을 끊고 새 연결도 실패하게 만듭니다.
    await database.drop();

    const ready = await fetch(`${baseUrl}/api/health/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ code: 'database_unavailable', message: '데이터베이스에 연결할 수 없습니다.' });

    const live = await fetch(`${baseUrl}/api/health`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'ok' });
  });
});
