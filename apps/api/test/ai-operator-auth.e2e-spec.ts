import { AgentRunView, ApiError, CreatorLandingState, MeResponse, OperatorCreatorDetail } from '@crelink/shared';
import { SYSTEM_ACTOR } from '../src/ai-operator/audit';
import { issueApiToken } from '../src/ai-operator/tokens';
import { withTransaction } from '../src/database';
import { PNG_STILL } from './image-samples';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

/** AI 운영자 인증·실행 헤더·멈춤(0101, docs/specs/crelink-ai-operator.md `인증·권한 규칙`). */
describe('AI 운영자 토큰 인증과 행위자 규칙 (R23 ①⑥)', () => {
  let t: TestApp;
  let operator: string;
  let ai: { userId: string; token: string; tokenId: string; email: string };
  let creator: { cookie: string; userId: string; publicId: string };

  const startRun = async (token = ai.token) => {
    const started = await api<AgentRunView>(t.baseUrl, 'POST', '/api/admin/agent-runs', {
      token,
      body: { trigger: 'manual' },
    });
    expect(started.status).toBe(201);
    return started.body.id;
  };
  const extraSlots = (options: { token?: string; runId?: string; cookie?: string }, extra = 1) =>
    api<OperatorCreatorDetail & Partial<ApiError>>(
      t.baseUrl,
      'PUT',
      `/api/admin/creators/${creator.userId}/extra-slots`,
      {
        ...options,
        body: { extraSlots: extra },
      },
    );
  const lastUsed = async (tokenId: string) =>
    (await t.pool.query<{ last_used_at: Date | null }>('SELECT last_used_at FROM api_tokens WHERE id = $1', [tokenId]))
      .rows[0].last_used_at;

  beforeAll(async () => {
    t = await createTestApp();
    operator = (await login(t.baseUrl, 'auth-op|operator@example.com')).cookie!;
    const creatorLogin = await login(t.baseUrl, 'auth-creator|creator@example.com');
    const landing = await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', {
      cookie: creatorLogin.cookie,
    });
    creator = {
      cookie: creatorLogin.cookie!,
      userId: creatorLogin.body.user!.id,
      publicId: landing.body.landing.publicId,
    };
    ai = await createAiOperator(t.pool);
  });

  afterEach(async () => {
    await t.pool.query("UPDATE agent_runs SET status = 'failed', ended_at = now() WHERE status = 'running'");
    await t.pool.query('UPDATE ai_operator_settings SET paused = false, paused_reason = NULL');
  });

  afterAll(async () => {
    await t?.close();
  });

  it('유효한 토큰은 AI 운영자로 통과하고 Bearer가 있으면 쿠키를 보지 않는다', async () => {
    const me = await api<MeResponse>(t.baseUrl, 'GET', '/api/me', { token: ai.token });
    expect([me.status, me.body]).toEqual([200, { id: ai.userId, email: ai.email, role: 'operator' }]);
    const list = await api(t.baseUrl, 'GET', '/api/admin/creators', { token: ai.token });
    expect(list.status).toBe(200);
    // 소문자 스킴도 받습니다.
    const lower = await api(t.baseUrl, 'GET', '/api/me', { headers: { authorization: `bearer ${ai.token}` } });
    expect(lower.status).toBe(200);
    // 잘못된 Bearer와 유효한 쿠키를 함께 보내도 쿠키로 넘어가지 않습니다.
    const mixed = await api(t.baseUrl, 'GET', '/api/me', { token: 'crl_ai_wrong', cookie: operator });
    expect([mixed.status, mixed.body.code]).toEqual([401, 'unauthenticated']);
  });

  it('형식 오류·빈 토큰·없는 토큰·폐기·정지·사람 계정 토큰은 401', async () => {
    const human = await withTransaction(t.pool, (client) =>
      issueApiToken(client, SYSTEM_ACTOR, { userId: creator.userId, label: '사람' }),
    );
    const revoked = await createAiOperator(t.pool, 'revoked@crelink.invalid');
    await t.pool.query('UPDATE api_tokens SET revoked_at = now() WHERE id = $1', [revoked.tokenId]);
    const suspended = await createAiOperator(t.pool, 'suspended@crelink.invalid');
    await t.pool.query('UPDATE users SET suspended_at = now() WHERE id = $1', [suspended.userId]);
    const unknown = `crl_ai_${'A'.repeat(43)}`;

    const headers = [
      `Bearer ${ai.token.slice(0, -1)}`,
      `Bearer ${ai.token}x`,
      'Bearer',
      'Bearer    ',
      `Bearer ${unknown}`,
      `Bearer ${revoked.token}`,
      `Bearer ${suspended.token}`,
      `Bearer ${human.token}`,
    ];
    for (const authorization of headers) {
      const response = await api(t.baseUrl, 'GET', '/api/me', { headers: { authorization } });
      expect([authorization, response.status, response.body.code]).toEqual([authorization, 401, 'unauthenticated']);
    }
    // Bearer가 아닌 스킴은 쿠키 인증으로 처리합니다(쿠키 없으면 401).
    const basic = await api(t.baseUrl, 'GET', '/api/me', { headers: { authorization: 'Basic eDp5' } });
    expect(basic.status).toBe(401);
  });

  it('OptionalSessionGuard도 잘못된 Bearer를 비회원으로 통과시키지 않고 401', async () => {
    const path = `/api/landings/${creator.publicId}/guestbook`;
    expect((await api(t.baseUrl, 'GET', path)).status).toBe(200);
    expect((await api(t.baseUrl, 'GET', path, { token: ai.token })).status).toBe(200);
    const bad = await api(t.baseUrl, 'GET', path, { token: 'crl_ai_short' });
    expect([bad.status, bad.body.code]).toEqual([401, 'unauthenticated']);
  });

  it('last_used_at은 1분에 한 번만 갱신한다', async () => {
    const fresh = await createAiOperator(t.pool, 'fresh@crelink.invalid');
    expect(await lastUsed(fresh.tokenId)).toBeNull();
    await api(t.baseUrl, 'GET', '/api/me', { token: fresh.token });
    const first = await lastUsed(fresh.tokenId);
    expect(first).toBeInstanceOf(Date);

    await t.pool.query("UPDATE api_tokens SET last_used_at = now() - interval '30 seconds' WHERE id = $1", [
      fresh.tokenId,
    ]);
    const recent = await lastUsed(fresh.tokenId);
    await api(t.baseUrl, 'GET', '/api/me', { token: fresh.token });
    expect(await lastUsed(fresh.tokenId)).toEqual(recent);

    await t.pool.query("UPDATE api_tokens SET last_used_at = now() - interval '2 minutes' WHERE id = $1", [
      fresh.tokenId,
    ]);
    const old = (await lastUsed(fresh.tokenId))!;
    await api(t.baseUrl, 'GET', '/api/me', { token: fresh.token });
    expect((await lastUsed(fresh.tokenId))!.getTime()).toBeGreaterThan(old.getTime());
  });

  it('AI의 상태 변경 요청은 자기 계정의 90분 안 running 실행 헤더가 있어야 하고(운영자·크리에이터 API), 조회는 헤더 없이 된다', async () => {
    expect((await api(t.baseUrl, 'GET', `/api/admin/creators/${creator.userId}`, { token: ai.token })).status).toBe(
      200,
    );
    expect((await api(t.baseUrl, 'GET', '/api/me/landing', { token: ai.token })).status).toBe(200);

    const missing = await extraSlots({ token: ai.token });
    expect([missing.status, missing.body]).toMatchObject([409, { code: 'agent_run_required' }]);
    const meWrite = await api(t.baseUrl, 'PATCH', '/api/me/landing', { token: ai.token, body: { bio: 'AI' } });
    expect([meWrite.status, meWrite.body.code]).toEqual([409, 'agent_run_required']);
    // 업로드도 본문을 읽기 전에 거절합니다(파일이 없어 400이 아니라 409).
    const upload = await fetch(`${t.baseUrl}/api/me/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ai.token}` },
    });
    expect([upload.status, await upload.json()]).toMatchObject([409, { code: 'agent_run_required' }]);
    const garbage = await extraSlots({ token: ai.token, runId: 'not-a-uuid' });
    expect(garbage.status).toBe(409);

    // 다른 AI 계정의 실행 id는 쓸 수 없습니다.
    const other = await createAiOperator(t.pool, 'other@crelink.invalid');
    const otherRun = await startRun(other.token);
    const foreign = await extraSlots({ token: ai.token, runId: otherRun });
    expect([foreign.status, foreign.body]).toMatchObject([409, { code: 'agent_run_required' }]);
    await t.pool.query("UPDATE agent_runs SET status = 'succeeded', ended_at = now() WHERE id = $1", [otherRun]);

    const runId = await startRun();
    const ok = await extraSlots({ token: ai.token, runId }, 2);
    expect([ok.status, ok.body.extraLinkSlots]).toEqual([200, 2]);
    const meOk = await api<CreatorLandingState>(t.baseUrl, 'PATCH', '/api/me/landing', {
      token: ai.token,
      runId,
      body: { bio: 'AI 운영자' },
    });
    expect([meOk.status, meOk.body.landing.bio]).toEqual([200, 'AI 운영자']);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG_STILL)], { type: 'image/png' }), 'image.png');
    const uploaded = await fetch(`${t.baseUrl}/api/me/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ai.token}`, 'X-Crelink-Agent-Run': runId },
      body: form,
    });
    expect(uploaded.status).toBe(201);

    // 시작 뒤 90분이 지난 실행은 실행 헤더로 쓸 수 없습니다.
    await t.pool.query("UPDATE agent_runs SET started_at = now() - interval '91 minutes' WHERE id = $1", [runId]);
    const stale = await extraSlots({ token: ai.token, runId });
    expect([stale.status, stale.body]).toMatchObject([409, { code: 'agent_run_required' }]);

    // 닫힌 실행도 안 됩니다.
    await t.pool.query(
      "UPDATE agent_runs SET status = 'succeeded', ended_at = now(), started_at = now() WHERE id = $1",
      [runId],
    );
    expect((await extraSlots({ token: ai.token, runId })).status).toBe(409);
  });

  it('멈춤이면 AI 상태 변경 요청은 409 ai_operator_paused(실행 헤더 검사보다 먼저), 실행 시작·갱신은 된다', async () => {
    const runId = await startRun();
    const paused = await api(t.baseUrl, 'PUT', '/api/admin/ai-operator/pause', {
      cookie: operator,
      body: { paused: true, reason: '점검' },
    });
    expect(paused.status).toBe(200);

    for (const options of [{ token: ai.token, runId }, { token: ai.token }]) {
      const blocked = await extraSlots(options);
      expect([blocked.status, blocked.body]).toMatchObject([409, { code: 'ai_operator_paused' }]);
    }
    const meWrite = await api(t.baseUrl, 'PATCH', '/api/me/landing', { token: ai.token, runId, body: { bio: 'x' } });
    expect([meWrite.status, meWrite.body.code]).toEqual([409, 'ai_operator_paused']);
    // 조회와 실행 기록 닫기는 됩니다.
    expect((await api(t.baseUrl, 'GET', '/api/admin/ai-operator', { token: ai.token })).status).toBe(200);
    const closed = await api<AgentRunView>(t.baseUrl, 'PATCH', `/api/admin/agent-runs/${runId}`, {
      token: ai.token,
      body: { status: 'failed', summary: '멈춤으로 중단' },
    });
    expect([closed.status, closed.body.status]).toEqual([200, 'failed']);
    // 사람 운영자 쓰기는 멈춤과 관계없습니다.
    expect((await extraSlots({ cookie: operator }, 0)).status).toBe(200);
  });

  it('오류 우선순위: 401 → 403(운영자 아님) → 403(사람·AI 전용) → 409 멈춤 → 409 실행 헤더', async () => {
    await t.pool.query("UPDATE ai_operator_settings SET paused = true, paused_reason = '점검'");
    // 사람 전용 경로: 멈춤·실행 헤더 없음보다 403이 먼저입니다.
    const pause = await api(t.baseUrl, 'PUT', '/api/admin/ai-operator/pause', {
      token: ai.token,
      body: { paused: false },
    });
    expect([pause.status, pause.body.code]).toEqual([403, 'forbidden']);
    const exclusion = await api(t.baseUrl, 'PUT', `/api/admin/creators/${creator.userId}/metrics-exclusion`, {
      token: ai.token,
      body: { excluded: true },
    });
    expect([exclusion.status, exclusion.body.code]).toEqual([403, 'forbidden']);
    const revoke = await api(t.baseUrl, 'PUT', `/api/admin/ai-operator/tokens/${ai.tokenId}/revoke`, {
      token: ai.token,
    });
    expect([revoke.status, revoke.body.code]).toEqual([403, 'forbidden']);
    // AI 전용 경로에 사람: 403.
    const humanStart = await api(t.baseUrl, 'POST', '/api/admin/agent-runs', {
      cookie: operator,
      body: { trigger: 'manual' },
    });
    expect([humanStart.status, humanStart.body.code]).toEqual([403, 'forbidden']);
    // 운영자 아님이 사람·AI 전용보다 먼저입니다.
    const creatorStart = await api(t.baseUrl, 'POST', '/api/admin/agent-runs', {
      cookie: creator.cookie,
      body: { trigger: 'manual' },
    });
    expect([creatorStart.status, creatorStart.body.code]).toEqual([403, 'forbidden']);
    const anonymous = await api(t.baseUrl, 'POST', '/api/admin/agent-runs', { body: { trigger: 'manual' } });
    expect([anonymous.status, anonymous.body.code]).toEqual([401, 'unauthenticated']);
    // 멈춤이 실행 헤더보다 먼저입니다(헤더 없음 → 409 ai_operator_paused).
    const paused = await extraSlots({ token: ai.token });
    expect(paused.body.code).toBe('ai_operator_paused');
  });
});
