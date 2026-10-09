import { AI_TOKEN_PATTERN } from '@crelink/shared';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { hashToken } from '../src/auth/token-hash';
import { DEFAULT_AI_EMAIL, runCommand } from '../src/cli/ai-operator';
import { runMigrations } from '../src/database';
import { createTestDatabase, TestDatabase } from './test-database';

/** AI 운영자 토큰 CLI 명령 함수(0101, 설계 `CLI(토큰 발급)`). 빌드 산출물 실행은 티켓 진행 기록에 남깁니다. */
describe('AI 운영자 CLI', () => {
  let database: TestDatabase;
  let pool: Pool;

  const run = async (...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runCommand(pool, argv, { out: (line) => out.push(line), err: (line) => err.push(line) });
    return { code, out, err };
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    pool = new Pool({ connectionString: database.url, max: 1 });
    await runMigrations(pool, join(__dirname, '../migrations'));
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  it('ensure-account는 AI 운영자 계정·랜딩·단축 주소를 없을 때만 만들고 userId를 출력한다', async () => {
    const first = await run('ensure-account');
    expect(first.code).toBe(0);
    expect(first.out).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)]);
    const userId = first.out[0];
    const user = await pool.query(
      `SELECT u.email, u.role, u.kind, count(DISTINCT l.id)::int AS landings, count(DISTINCT s.slug)::int AS slugs
       FROM users u JOIN landings l ON l.user_id = u.id JOIN short_links sl ON sl.user_id = u.id
       JOIN short_slugs s ON s.short_link_id = sl.id WHERE u.id = $1 GROUP BY u.id`,
      [userId],
    );
    expect(user.rows).toEqual([{ email: DEFAULT_AI_EMAIL, role: 'operator', kind: 'ai', landings: 1, slugs: 1 }]);

    const again = await run('ensure-account', '--email', 'AI-Operator@Crelink.invalid');
    expect([again.code, again.out]).toEqual([0, [userId]]);
    expect((await pool.query("SELECT 1 FROM users WHERE kind = 'ai'")).rowCount).toBe(1);
  });

  it('같은 이메일의 사람 계정이 있으면 바꾸지 않고 실패한다', async () => {
    await pool.query("INSERT INTO users (email, role) VALUES ('human@example.com', 'operator')");
    const result = await run('ensure-account', '--email', 'human@example.com');
    expect(result.code).toBe(1);
    expect(result.out).toEqual([]);
    expect(result.err.join('\n')).toContain('사람 계정');
    expect((await pool.query("SELECT kind FROM users WHERE email = 'human@example.com'")).rows).toEqual([
      { kind: 'human' },
    ]);
    expect((await run('issue-token', '--label', 'x', '--email', 'human@example.com')).code).toBe(1);
  });

  it('issue-token은 원문 한 줄만 출력하고 해시만 저장하며 system 행위자로 기록한다', async () => {
    const result = await run('issue-token', '--label', '운영자 Mac', '--email', 'issue@crelink.invalid');
    expect(result.code).toBe(0);
    expect(result.out).toHaveLength(1);
    const token = result.out[0];
    expect(token).toMatch(AI_TOKEN_PATTERN);
    expect(result.err.join('\n')).not.toContain(token);
    const stored = await pool.query<{ id: string; token_hash: string; prefix: string; label: string }>(
      `SELECT t.id, t.token_hash, t.prefix, t.label FROM api_tokens t JOIN users u ON u.id = t.user_id
       WHERE u.email = 'issue@crelink.invalid'`,
    );
    expect(stored.rows).toEqual([
      { id: expect.any(String), token_hash: hashToken(token), prefix: token.slice(0, 12), label: '운영자 Mac' },
    ]);
    const action = await pool.query(
      "SELECT actor_kind, actor_user_id, target_id, after FROM operator_actions WHERE action = 'ai_operator.token_issue'",
    );
    expect(action.rows).toEqual([
      {
        actor_kind: 'system',
        actor_user_id: null,
        target_id: stored.rows[0].id,
        after: { id: stored.rows[0].id, label: '운영자 Mac', prefix: token.slice(0, 12) },
      },
    ]);
    expect(JSON.stringify(action.rows)).not.toContain(token);

    for (const args of [[], ['--label'], ['--label', ' '], ['--label', 'a'.repeat(61)], ['--labe', 'x']]) {
      const bad = await run('issue-token', ...args);
      expect([args.join(' '), bad.code, bad.out]).toEqual([args.join(' '), 1, []]);
    }
  });

  it('list-tokens는 원문 없이 탭 구분 목록을, revoke-token은 멱등 폐기와 기록을 한다', async () => {
    const issued = await run('issue-token', '--label', '목록', '--email', 'list@crelink.invalid');
    const token = issued.out[0];
    const listed = await run('list-tokens', '--email', 'list@crelink.invalid');
    expect(listed.code).toBe(0);
    expect(listed.out[0]).toBe('id\tlabel\tprefix\tcreated_at\tlast_used_at\trevoked_at');
    const [id, label, prefix, createdAt, lastUsed, revokedAt] = listed.out[1].split('\t');
    expect([label, prefix, lastUsed, revokedAt]).toEqual(['목록', token.slice(0, 12), '-', '-']);
    expect(Number.isNaN(Date.parse(createdAt))).toBe(false);
    expect(listed.out.join('\n')).not.toContain(token);

    const revoked = await run('revoke-token', id);
    expect(revoked.code).toBe(0);
    expect(revoked.out[0].split('\t')[0]).toBe(id);
    const again = await run('revoke-token', id);
    expect(again.code).toBe(0);
    expect(again.out).toEqual(revoked.out);
    const after = await run('list-tokens', '--email', 'list@crelink.invalid');
    expect(after.out[1].split('\t')[5]).not.toBe('-');
    expect(
      (await pool.query("SELECT actor_kind FROM operator_actions WHERE action = 'ai_operator.token_revoke'")).rows,
    ).toEqual([{ actor_kind: 'system' }, { actor_kind: 'system' }]);

    expect((await run('revoke-token', '00000000-0000-4000-8000-000000000000')).code).toBe(1);
    expect((await run('revoke-token', 'nope')).code).toBe(1);
    expect((await run('revoke-token')).code).toBe(1);
    expect((await run('list-tokens', '--email', 'missing@crelink.invalid')).code).toBe(1);
    expect((await run('list-tokens', '--email', 'not-an-email')).code).toBe(1);
  });

  it('모르는 명령은 사용법과 종료 1', async () => {
    const result = await run('rotate');
    expect(result.code).toBe(1);
    expect(result.out).toEqual([]);
    expect(result.err.join('\n')).toContain('사용법');
    expect((await run()).code).toBe(1);
  });

  it('0004 전 DB(테이블 없음)면 안내 후 종료 1', async () => {
    const old = await createTestDatabase();
    const oldPool = new Pool({ connectionString: old.url, max: 1 });
    const directory = mkdtempSync(join(tmpdir(), 'crelink-migrations-'));
    try {
      for (const name of ['0001_crelink_mvp.sql', '0002_guestbook.sql', '0003_ad_banner.sql']) {
        copyFileSync(join(__dirname, '../migrations', name), join(directory, name));
      }
      await runMigrations(oldPool, directory);
      for (const argv of [
        ['list-tokens'],
        ['ensure-account'],
        ['revoke-token', '00000000-0000-4000-8000-000000000000'],
      ]) {
        const err: string[] = [];
        const code = await runCommand(oldPool, argv, { out: () => undefined, err: (line) => err.push(line) });
        expect([argv[0], code]).toEqual([argv[0], 1]);
        expect(err.join('\n')).toContain('0004_ai_operator');
      }
    } finally {
      await oldPool.end();
      await old.drop();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
