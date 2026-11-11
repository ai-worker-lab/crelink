// pnpm test(루트 package.json)에서 함께 실행합니다. 개별 실행: node --test scripts/lib/ci-local.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isCodeFile,
  verificationPlan,
  configEnvelope,
  CONFIG_INITIAL_KEYS,
  makeReceipt,
  receiptBlockers,
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
  assert.deepEqual(parseCliArgs([]), { report: false, dryRun: false, profile: 'full', selectors: [], qa: [] });
  assert.deepEqual(parseCliArgs(['--report', '--dry-run']), {
    report: true,
    dryRun: true,
    profile: 'full',
    selectors: [],
    qa: [],
  });
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

const opts = (profile = 'hotfix', selectors = ['api:src/instagram'], qa = []) => ({ profile, selectors, qa });
const cleanIdentity = {
  sha: 'a'.repeat(40),
  base: 'b'.repeat(40),
  clean: true,
  profile: 'hotfix',
  selectors: ['api:src/instagram'],
  qa: [],
  files: ['apps/api/src/instagram/graph.ts'],
  node: process.versions.node,
  platform: { os: process.platform, arch: process.arch, release: 'test' },
  lock: 'lock',
  runner: 'runner',
  environment: 'digest',
};
const plan = verificationPlan(opts(), cleanIdentity.files);
const passingResults = (stages) =>
  stages.map((entry) => ({
    step: entry.id,
    status: '통과',
    executed: entry.command ? [[entry.command, entry.args]] : [],
  }));
const receipt = () => makeReceipt(structuredClone(cleanIdentity), structuredClone(plan), passingResults(plan));

test('CLI는 고정 registry 값만 받으며 중복·빈 값·shell 인자를 거부한다', () => {
  assert.deepEqual(parseCliArgs(['--profile', 'auth', '--select', 'web,api:src/instagram', '--qa', 'visitor']), {
    report: false,
    dryRun: false,
    profile: 'auth',
    selectors: ['api:src/instagram', 'web'],
    qa: ['visitor'],
  });
  for (const args of [
    ['--profile'],
    ['--select', ''],
    ['--profile', 'unknown'],
    ['--report', '--report'],
    ['--select', 'web,'],
    ['--command', 'sh -c x'],
  ])
    assert.throws(() => parseCliArgs(args));
  assert.throws(() => verificationPlan(opts('auth', ['api:../../x']), []), /selector/);
  assert.throws(() => verificationPlan(opts('auth', ['web'], ['unknown']), []), /QA/);
});

test('소스 범위 누락·알 수 없는 공통 코드·full 축소·빈 필수 select 거부', () => {
  for (const files of [
    null,
    ['apps/api/src/config.service.ts'],
    ['apps/web/src/lib/instagram-dm-audience.ts'],
    ['apps/api/test/fixtures/new-fixture.ts'],
  ])
    assert.throws(() => verificationPlan(opts(), files), /full/);
  for (const file of [
    'scripts/lib/ci-local.mjs',
    'pnpm-lock.yaml',
    'apps/api/package.json',
    '.github/workflows/ci.yml',
    'infra/local/compose.yaml',
    'apps/api/Dockerfile',
    'eslint.config.mjs',
  ])
    assert.throws(() => verificationPlan(opts(), [file]), /full/);
  assert.throws(() => verificationPlan(opts('full'), []), /축소/);
  assert.throws(() => verificationPlan(opts('auth', []), []), /비었습니다/);
  assert.ok(receiptBlockers(receipt(), cleanIdentity, []).some((reason) => reason.includes('필수')));
});

test('새 test-only fixture selector가 실제 Graph 단위검사와 API 타입검사에 연결된다', () => {
  const stages = verificationPlan(opts('auth', ['api:test/fixtures/instagram-graph.fixtures.ts']), [
    'apps/api/test/fixtures/instagram-graph.fixtures.ts',
  ]);
  assert.deepEqual(stages.find((entry) => entry.id === 'api test').args.slice(-1), ['src/instagram/graph.spec.ts']);
  assert.ok(stages.some((entry) => entry.id === 'api typecheck'));
  assert.equal(
    stages.some((entry) => entry.id === 'DB 시작'),
    false,
  );
});

const apiTestPaths = (stages) => {
  const entry = stages.find(
    (entry) => entry.command === 'pnpm' && entry.args.includes('@crelink/api') && entry.args.includes('test'),
  );
  assert.ok(entry, 'API 시험 명령 필요');
  assert.deepEqual(entry.args.slice(0, 5), ['--filter', '@crelink/api', 'test', '--runInBand', '--runTestsByPath']);
  return entry.args.slice(5);
};
const hasDb = (stages) => stages.some((entry) => entry.command === 'make' && entry.args.includes('infra-up'));

