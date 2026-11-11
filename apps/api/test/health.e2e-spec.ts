import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { resolve } from 'node:path';
import { Client, Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { INSTAGRAM_REQUIRED_KEYS } from '../src/config.service';
import { Database, runMigrations } from '../src/database';
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

  it('등록된 라우트는 단축 도메인 다섯 정의만 /api 밖이고 나머지는 모두 /api 아래다', () => {
    // setGlobalPrefix exclude(`SHORT_DOMAIN_ROUTES`)의 매칭 규칙이 프레임워크 업그레이드로 바뀌거나 새 exclude가
    // `/api/*` 두 단계 경로의 접두사를 빼면 여기서 드러납니다.
    const express = app.getHttpAdapter().getInstance() as Express;
    const routes = (express.router.stack as RouterLayer[])
      .filter((layer) => layer.route)
      .flatMap(({ route }) => Object.keys(route!.methods).map((method) => `${method.toUpperCase()} ${route!.path}`));
    // Nest 12.2+가 제외 경로마다 모든 메서드로 등록하는 404 전용 핸들러(`\:` 정의라 글자 그대로의 `:` 주소만 받음)는 라우트 비교에서 뺍니다.
    const outsideApi = routes.filter((route) => !route.split(' ')[1].startsWith('/api/') && !route.includes('\\:'));
    expect(outsideApi.sort()).toEqual([
      'GET /:slug',
      'GET /a/:bannerPublicId/:landingPublicId',
      'GET /b/:bannerPublicId',
      'GET /c/:linkPublicId',
      'GET /s/:code',
    ]);
    expect(routes).toEqual(
      expect.arrayContaining(['GET /api/health', 'GET /api/health/ready', 'GET /api/me', 'POST /api/me/files']),
    );
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
        'agent_runs',
        'ai_operator_settings',
        'api_tokens',
        'blocked_domains',
        'channel_link_codes',
        'channel_links',
        'creator_banner_click_rollups',
        'creator_banner_clicks',
        'creator_banners',
        'files',
        'guestbook_entries',
        'instagram_connections',
        'instagram_deletion_requests',
        'instagram_dm_deliveries',
        'instagram_dm_opt_outs',
        'instagram_dm_rules',
        'instagram_opt_out_owners',
        'landing_blocks',
        'landing_event_daily_rollups',
        'landing_event_dimension_rollups',
        'landing_event_limits',
        'landing_events',
        'landings',
        'link_click_rollups',
        'link_clicks',
        'links',
        'operator_actions',
        'page_invites',
        'page_members',
        'platform_settings',
        'portfolio_items',
        'schema_migrations',
        'sessions',
        'short_links',
        'short_slugs',
        'signup_funnel_daily',
        'signup_funnel_oauth_contexts',
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
        { version: '0004_ai_operator' },
        { version: '0005_slot_event' },
        { version: '0006_agent_run_agent' },
        { version: '0007_ad_block_toggle' },
        { version: '0008_drop_retired_link_slot_data' },
        { version: '0009_landing_telemetry' },
        { version: '0010_analytics_rollups' },
        { version: '0011_link_layout' },
        { version: '0012_list_density' },
        { version: '0013_signup_funnel' },
        { version: '0014_shared_pages' },
        { version: '0015_channel_links' },
        { version: '0016_instagram_dm' },
        { version: '0017_instagram_public_reply' },
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
    // 대여 중인 연결도 유지해 pool의 idle 오류 처리만으로는 막지 못하는 강제 종료를 검사합니다.
    const client = await app.get(Database).pool.connect();
    try {
      await database.drop({ force: true });

      const ready = await fetch(`${baseUrl}/api/health/ready`);
      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({
        code: 'database_unavailable',
        message: '데이터베이스에 연결할 수 없습니다.',
      });

      const live = await fetch(`${baseUrl}/api/health`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: 'ok' });
    } finally {
      client.release(true);
    }
  });
});

