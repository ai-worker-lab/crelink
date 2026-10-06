import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ApiError, GoogleAuthCallbackResponse } from '@crelink/shared';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { GoogleOAuth } from '../src/auth/google-oauth';
import { GeoIpService } from '../src/short-link/tracking.service';
import { createTestDatabase, TestDatabase } from './test-database';

export const WEB_URL = 'http://web.test';
export const SHORT_URL = 'http://short.test';

/** 앱이 기동에 요구하는 주소 설정. 실제 값은 쓰지 않고 테스트 전용 값을 넣습니다. */
export function setTestEnvironment(databaseUrl: string): void {
  process.env.DATABASE_URL = databaseUrl;
  process.env.WEB_URL = WEB_URL;
  process.env.SHORT_LINK_BASE_URL = SHORT_URL;
  process.env.GEOIP_MMDB_PATH = '';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.OPERATOR_EMAILS = 'operator@example.com';
}

/**
 * 구글 대신 code를 `subject|email[|unverified]`로 해석합니다. code가 `bad`면 교환 실패입니다.
 * 실제 구현(GoogleAuthLibraryOAuth)은 이 경계 뒤에서 google-auth-library로 code 교환과 ID 토큰 검증을 합니다.
 */
export const fakeGoogle: GoogleOAuth = {
  authorizationUrl: (config, state) =>
    `https://accounts.google.test/o/oauth2/auth?state=${state}&redirect_uri=${encodeURIComponent(config.redirectUri)}`,
  verifyCode: async (_config, code) => {
    if (code === 'bad') throw new Error('invalid_grant');
    const [subject, email, verified] = code.split('|');
    return { subject, email, emailVerified: verified !== 'unverified' };
  },
};

export interface TestApp {
  app: INestApplication;
  baseUrl: string;
  pool: Pool;
  database: TestDatabase;
  close(): Promise<void>;
}

/**
 * 일회용 DB에 앱을 띄웁니다. 구글과 GeoIP 조회만 테스트용으로 바꿉니다(국가 KR, 도시 Seoul).
 * 업로드는 기본으로 임시 디렉터리(`FILE_STORAGE=disk`)이고, `env`로 저장소 설정(예: `startTestS3().env`)을 덮어씁니다.
 */
export async function createTestApp(options: { env?: Record<string, string> } = {}): Promise<TestApp> {
  const database = await createTestDatabase();
  setTestEnvironment(database.url);
  const uploadDir = mkdtempSync(join(tmpdir(), 'crelink-uploads-'));
  process.env.FILE_STORAGE = 'disk';
  process.env.UPLOAD_DIR = uploadDir;
  Object.assign(process.env, options.env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GoogleOAuth)
    .useValue(fakeGoogle)
    .overrideProvider(GeoIpService)
    .useValue({ lookup: (ip: string | null) => ({ country: ip ? 'KR' : null, city: ip ? 'Seoul' : null }) })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const pool = new Pool({ connectionString: database.url });
  return {
    app,
    baseUrl,
    pool,
    database,
    async close() {
      await app.close();
      await pool.end();
      await database.drop();
      rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

export interface LoginResult {
  status: number;
  /** 성공이면 `{ user }`, 실패면 `{ code, message }`. */
  body: Partial<GoogleAuthCallbackResponse & ApiError>;
  /** `cl_session=…` (요청 Cookie 헤더에 그대로 씀). 실패하면 null. */
  cookie: string | null;
  setCookies: string[];
}

/** 웹이 하는 것처럼 start로 state 쿠키를 받고 callback에 code·state·쿠키를 보냅니다. */
export async function login(baseUrl: string, code: string): Promise<LoginResult> {
  const start = await fetch(`${baseUrl}/api/auth/google/start`);
  const stateCookie = start.headers.getSetCookie()[0].split(';')[0];
  const state = decodeURIComponent(stateCookie.slice(stateCookie.indexOf('=') + 1));
  const response = await fetch(`${baseUrl}/api/auth/google/callback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: stateCookie },
    body: JSON.stringify({ code, state }),
  });
  const setCookies = response.headers.getSetCookie();
  const session = setCookies.find((cookie) => cookie.startsWith('cl_session=') && !cookie.includes('Max-Age=0'));
  return { status: response.status, body: await response.json(), cookie: session?.split(';')[0] ?? null, setCookies };
}

/** JSON 요청. body가 있으면 JSON으로 보냅니다. 응답 본문 타입 T는 호출하는 테스트가 기대하는 계약 타입입니다. */
export async function api<T = ApiError>(
  baseUrl: string,
  method: string,
  path: string,
  options: { cookie?: string | null; body?: unknown } = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

/** 비동기 기록(방문·클릭)이 DB에 들어올 때까지 기다립니다. */
export async function waitForRows<T>(read: () => Promise<T[]>, count = 1): Promise<T[]> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const rows = await read();
    if (rows.length >= count) return rows;
    await sleep(50);
  }
  throw new Error(`기록이 ${count}건 생기지 않았습니다.`);
}