test('Instagram 소스/시험 파일 그룹은 관련 명령과 DB만 선택한다', () => {
  const cases = [
    [
      'rules.service.ts',
      ['rules.service.ts', 'rules.controller.ts'],
      ['test/instagram-rules.e2e-spec.ts', 'test/instagram-contract.e2e-spec.ts'],
    ],
    [
      'webhook.service.ts',
      ['webhook.service.ts', 'webhook.controller.ts', 'webhook-payload.ts', 'raw-body.ts', 'signed-request.ts'],
      [
        'src/instagram/signed-request.spec.ts',
        'test/instagram-webhook.e2e-spec.ts',
        'test/instagram-contract.e2e-spec.ts',
      ],
    ],
    ['graph.ts', ['graph.ts'], ['src/instagram/graph.spec.ts', 'src/instagram/instagram-crypto.spec.ts']],
  ];
  for (const [group, sources, tests] of cases) {
    for (const profile of ['hotfix', 'auth']) {
      for (const file of [...sources.map((name) => `src/instagram/${name}`), ...tests]) {
        const stages = verificationPlan(opts(profile, [`api:src/instagram/${group}`]), [`apps/api/${file}`]);
        assert.deepEqual(apiTestPaths(stages), tests, file);
        assert.equal(
          hasDb(stages),
          tests.some((path) => path.startsWith('test/')),
          file,
        );
        assert.ok(
          stages.some(
            (entry) => entry.command === 'pnpm' && entry.args.join(' ') === '--filter @crelink/api typecheck',
          ),
        );
        assert.equal(
          stages.some(
            (entry) =>
              entry.args?.includes('@crelink/web') ||
              entry.args?.includes('@crelink/app') ||
              entry.action === 'stack' ||
              entry.id.startsWith('ego ') ||
              entry.action?.startsWith('image:'),
          ),
          false,
        );
        if (hasDb(stages)) {
          assert.ok(
            stages.findIndex((entry) => entry.command === 'make') <
              stages.findIndex((entry) => entry.id === 'api test'),
          );
          assert.ok(stages.some((entry) => entry.action === 'teardown'));
        }
      }
    }
  }
  assert.throws(
    () => verificationPlan(opts('hotfix', ['api:src/instagram/graph.ts']), ['apps/api/src/instagram/rules.service.ts']),
    /full/,
  );
  assert.throws(
    () =>
      verificationPlan(opts('hotfix', ['api:src/instagram/rules.service.ts']), [
        'apps/api/src/instagram/webhook.service.ts',
      ]),
    /full/,
  );
});

test('Instagram 모듈 전체 선택은 해당 도메인의 모든 기존 unit/e2e와 변경 시험을 덮는다', () => {
  const sourceDir = new URL('../../apps/api/src/instagram/', import.meta.url);
  const testDir = new URL('../../apps/api/test/', import.meta.url);
  const expected = [
    ...readdirSync(sourceDir)
      .filter((file) => file.endsWith('.spec.ts'))
      .map((file) => `src/instagram/${file}`),
    ...readdirSync(testDir)
      .filter((file) => /^instagram-.*\.e2e-spec\.ts$/.test(file))
      .map((file) => `test/${file}`),
  ].sort();
  for (const file of [...expected, 'src/instagram/rules.service.ts', 'src/instagram/webhook.service.ts']) {
    const stages = verificationPlan(opts(), [`apps/api/${file}`]);
    assert.deepEqual(apiTestPaths(stages).sort(), expected, file);
    assert.equal(hasDb(stages), true);
    assert.equal(
      stages.some((entry) => entry.args?.[0] === 'verify' && !entry.args.includes('--docs')),
      false,
    );
  }
});

test('hotfix/auth는 관련 API·web unit과 타입검사, shared는 앱/API/web 소비자도 포함한다', () => {
  for (const profile of ['hotfix', 'auth']) {
    const stages = verificationPlan(opts(profile, ['api:src/instagram/graph.ts', 'web', 'shared']), [
      'packages/shared/src/instagram-dm.ts',
    ]);
    for (const id of [
      'api test',
      'web test',
      'api typecheck',
      'web typecheck',
      'app consumer typecheck',
      'shared build',
      'shared test',
    ])
      assert.ok(
        stages.some((entry) => entry.id === id),
        id,
      );
    assert.equal(
      stages.some((entry) => entry.id.startsWith('ego ') || entry.id.startsWith('이미지') || entry.id === 'DB 시작'),
      false,
    );
    assert.equal(
      stages.some((entry) => entry.action === 'meta-live'),
      false,
    );
  }
  const e2e = verificationPlan(opts('hotfix', ['api:test/instagram-connection.e2e-spec.ts']), [
    'apps/api/test/instagram-connection.e2e-spec.ts',
  ]);
  assert.deepEqual(apiTestPaths(e2e), ['test/instagram-connection.e2e-spec.ts']);
  assert.ok(e2e.findIndex((entry) => entry.id === 'DB 시작') < e2e.findIndex((entry) => entry.id === 'api test'));
  const qa = verificationPlan(opts('hotfix', ['web'], ['visitor']), []);
  assert.deepEqual(
    qa.filter((entry) => entry.id.startsWith('ego ')).map((entry) => entry.id),
    ['ego visitor'],
  );
  const sharedOnly = verificationPlan(opts('hotfix', ['shared']), ['packages/shared/src/instagram-dm.ts']);
  assert.deepEqual(
    sharedOnly.filter((entry) => entry.command === 'pnpm' && entry.args[0] === '--filter').map((entry) => entry.args),
    [
      ['--filter', '@crelink/shared', 'build'],
      ['--filter', '@crelink/shared', 'test'],
      ['--filter', '@crelink/app', 'typecheck'],
      ['--filter', '@crelink/api', 'typecheck'],
      ['--filter', '@crelink/web', 'typecheck'],
    ],
  );
  assert.equal(hasDb(sharedOnly), false);
});