describe('Instagram DM 부분 설정', () => {
  it('키가 일부만 있으면 실제 기동이 거부되고 비밀값은 오류에 없다', async () => {
    const database = await createTestDatabase();
    setTestEnvironment(database.url);
    for (const key of INSTAGRAM_REQUIRED_KEYS) process.env[key] = '';
    process.env.META_APP_ID = 'app-id';
    process.env.META_APP_SECRET = 'partial-secret-value';
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    try {
      configureApp(app);
      const failure = await app.init().then(
        () => null,
        (error: Error) => error,
      );
      expect(failure?.message).toContain('INSTAGRAM_OPT_OUT_KEY');
      expect(failure?.message).toContain('Instagram DM 설정은 전부 있거나 전부 없어야 합니다.');
      expect(failure?.message).not.toContain('partial-secret-value');
    } finally {
      for (const key of INSTAGRAM_REQUIRED_KEYS) delete process.env[key];
      await app.close().catch(() => undefined);
      await database.drop({ force: true });
    }
  });
});

describe('0016_instagram_dm 제약', () => {
  let database: TestDatabase;
  let pool: Pool;
  let seq = 0;

  const check = (constraint: string) => ({ code: '23514', constraint });
  const hash = (fill: number, length = 32) => Buffer.alloc(length, fill);

  const insert = (table: string, row: Record<string, unknown>) => {
    const keys = Object.keys(row);
    return pool.query(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
      Object.values(row),
    );
  };
  const insertUser = async () => {
    seq += 1;
    return (await insert('users', { email: `ig${seq}@example.com` })).rows[0].id as string;
  };
  const insertConnection = (userId: string, patch: Record<string, unknown> = {}) => {
    seq += 1;
    return insert('instagram_connections', {
      user_id: userId,
      ig_user_id: `1784${seq}`,
      ig_username: 'creator',
      status: 'active',
      token_ciphertext: hash(9, 40),
      token_key_version: 1,
      ...patch,
    });
  };
  const connectionId = async (patch: Record<string, unknown> = {}) =>
    (await insertConnection(await insertUser(), patch)).rows[0].id as string;
  const insertRule = (connection: string, patch: Record<string, unknown> = {}) => {
    seq += 1;
    return insert('instagram_dm_rules', {
      public_id: `rule${String(seq).padStart(6, '0')}`,
      connection_id: connection,
      ig_media_id: `media${seq}`,
      media_permalink: 'https://www.instagram.com/p/x/',
      keyword: '링크',
      message: '여기 있어요',
      channel_link_code: 'dmcode01',
      ...patch,
    });
  };
  const ruleId = async (connection: string) => (await insertRule(connection)).rows[0].id as string;
  const insertDelivery = (connection: string, rule: string, patch: Record<string, unknown> = {}) => {
    seq += 1;
    return insert('instagram_dm_deliveries', {
      connection_id: connection,
      rule_id: rule,
      rule_version: 1,
      comment_id: `comment${seq}`,
      commenter_hash: hash(1),
      commented_at: new Date(),
      message_body: '본문',
      status: 'pending',
      ...patch,
    });
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    pool = new Pool({ connectionString: database.url });
    await runMigrations(pool, resolve(__dirname, '../migrations'));
    await pool.query("INSERT INTO channel_link_codes (code) VALUES ('dmcode01')");
  });

  afterAll(async () => {
    await pool?.end();
    await database?.drop();
  });

  it('플랫폼 스위치는 기본 off이고 세 값만 받으며 lock_timeout은 파일 안에서만 쓴다', async () => {
    expect((await pool.query('SELECT instagram_dm_audience FROM platform_settings')).rows).toEqual([
      { instagram_dm_audience: 'off' },
    ]);
    await expect(pool.query("UPDATE platform_settings SET instagram_dm_audience = 'all'")).rejects.toMatchObject(
      check('platform_settings_instagram_dm_audience_check'),
    );
    await pool.query("UPDATE platform_settings SET instagram_dm_audience = 'operators'");
    await pool.query("UPDATE platform_settings SET instagram_dm_audience = 'off'");
    expect((await pool.query('SHOW lock_timeout')).rows[0].lock_timeout).toBe('0');
  });

  it('연결: 상태 값과 reauth_required ⇔ 토큰 NULL을 지킨다', async () => {
    const user = await insertUser();
    await expect(insertConnection(user, { status: 'paused' })).rejects.toMatchObject(
      check('instagram_connections_status_check'),
    );
    await expect(insertConnection(user, { status: 'reauth_required' })).rejects.toMatchObject(
      check('instagram_connections_check'),
    );
    await expect(insertConnection(user, { token_ciphertext: null })).rejects.toMatchObject(
      check('instagram_connections_check'),
    );
    await expect(
      insertConnection(user, { status: 'messages_access_required', token_ciphertext: null }),
    ).rejects.toMatchObject(check('instagram_connections_check'));
    const row = await insertConnection(user, { status: 'reauth_required', token_ciphertext: null });
    expect(row.rows[0]).toMatchObject({ token_revision: 1, rate_window_count: 0, dm_paused_at: null });
  });

  it('연결: 사용자당 1개, 같은 IG 계정의 살아 있는 연결은 1개이고 reauth_required는 겹쳐도 된다', async () => {
    const user = await insertUser();
    await insertConnection(user, { ig_user_id: 'ig-live' });
    await expect(insertConnection(user, { ig_user_id: 'ig-other' })).rejects.toMatchObject({
      code: '23505',
      constraint: 'instagram_connections_user_id_key',
    });
    await expect(insertConnection(await insertUser(), { ig_user_id: 'ig-live' })).rejects.toMatchObject({
      code: '23505',
      constraint: 'instagram_connections_ig_live',
    });
    await insertConnection(await insertUser(), {
      ig_user_id: 'ig-live',
      status: 'reauth_required',
      token_ciphertext: null,
    });
  });

  it('발송 행의 rule_version은 필수이고 수신 거부 대응표는 IG 계정당 한 행이다', async () => {
    const connection = await connectionId();
    const rule = await ruleId(connection);
    await expect(insertDelivery(connection, rule, { rule_version: null })).rejects.toMatchObject({
      code: '23502',
      column: 'rule_version',
    });
    await insert('instagram_opt_out_owners', { ig_user_id: 'ig-owner', meta_user_id: 'meta-a' });
    await expect(
      insert('instagram_opt_out_owners', { ig_user_id: 'ig-owner', meta_user_id: 'meta-b' }),
    ).rejects.toMatchObject({ code: '23505', constraint: 'instagram_opt_out_owners_pkey' });
    await expect(insert('instagram_opt_out_owners', { ig_user_id: 'ig-x', meta_user_id: null })).rejects.toMatchObject({
      code: '23502',
      column: 'meta_user_id',
    });
  });

  it('규칙: public_id 형식, 키워드 1~30자, 문구 1~250자, 코드 FK, 게시물당 활성 규칙 1개', async () => {
    const connection = await connectionId();
    await expect(insertRule(connection, { public_id: 'ABCDEFGHIJ' })).rejects.toMatchObject(
      check('instagram_dm_rules_public_id_check'),
    );
    await expect(insertRule(connection, { keyword: '' })).rejects.toMatchObject(
      check('instagram_dm_rules_keyword_check'),
    );
    await expect(insertRule(connection, { keyword: '가'.repeat(31) })).rejects.toMatchObject(
      check('instagram_dm_rules_keyword_check'),
    );
    await expect(insertRule(connection, { message: '가'.repeat(251) })).rejects.toMatchObject(
      check('instagram_dm_rules_message_check'),
    );
    await expect(insertRule(connection, { channel_link_code: 'missing1' })).rejects.toMatchObject({
      code: '23503',
      constraint: 'instagram_dm_rules_channel_link_code_fkey',
    });
    await insertRule(connection, { keyword: '가'.repeat(30), message: '가'.repeat(250), ig_media_id: 'media-a' });
    await expect(insertRule(connection, { ig_media_id: 'media-a' })).rejects.toMatchObject({
      code: '23505',
      constraint: 'instagram_dm_rules_one_per_media',
    });
    await pool.query('UPDATE instagram_dm_rules SET archived_at = now() WHERE connection_id = $1', [connection]);
    await insertRule(connection, { ig_media_id: 'media-a' });
  });

  it('발송: 복합 FK가 다른 연결의 규칙을 거부한다', async () => {
    const owner = await connectionId();
    const other = await connectionId();
    const rule = await ruleId(owner);
    await expect(insertDelivery(other, rule)).rejects.toMatchObject({
      code: '23503',
      constraint: 'instagram_dm_deliveries_rule_id_connection_id_fkey',
    });
    await insertDelivery(owner, rule);
  });

  it('발송: 해시 길이·상태 값, 댓글 중복, 사람별 1건(실패·취소·만료는 다시 받을 수 있음)', async () => {
    const connection = await connectionId();
    const rule = await ruleId(connection);
    await expect(insertDelivery(connection, rule, { commenter_hash: hash(2, 31) })).rejects.toMatchObject(
      check('instagram_dm_deliveries_commenter_hash_check'),
    );
    await expect(insertDelivery(connection, rule, { status: 'queued' })).rejects.toMatchObject(
      check('instagram_dm_deliveries_status_check'),
    );
    const first = await insertDelivery(connection, rule, { commenter_hash: hash(3), comment_id: 'same-comment' });
    await expect(
      insertDelivery(connection, rule, { commenter_hash: hash(4), comment_id: 'same-comment' }),
    ).rejects.toMatchObject({ code: '23505', constraint: 'instagram_dm_deliveries_connection_id_comment_id_key' });
    await expect(insertDelivery(connection, rule, { commenter_hash: hash(3) })).rejects.toMatchObject({
      code: '23505',
      constraint: 'instagram_dm_deliveries_one_per_person',
    });
    for (const status of ['failed', 'expired', 'cancelled']) {
      await pool.query('UPDATE instagram_dm_deliveries SET status = $1 WHERE id = $2', [status, first.rows[0].id]);
      const again = await insertDelivery(connection, rule, { commenter_hash: hash(3) });
      await pool.query('DELETE FROM instagram_dm_deliveries WHERE id = $1', [again.rows[0].id]);
    }
  });

  it('수신 거부와 삭제 요청 형식을 지키고, 연결을 지워도 수신 거부는 남고 규칙·발송은 함께 지워진다', async () => {
    await expect(
      insert('instagram_dm_opt_outs', { ig_user_id: 'ig-x', commenter_hash: hash(5, 33) }),
    ).rejects.toMatchObject(check('instagram_dm_opt_outs_commenter_hash_check'));
    await insert('instagram_dm_opt_outs', { ig_user_id: 'ig-x', commenter_hash: hash(5) });
    await expect(
      insert('instagram_dm_opt_outs', { ig_user_id: 'ig-x', commenter_hash: hash(5) }),
    ).rejects.toMatchObject({ code: '23505', constraint: 'instagram_dm_opt_outs_pkey' });
    await expect(insert('instagram_deletion_requests', { confirmation_code: 'SHORT' })).rejects.toMatchObject(
      check('instagram_deletion_requests_confirmation_code_check'),
    );
    await insert('instagram_deletion_requests', { confirmation_code: 'abcd1234abcd1234' });

    const user = await insertUser();
    const connection = (await insertConnection(user, { ig_user_id: 'ig-x' })).rows[0].id as string;
    const rule = await ruleId(connection);
    await insertDelivery(connection, rule);
    await pool.query('DELETE FROM users WHERE id = $1', [user]);
    for (const [table, column] of [
      ['instagram_connections', 'id'],
      ['instagram_dm_rules', 'connection_id'],
      ['instagram_dm_deliveries', 'connection_id'],
    ]) {
      expect((await pool.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [connection])).rowCount).toBe(0);
    }
    expect((await pool.query("SELECT 1 FROM instagram_dm_opt_outs WHERE ig_user_id = 'ig-x'")).rowCount).toBe(1);
  });
});
