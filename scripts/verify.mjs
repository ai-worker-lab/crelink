#!/usr/bin/env node
// 저장소 검사 단계를 순서대로 실행하고 단계별 결과·시간과 실패 단계의 해결 안내를 요약합니다.
// 사용법: pnpm verify [--fast | --docs] [--keep-going]. 기준 문서: docs/development/verification.md
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInstanceEnv } from './lib/instance.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 단계 이름은 루트 package.json의 script 이름입니다. 값은 실패했을 때 출력할 해결 안내입니다.
const HINTS = {
  'tokens:check':
    '디자인 토큰 생성물이 원본과 다릅니다. pnpm tokens:generate를 실행하고 packages/design-tokens/generated/ 변경을 함께 커밋하세요.',
  'work:check':
    'work item 규칙 위반입니다. 출력된 파일·필드를 docs/work/README.md 규칙에 맞게 고치세요. 폴더 위치 오류는 pnpm work:place로 옮깁니다(링크도 함께 고침).',
  'docs:check': '문서 규칙 위반입니다. 출력의 각 오류에 적힌 파일·위치와 해결 방법을 따르세요.',
  'design:check': '디자인 산출물 규칙 위반입니다. 출력의 해결 안내와 design/docs/opendesign.md를 따르세요.',
  lint: '서식 오류(Prettier)는 pnpm format으로 고칩니다. 남은 ESLint 오류는 출력된 파일:줄과 규칙 메시지를 보고 코드를 고치세요.',
  typecheck:
    '출력된 파일:줄의 타입 오류를 고치세요. 공유 계약 타입은 packages/shared/src가 기준이며 바꾼 뒤 소비자(API·웹·앱)를 함께 맞춥니다.',
  build: '출력에서 실패한 패키지(@crelink/...)와 첫 오류를 찾아 고치세요. 개별 재현: pnpm --filter <패키지> build',
  test: '테스트는 실제 PostgreSQL이 필요합니다. make infra-up으로 DB를 띄우고 pnpm instance로 TEST_DATABASE_URL을 확인하세요. 개별 재현: pnpm --filter @crelink/api test',
};
const FAST = ['tokens:check', 'work:check', 'docs:check', 'design:check', 'lint', 'typecheck'];
const FULL = [...FAST, 'build', 'test'];
// 문서만 바뀐 변경(CI `changes` job 판정)의 검사. 문서·디자인 산출물은 Prettier·ESLint 대상이 아니라(.prettierignore) lint를 뺍니다.
const DOCS = ['work:check', 'docs:check', 'design:check'];
const MODES = { '--fast': FAST, '--docs': DOCS };
const USAGE = '사용법: pnpm verify [--fast | --docs] [--keep-going]';

const args = process.argv.slice(2);
const unknown = args.filter((arg) => !(arg in MODES) && arg !== '--keep-going');
const modes = args.filter((arg) => arg in MODES);
if (unknown.length > 0 || modes.length > 1) {
  console.error(
    `${unknown.length > 0 ? `알 수 없는 인자: ${unknown.join(' ')}` : '--fast와 --docs는 함께 쓸 수 없습니다.'}\n${USAGE}`,
  );
  process.exit(2);
}
const mode = modes[0] ?? '';
const keepGoing = args.includes('--keep-going');
const steps = mode ? MODES[mode] : FULL;

// 인스턴스 설정(.local/instance.env)은 이미 설정된 환경변수를 덮어쓰지 않고 보충합니다.
const instance = readInstanceEnv(root);
const env = { ...instance, ...process.env };
if (instance) console.log('인스턴스 설정 .local/instance.env를 적용합니다(이미 설정된 환경변수 우선).');

const results = [];
let stopped = false;
for (const step of steps) {
  if (stopped) {
    results.push({ step, status: '건너뜀' });
    continue;
  }
  console.log(`\n▶ ${step}`);
  const started = Date.now();
  const run = spawnSync('pnpm', ['run', step], { cwd: root, env, stdio: 'inherit' });
  const seconds = (Date.now() - started) / 1000;
  if (run.status === 0) {
    results.push({ step, status: '통과', seconds });
    continue;
  }
  const reason = run.error
    ? `실행 실패: ${run.error.message}`
    : run.signal
      ? `신호 ${run.signal}`
      : `종료 코드 ${run.status}`;
  results.push({ step, status: '실패', seconds, reason });
  if (!keepGoing || run.signal === 'SIGINT') stopped = true;
}

const width = Math.max(...steps.map((step) => step.length));
const total = results.reduce((sum, result) => sum + (result.seconds ?? 0), 0);
const failed = results.filter((result) => result.status === '실패');
const skipped = results.filter((result) => result.status === '건너뜀');
console.log(`\n검증 요약 (pnpm verify${mode ? ` ${mode}` : ''})`);
for (const { step, status, seconds, reason } of results) {
  const time = seconds === undefined ? '' : `${seconds.toFixed(1)}s`;
  console.log(`  ${step.padEnd(width)}  ${time.padStart(7)}  ${status}${reason ? ` (${reason})` : ''}`);
}
if (failed.length > 0) {
  console.log('\n해결 안내');
  for (const { step } of failed) console.log(`  ${step}: ${HINTS[step]}`);
  if (skipped.length > 0) {
    console.log(
      `\n첫 실패에서 멈췄습니다. 남은 단계까지 모두 보려면 pnpm verify${mode ? ` ${mode}` : ''} --keep-going`,
    );
  }
}
console.log(
  `\n결과: ${failed.length > 0 ? '실패' : '통과'} — 통과 ${results.length - failed.length - skipped.length}, 실패 ${failed.length}, 건너뜀 ${skipped.length}, 총 ${total.toFixed(1)}s`,
);
process.exit(failed.length > 0 ? 1 : 0);
