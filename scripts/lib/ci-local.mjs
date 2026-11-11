// pnpm ci:local의 판정 규칙입니다. 프로세스를 띄우지 않아 단위 시험(ci-local.test.mjs)으로 고정합니다.
// 기준 문서: docs/development/verification.md#로컬-ci

export const REPORT_CONTEXT = 'CI 통과';
export const USAGE =
  '사용법: pnpm ci:local [--profile config|hotfix|auth|full] [--select api:<등록 경로>,web,shared] [--qa <이름>] [--report [--dry-run]]';

/**
 * .github/workflows/ci.yml `changes` job의 grep과 같은 기준입니다. 그쪽을 바꾸면 여기도 함께 고칩니다.
 * 문서는 docs/·design/ 아래 파일과 *.md이고, RELEASES.md는 웹 /docs/releases가 빌드 때 읽으므로 코드로 봅니다.
 */
export function isCodeFile(file) {
  if (file === 'RELEASES.md') return true;
  return !(file.startsWith('docs/') || file.startsWith('design/') || file.endsWith('.md'));
}

/** `git status --porcelain -z --no-renames` 출력에서 경로만 뽑습니다. 앞 공백이 상태 칸이므로 trim한 값을 넘기면 안 됩니다. */
export function porcelainPaths(output) {
  return output
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(3));
}

export function parseCliArgs(args) {
  const options = { report: false, dryRun: false, profile: 'full', selectors: [], qa: [] };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw new Error(`중복 인자: ${flag}`);
    seen.add(flag);
    if (flag === '--report') options.report = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (['--profile', '--select', '--qa'].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error(`값이 필요합니다: ${flag}`);
      if (flag === '--profile') options.profile = value;
      else {
        const values = value.split(',');
        if (values.some((item) => !item || item.trim() !== item) || new Set(values).size !== values.length)
          throw new Error(`잘못된 목록: ${flag}`);
        options[flag === '--select' ? 'selectors' : 'qa'] = values.sort();
      }
    } else throw new Error(`알 수 없는 인자: ${flag}`);
  }
  if (!['config', 'hotfix', 'auth', 'full'].includes(options.profile)) throw new Error('알 수 없는 profile');
  if (options.dryRun && !options.report) throw new Error('--dry-run은 --report와 함께 씁니다.');
  return options;
}

/** origin URL에서 owner/repo를 뽑습니다. URL에 자격 증명이 있어도 결과에는 들어가지 않습니다. */
export function repoFromRemote(url) {
  return /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url ?? '')?.[1] ?? null;
}

export function statusRequestArgs({ repo, sha, description }) {
  return [
    'api',
    '--method',
    'POST',
    `repos/${repo}/statuses/${sha}`,
    '-f',
    'state=success',
    '-f',
    `context=${REPORT_CONTEXT}`,
    '-f',
    `description=${description}`,
  ];
}

/**
 * commit status를 기록하면 안 되는 이유를 모읍니다. 빈 배열일 때만 기록합니다.
 * 원격 브랜치 tip과 같아야 합니다. 조상이기만 하면 PR의 필수 검사가 보는 커밋이 아닙니다.
 */
export function reportBlockers({
  interrupted,
  failed,
  dirtyAtStart,
  dirtyAtEnd,
  startSha,
  endSha,
  branch,
  remoteSha,
  repo,
}) {
  const blockers = [];
  if (interrupted) blockers.push('실행이 중단됐습니다.');
  if (failed.length > 0) blockers.push(`실패한 단계가 있습니다: ${failed.join(', ')}`);
  if (dirtyAtStart) blockers.push('시작할 때 작업 트리가 깨끗하지 않아 검사한 내용이 HEAD와 다릅니다.');
  if (dirtyAtEnd) blockers.push('끝날 때 작업 트리가 깨끗하지 않습니다.');
  if (startSha !== endSha) blockers.push(`실행 중 HEAD가 바뀌었습니다(${startSha} → ${endSha}).`);
  if (!repo) blockers.push('origin에서 GitHub 저장소를 찾지 못했습니다.');
  if (!branch) blockers.push('브랜치가 아닙니다(detached HEAD).');
  else if (!remoteSha) blockers.push(`origin/${branch}가 없습니다. 먼저 push하세요.`);
  else if (remoteSha !== endSha) blockers.push(`origin/${branch}의 tip(${remoteSha})이 HEAD와 다릅니다. push하세요.`);
  return blockers;
}

