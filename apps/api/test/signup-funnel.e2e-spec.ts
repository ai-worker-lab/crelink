import { randomUUID } from 'node:crypto';
import { SIGNUP_CONTEXT_HEADER, SIGNUP_FUNNEL_LIMITS, type SignupFunnelContext } from '@crelink/shared';
import { RetentionService } from '../src/retention/retention.service';
import { SignupFunnelService } from '../src/telemetry/signup-funnel.service';
import { api, createTestApp, login, type TestApp, WEB_URL } from './test-app';

const instagram: SignupFunnelContext = {
  source: 'instagram',
  medium: 'social',
  campaign: 'spring',
  referrerHost: '',
  inAppKind: 'instagram',
};

describe('가입 경로 계측', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  // 서버 단계 기록은 응답과 분리되므로 읽기 전에 끝나기를 기다립니다.
  const settled = () => t.app.get(SignupFunnelService).settled();

  beforeEach(async () => {
    await settled();
    await t.pool.query('TRUNCATE signup_funnel_daily, signup_funnel_oauth_contexts');
    await t.pool.query('DELETE FROM landing_event_limits');
  });

  const send = (body: unknown, origin = WEB_URL) =>
    api(t.baseUrl, 'POST', '/api/signup-funnel/events', { body, headers: { origin } });

  const counts = async () => {
    await settled();
    const { rows } = await t.pool.query<{ step: string; events: string }>(
      'SELECT step, sum(events)::text AS events FROM signup_funnel_daily GROUP BY step',
    );
    return Object.fromEntries(rows.map((row) => [row.step, Number(row.events)]));
  };

  const row = async (step: string) => {
    await settled();
    return (
      await t.pool.query(
        'SELECT source, medium, campaign, referrer_host, in_app_kind FROM signup_funnel_daily WHERE step = $1',
        [step],
      )
    ).rows;
  };

  const startOAuth = (context?: SignupFunnelContext) =>
    fetch(`${t.baseUrl}/api/auth/google/start`, {
      headers: context ? { [SIGNUP_CONTEXT_HEADER]: JSON.stringify(context) } : {},
    });

  const oauth = async (code: string, context?: SignupFunnelContext, options = { settle: true }) => {
    const start = await startOAuth(context);
    if (options.settle) await settled();
    const stateCookie = start.headers.getSetCookie()[0].split(';')[0];
    const state = decodeURIComponent(stateCookie.slice(stateCookie.indexOf('=') + 1));
    const response = await fetch(`${t.baseUrl}/api/auth/google/callback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: stateCookie },
      body: JSON.stringify({ code, state }),
    });
    const session = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('cl_session=') && !cookie.includes('Max-Age=0'));
    return { status: response.status, cookie: session?.split(';')[0] ?? null, state };
  };

  /** 두 테이블을 잠가 기록을 멈춘 채 fn을 실행합니다. 끝나면 잠금을 풀고 기록이 끝나기를 기다립니다. */
  const withFunnelLocked = async <T>(fn: () => Promise<T>): Promise<T> => {
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE signup_funnel_oauth_contexts, signup_funnel_daily IN ACCESS EXCLUSIVE MODE');
      return await fn();
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await settled();
    }
  };

  it('여섯 단계를 유입값·앱 종류와 함께 합계로 남긴다', async () => {
    const event = {
      source: 'instagram',
      medium: 'social',
      campaign: 'spring',
      referrerHost: 'l.instagram.com',
      inAppKind: 'instagram',
    };
    expect((await send({ step: 'home_view', ...event })).status).toBe(204);
    expect((await send({ step: 'home_view', ...event })).status).toBe(204);
    expect((await send({ step: 'signup_click', ...event })).status).toBe(204);

    const id = randomUUID();
    const first = await oauth(`${id}|${id}@example.com`, instagram);
    expect(first.status).toBe(200);
    const inApp = {
      headers: { [SIGNUP_CONTEXT_HEADER]: JSON.stringify({ inAppKind: 'instagram' }) },
      cookie: first.cookie,
    };
    const created = await api(t.baseUrl, 'POST', '/api/me/links', {
      ...inApp,
      body: { title: '첫 링크', url: 'https://example.com/a' },
    });
    expect(created.status).toBe(201);
    await api(t.baseUrl, 'POST', '/api/me/links', {
      ...inApp,
      body: { title: '둘째 링크', url: 'https://example.com/b' },
    });

    expect(await counts()).toEqual({
      home_view: 2,
      signup_click: 1,
      oauth_start: 1,
      oauth_callback: 1,
      signup_complete: 1,
      first_link: 1,
    });
    expect(await row('home_view')).toEqual([
      {
        source: 'instagram',
        medium: 'social',
        campaign: 'spring',
        referrer_host: 'l.instagram.com',
        in_app_kind: 'instagram',
      },
    ]);
    const carried = [
      { source: 'instagram', medium: 'social', campaign: 'spring', referrer_host: '', in_app_kind: 'instagram' },
    ];
    expect(await row('oauth_start')).toEqual(carried);
    expect(await row('oauth_callback')).toEqual(carried);
    expect(await row('signup_complete')).toEqual(carried);
    // 계정과 잇지 않으므로 첫 링크에는 유입값이 없고 앱 종류만 남습니다.
    expect(await row('first_link')).toEqual([
      { source: '', medium: '', campaign: '', referrer_host: '', in_app_kind: 'instagram' },
    ]);
    expect((await t.pool.query('SELECT 1 FROM signup_funnel_oauth_contexts')).rowCount).toBe(0);

    // 기존 계정의 재로그인은 가입 완료가 아닙니다.
    await oauth(`${id}|${id}@example.com`, instagram);
    expect(await counts()).toMatchObject({ oauth_start: 2, oauth_callback: 2, signup_complete: 1 });
  });

  it('금지 항목을 저장할 열이 없고 이메일 모양 값은 other로 모은다', async () => {
    const { rows } = await t.pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_name IN ('signup_funnel_daily','signup_funnel_oauth_contexts') ORDER BY table_name, ordinal_position`,
    );
    expect(rows.filter((r) => r.table_name === 'signup_funnel_daily').map((r) => r.column_name)).toEqual([
      'day',
      'step',
      'source',
      'medium',
      'campaign',
      'referrer_host',
      'in_app_kind',
      'events',
    ]);
    expect(rows.filter((r) => r.table_name === 'signup_funnel_oauth_contexts').map((r) => r.column_name)).toEqual([
      'state_hash',
      'source',
      'medium',
      'campaign',
      'referrer_host',
      'in_app_kind',
      'created_at',
    ]);
    await send({
      step: 'home_view',
      source: 'victim@example.com',
      medium: '',
      campaign: '',
      referrerHost: 'https://a.test/x?y=1',
      inAppKind: 'none',
    });
    expect(await row('home_view')).toEqual([
      { source: 'other', medium: '', campaign: '', referrer_host: 'other', in_app_kind: 'none' },
    ]);
  });

  it('state 형식과 쿠키는 그대로이고 유입값은 주소·state에 실리지 않는다', async () => {
    const start = await fetch(`${t.baseUrl}/api/auth/google/start`, {
      headers: { [SIGNUP_CONTEXT_HEADER]: JSON.stringify(instagram) },
    });
    const body = (await start.json()) as { authorizationUrl: string };
    expect(start.headers.getSetCookie()).toHaveLength(1);
    expect(start.headers.getSetCookie()[0]).toMatch(/^cl_oauth_state=[A-Za-z0-9_-]{43}; /);
    expect(body.authorizationUrl).not.toContain('instagram');
    expect(body.authorizationUrl).not.toContain('spring');
  });

  it('브라우저 보고는 같은 출처의 허용 단계만 받는다', async () => {
    expect((await send({ step: 'home_view' }, 'https://evil.test')).status).toBe(403);
    expect((await send({ step: 'signup_complete' })).status).toBe(400);
    expect((await send({ step: 'home_view', email: 'a@example.com' })).status).toBe(400);
    expect(await counts()).toEqual({});
  });

  it('state가 쿠키와 다르면 콜백 도달로 세지 않고, 계측 전 시작은 unknown으로 남는다', async () => {
    const response = await fetch(`${t.baseUrl}/api/auth/google/callback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'cl_oauth_state=aaa' },
      body: JSON.stringify({ code: 'x', state: 'bbb' }),
    });
    expect(response.status).toBe(400);
    expect(await counts()).toEqual({});
    const id = randomUUID();
    await login(t.baseUrl, `${id}|${id}@example.com`);
    expect(await row('oauth_callback')).toEqual([
      { source: '', medium: '', campaign: '', referrer_host: '', in_app_kind: 'unknown' },
    ]);
  });

  it('지표 제외 계정의 첫 링크는 세지 않는다', async () => {
    const id = randomUUID();
    const { cookie } = await login(t.baseUrl, `${id}|${id}@example.com`);
    await t.pool.query('UPDATE users SET metrics_excluded_at = now() WHERE email = $1', [`${id}@example.com`]);
    await api(t.baseUrl, 'POST', '/api/me/links', { cookie, body: { title: '링크', url: 'https://example.com/a' } });
    expect((await counts()).first_link).toBeUndefined();
  });

  it('보존 작업이 오래된 합계와 남은 OAuth 기록만 지운다', async () => {
    await t.pool.query(
      `INSERT INTO signup_funnel_daily (day, step, in_app_kind, events) VALUES
       ((now() AT TIME ZONE 'Asia/Seoul')::date - 400, 'home_view', 'none', 3),
       ((now() AT TIME ZONE 'Asia/Seoul')::date - 10, 'home_view', 'none', 5)`,
    );
    await t.pool.query(
      `INSERT INTO signup_funnel_oauth_contexts (state_hash, in_app_kind, created_at) VALUES
       ('old', 'none', now() - interval '20 minutes'), ('fresh', 'none', now())`,
    );
    await t.app.get(RetentionService).runOnce();
    expect((await t.pool.query('SELECT events FROM signup_funnel_daily')).rows).toEqual([{ events: 5 }]);
    expect((await t.pool.query('SELECT state_hash FROM signup_funnel_oauth_contexts')).rows).toEqual([
      { state_hash: 'fresh' },
    ]);
  });

  it('기록이 실패해도 시작과 로그인은 그대로 진행된다', async () => {
    await t.pool.query('ALTER TABLE signup_funnel_oauth_contexts RENAME TO signup_funnel_oauth_contexts_off');
    await t.pool.query('ALTER TABLE signup_funnel_daily RENAME TO signup_funnel_daily_off');
    try {
      const id = randomUUID();
      const result = await oauth(`${id}|${id}@example.com`, instagram);
      expect(result.status).toBe(200);
      expect(result.cookie).toMatch(/^cl_session=/);
      const created = await api(t.baseUrl, 'POST', '/api/me/links', {
        cookie: result.cookie,
        body: { title: '링크', url: 'https://example.com/a' },
      });
      expect(created.status).toBe(201);
      await settled();
    } finally {
      await t.pool.query('ALTER TABLE signup_funnel_oauth_contexts_off RENAME TO signup_funnel_oauth_contexts');
      await t.pool.query('ALTER TABLE signup_funnel_daily_off RENAME TO signup_funnel_daily');
    }
  });

  it('기록이 멈춰도 시작과 로그인 응답을 기다리게 하지 않는다', async () => {
    const id = randomUUID();
    const elapsed = await withFunnelLocked(async () => {
      const startedAt = Date.now();
      const result = await oauth(`${id}|${id}@example.com`, instagram, { settle: false });
      expect(result.status).toBe(200);
      expect(result.cookie).toMatch(/^cl_session=/);
      return Date.now() - startedAt;
    });
    // 콜백이 유입값을 기다리는 시간(250ms)에 여유를 더한 값입니다. 잠금이 풀릴 때까지 기다렸다면 시험이 끝나지 않습니다.
    expect(elapsed).toBeLessThan(2000);
    expect((await counts()).oauth_start).toBe(1);
  });

  it('동시 기록이 상한을 넘으면 버리고 시작 응답은 그대로 준다', async () => {
    const extra = 3;
    await withFunnelLocked(async () => {
      for (let i = 0; i < SIGNUP_FUNNEL_LIMITS.pendingWritesMax + extra; i += 1) {
        expect((await startOAuth(instagram)).status).toBe(200);
      }
    });
    expect((await counts()).oauth_start).toBe(SIGNUP_FUNNEL_LIMITS.pendingWritesMax);
  });

  it('OAuth 유입 기록은 행 상한을 넘지 않고 콜백은 유입값 없이 진행하며 만료된 행은 자리를 내준다', async () => {
    const seed = (age: string) =>
      t.pool.query(
        `INSERT INTO signup_funnel_oauth_contexts (state_hash, in_app_kind, created_at)
         SELECT 'seed' || g, 'none', now() - $2::interval FROM generate_series(1, $1::int) g`,
        [SIGNUP_FUNNEL_LIMITS.oauthContextsMax, age],
      );
    const total = async () => {
      await settled();
      return (await t.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM signup_funnel_oauth_contexts')).rows[0]
        .n;
    };
    await seed('0 seconds');
    const id = randomUUID();
    const result = await oauth(`${id}|${id}@example.com`, instagram);
    expect(result.status).toBe(200);
    expect(await total()).toBe(SIGNUP_FUNNEL_LIMITS.oauthContextsMax);
    expect(await row('oauth_callback')).toEqual([
      { source: '', medium: '', campaign: '', referrer_host: '', in_app_kind: 'unknown' },
    ]);

    await t.pool.query('TRUNCATE signup_funnel_oauth_contexts');
    await seed('20 minutes');
    await startOAuth(instagram);
    expect(await total()).toBe(1);
  });

  it('하루 행 상한이 차도 이미 있는 행에는 더하고 새 조합만 other로 모은다', async () => {
    await t.pool.query(
      `INSERT INTO signup_funnel_daily (day, step, source, in_app_kind, events)
       SELECT (now() AT TIME ZONE 'Asia/Seoul')::date, 'home_view', 'seed' || g, 'none', 1 FROM generate_series(1, $1::int) g`,
      [SIGNUP_FUNNEL_LIMITS.dailyRowsMax],
    );
    expect((await send({ step: 'home_view', source: 'seed1', inAppKind: 'none' })).status).toBe(204);
    const existing = await t.pool.query<{ events: number }>(
      "SELECT events FROM signup_funnel_daily WHERE step = 'home_view' AND source = 'seed1'",
    );
    expect(existing.rows).toEqual([{ events: 2 }]);
    expect(
      (await t.pool.query("SELECT 1 FROM signup_funnel_daily WHERE step = 'home_view' AND source = 'other'")).rowCount,
    ).toBe(0);
    expect((await send({ step: 'signup_click', source: 'new-value', campaign: 'c', inAppKind: 'none' })).status).toBe(
      204,
    );
    expect(await row('signup_click')).toEqual([
      { source: 'other', medium: '', campaign: '', referrer_host: '', in_app_kind: 'none' },
    ]);
  });

  it('분당 전체 상한을 넘으면 429로 거절한다', async () => {
    await t.pool.query('INSERT INTO landing_event_limits (bucket, used) VALUES ($1, $2)', [
      'signup-funnel:global',
      SIGNUP_FUNNEL_LIMITS.eventsPerMinute,
    ]);
    expect((await send({ step: 'home_view' })).status).toBe(429);
    expect(await counts()).toEqual({});
  });
});
