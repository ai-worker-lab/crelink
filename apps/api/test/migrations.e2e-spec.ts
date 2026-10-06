import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from '../src/database';
import { createTestDatabase, TestDatabase } from './test-database';

describe('runMigrations', () => {
  let database: TestDatabase;
  let pool: Pool;
  let directory: string;

  const versions = async () =>
    (
      await pool.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY applied_at, version')
    ).rows.map((row) => row.version);

  beforeEach(async () => {
    database = await createTestDatabase();
    pool = new Pool({ connectionString: database.url });
    directory = mkdtempSync(join(tmpdir(), 'crelink-migrations-'));
  });

  afterEach(async () => {
    await pool.end();
    await database.drop();
    rmSync(directory, { recursive: true, force: true });
  });

  it('디렉터리가 없으면 기록 테이블만 만들고 아무것도 적용하지 않는다', async () => {
    await runMigrations(pool, join(directory, 'missing'));
    expect(await versions()).toEqual([]);
  });

  it('.sql 파일을 이름 순으로 적용하고 다른 확장자는 무시한다', async () => {
    writeFileSync(join(directory, '002_add_column.sql'), 'ALTER TABLE sample ADD COLUMN label text;');
    writeFileSync(join(directory, '001_create.sql'), 'CREATE TABLE sample (id int PRIMARY KEY);');
    writeFileSync(join(directory, 'README.md'), 'not a migration');

    await runMigrations(pool, directory);

    expect(await versions()).toEqual(['001_create', '002_add_column']);
    const columns = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'sample' ORDER BY ordinal_position",
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual(['id', 'label']);
  });

  it('이미 적용한 파일은 다시 실행하지 않는다', async () => {
    writeFileSync(join(directory, '001_create.sql'), 'CREATE TABLE sample (id int PRIMARY KEY);');
    await runMigrations(pool, directory);
    await runMigrations(pool, directory);
    expect(await versions()).toEqual(['001_create']);
  });

  it('실패한 파일은 되돌리고 기록하지 않으며 이전 파일의 적용은 유지한다', async () => {
    writeFileSync(join(directory, '001_create.sql'), 'CREATE TABLE sample (id int PRIMARY KEY);');
    writeFileSync(join(directory, '002_broken.sql'), 'CREATE TABLE partial (id int); SELECT * FROM missing_table;');

    await expect(runMigrations(pool, directory)).rejects.toThrow(/missing_table/);

    expect(await versions()).toEqual(['001_create']);
    const partial = await pool.query("SELECT to_regclass('public.partial') AS table_name");
    expect(partial.rows[0].table_name).toBeNull();
  });
});
