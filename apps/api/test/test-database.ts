import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { loadLocalEnvironment } from '../src/local-env';

/**
 * 테스트마다 일회용 PostgreSQL 데이터베이스를 만들고 지웁니다. 개발 DB의 데이터는 건드리지 않습니다.
 * 관리 연결은 TEST_DATABASE_URL, 없으면 apps/api/.env의 DATABASE_URL을 씁니다. 그 사용자는 CREATEDB 권한이 필요합니다.
 */
export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

// 테스트가 앱을 띄우려고 process.env.DATABASE_URL을 일회용 DB로 바꾸므로, 관리 연결 주소는 처음 읽은 값을 유지합니다.
let adminUrlCache: string | undefined;

export async function createTestDatabase(): Promise<TestDatabase> {
  loadLocalEnvironment();
  adminUrlCache ??= process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const adminUrl = adminUrlCache;
  if (!adminUrl)
    throw new Error(
      'TEST_DATABASE_URL 또는 DATABASE_URL이 필요합니다. 로컬은 make infra-up 후 apps/api/.env를 준비하세요.',
    );
  const name = `crelink_test_${randomBytes(6).toString('hex')}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    async drop() {
      const cleanup = new Client({ connectionString: adminUrl });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
