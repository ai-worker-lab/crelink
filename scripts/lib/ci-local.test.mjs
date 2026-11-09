// 실행: node --test scripts/lib/ci-local.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCodeFile,
  parseCliArgs,
  porcelainPaths,
  repoFromRemote,
  reportBlockers,
  statusRequestArgs,
} from './ci-local.mjs';

test('변경 판정: ci.yml changes job과 같은 기준', () => {
  for (const file of ['docs/README.md', 'docs/a/b.png', 'design/system/x.css', 'CHANGELOGS.md', 'apps/web/README.md']) {
    assert.equal(isCodeFile(file), false, file);
  }
  for (const file of ['RELEASES.md', 'scripts/verify.mjs', 'package.json', '.github/workflows/ci.yml', 'docsy/a.ts']) {
    assert.equal(isCodeFile(file), true, file);
  }
});

test('porcelain -z: 앞 공백 상태 칸을 유지한 채 경로만 뽑음', () => {
  assert.deepEqual(porcelainPaths(' M scripts/a.mjs\0?? docs/b c.md\0'), ['scripts/a.mjs', 'docs/b c.md']);
  assert.deepEqual(porcelainPaths(''), []);
});

test('인자: --dry-run은 --report와 함께만', () => {
  assert.deepEqual(parseCliArgs([]), { report: false, dryRun: false });
  assert.deepEqual(parseCliArgs(['--report', '--dry-run']), { report: true, dryRun: true });
  assert.throws(() => parseCliArgs(['--dry-run']), /--report와 함께/);
  assert.throws(() => parseCliArgs(['--nope']), /알 수 없는 인자/);
});

test('origin URL에서 저장소를 뽑고 자격 증명은 버림', () => {
  assert.equal(repoFromRemote('https://github.com/ai-worker-lab/crelink.git'), 'ai-worker-lab/crelink');
  assert.equal(repoFromRemote('git@github.com:ai-worker-lab/crelink.git'), 'ai-worker-lab/crelink');
  assert.equal(repoFromRemote('https://x:secret@github.com/ai-worker-lab/crelink'), 'ai-worker-lab/crelink');
  assert.equal(repoFromRemote('/tmp/remote.git'), null);
  assert.equal(repoFromRemote(null), null);
});

test('status 호출: success와 context CI 통과만', () => {
  assert.deepEqual(statusRequestArgs({ repo: 'a/b', sha: 'abc', description: 'd' }), [
    'api',
    '--method',
    'POST',
    'repos/a/b/statuses/abc',
    '-f',
    'state=success',
    '-f',
    'context=CI 통과',
    '-f',
    'description=d',
  ]);
});

const passing = {
  interrupted: false,
  failed: [],
  dirtyAtStart: false,
  dirtyAtEnd: false,
  startSha: 'aaa',
  endSha: 'aaa',
  branch: 'work/0210-local-ci',
  remoteSha: 'aaa',
  repo: 'a/b',
};

test('기록 조건: 모두 만족할 때만 막는 이유가 없음', () => {
  assert.deepEqual(reportBlockers(passing), []);
});

for (const [name, change, pattern] of [
  ['중단', { interrupted: true }, /중단/],
  ['실패 단계', { failed: ['pnpm verify'] }, /pnpm verify/],
  ['시작 시 더러운 트리', { dirtyAtStart: true }, /시작할 때/],
  ['끝날 때 더러운 트리', { dirtyAtEnd: true }, /끝날 때/],
  ['실행 중 HEAD 변경', { endSha: 'bbb', remoteSha: 'bbb' }, /HEAD가 바뀌었습니다/],
  ['detached HEAD', { branch: '' }, /detached/],
  ['push 안 됨', { remoteSha: '' }, /push/],
  ['원격 tip이 다름', { remoteSha: 'ccc' }, /tip/],
  ['저장소 불명', { repo: null }, /저장소/],
]) {
  test(`기록 조건: ${name}이면 기록하지 않음`, () => {
    const blockers = reportBlockers({ ...passing, ...change });
    assert.ok(blockers.length > 0);
    assert.match(blockers.join('\n'), pattern);
  });
}
