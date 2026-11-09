#!/usr/bin/env node
// tests/smoke/smoke.spec.ts를 ego-browser로 옮긴 실행기. 사용법(make up 뒤): node tests/e2e/ego/smoke.mjs — 전부 통과하면 종료 코드 0, 아니면 1.
// 선택 환경변수: EGO_TEST_INJECT_CSS(변이 검사용 CSS), EGO_TEST_ONLY(쉼표 구분, 없는 이름은 실패), EGO_TEST_FAULT(empty-body, outside-scenario).
// 원본처럼 DB를 쓰지 않아 합성 데이터가 없습니다. 근거: docs/work/orchestrator/0230-ego-smoke-core.md
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  finishProcess,
  interruptController,
  loadTargets,
  moduleUrlOf,
  readRunOptions,
  runInBrowser,
} from './lib/harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const SCENARIOS = ['api/liveness', 'api/readiness', 'web/first-screen', 'web/desktop-1280', 'web/mobile-390'];
const trimSlash = (value) => value.replace(/\/$/, '');
const interrupt = interruptController();

async function main() {
  const { selected, fault } = readRunOptions({ scenarios: SCENARIOS, faults: ['empty-body', 'outside-scenario'] });
  const env = loadTargets(root);
  const outputDir = join(root, '.local/e2e/ego/smoke');
  return runInBrowser({
    moduleUrl: moduleUrlOf(join(here, 'smoke.browser.mjs')),
    resultPath: join(outputDir, 'result.json'),
    signal: interrupt.signal,
    config: {
      taskSpaceName: 'crelink-ego-smoke',
      webUrl: trimSlash(env.WEB_URL),
      apiUrl: trimSlash(env.API_URL),
      outputDir,
      injectCss: process.env.EGO_TEST_INJECT_CSS || null,
      fault,
      scenarios: selected.map((name) => ({ name })),
    },
  });
}

finishProcess(main(), interrupt);