// 0281: 범위·필수 검사·외부 관측의 유일한 registry. 미등록 소스는 full로 확인합니다.
export const EGO_SUITES = Object.freeze({
  smoke: 'tests/e2e/ego/smoke.mjs',
  'analytics-responsive': 'tests/e2e/ego/analytics-responsive.mjs',
  visitor: 'tests/e2e/ego/visitor.mjs',
  'signup-funnel': 'tests/e2e/ego/signup-funnel.mjs',
});
export const CONFIG_FILE = 'infra/prod/secrets/home-server.sops.env';
// 기존 config.service.ts의 정의값 최초 주입에만 사용합니다. 원본과의 일치는 unit으로 확인합니다.
export const CONFIG_INITIAL_KEYS = Object.freeze([
  'META_APP_ID',
  'META_APP_SECRET',
  'META_LOGIN_CONFIG_ID',
  'META_WEBHOOK_VERIFY_TOKEN',
  'INSTAGRAM_TOKEN_KEYS',
  'INSTAGRAM_TOKEN_KEY_CURRENT',
  'INSTAGRAM_COMMENTER_HASH_KEY',
  'INSTAGRAM_OPT_OUT_KEY',
]);
const API_TESTS = [
  'src/instagram/instagram-crypto.spec.ts',
  'src/instagram/connection.service.spec.ts',
  'src/instagram/keyword.spec.ts',
  'src/instagram/signed-request.spec.ts',
  'src/instagram/graph.spec.ts',
];
const INSTAGRAM_E2E_TESTS = [
  'test/instagram-admin.e2e-spec.ts',
  'test/instagram-all-comments-migration.e2e-spec.ts',
  'test/instagram-connection.e2e-spec.ts',
  'test/instagram-contract.e2e-spec.ts',
  'test/instagram-deliveries.e2e-spec.ts',
  'test/instagram-opt-out.e2e-spec.ts',
  'test/instagram-rules.e2e-spec.ts',
  'test/instagram-webhook.e2e-spec.ts',
  'test/instagram-worker.e2e-spec.ts',
];
const apiTestFiles = (tests) => tests.map((file) => `apps/api/${file}`);
const RULES_TESTS = ['test/instagram-rules.e2e-spec.ts', 'test/instagram-contract.e2e-spec.ts'];
const WEBHOOK_TESTS = [
  'src/instagram/signed-request.spec.ts',
  'test/instagram-webhook.e2e-spec.ts',
  'test/instagram-contract.e2e-spec.ts',
];
const WEB_TESTS = [
  'apps/web/src/lib/instagram-dm-audience.spec.ts',
  'apps/web/src/components/manage/instagram/state.spec.ts',
  'apps/web/src/components/manage/instagram-deliveries/state.spec.ts',
  'apps/web/src/app/me/integrations/instagram/callback/route.spec.ts',
  'apps/web/src/app/(public)/privacy/instagram-deletion/[code]/status.spec.ts',
];
export const SCOPE_REGISTRY = Object.freeze({
  'api:src/instagram': {
    prefixes: ['apps/api/src/instagram/'],
    files: apiTestFiles(INSTAGRAM_E2E_TESTS),
    tests: [...API_TESTS, ...INSTAGRAM_E2E_TESTS],
  },
  'api:src/instagram/rules.service.ts': {
    files: [
      'apps/api/src/instagram/rules.service.ts',
      'apps/api/src/instagram/rules.controller.ts',
      ...apiTestFiles(RULES_TESTS),
    ],
    tests: RULES_TESTS,
  },
  'api:src/instagram/webhook.service.ts': {
    files: [
      'apps/api/src/instagram/webhook.service.ts',
      'apps/api/src/instagram/webhook.controller.ts',
      'apps/api/src/instagram/webhook-payload.ts',
      'apps/api/src/instagram/raw-body.ts',
      'apps/api/src/instagram/signed-request.ts',
      ...apiTestFiles(WEBHOOK_TESTS),
    ],
    tests: WEBHOOK_TESTS,
  },
  'api:src/instagram/graph.ts': {
    files: ['apps/api/src/instagram/graph.ts', 'apps/api/src/instagram/graph.spec.ts'],
    tests: ['src/instagram/graph.spec.ts'],
  },
  'api:test/fixtures/instagram-graph.fixtures.ts': {
    files: ['apps/api/test/fixtures/instagram-graph.fixtures.ts'],
    tests: ['src/instagram/graph.spec.ts'],
  },
  'api:test/instagram-connection.e2e-spec.ts': {
    files: ['apps/api/test/instagram-connection.e2e-spec.ts'],
    tests: ['test/instagram-connection.e2e-spec.ts'],
  },
  web: {
    prefixes: [
      'apps/web/src/components/manage/instagram/',
      'apps/web/src/components/manage/instagram-deliveries/',
      'apps/web/src/app/me/integrations/instagram/',
      'apps/web/src/app/me/landings/[publicId]/instagram/',
      'apps/web/src/app/(public)/privacy/instagram-deletion/',
    ],
    files: ['apps/web/src/lib/instagram-dm-audience.ts', 'apps/web/src/lib/instagram-dm-audience.spec.ts'],
    tests: WEB_TESTS,
  },
  shared: { files: ['packages/shared/src/instagram-dm.ts', 'packages/shared/src/instagram-dm.spec.ts'] },
});
const commandStep = (id, command, args, extra = {}) => ({ id, required: true, command, args, ...extra });
const actionCommands = (action) => {
  if (action === 'stack')
    return [
      ['make', ['up']],
      ...['api', 'web', 'app'].flatMap((a, i, all) => all.slice(i + 1).map((b) => ['make', [`${a}-up`, `${b}-up`]])),
      ...['api', 'web', 'app'].map((a) => ['make', [`${a}-up`]]),
    ];
  if (action === 'teardown')
    return [
      ['make', ['<started-services>-down']],
      ['pnpm', ['exec', 'pm2', 'kill']],
    ];
  if (action.startsWith('image:'))
    return [
      [
        'docker',
        [
          'buildx',
          'build',
          '--platform',
          '<docker-platform>',
          '--output',
          'type=cacheonly',
          '-f',
          `apps/${action.slice(6)}/Dockerfile`,
          '.',
        ],
      ],
    ];
  return [];
};
const actionStep = (id, action, extra = {}) => ({
  id,
  required: true,
  action,
  commands: actionCommands(action),
  ...extra,
});
const covers = (entry, file) =>
  entry.files?.includes(file) || entry.prefixes?.some((prefix) => file.startsWith(prefix));
