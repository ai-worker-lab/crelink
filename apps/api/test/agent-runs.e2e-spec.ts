import {
  AgentRunDetail,
  AgentRunPage,
  AgentRunView,
  AiOperatorMetrics,
  AiOperatorStatus,
  ApiError,
  CreatorLandingState,
} from '@crelink/shared';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

type Run = AgentRunView & Partial<ApiError>;

/** AI 실행 기록·멈춤 스위치·토큰 폐기(0103, docs/specs/crelink-ai-operator.md `경로`). */
describe('AI 실행 기록과 멈춤 스위치 (R23 ④⑤⑥)', () => {
  let t: TestApp;
  let operator: string;
  let ai: { userId: string; token: string; tokenId: string; email: string };

  const start = (token = ai.token, body: Record<string, unknown> = { trigger: 'schedule' }) =>
    api<Run>(t.baseUrl, 'POST', '/api/admin/agent-runs', { token, body });
  const patch = (runId: string, body: unknown, token = ai.token) =>
    api<Run>(t.baseUrl, 'PATCH', `/api/admin/agent-runs/${runId}`, { token, body });
  const setPause = (paused: boolean, reason?: string) =>
    api<AiOperatorStatus & Partial<ApiError>>(t.baseUrl, 'PUT', '/api/admin/ai-operator/pause', {
      cookie: operator,
      body: { paused, reason },
    });
  const status = async () =>
    (await api<AiOperatorStatus>(t.baseUrl, 'GET', '/api/admin/ai-operator', { cookie: operator })).body;

  beforeAll(async () => {
    t = await createTestApp();
    operator = (await login(t.baseUrl, 'runs-op|operator@example.com')).cookie!;
    ai = await createAiOperator(t.pool);
  });

  afterEach(async () => {
    await t.pool.query('DELETE FROM agent_runs');
    await t.pool.query('UPDATE ai_operator_settings SET paused = false, paused_reason = NULL, updated_by = NULL');
  });

  afterAll(async () => {
    await t?.close();
  });

  it('시작은 running을 만들고 겹치면 409 agent_run_in_progress, 입력 오류는 400', async () => {
    const first = await start(ai.token, { trigger: 'manual', host: 'mac-mini', model: 'opus' });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      status: 'running',
      trigger: 'manual',
      host: 'mac-mini',
      startedAt: expect.any(String),
      endedAt: null,
      pausedCount: 1,
      summary: null,
      actions: [],
      nextSteps: [],
      refs: [],
      model: 'opus',
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      actorEmail: ai.email,
      operatorActionCount: 0,
    });
    const second = await start();
    expect([second.status, second.body.code]).toEqual([409, 'agent_run_in_progress']);
    // 다른 AI 계정도 겹칠 수 없습니다.
    const other = await createAiOperator(t.pool, 'runs-other@crelink.invalid');
    expect((await start(other.token)).body.code).toBe('agent_run_in_progress');

    for (const body of [
      {},
      { trigger: 'cron' },
      { trigger: 'manual', host: 'h'.repeat(61) },
      { trigger: 'manual', model: 1 },
    ]) {
      const bad = await start(ai.token, body);
      expect([bad.status, bad.body.code]).toEqual([400, 'validation_failed']);
    }
  });

  it('시작 뒤 90분이 지난 running은 다음 시작 때 멈춤과 관계없이 먼저 abandoned로 닫힌다', async () => {
    const stale = (await start()).body.id;
    await t.pool.query("UPDATE agent_runs SET started_at = now() - interval '91 minutes' WHERE id = $1", [stale]);
    const next = await start();
    expect([next.status, next.body.status]).toEqual([201, 'running']);
    const closed = await t.pool.query<{ status: string; ended: boolean }>(
      'SELECT status, ended_at IS NOT NULL AS ended FROM agent_runs WHERE id = $1',
      [stale],
    );
    expect(closed.rows[0]).toEqual({ status: 'abandoned', ended: true });

    // 멈춤 중에도 먼저 포기 처리합니다.
    await t.pool.query("UPDATE agent_runs SET started_at = now() - interval '2 hours' WHERE id = $1", [next.body.id]);
    await setPause(true);
    const paused = await start();
    expect([paused.status, paused.body.status]).toEqual([201, 'paused']);
    const abandoned = await t.pool.query('SELECT status FROM agent_runs WHERE id = $1', [next.body.id]);
    expect(abandoned.rows[0].status).toBe('abandoned');
  });

  it('멈춤 중 시작은 paused 기록만 남기고 같은 멈춤 동안은 한 행으로 합치며, 다시 멈추면 새 행', async () => {
    await setPause(true, '점검');
    const first = await start();
    expect(first.body).toMatchObject({ status: 'paused', pausedCount: 1, endedAt: expect.any(String) });
    const second = await start();
    expect(second.body).toMatchObject({ id: first.body.id, status: 'paused', pausedCount: 2 });
    expect(new Date(second.body.endedAt!).getTime()).toBeGreaterThanOrEqual(new Date(first.body.endedAt!).getTime());
    // 같은 값으로 다시 저장해도 같은 멈춤입니다.
    await setPause(true, '점검');
    expect((await start()).body).toMatchObject({ id: first.body.id, pausedCount: 3 });

    await setPause(false);
    await setPause(true);
    const third = await start();
    expect(third.body.id).not.toBe(first.body.id);
    expect(third.body.pausedCount).toBe(1);
    expect((await t.pool.query("SELECT 1 FROM agent_runs WHERE status = 'running'")).rowCount).toBe(0);
  });

  it('갱신: 바뀐 필드만 저장하고 status로 닫으며, 닫힌 실행 409·다른 계정 403·없는 실행 404·refs URL은 http(s)만', async () => {
    const runId = (await start()).body.id;
    const updated = await patch(runId, {
      summary: '  첫 요약  ',
      actions: ['추가 슬롯 조정'],
      nextSteps: ['지표 확인'],
      refs: [
        { kind: 'pr', label: 'PR #70', url: 'https://github.com/example/repo/pull/70' },
        { kind: 'work_item', label: '0101' },
      ],
      costUsd: 1.2345,
      inputTokens: 12000,
      outputTokens: 3400,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      status: 'running',
      summary: '첫 요약',
      actions: ['추가 슬롯 조정'],
      nextSteps: ['지표 확인'],
      refs: [
        { kind: 'pr', label: 'PR #70', url: 'https://github.com/example/repo/pull/70' },
        { kind: 'work_item', label: '0101', url: null },
      ],
      costUsd: 1.2345,
      inputTokens: 12000,
      outputTokens: 3400,
      endedAt: null,
    });
    expect(typeof updated.body.costUsd).toBe('number');
    const partial = await patch(runId, { model: 'sonnet' });
    expect(partial.body).toMatchObject({ summary: '첫 요약', model: 'sonnet' });

    for (const body of [
      { refs: [{ kind: 'pr', label: 'x', url: 'javascript:alert(1)' }] },
      { refs: [{ kind: 'pr', label: 'x', url: 'ftp://example.com/a' }] },
      { refs: [{ kind: 'link', label: 'x' }] },
      { refs: [{ kind: 'pr', label: '' }] },
      { status: 'running' },
      { status: 'abandoned' },
      { summary: 'a'.repeat(2001) },
      { actions: Array.from({ length: 31 }, () => 'a') },
      { actions: ['a'.repeat(301)] },
      { costUsd: -1 },
      { costUsd: '1' },
      { inputTokens: 1.5 },
    ]) {
      const bad = await patch(runId, body);
      expect([JSON.stringify(body).slice(0, 40), bad.status, bad.body.code]).toEqual([
        JSON.stringify(body).slice(0, 40),
        400,
        'validation_failed',
      ]);
    }

    const other = await createAiOperator(t.pool, 'patch-other@crelink.invalid');
    const foreign = await patch(runId, { summary: '남의 실행' }, other.token);
    expect([foreign.status, foreign.body.code]).toEqual([403, 'forbidden']);
    const human = await api(t.baseUrl, 'PATCH', `/api/admin/agent-runs/${runId}`, {
      cookie: operator,
      body: { summary: 'x' },
    });
    expect([human.status, human.body.code]).toEqual([403, 'forbidden']);
    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const missing = await patch(id, { summary: 'x' });
      expect([missing.status, missing.body.code]).toEqual([404, 'agent_run_not_found']);
    }

    // 멈춤 중에도, 실행 헤더 없이도 닫을 수 있습니다.
    await setPause(true);
    const closed = await patch(runId, { status: 'succeeded', summary: '끝' });
    expect(closed.body).toMatchObject({ status: 'succeeded', summary: '끝', endedAt: expect.any(String) });
    const again = await patch(runId, { summary: '다시' });
    expect([again.status, again.body.code]).toEqual([409, 'agent_run_closed']);
  });

  it('목록은 최신순 20개와 커서, 상세는 그 실행의 행동 기록을 함께 주고 없으면 404', async () => {
    await t.pool.query(
      `INSERT INTO agent_runs (actor_user_id, status, trigger, started_at, ended_at, summary)
       SELECT $1, 'succeeded', 'schedule', now() - interval '1 day' + (g / 3) * interval '1 second', now(), 'run ' || g
       FROM generate_series(1, 24) g`,
      [ai.userId],
    );
    const runId = (await start()).body.id;
    const creator = await login(t.baseUrl, 'runs-creator|runs-creator@example.com');
    const slots = await api(t.baseUrl, 'PUT', `/api/admin/creators/${creator.body.user!.id}/extra-slots`, {
      token: ai.token,
      runId,
      body: { extraSlots: 2 },
    });
    expect(slots.status).toBe(200);

    const first = await api<AgentRunPage>(t.baseUrl, 'GET', '/api/admin/agent-runs', { cookie: operator });
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0]).toMatchObject({ id: runId, status: 'running', operatorActionCount: 1 });
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await api<AgentRunPage>(t.baseUrl, 'GET', `/api/admin/agent-runs?cursor=${first.body.nextCursor}`, {
      token: ai.token,
    });
    expect(second.body.items).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();
    const ids = new Set([...first.body.items, ...second.body.items].map((item) => item.id));
    expect(ids.size).toBe(25);
    const bad = await api(t.baseUrl, 'GET', '/api/admin/agent-runs?cursor=abc', { cookie: operator });
    expect([bad.status, bad.body.code]).toEqual([400, 'validation_failed']);

    const detail = await api<AgentRunDetail>(t.baseUrl, 'GET', `/api/admin/agent-runs/${runId}`, { cookie: operator });
    expect(detail.status).toBe(200);
    expect(detail.body.operatorActions).toEqual([
      expect.objectContaining({
        action: 'creator.extra_slots',
        actor: { kind: 'ai', userId: ai.userId, email: ai.email },
        runId,
        subjectUserId: creator.body.user!.id,
        before: { extraSlots: 0 },
        after: { extraSlots: 2 },
      }),
    ]);
    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const missing = await api(t.baseUrl, 'GET', `/api/admin/agent-runs/${id}`, { cookie: operator });
      expect([missing.status, missing.body.code]).toEqual([404, 'agent_run_not_found']);
    }
  });

  it('상태: 멈춤·바꾼 사람, AI 계정과 토큰(원문 없음), 진행 중·마지막 실행', async () => {
    const empty = await status();
    expect(empty).toMatchObject({
      paused: false,
      pausedReason: null,
      updatedBy: null,
      runningRun: null,
      lastRun: null,
    });
    expect(empty.accounts).toEqual(
      expect.arrayContaining([
        {
          userId: ai.userId,
          email: ai.email,
          createdAt: expect.any(String),
          suspended: false,
          tokens: [
            {
              id: ai.tokenId,
              label: '시험',
              prefix: ai.token.slice(0, 12),
              createdAt: expect.any(String),
              lastUsedAt: expect.any(String),
              revokedAt: null,
            },
          ],
        },
      ]),
    );
    expect(JSON.stringify(empty)).not.toContain(ai.token);

    const done = (await start()).body.id;
    await patch(done, { status: 'failed' });
    const running = (await start()).body.id;
    const now = await status();
    expect(now.runningRun?.id).toBe(running);
    expect(now.lastRun).toMatchObject({ id: done, status: 'failed' });

    const paused = await setPause(true, '  배포 점검  ');
    expect(paused.body).toMatchObject({ paused: true, pausedReason: '배포 점검', updatedBy: 'operator@example.com' });
    const action = await t.pool.query(
      "SELECT actor_kind, before, after FROM operator_actions WHERE action = 'ai_operator.pause' ORDER BY created_at DESC LIMIT 1",
    );
    expect(action.rows[0]).toEqual({
      actor_kind: 'human',
      before: { paused: false, reason: null },
      after: { paused: true, reason: '배포 점검' },
    });
    const resumed = await setPause(false, '무시되는 사유');
    expect(resumed.body).toMatchObject({ paused: false, pausedReason: null });
    for (const body of [{}, { paused: 'yes' }, { paused: true, reason: 'a'.repeat(201) }]) {
      const bad = await api(t.baseUrl, 'PUT', '/api/admin/ai-operator/pause', { cookie: operator, body });
      expect([bad.status, bad.body.code]).toEqual([400, 'validation_failed']);
    }
    const byAi = await api(t.baseUrl, 'PUT', '/api/admin/ai-operator/pause', {
      token: ai.token,
      runId: running,
      body: { paused: false },
    });
    expect([byAi.status, byAi.body.code]).toEqual([403, 'forbidden']);
  });

  it('토큰 폐기: 사람만, 멱등, 없거나 형식이 틀리면 404, 폐기 뒤 그 토큰은 401', async () => {
    const victim = await createAiOperator(t.pool, 'revoke@crelink.invalid');
    const path = `/api/admin/ai-operator/tokens/${victim.tokenId}/revoke`;
    const byAi = await api(t.baseUrl, 'PUT', path, { token: victim.token });
    expect([byAi.status, byAi.body.code]).toEqual([403, 'forbidden']);

    const revoked = await api<AiOperatorStatus>(t.baseUrl, 'PUT', path, { cookie: operator });
    expect(revoked.status).toBe(200);
    const account = revoked.body.accounts.find((item) => item.userId === victim.userId)!;
    expect(account.tokens[0]).toMatchObject({ id: victim.tokenId, revokedAt: expect.any(String) });
    const firstRevokedAt = account.tokens[0].revokedAt;
    expect((await api(t.baseUrl, 'GET', '/api/me', { token: victim.token })).status).toBe(401);

    const again = await api<AiOperatorStatus>(t.baseUrl, 'PUT', path, { cookie: operator });
    expect(again.status).toBe(200);
    expect(again.body.accounts.find((item) => item.userId === victim.userId)!.tokens[0].revokedAt).toBe(firstRevokedAt);
    const actions = await t.pool.query(
      "SELECT actor_kind, actor_email, target_id, subject_user_id, after FROM operator_actions WHERE action = 'ai_operator.token_revoke' ORDER BY created_at",
    );
    expect(actions.rows).toHaveLength(2);
    expect(actions.rows[0]).toEqual({
      actor_kind: 'human',
      actor_email: 'operator@example.com',
      target_id: victim.tokenId,
      subject_user_id: victim.userId,
      after: { id: victim.tokenId, label: '시험', prefix: victim.token.slice(0, 12), revoked: true },
    });
    expect(JSON.stringify(actions.rows)).not.toContain(victim.token);

    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const missing = await api(t.baseUrl, 'PUT', `/api/admin/ai-operator/tokens/${id}/revoke`, { cookie: operator });
      expect([missing.status, missing.body.code]).toEqual([404, 'api_token_not_found']);
    }
  });
});

