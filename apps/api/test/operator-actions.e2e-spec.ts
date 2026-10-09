import {
  AdBannerView,
  AgentRunView,
  ApiError,
  CreatorBannerView,
  CreatorLandingState,
  LinkView,
  OperatorActionPage,
  OperatorActionView,
  OperatorCreatorDetail,
  OperatorCreatorListResponse,
  UploadFileResponse,
} from '@crelink/shared';
import { setTimeout as sleep } from 'node:timers/promises';
import { PNG_STILL } from './image-samples';
import { api, createAiOperator, createTestApp, login, TestApp } from './test-app';

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

interface ActionRow {
  actor_kind: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  subject_user_id: string | null;
  before: unknown;
  after: unknown;
  run_id: string | null;
}

/** 운영자 행동 기록·지표 제외(0102, docs/specs/crelink-ai-operator.md `행동 기록 규칙`). */
describe('운영자 행동 기록 (R23 ③⑧)', () => {
  let t: TestApp;
  let operator: string;
  let operatorId: string;
  let ai: { userId: string; token: string; tokenId: string; email: string };
  let runId: string;
  let n = 0;

  const newCreator = async () => {
    n += 1;
    const result = await login(t.baseUrl, `actions-${n}|actions${n}@example.com`);
    return { cookie: result.cookie!, userId: result.body.user!.id };
  };
  /** 마지막 행동 기록 1건(시각 역순). */
  const lastAction = async () =>
    (
      await t.pool.query<ActionRow>(
        `SELECT actor_kind, actor_user_id, actor_email, action, target_type, target_id, subject_user_id, before, after, run_id
         FROM operator_actions ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
    ).rows[0];
  const actionCount = async () => (await t.pool.query('SELECT 1 FROM operator_actions')).rowCount;
  const human = () => ({
    actor_kind: 'human',
    actor_user_id: operatorId,
    actor_email: 'operator@example.com',
    run_id: null,
  });
  const byAi = () => ({ actor_kind: 'ai', actor_user_id: ai.userId, actor_email: ai.email, run_id: runId });
  const asAi = () => ({ token: ai.token, runId });
  const upload = async (headers: Record<string, string>) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PNG_STILL)], { type: 'image/png' }), 'image.png');
    const response = await fetch(`${t.baseUrl}/api/me/files`, { method: 'POST', headers, body: form });
    expect(response.status).toBe(201);
    const body: UploadFileResponse = await response.json();
    return body.fileId;
  };

  beforeAll(async () => {
    t = await createTestApp();
    const login1 = await login(t.baseUrl, 'actions-op|operator@example.com');
    operator = login1.cookie!;
    operatorId = login1.body.user!.id;
    ai = await createAiOperator(t.pool);
    const started = await api<AgentRunView>(t.baseUrl, 'POST', '/api/admin/agent-runs', {
      token: ai.token,
      body: { trigger: 'schedule' },
    });
    runId = started.body.id;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('creator.* 쓰기(추가 슬롯·정지·배너 슬롯·지표 제외)는 사람·AI 행위자와 전후 값·대상·실행 id를 남긴다', async () => {
    const creator = await newCreator();
    const path = (suffix: string) => `/api/admin/creators/${creator.userId}/${suffix}`;
    const target = { target_type: 'user', target_id: creator.userId, subject_user_id: creator.userId };

    expect(
      (await api(t.baseUrl, 'PUT', path('extra-slots'), { cookie: operator, body: { extraSlots: 3 } })).status,
    ).toBe(200);
    expect(await lastAction()).toEqual({
      ...human(),
      ...target,
      action: 'creator.extra_slots',
      before: { extraSlots: 0 },
      after: { extraSlots: 3 },
    });
    expect((await api(t.baseUrl, 'PUT', path('extra-slots'), { ...asAi(), body: { extraSlots: 4 } })).status).toBe(200);
    expect(await lastAction()).toEqual({
      ...byAi(),
      ...target,
      action: 'creator.extra_slots',
      before: { extraSlots: 3 },
      after: { extraSlots: 4 },
    });

    expect((await api(t.baseUrl, 'PUT', path('suspension'), { ...asAi(), body: { suspended: true } })).status).toBe(
      200,
    );
    expect(await lastAction()).toEqual({
      ...byAi(),
      ...target,
      action: 'creator.suspension',
      before: { suspended: false },
      after: { suspended: true },
    });
    expect(
      (await api(t.baseUrl, 'PUT', path('suspension'), { cookie: operator, body: { suspended: false } })).status,
    ).toBe(200);

    expect((await api(t.baseUrl, 'PUT', path('banner-slot'), { ...asAi(), body: { granted: true } })).status).toBe(200);
    expect(await lastAction()).toMatchObject({
      ...byAi(),
      action: 'creator.banner_slot',
      before: { bannerSlotGranted: false },
      after: { bannerSlotGranted: true },
    });

    const excluded = await api<OperatorCreatorDetail>(t.baseUrl, 'PUT', path('metrics-exclusion'), {
      cookie: operator,
      body: { excluded: true },
    });
    expect([excluded.status, excluded.body.metricsExcluded, excluded.body.accountKind]).toEqual([200, true, 'human']);
    expect(await lastAction()).toEqual({
      ...human(),
      ...target,
      action: 'creator.metrics_exclusion',
      before: { metricsExcluded: false },
      after: { metricsExcluded: true },
    });
    // 멱등 요청도 기록합니다.
    const before = await actionCount();
    await api(t.baseUrl, 'PUT', path('metrics-exclusion'), { cookie: operator, body: { excluded: true } });
    expect(await actionCount()).toBe(before! + 1);
    const list = await api<OperatorCreatorListResponse>(t.baseUrl, 'GET', `/api/admin/creators?query=actions${n}@`, {
      cookie: operator,
    });
    expect(list.body.items[0]).toMatchObject({ userId: creator.userId, accountKind: 'human', metricsExcluded: true });
  });

  it('지표 제외는 사람만이고, 입력 오류 400·없는 크리에이터 404', async () => {
    const creator = await newCreator();
    const path = `/api/admin/creators/${creator.userId}/metrics-exclusion`;
    const byAiResponse = await api(t.baseUrl, 'PUT', path, { ...asAi(), body: { excluded: true } });
    expect([byAiResponse.status, byAiResponse.body.code]).toEqual([403, 'forbidden']);
    const bad = await api(t.baseUrl, 'PUT', path, { cookie: operator, body: { excluded: 'yes' } });
    expect([bad.status, bad.body.code]).toEqual([400, 'validation_failed']);
    for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
      const missing = await api(t.baseUrl, 'PUT', `/api/admin/creators/${id}/metrics-exclusion`, {
        cookie: operator,
        body: { excluded: true },
      });
      expect([missing.status, missing.body.code]).toEqual([404, 'creator_not_found']);
    }
    const restored = await api<OperatorCreatorDetail>(t.baseUrl, 'PUT', path, {
      cookie: operator,
      body: { excluded: false },
    });
    expect(restored.body.metricsExcluded).toBe(false);
  });

  it('AI는 운영자·AI 계정 대상 creator.* 쓰기가 403이고 기록·변경이 남지 않는다', async () => {
    const other = await createAiOperator(t.pool, 'other-ai@crelink.invalid');
    const before = await actionCount();
    for (const userId of [operatorId, ai.userId, other.userId]) {
      for (const [suffix, body] of [
        ['extra-slots', { extraSlots: 1 }],
        ['suspension', { suspended: true }],
        ['banner-slot', { granted: true }],
      ] as const) {
        const response = await api(t.baseUrl, 'PUT', `/api/admin/creators/${userId}/${suffix}`, { ...asAi(), body });
        expect([suffix, response.status, response.body.code]).toEqual([suffix, 403, 'forbidden']);
      }
    }
    expect(await actionCount()).toBe(before);
    const state = await t.pool.query(
      `SELECT count(*)::int AS n FROM users WHERE (role = 'operator' OR kind = 'ai')
         AND (suspended_at IS NOT NULL OR extra_link_slots > 0 OR banner_slot_granted_at IS NOT NULL)`,
    );
    expect(state.rows[0].n).toBe(0);
    // 사람 운영자는 AI 계정을 정지할 수 있고, 정지되면 토큰 인증이 막힙니다.
    const suspend = await api<OperatorCreatorDetail>(
      t.baseUrl,
      'PUT',
      `/api/admin/creators/${other.userId}/suspension`,
      {
        cookie: operator,
        body: { suspended: true },
      },
    );
    expect([suspend.status, suspend.body.accountKind]).toEqual([200, 'ai']);
    expect((await api(t.baseUrl, 'GET', '/api/me', { token: other.token })).status).toBe(401);
  });

  it('링크·배너 차단은 소유자를 subject로, 차단 도메인 추가·삭제는 함께 바뀐 수와 사유를 남긴다', async () => {
    const creator = await newCreator();
    const link = await api<LinkView>(t.baseUrl, 'POST', '/api/me/links', {
      cookie: creator.cookie,
      body: { title: '링크', url: 'https://blocked.example/a' },
    });
    const blocked = await api<LinkView>(t.baseUrl, 'PUT', `/api/admin/links/${link.body.id}/block`, {
      ...asAi(),
      body: { blocked: true, reason: '스팸' },
    });
    expect(blocked.body.blocked).toBe(true);
    expect(await lastAction()).toEqual({
      ...byAi(),
      action: 'link.block',
      target_type: 'link',
      target_id: link.body.id,
      subject_user_id: creator.userId,
      before: { blocked: false, reason: null },
      after: { blocked: true, reason: '스팸' },
    });
    await api(t.baseUrl, 'PUT', `/api/admin/links/${link.body.id}/block`, {
      cookie: operator,
      body: { blocked: false },
    });

    await api(t.baseUrl, 'PUT', `/api/admin/creators/${creator.userId}/banner-slot`, {
      cookie: operator,
      body: { granted: true },
    });
    const image = await upload({ cookie: creator.cookie });
    const banner = await api<CreatorBannerView>(t.baseUrl, 'POST', '/api/me/banners', {
      cookie: creator.cookie,
      body: { imageFileId: image, alt: '배너', url: 'https://banner.example/' },
    });
    expect(banner.status).toBe(201);
    await api(t.baseUrl, 'PUT', `/api/admin/banners/${banner.body.id}/block`, {
      cookie: operator,
      body: { blocked: true },
    });
    expect(await lastAction()).toEqual({
      ...human(),
      action: 'banner.block',
      target_type: 'creator_banner',
      target_id: banner.body.id,
      subject_user_id: creator.userId,
      before: { blocked: false, reason: null },
      after: { blocked: true, reason: null },
    });

    const added = await api(t.baseUrl, 'POST', '/api/admin/blocked-domains', {
      ...asAi(),
      body: { domain: 'blocked.example', reason: '피싱' },
    });
    expect(added.status).toBe(201);
    expect(await lastAction()).toEqual({
      ...byAi(),
      action: 'blocked_domain.add',
      target_type: 'blocked_domain',
      target_id: 'blocked.example',
      subject_user_id: null,
      before: null,
      after: { domain: 'blocked.example', reason: '피싱', blockedLinks: 1, blockedBanners: 0, endedAdBanners: 0 },
    });
    const createdBy = await t.pool.query("SELECT created_by FROM blocked_domains WHERE domain = 'blocked.example'");
    expect(createdBy.rows[0].created_by).toBe(ai.userId);

    expect((await api(t.baseUrl, 'DELETE', '/api/admin/blocked-domains/blocked.example', asAi())).status).toBe(204);
    expect(await lastAction()).toEqual({
      ...byAi(),
      action: 'blocked_domain.remove',
      target_type: 'blocked_domain',
      target_id: 'blocked.example',
      subject_user_id: null,
      before: { domain: 'blocked.example', reason: '피싱' },
      after: null,
    });
    // 실패한 쓰기는 기록도 없습니다.
    const before = await actionCount();
    const missing = await api(t.baseUrl, 'DELETE', '/api/admin/blocked-domains/blocked.example', { cookie: operator });
    expect(missing.status).toBe(404);
    expect(await actionCount()).toBe(before);
  });

  it('크리링 배너 등록·수정(바뀐 필드만)·순서·내리기(멱등 포함)를 남긴다', async () => {
    const image = await upload({ authorization: `Bearer ${ai.token}`, 'X-Crelink-Agent-Run': runId });
    const startsAt = iso(-DAY);
    const created = await api<AdBannerView>(t.baseUrl, 'POST', '/api/admin/ad-banners', {
      ...asAi(),
      body: { imageFileId: image, alt: '가입 유도', url: 'https://crelink.example/join', startsAt },
    });
    expect(created.status).toBe(201);
    expect(await lastAction()).toEqual({
      ...byAi(),
      action: 'ad_banner.create',
      target_type: 'ad_banner',
      target_id: created.body.id,
      subject_user_id: null,
      before: null,
      after: {
        imageFileId: image,
        stillImageFileId: null,
        alt: '가입 유도',
        url: 'https://crelink.example/join',
        startsAt: new Date(startsAt).toISOString(),
        endsAt: null,
      },
    });

    await api(t.baseUrl, 'PATCH', `/api/admin/ad-banners/${created.body.id}`, {
      cookie: operator,
      body: { alt: '새 문구', url: 'https://crelink.example/join' },
    });
    expect(await lastAction()).toMatchObject({
      ...human(),
      action: 'ad_banner.update',
      before: { alt: '가입 유도' },
      after: { alt: '새 문구' },
    });

    const second = await api<AdBannerView>(t.baseUrl, 'POST', '/api/admin/ad-banners', {
      cookie: operator,
      body: { imageFileId: image, alt: '둘째', url: 'https://crelink.example/2', startsAt },
    });
    await api(t.baseUrl, 'PUT', '/api/admin/ad-banners/order', {
      ...asAi(),
      body: { ids: [second.body.id, created.body.id] },
    });
    expect(await lastAction()).toMatchObject({
      ...byAi(),
      action: 'ad_banner.reorder',
      target_type: 'ad_banner',
      target_id: null,
      before: { order: [created.body.id, second.body.id] },
      after: { order: [second.body.id, created.body.id] },
    });

    const ended = await api<AdBannerView>(t.baseUrl, 'PUT', `/api/admin/ad-banners/${created.body.id}/end`, asAi());
    expect(ended.body.status).toBe('ended');
    expect(await lastAction()).toMatchObject({
      action: 'ad_banner.end',
      before: { endsAt: null },
      after: { endsAt: ended.body.endsAt },
    });
    const count = await actionCount();
    await api(t.baseUrl, 'PUT', `/api/admin/ad-banners/${created.body.id}/end`, { cookie: operator });
    expect(await actionCount()).toBe(count! + 1);
    await t.pool.query('DELETE FROM ad_banners');
  });

  it('AI 쓰기 중 멈춤이 켜지면 기록의 FOR SHARE 재확인이 막고 쓰기를 되돌린다', async () => {
    const creator = await newCreator();
    const before = await actionCount();
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE ai_operator_settings SET paused = true, paused_reason = '경쟁'");
      // 가드는 커밋 전 값(멈춤 아님)을 보고 통과하고, 기록의 FOR SHARE가 이 트랜잭션을 기다립니다.
      const pending = api<ApiError>(t.baseUrl, 'PUT', `/api/admin/creators/${creator.userId}/extra-slots`, {
        ...asAi(),
        body: { extraSlots: 7 },
      });
      let settled = false;
      void pending.then(() => (settled = true));
      await sleep(300);
      // 가드(잠금 없는 조회)를 지나 기록의 FOR SHARE에서 기다리는 중입니다.
      expect(settled).toBe(false);
      await client.query('COMMIT');
      const response = await pending;
      expect([response.status, response.body.code]).toEqual([409, 'ai_operator_paused']);
    } finally {
      client.release();
    }
    const slots = await t.pool.query('SELECT extra_link_slots FROM users WHERE id = $1', [creator.userId]);
    expect(slots.rows[0].extra_link_slots).toBe(0);
    expect(await actionCount()).toBe(before);
    await t.pool.query('UPDATE ai_operator_settings SET paused = false, paused_reason = NULL');
  });

  it('GET /api/admin/actions: 최신순 50개·커서·행위자 걸러보기, 잘못된 커서·actor는 400', async () => {
    const creator = await newCreator();
    // 같은 시각 행이 섞여도 건너뛰지 않는지 보려고 시각을 묶어 55건을 넣습니다.
    await t.pool.query(
      `INSERT INTO operator_actions (actor_kind, action, target_type, target_id, subject_user_id, created_at)
       SELECT 'system', 'ai_operator.token_issue', 'api_token', g::text, $1, now() + interval '1 hour' + (g / 5) * interval '1 second'
       FROM generate_series(1, 55) g`,
      [creator.userId],
    );
    const total = (await actionCount())!;
    const seen: OperatorActionView[] = [];
    let cursor: string | null = null;
    do {
      const page: { status: number; body: OperatorActionPage } = await api<OperatorActionPage>(
        t.baseUrl,
        'GET',
        `/api/admin/actions${cursor ? `?cursor=${cursor}` : ''}`,
        { token: ai.token },
      );
      expect(page.status).toBe(200);
      expect(page.body.items.length).toBeLessThanOrEqual(50);
      seen.push(...page.body.items);
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(total);
    expect(new Set(seen.map((item) => item.id)).size).toBe(total);
    expect(seen[0]).toMatchObject({
      actor: { kind: 'system', userId: null, email: null },
      action: 'ai_operator.token_issue',
      targetType: 'api_token',
      targetId: '55',
      subjectUserId: creator.userId,
      before: null,
      after: null,
      runId: null,
    });

    const aiOnly = await api<OperatorActionPage>(t.baseUrl, 'GET', '/api/admin/actions?actor=ai', { cookie: operator });
    expect(aiOnly.body.items.length).toBeGreaterThan(0);
    expect(aiOnly.body.items.every((item) => item.actor.kind === 'ai' && item.runId === runId)).toBe(true);
    const humanOnly = await api<OperatorActionPage>(t.baseUrl, 'GET', '/api/admin/actions?actor=human', {
      cookie: operator,
    });
    expect(humanOnly.body.items.every((item) => item.actor.kind === 'human')).toBe(true);

    for (const query of [
      'actor=robot',
      'actor=',
      'actor=toString',
      'cursor=%%%',
      `cursor=${Buffer.from('1.x').toString('base64url')}`,
    ]) {
      const bad = await api(t.baseUrl, 'GET', `/api/admin/actions?${query}`, { cookie: operator });
      expect([query, bad.status, bad.body.code]).toEqual([query, 400, 'validation_failed']);
    }
    const creatorCall = await api(t.baseUrl, 'GET', '/api/admin/actions', { cookie: creator.cookie });
    expect(creatorCall.status).toBe(403);
    await t.pool.query(
      "DELETE FROM operator_actions WHERE action = 'ai_operator.token_issue' AND actor_kind = 'system' AND target_id ~ '^[0-9]+$'",
    );
  });

  it('크리에이터 요약은 AI 계정을 accountKind ai로 보여 준다', async () => {
    const detail = await api<OperatorCreatorDetail>(t.baseUrl, 'GET', `/api/admin/creators/${ai.userId}`, {
      cookie: operator,
    });
    expect(detail.body).toMatchObject({
      userId: ai.userId,
      email: ai.email,
      accountKind: 'ai',
      metricsExcluded: false,
    });
    const landing = await api<CreatorLandingState>(t.baseUrl, 'GET', '/api/me/landing', { token: ai.token });
    expect(landing.status).toBe(200);
  });
});
