// E2E 공용 fixture. 구글 로그인 대신 개발 DB에 가입 결과 행과 세션 행을 직접 넣고, 브라우저 컨텍스트에 cl_session 쿠키를 심습니다.
// 만든 사용자·차단 도메인은 테스트가 끝나면 지웁니다. 원리와 실행 방법: tests/e2e/README.md
import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import pg from 'pg';

const trimSlash = (value: string | undefined) => (value ?? '').replace(/\/$/, '');
export const WEB_URL = trimSlash(process.env.WEB_URL);
export const API_URL = trimSlash(process.env.API_URL);
export const SHORT_URL = trimSlash(process.env.SHORT_LINK_BASE_URL);

// Playwright가 테스트 파일을 CommonJS로 변환하므로 __dirname을 씁니다.
const root = join(__dirname, '../..');
// API의 이미지 저장 위치(apps/api/src/config.service.ts uploadDir). 상대 경로는 API 작업 디렉터리(apps/api) 기준입니다.
const UPLOAD_DIR = process.env.UPLOAD_DIR?.trim()
  ? resolve(root, 'apps/api', process.env.UPLOAD_DIR.trim())
  : join(root, '.local/uploads');

/** 테스트가 만드는 이메일·차단 도메인의 꼬리. 이 꼬리가 붙은 데이터만 지웁니다. */
export const TEST_EMAIL_DOMAIN = 'e2e.crelink.test';
export const TEST_HOST_SUFFIX = 'e2e.test';
/** 중단된 이전 실행이 남긴 테스트 데이터를 이 시간이 지나면 지웁니다(동시에 도는 다른 실행의 데이터는 건드리지 않음). */
const STALE_INTERVAL = '1 hour';
const SESSION_COOKIE = 'cl_session';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function randomToken(length: number): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/** 1×1 PNG. 프로필 사진 업로드에 씁니다. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export interface SeedLink {
  title: string;
  url: string;
  hidden?: boolean;
}

export interface SeededLink extends Required<SeedLink> {
  id: string;
  publicId: string;
  clickUrl: string;
}

export interface SeededUser {
  userId: string;
  email: string;
  role: 'creator' | 'operator';
  publicId: string;
  landingUrl: string;
  shortLinkId: string;
  slug: string;
  shortUrl: string;
  /** renamed 옵션으로 만든 경우 바꾸기 전 자동 주소(90일 동안 연결). */
  oldSlug: string | null;
  sessionToken: string;
  links: SeededLink[];
}

export interface SeedOptions {
  role?: 'creator' | 'operator';
  displayName?: string;
  bio?: string;
  links?: SeedLink[];
  /** 자동 주소를 방금 사용자 지정 주소로 바꾼 상태로 만듭니다(옛 주소 연결 확인용). */
  renamed?: boolean;
}

export interface Session {
  context: BrowserContext;
  page: Page;
}

interface ConsoleProblem {
  page: string;
  text: string;
}

const isLocal = (url: string) => {
  const { origin } = new URL(url);
  return origin === WEB_URL || origin === API_URL || origin === SHORT_URL || url.startsWith('data:');
};

/**
 * 한 테스트가 쓰는 데이터와 브라우저 컨텍스트. 테스트가 끝나면 컨텍스트를 닫고, 앱 콘솔 오류가 없었는지 확인하고, 만든 행을 지웁니다.
 */
export class E2EData {
  readonly run = randomToken(8);
  private readonly users: string[] = [];
  private readonly domains: string[] = [];
  private readonly contexts: BrowserContext[] = [];
  private readonly problems: ConsoleProblem[] = [];
  private readonly allowed: RegExp[] = [];
  private sequence = 0;

  constructor(
    /** 개발 DB. 기록 확인 조회에 씁니다. */
    readonly db: pg.Pool,
    private readonly browser: Browser,
  ) {}

