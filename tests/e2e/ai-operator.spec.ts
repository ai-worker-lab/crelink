// AI 운영자(에픽 0088) 검증 계획 1~4. 실행 호스트 도구(scripts/ai-operator.mjs) → 웹 토큰 경로(/api/agent) → API → DB를 실제로 지나고,
// 사람 운영자 화면(/admin/agent-runs·/admin/actions)에서 결과를 봅니다. 기준: docs/specs/crelink-ai-operator.md#검증-계획
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, expectMobileFits, test, WEB_URL } from './fixtures';

const SCRIPT = join(__dirname, '../../scripts/ai-operator.mjs');

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** 실행 호스트 도구를 이 테스트 전용 설정(환경변수)과 상태 폴더로 실행합니다. 설정 파일은 쓰지 않습니다. */
function cli(env: Record<string, string>, args: string[]): Promise<CliResult> {
  const { promise, resolve } = Promise.withResolvers<CliResult>();
  execFile(
    process.execPath,
    [SCRIPT, ...args],
    { env: { ...process.env, ...env }, timeout: 60_000 },
    (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ code, stdout, stderr });
    },
  );
  return promise;
}

test('AI 운영자: 토큰 인증·실행 기록·겹침 금지·행동 기록·멈춤 스위치·토큰 폐기(390px 포함)', async ({ data }) => {
  // 멈춤과 진행 중 실행은 전역 상태입니다. 이 시나리오만 쓰므로 시작할 때 맞추고 끝날 때 되돌립니다(로컬 개발 DB).
  await data.db.query(`UPDATE ai_operator_settings SET paused = false, paused_reason = NULL`);
  await data.db.query(`UPDATE agent_runs SET status = 'abandoned', ended_at = now() WHERE status = 'running'`);
  const stateDir = await mkdtemp(join(tmpdir(), 'crelink-ai-e2e-'));
  try {
    const creator = await data.user({
      displayName: `E2E AI 대상 ${data.run}`,
      links: [{ title: '블로그', url: data.externalUrl('blog') }],
    });
    const operator = await data.user({ role: 'operator' });
    const ai = await data.aiAccount();
    const env = {
      CRELINK_AI_BASE_URL: `${WEB_URL}/api/agent`,
      CRELINK_AI_TOKEN: ai.token,
      CRELINK_AI_HOST: 'e2e',
      CRELINK_AI_ENV_FILE: join(stateDir, 'none.env'),
      CRELINK_AI_STATE_DIR: stateDir,
    };
    const agentFetch = (path: string, init: RequestInit = {}) =>
      fetch(`${WEB_URL}/api/agent${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${ai.token}`, 'Content-Type': 'application/json', ...init.headers },
      });

    // 1. 토큰 인증: 토큰 없음 401, 토큰으로 상태 조회 200, 프리체크 통과
    expect((await fetch(`${WEB_URL}/api/agent/api/admin/ai-operator`)).status).toBe(401);
    expect((await agentFetch('/api/admin/ai-operator')).status).toBe(200);
    expect(await cli(env, ['precheck'])).toMatchObject({ code: 0 });

    // 3. 실행 기록 열기와 겹침 금지
    const started = await cli(env, ['start']);
    expect(started.code, started.stderr).toBe(0);
    const runId = /실행 id: ([0-9a-f-]{36})/.exec(started.stdout)?.[1];
    expect(runId).toBeTruthy();
    const second = await cli(env, ['start']);
    expect(second.code).toBe(1);
    expect(second.stdout).toContain('agent_run_in_progress');
    expect(await cli(env, ['precheck'])).toMatchObject({ code: 1 });

    // 2. 행동 기록: 실행 헤더 없는 쓰기는 409, 실행 안의 쓰기는 기록됨. AI는 사람 운영자를 정지하거나 멈춤을 바꾸지 못함
    const withoutRun = await agentFetch(`/api/admin/creators/${creator.userId}/extra-slots`, {
      method: 'PUT',
      body: JSON.stringify({ extraSlots: 2 }),
    });
    expect(withoutRun.status).toBe(409);
    expect((await withoutRun.json()).code).toBe('agent_run_required');
    const slots = await cli(env, [
      'api',
      'PUT',
      `/api/admin/creators/${creator.userId}/extra-slots`,
      JSON.stringify({ extraSlots: 2 }),
    ]);
    expect(slots.code, slots.stderr).toBe(0);
    const suspendHuman = await cli(env, [
      'api',
      'PUT',
      `/api/admin/creators/${operator.userId}/suspension`,
      JSON.stringify({ suspended: true }),
    ]);
    expect(suspendHuman.code).toBe(1);
    expect(suspendHuman.stderr).toContain('403 forbidden');
    const unpauseByAi = await cli(env, [
      'api',
      'PUT',
      '/api/admin/ai-operator/pause',
      JSON.stringify({ paused: false }),
    ]);
    expect(unpauseByAi.code).toBe(1);
    expect(unpauseByAi.stderr).toContain('403 forbidden');

    const context = await cli(env, ['context']);
    expect(context.code, context.stderr).toBe(0);
    expect(context.stdout).toContain('실사용자:');
    expect(context.stdout).toContain(`이번 실행: ${runId}`);

    const summary = `E2E 실행 요약 ${data.run}`;
    const finished = await cli(env, [
      'finish',
      '--status',
      'succeeded',
      '--summary',
      summary,
      '--action',
      `추가 슬롯 2개 부여 ${data.run}`,
      '--next',
      `다음 할 일 ${data.run}`,
      '--ref',
      'pr=PR #9999=https://github.com/ai-worker-lab/crelink/pull/9999',
    ]);
    expect(finished.code, finished.stderr).toBe(0);
    // 닫은 뒤에는 실행 id 파일이 없어 쓰기를 보내지 않습니다.
    expect((await cli(env, ['api', 'PUT', '/api/admin/ai-operator/pause', '{}'])).stderr).toContain('start를 먼저');

    // 사람 운영자 화면: 실행 기록(390px)과 상세의 행동 기록
    const admin = await data.session(operator, { viewport: { width: 390, height: 844 } });
    const page = admin.page;
    await page.goto('/admin/agent-runs');
    await expect(page.getByRole('heading', { name: 'AI 실행 기록', level: 1 })).toBeVisible();
    const card = page.locator('details.run-card').filter({ hasText: summary });
    await expect(card).toHaveCount(1);
    await expect(card.getByText('성공')).toBeVisible();
    await card.locator('summary').click();
    await expect(card.getByText(`다음 할 일 ${data.run}`)).toBeVisible();
    await expect(card.getByRole('link', { name: /PR #9999/ })).toHaveAttribute(
      'href',
      'https://github.com/ai-worker-lab/crelink/pull/9999',
    );
    await expectMobileFits(page, 'AI 실행 기록');
    await page.locator('details.run-card').filter({ hasText: summary }).locator('summary').click();
    await page
      .locator('details.run-card')
      .filter({ hasText: summary })
      .getByRole('link', { name: '실행 상세 보기' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/admin/agent-runs/${runId}$`));
    await expect(page.getByRole('heading', { name: '이 실행의 운영 기록' })).toBeVisible();
    await expect(page.getByText('추가 링크 슬롯 변경')).toBeVisible();
    await expectMobileFits(page, 'AI 실행 상세');

    // 운영 기록: AI 걸러보기에 이 행동이 실행 링크와 함께 보임
    await page.goto('/admin/actions?actor=ai');
    await expect(page.getByRole('heading', { name: '운영 기록', level: 1 })).toBeVisible();
    const actionRow = page.getByRole('row').filter({ hasText: ai.email });
    await expect(actionRow.first()).toContainText('추가 링크 슬롯 변경');
    await expectMobileFits(page, '운영 기록');
    const { rows: actions } = await data.db.query<{
      actor_kind: string;
      run_id: string;
      before: unknown;
      after: unknown;
    }>(
      `SELECT actor_kind, run_id, before, after FROM operator_actions WHERE actor_user_id = $1 AND action = 'creator.extra_slots'`,
      [ai.userId],
    );
    expect(actions).toEqual([{ actor_kind: 'ai', run_id: runId, before: { extraSlots: 0 }, after: { extraSlots: 2 } }]);

    // 사람 운영자가 시험 계정을 지표에서 뺌 → 배지와 사람 행위자 행동 기록. AI 계정 상세는 조작 대신 안내
    await page.goto(`/admin/creators/${creator.userId}`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '지표에서 빼기' }).click();
    await expect(page.getByRole('button', { name: '지표에 다시 넣기' })).toBeVisible();
    await expect(page.getByText('지표 제외', { exact: true }).first()).toBeVisible();
    const { rows: exclusions } = await data.db.query<{ actor_kind: string; after: unknown }>(
      `SELECT actor_kind, after FROM operator_actions WHERE subject_user_id = $1 AND action = 'creator.metrics_exclusion'`,
      [creator.userId],
    );
    expect(exclusions).toEqual([{ actor_kind: 'human', after: { metricsExcluded: true } }]);
    await page.goto(`/admin/creators/${ai.userId}`);
    await expect(page.getByText('AI 계정은 지표에 들어가지 않아요')).toBeVisible();
    await expect(page.getByRole('button', { name: '지표에서 빼기' })).toHaveCount(0);

    // 4. 멈춤: 사람이 화면에서 켬 → 프리체크 1·paused 기록, 시작 1, AI 쓰기 409 → 끄면 프리체크 0
    await page.goto('/admin/agent-runs');
    await page.getByLabel('멈춤 사유 (선택)').fill(`E2E 멈춤 ${data.run}`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'AI 운영자 멈추기' }).click();
    await expect(page.getByRole('button', { name: '멈춤 풀기' })).toBeVisible();
    const pausedCheck = await cli(env, ['precheck']);
    expect(pausedCheck.code).toBe(1);
    expect(pausedCheck.stdout).toContain('멈춤');
    expect((await cli(env, ['start'])).code).toBe(1);
    const pausedWrite = await agentFetch(`/api/admin/creators/${creator.userId}/extra-slots`, {
      method: 'PUT',
      body: JSON.stringify({ extraSlots: 3 }),
    });
    expect(pausedWrite.status).toBe(409);
    expect((await pausedWrite.json()).code).toBe('ai_operator_paused');
    const { rows: pausedRuns } = await data.db.query<{ paused_count: number }>(
      `SELECT paused_count FROM agent_runs WHERE actor_user_id = $1 AND status = 'paused'`,
      [ai.userId],
    );
    // 프리체크와 시작이 같은 멈춤 동안 남긴 기록은 한 행으로 합쳐집니다.
    expect(pausedRuns).toEqual([{ paused_count: 2 }]);
    await page.reload();
    await expect(page.locator('details.run-card').first()).toContainText('멈춤');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '멈춤 풀기' }).click();
    await expect(page.getByRole('button', { name: 'AI 운영자 멈추기' })).toBeVisible();
    expect(await cli(env, ['precheck'])).toMatchObject({ code: 0 });

    // 1. 토큰 폐기: 화면에서 폐기하면 바로 401
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: `${ai.tokenLabel} 토큰 폐기` }).click();
    await expect.poll(async () => (await agentFetch('/api/admin/ai-operator')).status).toBe(401);
    expect((await cli(env, ['precheck'])).code).toBe(1);
  } finally {
    await data.db.query(`UPDATE ai_operator_settings SET paused = false, paused_reason = NULL`);
    await rm(stateDir, { recursive: true, force: true });
  }
});
