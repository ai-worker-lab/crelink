import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseError, Pool, PoolClient, PoolConfig, QueryResultRow } from 'pg';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDatabasePoolMax } from './config.service';
import { loadLocalEnvironment } from './local-env';

/** 트랜잭션 client와 pool 모두 받는 질의 대상. */
export type Queryable = Pick<PoolClient, 'query'>;

/** PostgreSQL UNIQUE 제약 위반(23505). 동시 요청이 같은 값을 만들 때 오류 코드로 바꾸는 데 씁니다. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === '23505';
}

/** pg가 연결 문자열에서 읽는 TLS 파라미터. `DATABASE_SSL`이 있으면 이 값들은 지우고 환경변수만 따릅니다. */
const URL_SSL_PARAMS = ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'];

/**
 * `DATABASE_URL`·`DATABASE_SSL`·`DATABASE_SSL_CA_PATH`를 pg Pool의 연결 설정으로 바꿉니다. 값이 틀리면 오류(기동 거부)입니다.
 * pg는 연결 문자열을 파싱한 결과로 `ssl` 옵션을 덮어쓰므로(pg-connection-string의 `sslmode` 처리), `DATABASE_SSL`이 있으면
 * URL의 TLS 파라미터를 지워 두 설정이 섞이지 않게 합니다. `DATABASE_SSL`이 비면 URL을 그대로 넘깁니다(TLS 파라미터가 없으면 평문).
 * 키 설명: apps/api/docs/README.md#db-tls
 */
export function databaseConnectionConfig(
  env: NodeJS.ProcessEnv,
  readCa: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): Pick<PoolConfig, 'connectionString' | 'ssl'> {
  const mode = env.DATABASE_SSL?.trim();
  const caPath = env.DATABASE_SSL_CA_PATH?.trim();
  if (caPath && mode !== 'verify-full') {
    throw new Error('DATABASE_SSL_CA_PATH는 DATABASE_SSL=verify-full일 때만 씁니다.');
  }
  if (!mode) return { connectionString: env.DATABASE_URL };
  if (mode !== 'disable' && mode !== 'require' && mode !== 'verify-full') {
    throw new Error('DATABASE_SSL은 disable, require, verify-full 중 하나여야 합니다.');
  }
  let connectionString = env.DATABASE_URL;
  if (connectionString?.includes('?')) {
    // 비밀번호가 들어 있으므로 오류 메시지에 URL 값을 넣지 않습니다.
    if (!URL.canParse(connectionString)) throw new Error('DATABASE_URL을 URL로 해석할 수 없습니다.');
    const url = new URL(connectionString);
    if (URL_SSL_PARAMS.some((name) => url.searchParams.has(name))) {
      for (const name of URL_SSL_PARAMS) url.searchParams.delete(name);
      connectionString = url.toString();
    }
  }
  if (mode === 'disable') return { connectionString, ssl: false };
  // require: 암호화만 하고 서버 인증서는 확인하지 않습니다(libpq sslmode=require와 같음).
  if (mode === 'require') return { connectionString, ssl: { rejectUnauthorized: false } };
  // verify-full: CA 체인과 호스트 이름을 모두 확인합니다. CA 파일을 주지 않으면 Node 기본 신뢰 저장소를 씁니다.
  if (!caPath) return { connectionString, ssl: { rejectUnauthorized: true } };
  let ca: string;
  try {
    ca = readCa(caPath);
  } catch (error) {
    throw new Error(
      `DATABASE_SSL_CA_PATH(${caPath})를 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error(`DATABASE_SSL_CA_PATH(${caPath})가 PEM 인증서가 아닙니다.`);
  }
  return { connectionString, ssl: { rejectUnauthorized: true, ca } };
}

/**
 * `directory`의 `.sql` 파일을 이름 순으로 한 번씩 적용합니다. 디렉터리가 없으면 아무것도 적용하지 않습니다.
 * 세션 advisory lock을 한 연결에서 잡고 푸므로 직접 연결이나 Supavisor 세션 모드(5432)에서만 안전합니다. 트랜잭션 풀러(6543)는
 * 트랜잭션마다 서버 연결이 바뀌어 잠금이 유지되지 않습니다. 근거: apps/api/docs/README.md#db-tls
 */
export async function runMigrations(pool: Pool, directory: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(931475210)');
    try {
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const migrations = existsSync(directory)
        ? readdirSync(directory)
            .filter((name) => name.endsWith('.sql'))
            .sort()
        : [];
      for (const name of migrations) {
        const version = name.replace(/\.sql$/, '');
        await client.query('BEGIN');
        try {
          const done = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version]);
          if (!done.rowCount) {
            await client.query(readFileSync(resolve(directory, name), 'utf8'));
            await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(931475210)');
    }
  } finally {
    client.release();
  }
}

@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Database.name);
  pool!: Pool;
  async onModuleInit() {
    loadLocalEnvironment();
    this.pool = new Pool({
      ...databaseConnectionConfig(process.env),
      // 무중단 전환 중 구·신 API가 함께 돌면 연결이 2배가 됩니다. 운영값 산정: apps/api/docs/README.md#db-연결-수
      max: parseDatabasePoolMax(process.env.DATABASE_POOL_MAX),
      application_name: 'crelink-api',
      // DB가 응답하지 않을 때 요청(readiness 포함)이 무한히 기다리지 않게 합니다.
      connectionTimeoutMillis: 5000,
    });
    // DB가 idle 연결을 끊으면 pool이 error를 냅니다. 처리하지 않으면 프로세스가 종료됩니다.
    this.pool.on('error', (error) => this.logger.error(`idle PostgreSQL 연결 오류: ${error.message}`));
    await this.pool.query('SELECT 1');
    await runMigrations(this.pool, resolve(__dirname, '../migrations'));
  }
  /** 종료 때(src/shutdown.ts가 HTTP 요청을 모두 마친 뒤) 빌려 간 연결이 돌아오길 기다려 pool을 닫습니다. */
  async onModuleDestroy() {
    // app.close()가 두 번 불려도(테스트 정리 등) pool.end를 다시 부르지 않습니다(pg는 두 번째 end를 오류로 냄).
    if (!this.pool || this.pool.ending) return;
    await this.pool.end();
    this.logger.log('PostgreSQL pool을 닫았습니다.');
  }
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
    return this.pool.query<T>(sql, values);
  }
  async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await run(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
