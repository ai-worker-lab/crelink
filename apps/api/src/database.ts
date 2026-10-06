import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseError, Pool, PoolClient, QueryResultRow } from 'pg';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** 트랜잭션 client와 pool 모두 받는 질의 대상. */
export type Queryable = Pick<PoolClient, 'query'>;

/** PostgreSQL UNIQUE 제약 위반(23505). 동시 요청이 같은 값을 만들 때 오류 코드로 바꾸는 데 씁니다. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === '23505';
}

export function loadLocalEnvironment(): void {
  const file = resolve(__dirname, '../.env');
  if (!existsSync(file)) return;
  for (const row of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = row.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

/** `directory`의 `.sql` 파일을 이름 순으로 한 번씩 적용합니다. 디렉터리가 없으면 아무것도 적용하지 않습니다. */
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
      connectionString: process.env.DATABASE_URL,
      max: 15,
      application_name: 'crelink-api',
      // DB가 응답하지 않을 때 요청(readiness 포함)이 무한히 기다리지 않게 합니다.
      connectionTimeoutMillis: 5000,
    });
    // DB가 idle 연결을 끊으면 pool이 error를 냅니다. 처리하지 않으면 프로세스가 종료됩니다.
    this.pool.on('error', (error) => this.logger.error(`idle PostgreSQL 연결 오류: ${error.message}`));
    await this.pool.query('SELECT 1');
    await runMigrations(this.pool, resolve(__dirname, '../migrations'));
  }
  async onModuleDestroy() {
    await this.pool?.end();
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