  /** 테스트 전용 고유 이름(소문자·숫자·하이픈). 주소·도메인·제목에 씁니다. */
  unique(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.run}${this.sequence}`;
  }

  /** 가입 트랜잭션(docs/specs/crelink-mvp.md 데이터 모델 `가입 시 생성`)과 같은 행 + 세션을 만듭니다. */
  async user(options: SeedOptions = {}): Promise<SeededUser> {
    const role = options.role ?? 'creator';
    const email = `${this.unique(role)}@${TEST_EMAIL_DOMAIN}`;
    const sessionToken = randomBytes(32).toString('base64url');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const { rows: users } = await client.query<{ id: string }>(
        'INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id',
        [email, role],
      );
      const userId = users[0].id;
      this.users.push(userId);
      await client.query(
        `INSERT INTO user_identities (user_id, provider, provider_subject, email) VALUES ($1, 'google', $2, $3)`,
        [userId, `e2e-${randomToken(24)}`, email],
      );
      const publicId = randomToken(10);
      const { rows: landings } = await client.query<{ id: string }>(
        'INSERT INTO landings (user_id, public_id, display_name, bio) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, publicId, options.displayName ?? null, options.bio ?? null],
      );
      const landingId = landings[0].id;
      const { rows: blocks } = await client.query<{ id: string }>(
        `INSERT INTO landing_blocks (landing_id, type, position) VALUES ($1, 'list', 0) RETURNING id`,
        [landingId],
      );
      const { rows: shortLinks } = await client.query<{ id: string }>(
        `INSERT INTO short_links (user_id, landing_id, slug_changed_at) VALUES ($1, $2, $3) RETURNING id`,
        [userId, landingId, options.renamed ? new Date() : null],
      );
      const shortLinkId = shortLinks[0].id;
      const autoSlug = randomToken(7);
      let slug = autoSlug;
      let oldSlug: string | null = null;
      if (options.renamed) {
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
        !options.renamed,
      ]);
      const links: SeededLink[] = [];
      for (const [position, link] of (options.links ?? []).entries()) {
        const linkPublicId = randomToken(10);
        const { rows } = await client.query<{ id: string }>(
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
        links.push({
          ...link,
          hidden: !!link.hidden,
          id: rows[0].id,
          publicId: linkPublicId,
          clickUrl: `${SHORT_URL}/c/${linkPublicId}`,
        });
      }
      await client.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
        [userId, createHash('sha256').update(sessionToken).digest('hex')],
      );
      await client.query('COMMIT');
      return {
        userId,
        email,
        role,
        publicId,
        landingUrl: `${WEB_URL}/p/${publicId}`,
        shortLinkId,
        slug,
        shortUrl: `${SHORT_URL}/${slug}`,
        oldSlug,
        sessionToken,
        links,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** 테스트 전용 차단 도메인 이름. 테스트가 끝나면 차단 목록에서 지웁니다. */
  blockedDomain(): string {
    const domain = `${this.unique('blk')}.${TEST_HOST_SUFFIX}`;
    this.domains.push(domain);
    return domain;
  }

  /** 테스트 전용 외부 링크 주소. `.test` 최상위 도메인이라 DNS로 풀리지 않아 실제 외부 사이트로 나가지 않습니다. */
  externalUrl(label: string): string {
    return `https://${this.unique('site')}.${TEST_HOST_SUFFIX}/${label}`;
  }

  /**
   * 새 브라우저 컨텍스트. user를 주면 그 사용자의 cl_session 쿠키를 심습니다.
   * 외부 요청(사이트 아이콘 등)은 네트워크로 나가지 않게 가짜 응답을 줍니다: favicon은 404, 나머지는 200 빈 문서.
   * Playwright route는 리디렉트된 요청을 가로채지 않으므로 `/c/{id}` 302의 도착지는 DNS 실패로 끝납니다(테스트는 302와 요청만 확인).
   */
  async session(user?: SeededUser): Promise<Session> {
    // 데스크톱 1280px 기본. 390px 확인은 expectMobileFits가 폭을 바꿔 다시 엽니다.
    const context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
    this.contexts.push(context);
    await context.route(
      (url) => !isLocal(url.href),
      (route) =>
        new URL(route.request().url()).pathname === '/favicon.ico'
          ? route.fulfill({ status: 404, body: '' })
          : route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>external</title>' }),
    );
    if (user) {
      await context.addCookies([
        {
          name: SESSION_COOKIE,
          value: user.sessionToken,
          domain: new URL(WEB_URL).hostname,
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
    }
    context.on('page', (page) => this.watch(page));
    const page = await context.newPage();
    return { context, page };
  }

  /**
   * 시나리오가 일부러 일으키는 API 거부(예: 차단 도메인 저장 422)는 브라우저가 리소스 오류로 콘솔에 남깁니다.
   * 그런 오류만 `메시지 출처URL` 형식의 문자열에 대한 패턴으로 허용합니다.
   */
  allowConsoleError(pattern: RegExp) {
    this.allowed.push(pattern);
  }

  /** 앱 코드의 콘솔 오류를 모읍니다. 외부 사이트 아이콘을 못 불러온 리소스 오류는 설계상 정상(기본 아이콘)이라 뺍니다. */
  private watch(page: Page) {
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const source = message.location().url;
      if (message.text().startsWith('Failed to load resource') && source && !isLocal(source)) return;
      if (this.allowed.some((pattern) => pattern.test(`${message.text()} ${source}`))) return;
      this.problems.push({ page: page.url(), text: `${message.text()} ${source}` });
    });
    page.on('pageerror', (error) => this.problems.push({ page: page.url(), text: error.message }));
  }

  async dispose(): Promise<ConsoleProblem[]> {
    await Promise.all(this.contexts.map((context) => context.close()));
    await removeUsers(this.db, 'u.id = ANY($1::uuid[])', [this.users]);
    if (this.domains.length > 0) {
      await this.db.query('DELETE FROM blocked_domains WHERE domain = ANY($1::text[])', [this.domains]);
    }
    return this.problems;
  }
}