const requiresFull = (file) =>
  file !== CONFIG_FILE &&
  (file.startsWith('scripts/') ||
    file.startsWith('.github/') ||
    file.startsWith('infra/') ||
    /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|Dockerfile[^/]*|package-lock\.json|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$/.test(
      file,
    ) ||
    (!file.startsWith('apps/') && !file.startsWith('packages/') && isCodeFile(file)));

/** 실행 전에 확정한 명령만 argv로 실행합니다. 파일 누락·공통 변경을 자동 확대하지 않습니다. */
export function verificationPlan(options, files, { scoped = true, live = false } = {}) {
  const { profile, selectors, qa } = options;
  if (!['config', 'hotfix', 'auth', 'full'].includes(profile)) throw new Error('알 수 없는 profile');
  if (!Array.isArray(files) && profile !== 'full') throw new Error('변경 범위 불명: full 필요');
  if (selectors.some((selector) => !Object.hasOwn(SCOPE_REGISTRY, selector))) throw new Error('알 수 없는 selector');
  if (qa.some((name) => !Object.hasOwn(EGO_SUITES, name))) throw new Error('알 수 없는 QA');
  if (profile === 'full' && (selectors.length || qa.length)) throw new Error('full은 select/qa로 축소할 수 없습니다.');
  if (profile === 'config' && (selectors.length || qa.length || live))
    throw new Error('config는 select/qa/live를 받지 않습니다.');
  if (profile !== 'full') {
    for (const file of files) {
      if (!isCodeFile(file)) continue;
      if (profile === 'config' && file === CONFIG_FILE) continue;
      if (requiresFull(file) || !selectors.some((selector) => covers(SCOPE_REGISTRY[selector], file)))
        throw new Error(`지정 범위 밖 변경: ${file}; full 필요`);
    }
    if (profile !== 'config' && !selectors.length) throw new Error('필수 selector가 비었습니다.');
  }
  const plan = [];
  if (scoped) plan.push(commandStep('work:scope', 'pnpm', ['work:scope', '--base', 'origin/main']));
  const docs = commandStep('pnpm verify --docs', 'pnpm', ['verify', '--docs', '--keep-going']);
  if (profile === 'full') {
    if (files === null || files.some(isCodeFile)) {
      plan.push(
        actionStep('인스턴스 설정', 'instance'),
        commandStep('DB 시작', 'make', ['infra-up']),
        commandStep('pnpm verify', 'pnpm', ['verify', '--keep-going']),
        actionStep('스택 시작', 'stack'),
      );
      for (const [name, path] of Object.entries(EGO_SUITES))
        plan.push(commandStep(`ego ${name}`, process.execPath, [path]));
      plan.push(actionStep('스택 정리', 'teardown', { allowSkip: '이 실행이 띄운 스택이 없습니다' }));
      for (const area of ['api', 'web']) plan.push(actionStep(`이미지 ${area}`, `image:${area}`));
    } else plan.unshift(docs);
  } else {
    plan.push(docs);
    if (profile === 'config') plan.push(actionStep('암호화 값 주입 범위', 'config-envelope'));
    else {
      const changedTests = files
        .filter(
          (file) =>
            /\.(?:e2e-)?spec\.ts$/.test(file) && selectors.some((selector) => covers(SCOPE_REGISTRY[selector], file)),
        )
        .map((file) => (file.startsWith('apps/api/') ? file.slice('apps/api/'.length) : file))
        .filter((file) => !file.startsWith('packages/'));
      const tests = [
        ...new Set([...selectors.flatMap((selector) => SCOPE_REGISTRY[selector].tests ?? []), ...changedTests]),
      ];
      const apiTests = tests.filter((path) => !path.startsWith('apps/web/'));
      const webTests = tests.filter((path) => path.startsWith('apps/web/'));
      // API/web의 workspace import는 dist를 읽으므로 selector와 무관하게 선행 build가 필요합니다.
      plan.push(commandStep('shared build', 'pnpm', ['--filter', '@crelink/shared', 'build']));
      if (selectors.includes('shared')) {
        plan.push(
          commandStep('shared test', 'pnpm', ['--filter', '@crelink/shared', 'test']),
          commandStep('app consumer typecheck', 'pnpm', ['--filter', '@crelink/app', 'typecheck']),
        );
      }
      if (apiTests.some((path) => path.startsWith('test/'))) plan.push(commandStep('DB 시작', 'make', ['infra-up']));
      if (apiTests.length)
        plan.push(
          commandStep('api test', 'pnpm', [
            '--filter',
            '@crelink/api',
            'test',
            '--runInBand',
            '--runTestsByPath',
            ...apiTests,
          ]),
        );
      if (webTests.length) plan.push(commandStep('web test', process.execPath, ['--test', ...webTests]));
      if (apiTests.length || selectors.includes('shared'))
        plan.push(commandStep('api typecheck', 'pnpm', ['--filter', '@crelink/api', 'typecheck']));
      if (webTests.length || selectors.includes('shared'))
        plan.push(commandStep('web typecheck', 'pnpm', ['--filter', '@crelink/web', 'typecheck']));
      const lintFiles = files.filter((file) => isCodeFile(file) && /\.(ts|tsx|mjs|js)$/.test(file)).sort();
      if (lintFiles.length) {
        plan.push(
          commandStep('changed lint', 'pnpm', ['exec', 'eslint', '--', ...lintFiles]),
          commandStep('changed format', 'pnpm', ['exec', 'prettier', '--check', '--', ...lintFiles]),
        );
      }
      if (qa.length) {
        plan.push(actionStep('인스턴스 설정', 'instance'), actionStep('스택 시작', 'stack'));
        for (const name of qa) plan.push(commandStep(`ego ${name}`, process.execPath, [EGO_SUITES[name]]));
      }
      if (qa.length || apiTests.some((path) => path.startsWith('test/')))
        plan.push(actionStep('스택 정리', 'teardown', { allowSkip: '이 실행이 띄운 스택이 없습니다' }));
    }
  }
  if (live) plan.push(actionStep('Meta 도달 관측', 'meta-live', { required: false, observation: 'external' }));
  if (!plan.some((entry) => entry.required)) throw new Error('필수 검사가 비었습니다.');
  return plan;
}

