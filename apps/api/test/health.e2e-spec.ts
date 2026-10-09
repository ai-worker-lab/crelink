import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { createTestDatabase, TestDatabase } from './test-database';
import { setTestEnvironment, WEB_URL } from './test-app';

/** Express 5 라우터 스택의 라우트 항목(시험에 필요한 필드만). */
type RouterLayer = { route?: { path: string; methods: Record<string, boolean> } };

describe('API 기동과 health', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    setTestEnvironment(database.url);
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

  it('prefix 없는 /health는 health가 아니라 단축 도메인이 처리한다(예약어라 없는 주소 안내)', async () => {
    const response = await fetch(`${baseUrl}/health`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${WEB_URL}/notice?reason=link_not_found`);
  });

  it('없는 /api 경로는 404와 ApiError를 반환한다', async () => {
    const response = await fetch(`${baseUrl}/api/nope`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: 'not_found', message: '요청한 경로를 찾을 수 없습니다.' });
  });

  it('등록된 라우트는 단축 도메인 두 정의만 /api 밖이고 나머지는 모두 /api 아래다', () => {
    // setGlobalPrefix exclude(`\:slug`·`c/\:linkPublicId`)의 매칭 규칙이 프레임워크 업그레이드로 바뀌면 여기서 드러납니다.
    const express = app.getHttpAdapter().getInstance() as Express;
    const routes = (express.router.stack as RouterLayer[])
      .filter((layer) => layer.route)
      .flatMap(({ route }) => Object.keys(route!.methods).map((method) => `${method.toUpperCase()} ${route!.path}`));
    expect(routes.filter((route) => !route.split(' ')[1].startsWith('/api/')).sort()).toEqual([
      'GET /:slug',
      'GET /c/:linkPublicId',
    ]);
    expect(routes).toEqual(expect.arrayContaining(['GET /api/health', 'GET /api/me', 'POST /api/me/files']));
    expect(routes.length).toBeGreaterThan(20);
  });

  it('기동 시 빈 데이터베이스에 migration을 적용해 크리링 테이블을 만든다', async () => {
    const client = new Client({ connectionString: database.url });
    await client.connect();
    try {
      const tables = await client.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      );
      expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
        'ad_banner_daily_stats',
        'ad_banners',
        'blocked_domains',
        'creator_banner_click_rollups',
        'creator_banner_clicks',
        'creator_banners',
        'files',
        'guestbook_entries',
        'landing_blocks',
        'landings',
        'link_click_rollups',
        'link_clicks',
        'links',
        'portfolio_items',
        'schema_migrations',
        'sessions',
        'short_links',
        'short_slugs',
        'social_links',
        'user_identities',
        'users',
        'visit_daily_rollups',
        'visit_dimension_rollups',
        'visits',
      ]);
      const applied = await client.query('SELECT version FROM schema_migrations ORDER BY version');
      expect(applied.rows).toEqual([
        { version: '0001_crelink_mvp' },
        { version: '0002_guestbook' },
        { version: '0003_ad_banner' },
      ]);
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
    setTestEnvironment(database.url);
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