/** 사용자와 그 사용자의 업로드 파일(디스크)을 지웁니다. 나머지 행은 users의 ON DELETE CASCADE로 지워집니다. */
async function removeUsers(db: pg.Pool, where: string, values: unknown[]) {
  const { rows } = await db.query<{ storage_key: string }>(
    `SELECT f.storage_key FROM files f JOIN users u ON u.id = f.owner_user_id WHERE ${where}`,
    values,
  );
  await Promise.all(rows.map((row) => rm(join(UPLOAD_DIR, row.storage_key), { force: true })));
  await db.query(`DELETE FROM users u WHERE ${where}`, values);
}

export const test = base.extend<{ data: E2EData }, { db: pg.Pool }>({
  db: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixture는 첫 인자를 구조 분해해야 합니다.
    async ({}, use) => {
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
      // 중단된 이전 실행이 남긴 테스트 데이터만 정리합니다.
      await removeUsers(pool, `u.email LIKE $1 AND u.created_at < now() - $2::interval`, [
        `%@${TEST_EMAIL_DOMAIN}`,
        STALE_INTERVAL,
      ]);
      await pool.query(`DELETE FROM blocked_domains WHERE domain LIKE $1 AND created_at < now() - $2::interval`, [
        `%.${TEST_HOST_SUFFIX}`,
        STALE_INTERVAL,
      ]);
      await use(pool);
      await pool.end();
    },
    { scope: 'worker' },
  ],
  data: async ({ db, browser }, use) => {
    const data = new E2EData(db, browser);
    await use(data);
    const problems = await data.dispose();
    expect(problems, '앱 콘솔 오류(외부 사이트 아이콘 실패 제외)').toEqual([]);
  },
});

export { expect };

/** 지금 화면에 가로 스크롤이 생기지 않는지 확인합니다(R16). */
export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: 가로 넘침(px)`).toBeLessThanOrEqual(0);
}

/** 같은 화면을 390px 폭으로 다시 열어 가로 넘침이 없는지 확인합니다. */
export async function expectMobileFits(page: Page, label: string) {
  const original = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expectNoHorizontalOverflow(page, `${label} 390px`);
  if (original) await page.setViewportSize(original);
}

/** 비동기 방문·클릭 기록이 DB에 들어올 때까지 기다립니다. */
export async function waitForCount(data: E2EData, table: 'visits' | 'link_clicks', shortLinkId: string, count: number) {
  await expect
    .poll(
      async () =>
        Number(
          (
            await data.db.query<{ count: string }>(`SELECT count(*) FROM ${table} WHERE short_link_id = $1`, [
              shortLinkId,
            ])
          ).rows[0].count,
        ),
      { message: `${table} 기록 ${count}건` },
    )
    .toBe(count);
}