/** 기존 암호문 교체 또는 정의된 Instagram 8개 키의 최초 일괄 주입만 허용합니다. 값 형식 검증은 아닙니다. */
export function configEnvelope(before, after) {
  const parse = (text) => {
    const entries = text
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const at = line.indexOf('=');
        if (at < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(line.slice(0, at))) throw new Error('암호문 형식 불명');
        return [line.slice(0, at), line.slice(at + 1)];
      });
    if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error('중복 키: full 필요');
    return Object.fromEntries(entries);
  };
  const a = parse(before),
    b = parse(after);
  const added = Object.keys(b).filter((key) => !Object.hasOwn(a, key));
  const removed = Object.keys(a).filter((key) => !Object.hasOwn(b, key));
  if (
    removed.length ||
    (added.length &&
      (added.length !== CONFIG_INITIAL_KEYS.length || !CONFIG_INITIAL_KEYS.every((key) => added.includes(key))))
  )
    throw new Error('키 변경: full 필요');
  if (added.some((key) => !/^ENC\[AES256_GCM,.*\]$/.test(b[key]))) throw new Error('암호화 값 이외 변경: full 필요');
  for (const key of Object.keys(a)) {
    if (a[key] === b[key]) continue;
    if (
      (key === 'sops_lastmodified' && /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(b[key])) ||
      (key === 'sops_mac' && /^ENC\[AES256_GCM,.*\]$/.test(b[key])) ||
      (!key.startsWith('sops_') && /^ENC\[AES256_GCM,.*\]$/.test(a[key]) && /^ENC\[AES256_GCM,.*\]$/.test(b[key]))
    )
      continue;
    throw new Error('암호화 값 이외 변경: full 필요');
  }
}