test('기본 full은 기존 코드/문서 경로·ego 네 종·이미지와 정리를 유지한다', () => {
  const full = verificationPlan(parseCliArgs([]), ['scripts/lib/ci-local.mjs']);
  assert.deepEqual(
    full.map((entry) => entry.id),
    [
      'work:scope',
      '인스턴스 설정',
      'DB 시작',
      'pnpm verify',
      '스택 시작',
      'ego smoke',
      'ego analytics-responsive',
      'ego visitor',
      'ego signup-funnel',
      '스택 정리',
      '이미지 api',
      '이미지 web',
    ],
  );
  assert.deepEqual(
    verificationPlan(parseCliArgs([]), ['AGENTS.md']).map((entry) => entry.id),
    ['pnpm verify --docs', 'work:scope'],
  );
  assert.deepEqual(verificationPlan(parseCliArgs([]), null), full);
  assert.throws(() => verificationPlan(opts('full', [], ['visitor']), []), /축소/);
});

const syntheticConfig =
  'SECRET=ENC[AES256_GCM,data:old]\nWEB_URL=https://example.test\nsops_age__list_0__map_recipient=age-public\nsops_mac=ENC[AES256_GCM,data:macold]\nsops_lastmodified=2026-11-10T00:00:00Z\n';
const initialConfig = (keys = CONFIG_INITIAL_KEYS) =>
  syntheticConfig + keys.map((key) => `${key}=ENC[AES256_GCM,data:synthetic]\n`).join('');

