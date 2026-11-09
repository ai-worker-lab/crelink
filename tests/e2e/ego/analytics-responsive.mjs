#!/usr/bin/env node
// 0206 ego-lite 시범: 실행 중인 로컬 스택에 tests/e2e/analytics-responsive.spec.ts의 chromium 검사를 ego-browser로 실행합니다.
// 사용법(make up 뒤): node tests/e2e/ego/analytics-responsive.mjs — 전부 통과하면 종료 코드 0, 아니면 1.
// 선택 환경변수: EGO_TEST_INJECT_CSS(변이 검사용 CSS를 모든 페이지에 주입), EGO_TEST_ONLY(쉼표 구분 예: creator/metrics).
// 근거와 옮기지 못한 검사: docs/work/crelink-qa/0206-ego-analytics-responsive.md
/* global console */
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { recentRange } from '../../../apps/web/src/lib/format.ts';
import { SyntheticData } from './lib/data.mjs';
import { assertStackReachable, loadTargets, moduleUrlOf, runInBrowser } from './lib/harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const TASK_SPACE = 'crelink-0206-ego';
const only = process.env.EGO_TEST_ONLY?.split(',').map((value) => value.trim());

const trimSlash = (value) => value.replace(/\/$/, '');
const sessionUser = ({ userId, role, publicId, landingUrl, sessionToken }) => ({
  userId,
  role,
  publicId,
  landingUrl,
  sessionToken,
});

async function main() {
  const env = loadTargets(root);
  await assertStackReachable(env);
  const webUrl = trimSlash(env.WEB_URL);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 4 });
  const data = new SyntheticData(pool, { root, webUrl });
  try {
    await data.removeStale();
    const scenarios = [];
    for (const role of ['creator', 'operator']) {
      for (const mode of ['metrics', 'stats']) {
        if (only && !only.includes(`${role}/${mode}`)) continue;
        const creator = await data.user({ displayName: '반응형 검수 크리에이터' });
        const user = role === 'operator' ? await data.user({ role: 'operator' }) : creator;
        scenarios.push({ role, mode, creator: sessionUser(creator), user: sessionUser(user) });
      }
    }
    const outputDir = join(root, '.local/e2e/ego/analytics-responsive');
    return await runInBrowser({
      moduleUrl: moduleUrlOf(join(here, 'analytics-responsive.browser.mjs')),
      resultPath: join(outputDir, 'result.json'),
      config: {
        taskSpaceName: TASK_SPACE,
        webUrl,
        apiUrl: trimSlash(env.API_URL),
        outputDir,
        injectCss: process.env.EGO_TEST_INJECT_CSS || null,
        ranges: { recent30: recentRange(30) },
        scenarios,
      },
    });
  } finally {
    await data.dispose();
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[ego] 실행 실패: ${error.message}`);
    process.exit(1);
  },
);
