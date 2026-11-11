import { mkdtempSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { runMigrations } from '../src/database';
import { createTestDatabase } from './test-database';

/** 기존 격리 DB 생성 경로에 0018까지 적용한 뒤 0019 업그레이드를 실제 PostgreSQL로 검사합니다. */
describe('0280 additive 0019 백필', () => {
  it('기존 false 기본값·pending/sending/sent/unknown canonical 백필·90일 경과 데이터·재적용을 보존한다', async () => {
    const db = await createTestDatabase();
    const pool = new Pool({ connectionString: db.url });
    const previous = mkdtempSync(join(tmpdir(), 'crelink-0280-migrations-'));
    const migrations = resolve(__dirname, '../migrations');
    try {
      for (const name of readdirSync(migrations).filter((name) => name.endsWith('.sql') && name < '0019')) {
        copyFileSync(join(migrations, name), join(previous, name));
      }
      await runMigrations(pool, previous);
      const user = (await pool.query("INSERT INTO users(email) VALUES ('0280-migration@example.test') RETURNING id"))
        .rows[0].id;
      const connection = (
        await pool.query(
          `INSERT INTO instagram_connections (user_id,ig_user_id,ig_username,status)
        VALUES ($1,'migration-ig','fixture','reauth_required') RETURNING id`,
          [user],
        )
      ).rows[0].id;
      await pool.query("INSERT INTO channel_link_codes(code) VALUES ('mig0280')");
      const rule = (
        await pool.query(
          `INSERT INTO instagram_dm_rules
        (public_id,connection_id,ig_media_id,ig_media_child_ids,media_permalink,keyword,message,channel_link_code)
        VALUES ('rule028000',$1,'canonical-post',ARRAY['child-post'],'https://instagram.test/p/1','키워드','안내','mig0280') RETURNING id`,
          [connection],
        )
      ).rows[0].id;
      const states = ['pending', 'sending', 'sent', 'unknown', 'failed', 'expired', 'cancelled'];
      for (const [index, status] of states.entries()) {
        await pool.query(
          `INSERT INTO instagram_dm_deliveries
          (connection_id,rule_id,rule_version,comment_id,commenter_hash,commented_at,message_body,status,created_at)
          VALUES ($1,$2,1,$3,$4,now(),'기존본문',$5,now()-interval '100 days')`,
          [connection, rule, `comment-${index}`, Buffer.alloc(32, index + 1), status],
        );
      }
      // 보관된 옛 규칙과 현재 규칙이 같은 canonical 키를 가지면 한 마커로 백필합니다.
      const archived = (
        await pool.query(
          `INSERT INTO instagram_dm_rules
        (public_id,connection_id,ig_media_id,media_permalink,keyword,message,channel_link_code,archived_at)
        VALUES ('rule028001',$1,'canonical-post','https://instagram.test/p/1','키워드','옛문구','mig0280',now()) RETURNING id`,
          [connection],
        )
      ).rows[0].id;
      await pool.query(
        `INSERT INTO instagram_dm_deliveries
        (connection_id,rule_id,rule_version,comment_id,commenter_hash,commented_at,message_body,status,created_at)
        VALUES ($1,$2,1,'archived-comment',$3,now(),'옛본문','sent',now()-interval '110 days')`,
        [connection, archived, Buffer.alloc(32, 1)],
      );
      await runMigrations(pool, migrations);
      await runMigrations(pool, migrations);
      expect(
        (await pool.query('SELECT match_all_comments,keyword FROM instagram_dm_rules WHERE id=$1', [rule])).rows,
      ).toEqual([{ match_all_comments: false, keyword: '키워드' }]);
      const recipients = (await pool.query('SELECT * FROM instagram_dm_recipients ORDER BY commenter_hash')).rows;
      expect(recipients).toHaveLength(4);
      expect(recipients.map((row) => row.commenter_hash[0])).toEqual([1, 2, 3, 4]);
      for (const row of recipients) {
        expect(row).toMatchObject({ ig_user_id: 'migration-ig', scope_key: 'canonical-post' });
        expect(row.created_at.getTime()).toBeLessThan(Date.now() - 99 * 86400000);
      }
      expect(recipients[0].created_at.getTime()).toBeLessThan(Date.now() - 109 * 86400000);
      expect((await pool.query('SELECT 1 FROM instagram_dm_deliveries')).rowCount).toBe(8);
      await expect(pool.query("UPDATE instagram_dm_rules SET keyword='' WHERE id=$1", [rule])).rejects.toMatchObject({
        code: '23514',
      });
      await pool.query("UPDATE instagram_dm_rules SET match_all_comments=true,keyword='' WHERE id=$1", [rule]);
      await expect(
        pool.query('UPDATE instagram_dm_rules SET keyword=$2 WHERE id=$1', [rule, '가'.repeat(31)]),
      ).rejects.toMatchObject({ code: '23514' });
      await pool.query('DELETE FROM instagram_connections WHERE id=$1', [connection]);
      expect((await pool.query('SELECT 1 FROM instagram_dm_recipients')).rowCount).toBe(4);
    } finally {
      await pool.end();
      await db.drop();
      rmSync(previous, { recursive: true, force: true });
    }
  });
});
