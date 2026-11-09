#!/usr/bin/env node
// 앱 내 브라우저 가입 안내(0231) 시험. 사용법(make up 뒤): node tests/e2e/ego/signup-funnel.mjs — 전부 통과하면 종료 코드 0, 아니면 1.
// 선택 환경변수: EGO_TEST_INJECT_CSS(변이 검사용 CSS), EGO_TEST_ONLY(쉼표 구분, 없는 이름은 실패), EGO_TEST_FAULT(always-notice, outside-scenario).
// 실제 Google 로그인은 하지 않습니다. Google 주소는 차단하며 일반 브라우저 시험도 `/auth/google` 문서 요청까지만 봅니다.
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { SyntheticData } from './lib/data.mjs';
import {
  assertStackReachable,
  finishProcess,
  interruptController,
  loadTargets,
  moduleUrlOf,
  readRunOptions,
  runInBrowser,
} from './lib/harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const SCENARIOS = ['signup/instagram-ios-home', 'signup/instagram-android-return-to', 'signup/regular-browser'];
const trimSlash = (value) => value.replace(/\/$/, '');
const interrupt = interruptController();

async function main() {
  const { selected, fault } = readRunOptions({ scenarios: SCENARIOS, faults: ['always-notice', 'outside-scenario'] });
  const env = loadTargets(root);
  await assertStackReachable(env);
  const webUrl = trimSlash(env.WEB_URL);
  const shortUrl = trimSlash(env.SHORT_LINK_BASE_URL);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 4 });
  const data = new SyntheticData(pool, { root, webUrl, shortUrl });
  const source = `e2e-${data.run}`;
  try {
    await data.removeStale();
    await data.resetVisitorRateLimits();
    await pool.query("DELETE FROM signup_funnel_daily WHERE source LIKE 'e2e-%'");
    if (interrupt.signal.aborted) return 1;
    const creator = await data.user({ displayName: 'E2E 가입 안내' });
    const outputDir = join(root, '.local/e2e/ego/signup-funnel');
    return await runInBrowser({
      moduleUrl: moduleUrlOf(join(here, 'signup-funnel.browser.mjs')),
      resultPath: join(outputDir, 'result.json'),
      signal: interrupt.signal,
      config: {
        taskSpaceName: 'crelink-ego-signup-funnel',
        webUrl,
        apiUrl: trimSlash(env.API_URL),
        shortUrl,
        databaseUrl: env.DATABASE_URL,
        outputDir,
        injectCss: process.env.EGO_TEST_INJECT_CSS || null,
        fault,
        source,
        scenarios: selected.map((name) => ({ name, creator })),
      },
    });
  } finally {
    await pool.query("DELETE FROM signup_funnel_daily WHERE source LIKE 'e2e-%'").catch(() => {});
    await data.dispose();
    await pool.end();
  }
}

finishProcess(main(), interrupt);