/** 지표(0103, 설계 `지표 정의`). 다른 시험의 계정이 섞이지 않게 앱을 따로 띄웁니다. */
describe('운영자 지표 GET /api/admin/metrics (R23 ⑧, PRD 목표)', () => {
  let t: TestApp;
  let operator: string;
  let n = 0;

  const creator = async (setup: (user: { cookie: string; userId: string; shortLinkId: string }) => Promise<void>) => {
    n += 1;
    const result = await login(t.baseUrl, `metrics-${n}|metrics${n}@example.com`);
    const user = { cookie: result.cookie!, userId: result.body.user!.id, shortLinkId: '' };
    user.shortLinkId = (
      await t.pool.query<{ id: string }>('SELECT id FROM short_links WHERE user_id = $1', [user.userId])
    ).rows[0].id;
    await setup(user);
    return user;
  };
  const addLink = async (cookie: string, body: Record<string, unknown>) =>
    (await api<{ id: string }>(t.baseUrl, 'POST', '/api/me/links', { cookie, body })).body.id;
  const metrics = async () =>
    (await api<AiOperatorMetrics>(t.baseUrl, 'GET', '/api/admin/metrics', { cookie: operator })).body;
  const traffic = async (shortLinkId: string, table: 'visits' | 'link_clicks', ages: string[]) => {
    for (const age of ages) {
      await t.pool.query(
        table === 'visits'
          ? `INSERT INTO visits (short_link_id, slug, visitor_id, occurred_at) VALUES ($1, 's', gen_random_uuid(), now() - $2::interval)`
          : `INSERT INTO link_clicks (link_public_id, short_link_id, visitor_id, occurred_at) VALUES ('x', $1, gen_random_uuid(), now() - $2::interval)`,
        [shortLinkId, age],
      );
    }
  };

  beforeAll(async () => {
    t = await createTestApp();
    operator = (await login(t.baseUrl, 'metrics-op|operator@example.com')).cookie!;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('실사용자 조건(보이는 링크·포트폴리오, 정지·제외·숨김·차단·AI·운영자 제외)과 가입·방문·클릭·광고 기간', async () => {
    const empty = await metrics();
    expect(empty).toEqual({
      generatedAt: expect.any(String),
      goal: { realUsers: 100 },
      realUsers: 0,
      creators: { total: 0, excluded: 0 },
      signups: { last24Hours: 0, last7Days: 0, last30Days: 0 },
      visits: { last7Days: 0, last30Days: 0 },
      linkClicks: { last7Days: 0, last30Days: 0 },
      adBanners: { live: 0, impressionsLast7Days: 0, clicksLast7Days: 0 },
      events: [{ key: 'slot_event_applications', label: '링크 슬롯 이벤트 신청', value: 0 }],
    });

    // 실사용자: 보이는 링크.
    const real = await creator(async (user) => {
      await addLink(user.cookie, { title: 'a', url: 'https://a.example' });
      await traffic(user.shortLinkId, 'visits', ['1 hour', '3 days', '10 days', '40 days']);
      await traffic(user.shortLinkId, 'link_clicks', ['2 days', '20 days', '31 days']);
    });
    // 실사용자: 포트폴리오만.
    await creator(async (user) => {
      await api(t.baseUrl, 'POST', '/api/me/portfolio', { cookie: user.cookie, body: { title: '작품' } });
      await t.pool.query("UPDATE users SET created_at = now() - interval '3 days' WHERE id = $1", [user.userId]);
    });
    // 아님: 숨긴 링크만, 차단된 링크만, 아무것도 없음.
    await creator(async (user) => {
      await addLink(user.cookie, { title: 'h', url: 'https://h.example', hidden: true });
      await t.pool.query("UPDATE users SET created_at = now() - interval '10 days' WHERE id = $1", [user.userId]);
    });
    await creator(async (user) => {
      const linkId = await addLink(user.cookie, { title: 'b', url: 'https://b.example' });
      await t.pool.query('UPDATE links SET blocked_at = now() WHERE id = $1', [linkId]);
      await t.pool.query("UPDATE users SET created_at = now() - interval '40 days' WHERE id = $1", [user.userId]);
    });
    await creator(async () => {});
    // 아님: 정지(크리에이터 수·가입에는 들어감).
    await creator(async (user) => {
      await addLink(user.cookie, { title: 's', url: 'https://s.example' });
      await t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [user.userId]);
    });
    // 아님: 지표 제외(가입·방문·클릭에서도 빠짐).
    await creator(async (user) => {
      await addLink(user.cookie, { title: 'e', url: 'https://e.example' });
      await traffic(user.shortLinkId, 'visits', ['1 hour']);
      await traffic(user.shortLinkId, 'link_clicks', ['1 hour']);
      const excluded = await api(t.baseUrl, 'PUT', `/api/admin/creators/${user.userId}/metrics-exclusion`, {
        cookie: operator,
        body: { excluded: true },
      });
      expect(excluded.status).toBe(200);
    });
    // 아님: AI 계정(링크가 있어도), 사람 운영자.
    const ai = await createAiOperator(t.pool, 'metrics-ai@crelink.invalid');
    const aiLanding = await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { token: ai.token });
    await t.pool.query(
      `INSERT INTO links (user_id, block_id, public_id, title, url, host, position)
       SELECT $1, b.id, 'aiaiaiaiai', 'ai', 'https://ai.example', 'ai.example', 0
       FROM landing_blocks b JOIN landings l ON l.id = b.landing_id WHERE l.user_id = $1`,
      [ai.userId],
    );
    expect(aiLanding.status).toBe(200);

    // 광고 배너: 게시 중 1, 끝남 1, 예약 1. 서울 날짜 오늘 포함 7일(6일 전까지)만 셉니다.
    const image = await t.pool.query<{ id: string }>(
      `INSERT INTO files (owner_user_id, storage_key, content_type, size) VALUES ($1, 'k', 'image/png', 1) RETURNING id`,
      [real.userId],
    );
    const banner = (publicId: string, starts: string, ends: string | null) =>
      t.pool.query<{ id: string }>(
        `INSERT INTO ad_banners (public_id, image_file_id, alt, url, host, starts_at, ends_at, sort_order)
         VALUES ($1, $2, 'a', 'https://ad.example', 'ad.example', now() + $3::interval, now() + $4::interval, 0) RETURNING id`,
        [publicId, image.rows[0].id, starts, ends],
      );
    const live = (await banner('adlive0001', '-1 day', null)).rows[0].id;
    await banner('adended001', '-3 days', '-1 day');
    await banner('adsched001', '1 day', null);
    await t.pool.query(
      `INSERT INTO ad_banner_daily_stats (day, ad_banner_id, landing_public_id, impressions, clicks)
       VALUES ((now() AT TIME ZONE 'Asia/Seoul')::date, $1, 'p1', 10, 2),
              ((now() AT TIME ZONE 'Asia/Seoul')::date - 6, $1, 'p1', 5, 1),
              ((now() AT TIME ZONE 'Asia/Seoul')::date - 7, $1, 'p1', 100, 50)`,
      [live],
    );
    // R24 링크 슬롯 이벤트 신청 수(시드 이벤트는 열려 있음).
    const entry = await api(t.baseUrl, 'POST', '/api/me/slot-event/entry', { cookie: real.cookie });
    expect(entry.status).toBe(201);

    const result = await metrics();
    expect(result).toEqual({
      generatedAt: expect.any(String),
      goal: { realUsers: 100 },
      realUsers: 2,
      creators: { total: 7, excluded: 1 },
      // 지표 대상(제외 1명 빼고 6명): 지금 가입 3(링크·없음·정지), 3일 전 1(포트폴리오), 10일 전 1(숨김), 40일 전 1(차단).
      signups: { last24Hours: 3, last7Days: 4, last30Days: 5 },
      visits: { last7Days: 2, last30Days: 3 },
      linkClicks: { last7Days: 1, last30Days: 2 },
      adBanners: { live: 1, impressionsLast7Days: 15, clicksLast7Days: 3 },
      events: [{ key: 'slot_event_applications', label: '링크 슬롯 이벤트 신청', value: 1 }],
    });
    const byAi = await api(t.baseUrl, 'GET', '/api/admin/metrics', { token: ai.token });
    expect(byAi.status).toBe(200);
  });
});
