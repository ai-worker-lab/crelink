#!/usr/bin/env node
// tests/e2e/visitor.spec.ts를 ego-browser로 옮긴 실행기. 사용법(make up 뒤): node tests/e2e/ego/visitor.mjs — 전부 통과하면 종료 코드 0, 아니면 1.
// 선택 환경변수: EGO_TEST_INJECT_CSS(변이 검사용 CSS), EGO_TEST_ONLY(쉼표 구분, 없는 이름은 실패), EGO_TEST_FAULT(missing-link, missing-open-link, outside-scenario).
// 근거와 옮기지 못한 검사: docs/work/orchestrator/0230-ego-smoke-core.md
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { SyntheticData } from './lib/data.mjs';
import {
  aliasLoopback,
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
const SCENARIOS = ['visitor/short-url', 'visitor/direct-entry'];
const trimSlash = (value) => value.replace(/\/$/, '');
const interrupt = interruptController();

async function main() {
  const { selected, fault } = readRunOptions({
    scenarios: SCENARIOS,
    faults: ['missing-link', 'missing-open-link', 'outside-scenario'],
  });
  const env = loadTargets(root);
  await assertStackReachable(env);
  const webUrl = trimSlash(env.WEB_URL);
  const shortUrl = trimSlash(env.SHORT_LINK_BASE_URL);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 4 });
  const data = new SyntheticData(pool, { root, webUrl, shortUrl });
  try {
    await data.removeStale();
    await data.resetVisitorRateLimits();
    const scenarios = [];
    if (selected.includes('visitor/short-url')) {
      const creator = await data.user({
        displayName: 'E2E 방문 테스트',
        bio: '방문자 시나리오',
        renamed: true,
        links: [
          { title: '첫 번째 링크', url: data.externalUrl('first?ref=e2e') },
          { title: '두 번째 링크', url: data.externalUrl('second') },
          { title: '숨긴 링크', url: data.externalUrl('hidden'), hidden: true },
        ],
      });
      scenarios.push({ name: 'visitor/short-url', creator });
    }
    if (selected.includes('visitor/direct-entry')) {
      const name = `E2E 직접 접속 ${data.run}`;
      scenarios.push({
        name: 'visitor/direct-entry',
        creator: await data.user({ displayName: name }),
        displayName: name,
      });
    }
    if (interrupt.signal.aborted) return 1;
    const outputDir = join(root, '.local/e2e/ego/visitor');
    return await runInBrowser({
      moduleUrl: moduleUrlOf(join(here, 'visitor.browser.mjs')),
      resultPath: join(outputDir, 'result.json'),
      signal: interrupt.signal,
      config: {
        taskSpaceName: 'crelink-ego-visitor',
        webUrl,
        apiUrl: trimSlash(env.API_URL),
        shortUrl,
        aliasShortUrl: aliasLoopback(shortUrl),
        databaseUrl: env.DATABASE_URL,
        outputDir,
        injectCss: process.env.EGO_TEST_INJECT_CSS || null,
        fault,
        scenarios,
      },
    });
  } finally {
    await data.dispose();
    await pool.end();
  }
}

finishProcess(main(), interrupt);