test('config 최초 주입 허용 목록은 기존 INSTAGRAM_REQUIRED_KEYS 원본 8개와 일치한다(TS 실행 없음)', () => {
  const source = readFileSync(new URL('../../apps/api/src/config.service.ts', import.meta.url), 'utf8');
  const declaration = /export const INSTAGRAM_REQUIRED_KEYS = \[([\s\S]*?)\] as const;/.exec(source);
  assert.ok(declaration, '기존 export 배열 정의 필요');
  const keys = [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.equal(keys.length, 8);
  assert.deepEqual([...CONFIG_INITIAL_KEYS].sort(), keys.sort());
});

test('config는 기존 encrypted 값 교체와 기존 8개 최초 일괄 주입만 허용한다', () => {
  const before = syntheticConfig;
  configEnvelope(
    before,
    before.replace('data:old', 'data:new').replace('data:macold', 'data:macnew').replace('2026-11-10', '2026-11-11'),
  );
  const initial = initialConfig();
  configEnvelope(before, initial);
  configEnvelope(initial, initial.replaceAll('data:synthetic', 'data:rotated'));
  configEnvelope(before, initialConfig([...CONFIG_INITIAL_KEYS].reverse()).replace('data:macold', 'data:macnew'));
  for (let count = 1; count < CONFIG_INITIAL_KEYS.length; count++) {
    assert.throws(() => configEnvelope(before, initialConfig(CONFIG_INITIAL_KEYS.slice(0, count))), /full/);
    assert.throws(() => configEnvelope(initialConfig(CONFIG_INITIAL_KEYS.slice(0, count)), initial), /full/);
  }
  for (const after of [
    before.replace('age-public', 'other-recipient'),
    before.replace('https://example.test', 'other'),
    before + 'NEW=ENC[AES256_GCM,data:new]\n',
    before.replace('SECRET=', 'RENAME='),
    before.replace('SECRET=ENC[AES256_GCM,data:old]\n', ''),
    initial + 'UNREGISTERED=ENC[AES256_GCM,data:new]\n',
    initial.replace('META_APP_ID=ENC[AES256_GCM,data:synthetic]', 'META_APP_ID=plaintext'),
    initial.replace('age-public', 'other-recipient'),
    initial.replace('https://example.test', 'other'),
    initial.replace('sops_mac=ENC[AES256_GCM,data:macold]', 'sops_mac=plaintext'),
    initial.replace('sops_lastmodified=2026-11-10T00:00:00Z', 'sops_lastmodified=invalid'),
    initial.replace('META_APP_ID=', 'UNREGISTERED='),
    initial + 'META_APP_ID=ENC[AES256_GCM,data:duplicate]\n',
  ])
    assert.throws(() => configEnvelope(before, after), /full/);
  for (const key of CONFIG_INITIAL_KEYS) {
    assert.throws(
      () => configEnvelope(before, initial.replace(`${key}=ENC[AES256_GCM,data:synthetic]`, `${key}=plaintext`)),
      /full/,
    );
    assert.throws(
      () => configEnvelope(initial, initial.replace(`${key}=ENC[AES256_GCM,data:synthetic]\n`, '')),
      /full/,
    );
  }
  const stages = verificationPlan(opts('config', []), ['infra/prod/secrets/home-server.sops.env']);
  assert.ok(stages.some((entry) => entry.action === 'config-envelope'));
  assert.throws(() => verificationPlan(opts('config', []), ['infra/prod/lib.sh']), /full/);
  for (const file of [
    'apps/api/src/config.service.ts',
    '.sops.yaml',
    'infra/prod/compose.yaml',
    '.github/workflows/deploy.yml',
  ])
    assert.throws(() => verificationPlan(opts('config', []), [file]), /full/);
});

test('정상 receipt만 수용하고 sha/base/clean/profile/select/명령/환경/Node/platform/lock/runner 바꿔치기 거부', () => {
  assert.deepEqual(receiptBlockers(receipt(), cleanIdentity, plan), []);
  for (const [key, value] of Object.entries({
    sha: 'other',
    base: 'other',
    clean: false,
    profile: 'auth',
    selectors: ['web'],
    qa: ['visitor'],
    files: [],
    node: 'other',
    platform: { arch: 'other' },
    lock: 'other',
    runner: 'other',
    environment: 'other',
  })) {
    const altered = receipt();
    altered.identity[key] = value;
    assert.ok(receiptBlockers(altered, cleanIdentity, plan).length, key);
  }
  for (const mutate of [
    (r) => {
      r.commands[0].args.push('--fake');
    },
    (r) => {
      r.plan[0].required = false;
    },
    (r) => {
      r.plan[0].args.push('--fake');
    },
    (r) => {
      r.results[0].executed = [];
    },
    (r) => {
      r.results[0].executed = [['sh', ['-c', 'true']]];
    },
    (r) => {
      r.complete = false;
    },
    (r) => {
      r.interrupted = true;
    },
    (r) => {
      r.results.pop();
    },
    (r) => {
      r.observations.push(r.results.pop());
    },
    (r) => {
      r.results.push(r.results[0]);
    },
    (r) => {
      r.results[1] = r.results[0];
    },
    (r) => {
      r.results[0].status = '건너뜀';
    },
    (r) => {
      r.results[0].status = '실패';
    },
    (r) => {
      r.results[0].reason = 'FAIL';
    },
  ]) {
    const altered = receipt();
    mutate(altered);
    assert.ok(receiptBlockers(altered, cleanIdentity, plan).length);
  }
  assert.match(receiptBlockers(null, cleanIdentity, plan).join(), /영수증 없음/);
});

test('사전 선언된 외부 관측 FAIL만 비차단, 내부 필수 실패를 외부로 바꾸지 못한다', () => {
  const stages = verificationPlan(opts(), cleanIdentity.files, { live: true });
  const results = passingResults(stages);
  results.at(-1).status = '실패';
  results.at(-1).reason = '외부 관측 불가';
  const liveReceipt = makeReceipt(cleanIdentity, stages, results);
  assert.deepEqual(receiptBlockers(liveReceipt, cleanIdentity, stages), []);
  assert.equal(liveReceipt.observations.at(-1).status, '실패');
  results[0].status = '실패';
  liveReceipt.plan[0].required = false;
  liveReceipt.plan[0].observation = 'external';
  assert.ok(
    receiptBlockers(liveReceipt, cleanIdentity, verificationPlan(opts(), cleanIdentity.files, { live: true })).length,
  );
  assert.ok(receiptBlockers(makeReceipt(cleanIdentity, stages, results, true), cleanIdentity, stages).length);
});

// 실제 임시 Git 저장소 + fake 명령. DB/Docker/network/listen 없이 CLI의 실행 경계를 확인합니다.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function cliFixture({ full = false, live = false, consumers = false, config = false } = {}) {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const temp = mkdtempSync(join(tmpdir(), 'crelink-0281-'));
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const git = (...args) =>
    execFileSync(realGit, args, { cwd: temp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  cpSync(join(source, 'scripts'), join(temp, 'scripts'), { recursive: true });
  for (const file of ['package.json', 'pnpm-lock.yaml', '.nvmrc']) cpSync(join(source, file), join(temp, file));
  symlinkSync(join(source, 'node_modules'), join(temp, 'node_modules'), 'dir');
  mkdirSync(join(temp, '.local/bin'), { recursive: true });
  mkdirSync(join(temp, 'apps/api/test/fixtures'), { recursive: true });
  writeFileSync(join(temp, '.gitignore'), '.local/\nnode_modules/\n.env*\npackages/shared/dist/\n');
  if (config) {
    mkdirSync(join(temp, 'infra/prod/secrets'), { recursive: true });
    writeFileSync(join(temp, 'infra/prod/secrets/home-server.sops.env'), syntheticConfig);
  }
  if (consumers) {
    mkdirSync(join(temp, 'packages/shared/src'), { recursive: true });
    writeFileSync(join(temp, 'packages/shared/src/index.ts'), 'synthetic current shared source\n');
    writeFileSync(join(temp, '.local/consumer-guard'), '1');
    mkdirSync(join(temp, 'apps/api/src/instagram'), { recursive: true });
    writeFileSync(join(temp, 'apps/api/src/instagram/graph.ts'), '// synthetic graph\n');
    mkdirSync(join(temp, 'apps/web/src/lib'), { recursive: true });
    writeFileSync(
      join(temp, 'apps/web/src/lib/instagram-dm-audience.spec.ts'),
      `
      import assert from 'node:assert/strict';
      import { appendFileSync, readFileSync } from 'node:fs';
      appendFileSync('.local/calls.jsonl', JSON.stringify(['node-web', ['--test']]) + '\\n');
      assert.equal(readFileSync('packages/shared/dist/index.js', 'utf8'), readFileSync('packages/shared/src/index.ts', 'utf8'));
    `,
    );
    // web registry의 나머지 시험도 실제 Node가 synthetic dist 소비자만 실행합니다.
    for (const file of [
      'apps/web/src/components/manage/instagram/state.spec.ts',
      'apps/web/src/components/manage/instagram-deliveries/state.spec.ts',
      'apps/web/src/app/me/integrations/instagram/callback/route.spec.ts',
      'apps/web/src/app/(public)/privacy/instagram-deletion/[code]/status.spec.ts',
    ]) {
      mkdirSync(dirname(join(temp, file)), { recursive: true });
      cpSync(join(temp, 'apps/web/src/lib/instagram-dm-audience.spec.ts'), join(temp, file));
    }
  }
  if (full) {
    for (const file of [
      'infra/local/.env.example',
      'apps/api/.env.example',
      'apps/web/.env.example',
      'apps/app/.env.example',
    ]) {
      mkdirSync(dirname(join(temp, file)), { recursive: true });
      cpSync(join(source, file), join(temp, file));
    }
    for (const name of ['smoke', 'analytics-responsive', 'visitor', 'signup-funnel']) {
      const file = join(temp, `tests/e2e/ego/${name}.mjs`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        `import { appendFileSync } from 'node:fs'; appendFileSync('.local/calls.jsonl', JSON.stringify(['node-ego', ['${name}']]) + '\\n');`,
      );
    }
    writeFileSync(
      join(temp, '.local/hermetic.mjs'),
      `
      import net from 'node:net';
      import { EventEmitter } from 'node:events';
      import { syncBuiltinESMExports } from 'node:module';
      net.connect = () => {
        const socket = new EventEmitter(); socket.destroy = () => {}; socket.setTimeout = () => socket;
        queueMicrotask(() => socket.emit('error', new Error('synthetic closed port'))); return socket;
      };
      syncBuiltinESMExports();
      globalThis.fetch = async (url) => {
        if (String(url).startsWith('https://graph.facebook.com/')) throw new Error('synthetic external unavailable');
        return new Response('{}', { status: 200 });
      };
    `,
    );
    writeFileSync(join(temp, '.local/full'), '1');
  }
  writeFileSync(join(temp, 'AGENTS.md'), '임시 시험 저장소\n');
  git('init', '-b', 'work/0281-hermetic');
  git('config', 'user.name', 'Synthetic CI Test');
  git('config', 'user.email', 'synthetic@example.test');
  git('add', '.');
  git('commit', '-qm', 'synthetic base');
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
  git('remote', 'add', 'origin', 'https://github.com/synthetic/fixture.git');
  const fake = `#!${process.execPath}
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const name = basename(process.argv[1]);
const args = process.argv.slice(2);
const root = process.cwd();
if (name === 'git') {
  if (args[0] === 'fetch') process.exit(0); // 네트워크 금지
  if (args[0] === 'ls-remote') { console.log(execFileSync(${JSON.stringify(realGit)}, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() + '\\trefs/heads/work/0281-hermetic'); process.exit(0); }
  process.stdout.write(execFileSync(${JSON.stringify(realGit)}, args)); process.exit(0);
}
appendFileSync(join(root, '.local/calls.jsonl'), JSON.stringify([name, args]) + '\\n');
if (name === 'pnpm' && existsSync(join(root, '.local/consumer-guard'))) {
  const source = join(root, 'packages/shared/src/index.ts');
  const dist = join(root, 'packages/shared/dist/index.js');
  if (args[0] === '--filter' && args[1] === '@crelink/shared' && args[2] === 'build') {
    mkdirSync(join(root, 'packages/shared/dist'), { recursive: true });
    writeFileSync(dist, readFileSync(source));
  }
  if (args[0] === '--filter' && ['@crelink/api', '@crelink/web', '@crelink/app'].includes(args[1]) && ['test', 'typecheck'].includes(args[2])) {
    if (!existsSync(dist) || readFileSync(dist, 'utf8') !== readFileSync(source, 'utf8')) throw new Error('missing/stale shared dist');
  }
}
if (name === 'pnpm' && existsSync(join(root, '.local/fail'))) process.exit(1);
if (name === 'pnpm' && existsSync(join(root, '.local/interrupt'))) {
  process.kill(process.ppid, 'SIGTERM'); setTimeout(() => process.exit(0), 1000);
}
if (name === 'docker' || name === 'make') {
  if (!existsSync(join(root, '.local/full'))) throw new Error('hermetic 시험에서 허용하지 않은 인프라 명령');
  if (name === 'docker' && args[0] === 'version') console.log('arm64');
  if (name === 'docker' && args[0] === 'ps') console.log('postgres');
}
`;
  for (const name of ['git', 'pnpm', 'gh', 'docker', 'make'])
    writeFileSync(join(temp, '.local/bin', name), fake, { mode: 0o755 });
  const env = { ...process.env, PATH: `${join(temp, '.local/bin')}:${process.env.PATH}` };
  // 상위 node:test의 내부 표식을 넘기면 하위 `node --test`가 시험 파일을 실행하지 않을 수 있습니다.
  delete env.NODE_TEST_CONTEXT;
  if (full) env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --import=${join(temp, '.local/hermetic.mjs')}`;
  // 사용자의 선택/오류 주입 환경은 이 hermetic 저장소에 상속하지 않습니다.
  for (const key of ['INSTAGRAM_LIVE', 'EGO_TEST_ONLY', 'EGO_TEST_FAULT', 'EGO_TEST_INJECT_CSS']) delete env[key];
  if (live) env.INSTAGRAM_LIVE = '1';
  let toolCallId = 0;
  const run = (...args) =>
    spawnSync(process.execPath, ['scripts/ci-local.mjs', ...args], {
      cwd: temp,
      env: { ...env, CODEX_TOOL_CALL_ID: `synthetic-tool-call-${++toolCallId}` },
      encoding: 'utf8',
      timeout: 20_000,
    });
  const calls = () =>
    existsSync(join(temp, '.local/calls.jsonl'))
      ? readFileSync(join(temp, '.local/calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
      : [];
  const receiptPath = () => join(temp, '.local/ci/receipts', `${git('rev-parse', 'HEAD')}.json`);
  return { temp, git, run, calls, receiptPath, env };
}

test('hermetic CLI: shared selector 없이 API/web 소비자 전에 build 1회(새 checkout·오래된 dist)', () => {
  for (const area of ['api', 'web']) {
    for (const stale of [false, true]) {
      const fixture = cliFixture({ consumers: true });
      try {
        const changed =
          area === 'api' ? 'apps/api/src/instagram/graph.ts' : 'apps/web/src/lib/instagram-dm-audience.spec.ts';
        writeFileSync(
          join(fixture.temp, changed),
          readFileSync(join(fixture.temp, changed), 'utf8') + '\n// synthetic change\n',
        );
        fixture.git('add', '.');
        fixture.git('commit', '-qm', 'synthetic consumer change');
        if (stale) {
          mkdirSync(join(fixture.temp, 'packages/shared/dist'), { recursive: true });
          writeFileSync(join(fixture.temp, 'packages/shared/dist/index.js'), 'synthetic stale dist\n');
        }
        const result = fixture.run(
          '--profile',
          'auth',
          '--select',
          area === 'api' ? 'api:src/instagram/graph.ts' : 'web',
        );
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const calls = fixture.calls();
        const builds = calls.filter(([command, args]) => command === 'pnpm' && args[1] === '@crelink/shared');
        assert.deepEqual(builds, [['pnpm', ['--filter', '@crelink/shared', 'build']]]);
        const buildAt = calls.findIndex((entry) => entry === builds[0]);
        const consumers = calls.flatMap(([command, args], index) =>
          command === 'node-web' ||
          (command === 'pnpm' &&
            ['@crelink/api', '@crelink/web', '@crelink/app'].includes(args[1]) &&
            ['test', 'typecheck'].includes(args[2]))
            ? [index]
            : [],
        );
        assert.ok(consumers.length >= 2, `시험과 typecheck가 실제 호출되어야 함: ${JSON.stringify(calls)}`);
        assert.ok(consumers.every((index) => buildAt < index));
        assert.equal(
          calls.some(([command]) => ['make', 'docker', 'gh'].includes(command)),
          false,
        );
        assert.equal(
          calls.some(([, args]) => args.includes('@crelink/app')),
          false,
        );
        assert.equal(
          calls.some(([, args]) => args.includes(area === 'api' ? '@crelink/web' : '@crelink/api')),
          false,
        );
      } finally {
        rmSync(fixture.temp, { recursive: true, force: true });
      }
    }
  }
});

test('hermetic CLI: config 최초 등록만 허용하며 부분·평문·수신자·파서/배포 변경은 검사 전 거부', () => {
  const fixture = cliFixture({ config: true });
  const configFile = join(fixture.temp, 'infra/prod/secrets/home-server.sops.env');
  try {
    writeFileSync(configFile, initialConfig());
    fixture.git('add', '.');
    fixture.git('commit', '-qm', 'synthetic initial config');
    const result = fixture.run('--profile', 'config');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(fixture.calls(), [
      ['pnpm', ['work:scope', '--base', 'origin/main']],
      ['pnpm', ['verify', '--docs', '--keep-going']],
    ]);
    const count = fixture.calls().length;
    for (const text of [
      initialConfig(CONFIG_INITIAL_KEYS.slice(1)),
      initialConfig().replace('META_APP_ID=ENC[AES256_GCM,data:synthetic]', 'META_APP_ID=plain'),
      initialConfig().replace('age-public', 'other-recipient'),
    ]) {
      writeFileSync(configFile, text);
      const rejected = fixture.run('--profile', 'config');
      assert.equal(rejected.status, 2, rejected.stdout + rejected.stderr);
      assert.equal(fixture.calls().length, count);
    }
    writeFileSync(configFile, initialConfig());
    for (const file of ['apps/api/src/config.service.ts', 'infra/prod/deploy.sh']) {
      mkdirSync(dirname(join(fixture.temp, file)), { recursive: true });
      writeFileSync(join(fixture.temp, file), '// synthetic parser/deploy change\n');
      assert.equal(fixture.run('--profile', 'config').status, 2);
      assert.equal(fixture.calls().length, count);
      rmSync(join(fixture.temp, file));
    }
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test('hermetic CLI: 호출별 CODEX_TOOL_CALL_ID 변경은 report 검사 0회 재사용, 테스트 환경 변경은 거부', () => {
  const fixture = cliFixture();
  try {
    fixture.env.TEST_DATABASE_URL = 'postgresql://synthetic:synthetic@example.test/original';
    const first = fixture.run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const before = fixture.calls();
    assert.deepEqual(
      before.map(([, args]) => args[0]),
      ['verify', 'work:scope'],
    );
    const report = fixture.run('--report');
    assert.equal(report.status, 0, report.stdout + report.stderr);
    assert.match(report.stdout, /tests 0/);
    assert.deepEqual(
      fixture
        .calls()
        .slice(before.length)
        .map(([command]) => command),
      ['gh'],
    );
    assert.equal(fixture.calls().filter(([command]) => command === 'pnpm').length, before.length);
    const count = fixture.calls().length;
    fixture.env.TEST_DATABASE_URL = 'postgresql://synthetic:synthetic@example.test/changed';
    const changedEnvironment = fixture.run('--report');
    assert.equal(changedEnvironment.status, 1, changedEnvironment.stdout + changedEnvironment.stderr);
    assert.match(changedEnvironment.stderr, /영수증 대상 불일치/);
    assert.equal(fixture.calls().length, count);
    fixture.env.TEST_DATABASE_URL = 'postgresql://synthetic:synthetic@example.test/original';
    rmSync(fixture.receiptPath());
    const missing = fixture.run('--report');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /영수증 없음/);
    assert.equal(fixture.calls().length, count);
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test('hermetic CLI: fixture 범위·report 옵션/결과 바꿔치기·dirty·재실행 실패·구 영수증 재사용 거부', () => {
  const fixture = cliFixture();
  try {
    writeFileSync(
      join(fixture.temp, 'apps/api/test/fixtures/instagram-graph.fixtures.ts'),
      'export const synthetic = true;\n',
    );
    fixture.git('add', '.');
    fixture.git('commit', '-qm', 'synthetic fixture');
    const args = ['--profile', 'auth', '--select', 'api:test/fixtures/instagram-graph.fixtures.ts'];
    const first = fixture.run(...args);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const calls = fixture.calls();
    assert.ok(calls.some(([, argv]) => argv.includes('src/instagram/graph.spec.ts')));
    assert.equal(
      calls.some(([command]) => command === 'make' || command === 'docker'),
      false,
    );
    const originalBase = fixture.git('rev-parse', 'origin/main');
    const receiptFile = fixture.receiptPath();
    const saved = readFileSync(receiptFile, 'utf8');
    const reused = fixture.run(...args, '--report', '--dry-run');
    assert.equal(reused.status, 0, reused.stdout + reused.stderr);
    assert.equal(fixture.calls().length, calls.length);
    writeFileSync(join(fixture.temp, '.local/instance.env'), 'SYNTHETIC=value\n');
    assert.equal(fixture.run(...args, '--report').status, 1);
    rmSync(join(fixture.temp, '.local/instance.env'));
    fixture.git('update-ref', 'refs/remotes/origin/main', fixture.git('rev-parse', 'HEAD'));
    assert.equal(fixture.run(...args, '--report').status, 1);
    fixture.git('update-ref', 'refs/remotes/origin/main', originalBase);
    assert.equal(fixture.calls().length, calls.length);
    for (const options of [
      [],
      ['--profile', 'hotfix', '--select', 'api:test/fixtures/instagram-graph.fixtures.ts'],
      ['--profile', 'auth', '--select', 'api:src/instagram'],
    ]) {
      const wrong = fixture.run(...options, '--report');
      assert.equal(wrong.status, 1, wrong.stdout + wrong.stderr);
      assert.equal(fixture.calls().length, calls.length);
    }
    for (const mutate of [
      (r) => {
        r.identity.environment = 'different';
      },
      (r) => {
        r.results.pop();
      },
      (r) => {
        r.results[0].status = '실패';
        r.plan[0].required = false;
        r.plan[0].observation = 'external';
      },
      (r) => {
        r.results[0].executed = [];
      },
    ]) {
      const changed = JSON.parse(saved);
      mutate(changed);
      writeFileSync(receiptFile, JSON.stringify(changed));
      assert.equal(fixture.run(...args, '--report').status, 1);
      assert.equal(fixture.calls().length, calls.length);
    }
    writeFileSync(receiptFile, saved);
    writeFileSync(
      join(fixture.temp, 'apps/api/test/fixtures/instagram-graph.fixtures.ts'),
      'export const synthetic = false;\n',
    );
    assert.equal(fixture.run(...args, '--report').status, 1);
    assert.equal(fixture.calls().length, calls.length);
    const dirtyRun = fixture.run(...args);
    assert.equal(dirtyRun.status, 1, dirtyRun.stdout + dirtyRun.stderr);
    assert.match(dirtyRun.stdout, /결과: 실패 \(receipt 거부\)/);
    assert.equal(existsSync(receiptFile), false);
    fixture.git('checkout', '--', 'apps/api/test/fixtures/instagram-graph.fixtures.ts');
    writeFileSync(join(fixture.temp, '.local/fail'), '1');
    const failed = fixture.run(...args);
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    assert.equal(existsSync(receiptFile), false);
    const after = fixture.calls().length;
    assert.equal(fixture.run(...args, '--report').status, 1);
    assert.equal(fixture.calls().length, after);
    rmSync(join(fixture.temp, '.local/fail'));
    writeFileSync(receiptFile, saved);
    writeFileSync(join(fixture.temp, '.local/interrupt'), '1');
    const interrupted = fixture.run(...args);
    assert.equal(interrupted.status, 143, interrupted.stdout + interrupted.stderr);
    assert.equal(existsSync(receiptFile), false);
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test('hermetic CLI: full 코드 경로는 fake DB/스택/ego 4종/정리/이미지 그대로 실행하고 report에서 0회', () => {
  const fixture = cliFixture({ full: true });
  try {
    writeFileSync(join(fixture.temp, 'scripts/synthetic-change.mjs'), '// synthetic runner change\n');
    fixture.git('add', '.');
    fixture.git('commit', '-qm', 'synthetic code');
    const first = fixture.run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const calls = fixture.calls();
    assert.deepEqual(
      calls.filter(([command]) => command === 'make').map(([, args]) => args),
      [['infra-up'], ['up'], ['app-down', 'web-down', 'api-down']],
    );
    assert.deepEqual(
      calls.filter(([command]) => command === 'node-ego').map(([, args]) => args[0]),
      ['smoke', 'analytics-responsive', 'visitor', 'signup-funnel'],
    );
    assert.deepEqual(
      calls.filter(([command, args]) => command === 'docker' && args[0] === 'buildx').map(([, args]) => args.at(-2)),
      ['apps/api/Dockerfile', 'apps/web/Dockerfile'],
    );
    assert.ok(
      calls.some(([command, args]) => command === 'pnpm' && args[0] === 'verify' && args[1] === '--keep-going'),
    );
    const reported = fixture.run('--report');
    assert.equal(reported.status, 0, reported.stdout + reported.stderr);
    assert.match(reported.stdout, /tests 0/);
    assert.deepEqual(
      fixture
        .calls()
        .slice(calls.length)
        .map(([command]) => command),
      ['gh'],
    );
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test('hermetic CLI: opt-in 외부 관측 불가는 FAIL 그대로 보관하고 report에서 관측/검사 재실행 0회', () => {
  const fixture = cliFixture({ full: true, live: true });
  try {
    writeFileSync(join(fixture.temp, 'scripts/synthetic-change.mjs'), '// synthetic code\n');
    fixture.git('add', '.');
    fixture.git('commit', '-qm', 'synthetic live observation');
    const first = fixture.run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /실패 1\(비차단 관측 1\)/);
    const saved = JSON.parse(readFileSync(fixture.receiptPath(), 'utf8'));
    assert.equal(saved.observations.find((result) => result.step === 'Meta 도달 관측').status, '실패');
    const calls = fixture.calls().length;
    const report = fixture.run('--report', '--dry-run');
    assert.equal(report.status, 0, report.stdout + report.stderr);
    assert.match(report.stdout, /tests 0/);
    assert.equal(fixture.calls().length, calls);
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});
