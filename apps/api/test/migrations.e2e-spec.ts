import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  it('0002_guestbook은 기존 랜딩에 방명록 켜짐(기본 true)을 더하고 글 본문 길이·삭제 연쇄를 지킨다', async () => {
    const source = join(__dirname, '../migrations');
    copyFileSync(join(source, '0001_crelink_mvp.sql'), join(directory, '0001_crelink_mvp.sql'));
    await runMigrations(pool, directory);
    const user = await pool.query<{ id: string }>("INSERT INTO users (email) VALUES ('a@example.com') RETURNING id");
    const userId = user.rows[0].id;
    const landing = await pool.query<{ id: string }>(
      "INSERT INTO landings (user_id, public_id) VALUES ($1, 'abcdefghij') RETURNING id",
      [userId],
    );
    const landingId = landing.rows[0].id;

    copyFileSync(join(source, '0002_guestbook.sql'), join(directory, '0002_guestbook.sql'));
    await runMigrations(pool, directory);

    expect(await versions()).toEqual(['0001_crelink_mvp', '0002_guestbook']);
    const enabled = await pool.query('SELECT guestbook_enabled FROM landings WHERE id = $1', [landingId]);
    expect(enabled.rows[0].guestbook_enabled).toBe(true);
    const insert = (body: string) =>
      pool.query('INSERT INTO guestbook_entries (landing_id, author_user_id, body) VALUES ($1, $2, $3) RETURNING *', [
        landingId,
        userId,
        body,
      ]);
    const entry = await insert('가'.repeat(500));
    expect(entry.rows[0]).toMatchObject({ is_secret: false, hidden_at: null, created_at: expect.any(Date) });
    await expect(insert('')).rejects.toThrow(/guestbook_entries_body_check/);
    await expect(insert('가'.repeat(501))).rejects.toThrow(/guestbook_entries_body_check/);

    await pool.query('DELETE FROM landings WHERE id = $1', [landingId]);
    expect((await pool.query('SELECT 1 FROM guestbook_entries')).rowCount).toBe(0);
  });

  describe('0003_ad_banner', () => {
    const source = join(__dirname, '../migrations');
    let fileSeq = 0;
    const insertUser = async (email: string, role = 'creator') =>
      (await pool.query<{ id: string }>('INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id', [email, role]))
        .rows[0].id;
    const insertFile = async (ownerId: string) =>
      (
        await pool.query<{ id: string }>(
          "INSERT INTO files (owner_user_id, storage_key, content_type, size) VALUES ($1, $2, 'image/gif', 10) RETURNING id",
          [ownerId, `key-${(fileSeq += 1)}`],
        )
      ).rows[0].id;
    const insertLanding = async (userId: string, publicId: string) =>
      (
        await pool.query<{ id: string }>('INSERT INTO landings (user_id, public_id) VALUES ($1, $2) RETURNING id', [
          userId,
          publicId,
        ])
      ).rows[0].id;
    const insertAdBanner = (imageFileId: string, patch: Record<string, unknown> = {}) => {
      const row = {
        public_id: 'adbanner01',
        image_file_id: imageFileId,
        alt: '크리링 배너',
        url: 'https://ad.example/',
        host: 'ad.example',
        starts_at: '2026-10-01T00:00:00+09:00',
        ends_at: null,
        sort_order: 0,
        ...patch,
      };
      const keys = Object.keys(row);
      return pool.query(
        `INSERT INTO ad_banners (${keys.join(', ')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
        Object.values(row),
      );
    };
    const insertCreatorBanner = (
      userId: string,
      landingId: string,
      imageFileId: string,
      patch: Record<string, unknown> = {},
    ) => {
      const row = {
        public_id: 'mybanner01',
        user_id: userId,
        landing_id: landingId,
        image_file_id: imageFileId,
        alt: '내 배너',
        url: 'https://mine.example/',
        host: 'mine.example',
        position: 0,
        ...patch,
      };
      const keys = Object.keys(row);
      return pool.query(
        `INSERT INTO creator_banners (${keys.join(', ')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
        Object.values(row),
      );
    };
    const count = async (table: string) => (await pool.query(`SELECT 1 FROM ${table}`)).rowCount;

    beforeEach(async () => {
      for (const name of ['0001_crelink_mvp.sql', '0002_guestbook.sql'])
        copyFileSync(join(source, name), join(directory, name));
      await runMigrations(pool, directory);
    });

    const applyAdBanner = async () => {
      copyFileSync(join(source, '0003_ad_banner.sql'), join(directory, '0003_ad_banner.sql'));
      await runMigrations(pool, directory);
    };

    it('기존 행은 그대로 두고 새 컬럼을 NULL(맨 뒤·미부여·모름)로 더하며 lock_timeout은 그 파일 안에서만 쓴다', async () => {
      const userId = await insertUser('a@example.com');
      const landingId = await insertLanding(userId, 'abcdefghij');
      await pool.query("INSERT INTO landing_blocks (landing_id, type, position) VALUES ($1, 'list', 0)", [landingId]);
      await insertFile(userId);

      await applyAdBanner();

      expect(await versions()).toEqual(['0001_crelink_mvp', '0002_guestbook', '0003_ad_banner']);
      const row = await pool.query(
        `SELECT u.banner_slot_granted_at, b.slot_position, f.animated
         FROM users u JOIN landings l ON l.user_id = u.id JOIN landing_blocks b ON b.landing_id = l.id JOIN files f ON f.owner_user_id = u.id`,
      );
      expect(row.rows).toEqual([{ banner_slot_granted_at: null, slot_position: null, animated: null }]);
      expect((await pool.query('SHOW lock_timeout')).rows[0].lock_timeout).toBe('0');
    });

    it('배너(이미지·정지 이미지)가 있는 크리에이터를 지우면 배너·파일·클릭 집계까지 연쇄 삭제된다', async () => {
      await applyAdBanner();
      const userId = await insertUser('creator@example.com');
      const landingId = await insertLanding(userId, 'abcdefghij');
      const image = await insertFile(userId);
      const still = await insertFile(userId);
      const banner = await insertCreatorBanner(userId, landingId, image, { still_file_id: still });
      const shortLink = await pool.query<{ id: string }>(
        'INSERT INTO short_links (user_id, landing_id) VALUES ($1, $2) RETURNING id',
        [userId, landingId],
      );
      await pool.query(
        "INSERT INTO creator_banner_clicks (banner_id, banner_public_id, short_link_id, visitor_id) VALUES ($1, 'mybanner01', $2, gen_random_uuid())",
        [banner.rows[0].id, shortLink.rows[0].id],
      );
      await pool.query(
        "INSERT INTO creator_banner_click_rollups (day, short_link_id, banner_public_id, clicks) VALUES ('2026-10-01', $1, 'mybanner01', 3)",
        [shortLink.rows[0].id],
      );

      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      for (const table of ['creator_banners', 'files', 'creator_banner_clicks', 'creator_banner_click_rollups']) {
        expect(await count(table)).toBe(0);
      }
    });

    it('정지 이미지 파일만 지우면 크리에이터 배너의 still_file_id가 NULL이 되고, 배너를 지워도 클릭 원본은 공개 ID로 남는다', async () => {
      await applyAdBanner();
      const userId = await insertUser('creator@example.com');
      const landingId = await insertLanding(userId, 'abcdefghij');
      const still = await insertFile(userId);
      const banner = await insertCreatorBanner(userId, landingId, await insertFile(userId), { still_file_id: still });
      const shortLink = await pool.query<{ id: string }>(
        'INSERT INTO short_links (user_id, landing_id) VALUES ($1, $2) RETURNING id',
        [userId, landingId],
      );
      await pool.query(
        "INSERT INTO creator_banner_clicks (banner_id, banner_public_id, short_link_id, visitor_id) VALUES ($1, 'mybanner01', $2, gen_random_uuid())",
        [banner.rows[0].id, shortLink.rows[0].id],
      );

      await pool.query('DELETE FROM files WHERE id = $1', [still]);
      expect((await pool.query('SELECT still_file_id FROM creator_banners')).rows).toEqual([{ still_file_id: null }]);

      await pool.query('DELETE FROM creator_banners');
      expect((await pool.query('SELECT banner_id, banner_public_id FROM creator_banner_clicks')).rows).toEqual([
        { banner_id: null, banner_public_id: 'mybanner01' },
      ]);
    });

    it('크리링 배너 이미지를 올린 운영자를 지우면 23503으로 실패하고 배너·이미지가 남는다', async () => {
      await applyAdBanner();
      const operatorId = await insertUser('operator@example.com', 'operator');
      const image = await insertFile(operatorId);
      const banner = await insertAdBanner(image, { created_by: operatorId });
      await pool.query(
        "INSERT INTO ad_banner_daily_stats (day, ad_banner_id, landing_public_id, impressions) VALUES ('2026-10-01', $1, 'abcdefghij', 1)",
        [banner.rows[0].id],
      );

      await expect(pool.query('DELETE FROM users WHERE id = $1', [operatorId])).rejects.toMatchObject({
        code: '23503',
      });
      expect(await count('ad_banners')).toBe(1);
      expect(await count('files')).toBe(1);

      // 배너를 지우면(삭제 API는 없음) 카운터도 함께 지워지고, 그 뒤에는 운영자를 지울 수 있습니다.
      await pool.query('DELETE FROM ad_banners');
      expect(await count('ad_banner_daily_stats')).toBe(0);
      await pool.query('DELETE FROM users WHERE id = $1', [operatorId]);
      expect(await count('files')).toBe(0);
    });

    it('CHECK: 공개 ID 형식, 대체 문구 1~100자, 게시 끝 ≥ 시작, 연결 URL·호스트 짝, 슬롯 위치 0 이상', async () => {
      await applyAdBanner();
      const userId = await insertUser('creator@example.com');
      const landingId = await insertLanding(userId, 'abcdefghij');
      const image = await insertFile(userId);
      const violates = (constraint: string) => ({ code: '23514', constraint });

      await expect(insertAdBanner(image, { public_id: 'ABCDEFGHIJ' })).rejects.toMatchObject(
        violates('ad_banners_public_id_check'),
      );
      await expect(insertAdBanner(image, { alt: '' })).rejects.toMatchObject(violates('ad_banners_alt_check'));
      await expect(insertAdBanner(image, { alt: '가'.repeat(101) })).rejects.toMatchObject(
        violates('ad_banners_alt_check'),
      );
      await expect(insertAdBanner(image, { ends_at: '2026-09-30T23:59:59+09:00' })).rejects.toMatchObject(
        violates('ad_banners_check'),
      );
      // 예약 배너를 내리면 시작과 끝이 같아질 수 있어 같은 값은 받습니다.
      await insertAdBanner(image, { alt: '가'.repeat(100), ends_at: '2026-10-01T00:00:00+09:00' });

      await expect(insertCreatorBanner(userId, landingId, image, { public_id: 'short' })).rejects.toMatchObject(
        violates('creator_banners_public_id_check'),
      );
      await expect(insertCreatorBanner(userId, landingId, image, { alt: '가'.repeat(101) })).rejects.toMatchObject(
        violates('creator_banners_alt_check'),
      );
      await expect(insertCreatorBanner(userId, landingId, image, { host: null })).rejects.toMatchObject(
        violates('creator_banners_check'),
      );
      const unlinked = await insertCreatorBanner(userId, landingId, image, { url: null, host: null });
      expect(unlinked.rows[0]).toMatchObject({ hidden: false, blocked_at: null, still_file_id: null });

      await expect(
        pool.query(
          "INSERT INTO landing_blocks (landing_id, type, position, slot_position) VALUES ($1, 'list', 0, -1)",
          [landingId],
        ),
      ).rejects.toMatchObject(violates('landing_blocks_slot_position_check'));
    });
  });
});