/** JSON 비교는 키 순서와 무관하지만 계획/결과 배열의 순서·중복은 보존합니다. */
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

export function receiptBlockers(receipt, identity, plan) {
  const blockers = [];
  if (!receipt || typeof receipt !== 'object') return ['영수증 없음: 먼저 같은 범위의 ci:local을 실행하세요.'];
  if (!Array.isArray(plan) || !plan.some((entry) => entry.required)) return ['필수 검사가 비었습니다.'];
  if (receipt.version !== 1 || receipt.complete !== true || receipt.interrupted !== false)
    blockers.push('영수증 미완료·중단·버전 불일치');
  if (identity.clean !== true || receipt.identity?.clean !== true) blockers.push('dirty 영수증/작업 트리');
  if (canonical(receipt.identity) !== canonical(identity))
    blockers.push('영수증 대상 불일치(SHA/base/clean/profile/select/환경/Node/platform/lock/runner)');
  if (canonical(receipt.plan) !== canonical(plan)) blockers.push('registry 계획/명령/필수 여부 불일치');
  const commands = plan.map(({ id, command, args, action, commands }) => ({
    id,
    ...(command ? { command, args } : { action, commands }),
  }));
  if (canonical(receipt.commands) !== canonical(commands)) blockers.push('명령 불일치');
  const requiredCount = plan.filter((entry) => entry.required).length;
  if (
    !Array.isArray(receipt.results) ||
    !Array.isArray(receipt.observations) ||
    receipt.results.length !== requiredCount ||
    receipt.observations.length !== plan.length - requiredCount
  )
    blockers.push('필수/관측 결과 누락·중복·분류 불일치');
  else {
    const recorded = [...receipt.results, ...receipt.observations];
    for (let index = 0; index < plan.length; index++) {
      const entry = plan[index],
        result = recorded[index];
      if (result?.step !== entry.id) {
        blockers.push('결과 순서/이름/중복 불일치');
        continue;
      }
      if (!validExecutions(entry, result.executed)) blockers.push(`실행 명령 누락/불일치: ${entry.id}`);
      const observation = entry.required === false && entry.action === 'meta-live' && entry.observation === 'external';
      const skip = entry.allowSkip && result.status === '건너뜀' && result.reason === entry.allowSkip;
      if (result.status !== '통과' && !(observation && result.status === '실패') && !skip)
        blockers.push(`필수 실패·누락: ${entry.id}`);
      // 성공 상태로 포장한 내부 FAIL도 거부합니다. 이유는 실패에만 있습니다.
      if (result.status === '통과' && result.reason) blockers.push(`내부 FAIL: ${entry.id}`);
    }
  }
  return blockers;
}

