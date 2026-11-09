// ego-lite 시험의 합성 사용자·세션. tests/e2e/fixtures.ts의 E2EData.user·removeUsers와 같은 행을 같은 순서로 만들고 지웁니다.
// fixtures.ts는 Playwright와 CommonJS(__dirname)·비소거 TS 문법에 묶여 일반 Node에서 불러올 수 없어 필요한 부분만 옮겼습니다.
// 가입 행 구조가 바뀌면 fixtures.ts와 이 파일을 함께 고칩니다.
/* global URL */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

export const TEST_EMAIL_DOMAIN = 'e2e.crelink.test';
export const TEST_HOST_SUFFIX = 'e2e.test';
const STALE_INTERVAL = '1 hour';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const randomToken = (length) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export class SyntheticData {
  run = randomToken(8);
  users = [];
  sequence = 0;

  constructor(db, { root, webUrl, shortUrl }) {
    this.db = db;
    this.webUrl = webUrl;
    this.shortUrl = shortUrl;
    this.uploadDir = process.env.UPLOAD_DIR?.trim()
      ? resolve(root, 'apps/api', process.env.UPLOAD_DIR.trim())
      : join(root, '.local/uploads');
  }

  unique(prefix) {
    this.sequence += 1;
    return `${prefix}-${this.run}${this.sequence}`;
  }

  /** 시험 전용 외부 링크 주소. `.test`는 DNS로 풀리지 않아 실제 외부 사이트로 나가지 않습니다. */
  externalUrl(label) {
    return `https://${this.unique('site')}.${TEST_HOST_SUFFIX}/${label}`;
  }

  /** 가입 트랜잭션과 같은 행 + 세션. 기본값은 fixtures.ts와 같이 지표 제외 계정입니다. renamed는 자동 주소를 방금 바꾼 상태입니다. */
  async user({ role = 'creator', displayName = null, bio = null, links = [], renamed = false } = {}) {
    const email = `${this.unique(role)}@${TEST_EMAIL_DOMAIN}`;
    const sessionToken = randomBytes(32).toString('base64url');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows: users } = await client.query(
        'INSERT INTO users (email, role, metrics_excluded_at) VALUES ($1, $2, now()) RETURNING id',
        [email, role],
      );
      const userId = users[0].id;
      this.users.push(userId);
      await client.query(
        `INSERT INTO user_identities (user_id, provider, provider_subject, email) VALUES ($1, 'google', $2, $3)`,
        [userId, `e2e-${randomToken(24)}`, email],
      );
      const publicId = randomToken(10);
      const { rows: landings } = await client.query(
        'INSERT INTO landings (user_id, public_id, display_name, bio) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, publicId, displayName, bio],
      );
      const landingId = landings[0].id;
      const { rows: blocks } = await client.query(
        `INSERT INTO landing_blocks (landing_id, type, position) VALUES ($1, 'list', 0) RETURNING id`,
        [landingId],
      );
      const { rows: shortLinks } = await client.query(
        `INSERT INTO short_links (user_id, landing_id, slug_changed_at) VALUES ($1, $2, $3) RETURNING id`,
        [userId, landingId, renamed ? new Date() : null],
      );
      const shortLinkId = shortLinks[0].id;
      const autoSlug = randomToken(7);
      let slug = autoSlug;
      let oldSlug = null;
      if (renamed) {
        slug = this.unique('e2e');
        oldSlug = autoSlug;
        await client.query(
          `INSERT INTO short_slugs (slug, short_link_id, is_auto, retired_at) VALUES ($1, $2, true, now())`,
          [autoSlug, shortLinkId],
        );
      }
      await client.query(`INSERT INTO short_slugs (slug, short_link_id, is_auto) VALUES ($1, $2, $3)`, [
        slug,
        shortLinkId,
        !renamed,
      ]);
      const seededLinks = [];
      for (const [position, link] of links.entries()) {
        const linkPublicId = randomToken(10);
        const { rows } = await client.query(
          `INSERT INTO links (public_id, user_id, block_id, title, url, host, position, hidden)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            linkPublicId,
            userId,
            blocks[0].id,
            link.title,
            link.url,
            new URL(link.url).hostname,
            position,
            !!link.hidden,
          ],
        );
        seededLinks.push({
          ...link,
          hidden: !!link.hidden,
          id: rows[0].id,
          publicId: linkPublicId,
          clickUrl: `${this.shortUrl}/c/${linkPublicId}`,
        });
      }
      await client.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
        [userId, createHash('sha256').update(sessionToken).digest('hex')],
      );
      await client.query('COMMIT');
      return {
        userId,
        role,
        publicId,
        landingUrl: `${this.webUrl}/p/${publicId}`,
        shortLinkId,
        slug,
        shortUrl: `${this.shortUrl}/${slug}`,
        oldSlug,
        sessionToken,
        links: seededLinks,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** 중단된 이전 실행이 남긴 합성 사용자만 지웁니다(fixtures.ts의 worker 시작 정리와 같은 조건). */
  async removeStale() {
    await this.removeUsers(`u.email LIKE $1 AND u.created_at < now() - $2::interval`, [
      `%@${TEST_EMAIL_DOMAIN}`,
      STALE_INTERVAL,
    ]);
  }

  /**
   * 방문 이벤트의 분당 제한 카운터를 비웁니다. Playwright는 시험마다 새 컨텍스트라 cl_vid가 매번 새것이지만 ego는 프로필의 cl_vid를 지우지 않아
   * 짧은 반복 실행이 같은 방문자 예산(120건/분)을 나눠 쓰고 429로 실패합니다(0230 실측). 카운터는 사용자 데이터가 아니며 loadTargets가 루프백 DB만 허용합니다.
   */
  async resetVisitorRateLimits() {
    await this.db.query('DELETE FROM landing_event_limits');
  }

  async dispose() {
    if (this.users.length > 0) await this.removeUsers('u.id = ANY($1::uuid[])', [this.users]);
  }

  async removeUsers(where, values) {
    const { rows } = await this.db.query(
      `SELECT f.storage_key FROM files f JOIN users u ON u.id = f.owner_user_id WHERE ${where}`,
      values,
    );
    await this.db.query(
      `DELETE FROM operator_actions WHERE actor_user_id IN (SELECT u.id FROM users u WHERE ${where})
          OR subject_user_id IN (SELECT u.id FROM users u WHERE ${where})`,
      values,
    );
    await this.db.query(
      `DELETE FROM agent_runs WHERE actor_user_id IN (SELECT u.id FROM users u WHERE ${where})`,
      values,
    );
    await this.db.query(
      `DELETE FROM ad_banners WHERE image_file_id IN (SELECT f.id FROM files f JOIN users u ON u.id = f.owner_user_id WHERE ${where})
          OR still_file_id IN (SELECT f.id FROM files f JOIN users u ON u.id = f.owner_user_id WHERE ${where})`,
      values,
    );
    await Promise.all(rows.map((row) => rm(join(this.uploadDir, row.storage_key), { force: true })));
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // 종료 직전 beacon도 anchor→short_link 순서로 잠급니다. CASCADE를 반대 순서로 시작하면 교착할 수 있습니다.
      await client.query(
        `SELECT e.event_id FROM landing_events e JOIN short_links sl ON sl.id=e.short_link_id
         JOIN landings l ON l.id=sl.landing_id JOIN users u ON u.id=l.user_id
         WHERE ${where} ORDER BY e.event_id FOR UPDATE OF e`,
        values,
      );
      await client.query(`DELETE FROM users u WHERE ${where}`, values);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
