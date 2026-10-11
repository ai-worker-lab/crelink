import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertLocalE2ETargets } from './e2e-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const local = {
  WEB_URL: 'http://localhost:3000',
  API_URL: 'http://127.0.0.1:3001',
  SHORT_LINK_BASE_URL: 'http://[::1]:3002',
  DATABASE_URL: 'postgresql://e2e:local@127.0.0.1:5432/e2e',
};

const rejected = [
  ['WEB_URL', 'https://crelink.example'],
  ['API_URL', 'https://api.crelink.example'],
  ['SHORT_LINK_BASE_URL', 'https://short.crelink.example'],
  ['DATABASE_URL', 'postgresql://e2e:secret@db.project.supabase.co:5432/postgres'],
  ['DATABASE_URL', 'postgres://e2e:secret@192.168.1.10:5432/e2e'],
  ['DATABASE_URL', 'postgres://e2e:secret@127.0.0.1:5432/e2e?host=db.project.supabase.co'],
  ['DATABASE_URL', 'postgres://e2e:secret@localhost:5432/e2e?hostaddr=192.168.1.10'],
  ['DATABASE_URL', 'postgres://e2e:secret@localhost:5432/e2e?service=production'],
  ['DATABASE_URL', 'postgres://e2e:secret@localhost:5432/e2e?connectionString=postgres://remote/e2e'],
];

for (const [key, value] of rejected) {
  test(`E2E 안전 경계: ${key}의 원격/혼합 연결 거부 (${value.split('@').at(-1)})`, () => {
    assert.throws(() => assertLocalE2ETargets({ ...local, [key]: value }), new RegExp(`E2E 로컬 안전 경계: ${key}`));
  });
}

test('E2E 안전 경계: 누락·잘못된 URL·프로토콜·비루프백 유사 호스트를 거부하며 DB 비밀값을 출력하지 않음', () => {
  for (const key of Object.keys(local)) {
    for (const value of [
      undefined,
      '',
      'not a URL',
      '//localhost:3000',
      'http:localhost:3000',
      'http://local\nhost:3000',
      ' http://localhost:3000',
      'http://localhost:invalid',
      'file://localhost/tmp',
      'ftp://localhost',
    ]) {
      assert.throws(() => assertLocalE2ETargets({ ...local, [key]: value }), new RegExp(key));
    }
  }
  for (const host of ['127.0.0.2', '[::2]', '[::ffff:127.0.0.1]', 'localhost.remote.example', 'remote.example']) {
    assert.throws(() => assertLocalE2ETargets({ ...local, WEB_URL: `http://${host}` }), /WEB_URL/);
  }
  assert.throws(
    () => assertLocalE2ETargets({ ...local, DATABASE_URL: 'postgres://e2e:do-not-print@remote.example/e2e' }),
    (error) => error.message.includes('DATABASE_URL') && !error.message.includes('do-not-print'),
  );
});

// 실제 진입점의 실패를 확인합니다. 테스트 데이터 생성·브라우저 실행·DB 연결은 하지 않습니다.
// 모든 기본 대상은 루프백이며, 한 대상만 잘못되면 연결 점검/fixture 정리 이전에 guard 오류로 끝나야 합니다.
for (const [name, args] of [
  ['pnpm e2e의 runner', [join(root, 'scripts/e2e.mjs')]],
  [
    '직접 Playwright fixture',
    [
      require.resolve('@playwright/test/cli'),
      'test',
      '-c',
      'tests/e2e/playwright.config.ts',
      'ai-operator.spec.ts',
      '--project=main',
      '--list',
    ],
  ],
]) {
  for (const [key, value] of rejected.slice(0, 4)) {
    test(`${name}: ${key} 혼합 대상이 소비자 진입점에서 fail closed`, () => {
      const result = spawnSync(process.execPath, args, {
        cwd: root,
        env: { ...process.env, ...local, [key]: value },
        encoding: 'utf8',
        timeout: 20_000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
      assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`E2E 로컬 안전 경계: ${key}`));
    });
  }
}