export function makeReceipt(identity, plan, results, interrupted = false) {
  return {
    version: 1,
    identity,
    plan,
    commands: plan.map(({ id, command, args, action, commands }) => ({
      id,
      ...(command ? { command, args } : { action, commands }),
    })),
    complete: true,
    interrupted,
    results: results.filter((result) => !plan.some((entry) => entry.id === result.step && !entry.required)),
    observations: results.filter((result) => plan.some((entry) => entry.id === result.step && !entry.required)),
  };
}

/** 동적 스택은 원래 실행이 만든 서비스의 argv만 허용합니다. 임의 shell은 없습니다. */
function validExecutions(entry, executed) {
  if (!Array.isArray(executed)) return false;
  if (entry.command) return canonical(executed) === canonical([[entry.command, entry.args]]);
  if (entry.action === 'teardown') {
    if (!executed.length) return true;
    const [command, args] = executed[0];
    if (
      command !== 'make' ||
      !args.length ||
      new Set(args).size !== args.length ||
      args.some((arg) => !['api-down', 'web-down', 'app-down', 'infra-down'].includes(arg))
    )
      return false;
    return (
      executed.length === 1 ||
      (executed.length === 2 && canonical(executed[1]) === canonical(['pnpm', ['exec', 'pm2', 'kill']]))
    );
  }
  if (entry.action.startsWith('image:')) {
    if (executed.length !== 1 || !/^linux\/(amd64|arm64|arm|386|ppc64le|s390x|riscv64)$/.test(executed[0]?.[1]?.[3]))
      return false;
    const expected = structuredClone(entry.commands[0]);
    expected[1][3] = executed[0][1][3];
    return canonical(executed[0]) === canonical(expected);
  }
  if (entry.action === 'stack')
    return (
      executed.length === 0 ||
      (executed.length === 1 && entry.commands.some((candidate) => canonical(candidate) === canonical(executed[0])))
    );
  return executed.length === 0;
}
