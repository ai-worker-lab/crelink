// work item 브랜치의 변경이 티켓 `역할`의 소유 경로(.omp/agents/*.md frontmatter owns) 안에 있는지 검사합니다.
// 사용법: pnpm work:scope [NNNN] [--base <ref>]
// --base를 생략하면 WORKFLOW.md의 workspace.base(기본 main)와 origin/<같은 이름> 중 HEAD와의 머지 베이스가 더
// 최근인 쪽을 기준으로 삼습니다. 로컬 기준 브랜치가 origin보다 앞서도 티켓 브랜치의 변경만 셉니다.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { loadAgents } from './lib/agents.mjs';
import { readWorkspaceBase } from './lib/runner-workflow.mjs';
import { branchItemId, loadWorkItems } from './lib/work-items.mjs';

// work item과 루트 변경 기록은 모든 역할이 고칩니다. 전용 로그가 없는 영역(packages/, design/ 등)의 변경은 루트
// CHANGELOGS.md에 기록하는 것이 정책이기 때문입니다(docs/development/repository-policy.md#변경-기록).
const ALWAYS_ALLOWED = ['docs/work/**', 'CHANGELOGS.md'];
const USAGE = '사용법: pnpm work:scope [NNNN] [--base <ref>]';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const fail = (message) => {
  console.error(`${message}\n${USAGE}`);
  process.exit(1);
};
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const gitSucceeds = (...args) => {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
};
const refExists = (ref) => gitSucceeds('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
const mergeBase = (ref) => {
  try {
    return git('merge-base', ref, 'HEAD').trim();
  } catch {
    return undefined;
  }
};

let id;
let base;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--base') {
    base = args[++index];
    if (!base) fail('--base 뒤에 기준 ref가 없습니다. 예: --base origin/main');
  } else if (/^\d{4}$/.test(args[index]) && !id) {
    id = args[index];
  } else {
    fail(`알 수 없는 인자 '${args[index]}'입니다.`);
  }
}

if (!id) {
  const branch = process.env.WORK_BRANCH || process.env.GITHUB_HEAD_REF || git('branch', '--show-current').trim();
  id = branchItemId(branch);
  if (!id) {
    fail(
      `브랜치 '${branch || '(detached HEAD)'}'에서 work item 번호를 찾지 못했습니다. work/NNNN-<slug> 브랜치에서 실행하거나 번호를 넘기세요.`,
    );
  }
}

/** 비교 시작점(diff `${from}...HEAD`)과 출력용 설명. --base를 주면 기존처럼 그 ref와 HEAD의 머지 베이스입니다. */
let from;
let baseLabel;
if (base) {
  if (!refExists(base))
    fail(`기준 ref '${base}'가 없습니다. git fetch origin <기준 브랜치>를 실행하거나 --base로 있는 ref를 지정하세요.`);
  from = base;
  baseLabel = base;
} else {
  let branch;
  try {
    branch = readWorkspaceBase(root);
  } catch (error) {
    fail(error.message);
  }
  const candidates = [branch, ...(branch.startsWith('origin/') ? [] : [`origin/${branch}`])].filter(refExists);
  if (!candidates.length) {
    fail(
      `기준 브랜치 '${branch}'(WORKFLOW.md workspace.base)가 로컬에도 origin에도 없습니다. ` +
        `git fetch origin ${branch}를 실행하거나 --base로 있는 ref를 지정하세요.`,
    );
  }
  // 로컬과 origin 중 HEAD에 더 가까운(다른 쪽의 자손인) 머지 베이스를 고릅니다. 같으면 로컬 이름을 씁니다.
  let chosen;
  for (const ref of candidates) {
    const commit = mergeBase(ref);
    if (!commit) continue;
    if (!chosen || (commit !== chosen.commit && gitSucceeds('merge-base', '--is-ancestor', chosen.commit, commit))) {
      chosen = { ref, commit };
    }
  }
  if (!chosen) {
    fail(
      `${candidates.join(', ')}와 HEAD의 머지 베이스를 찾지 못했습니다. 얕은 clone이면 git fetch --unshallow로 이력을 받거나 --base로 기준 ref를 지정하세요.`,
    );
  }
  from = chosen.commit;
  baseLabel = `${chosen.ref}(머지 베이스 ${chosen.commit.slice(0, 7)})`;
}

const { items } = loadWorkItems({ root });
const item = items.get(id);
if (!item) fail(`work item ${id}이 없습니다. docs/work/<역할 또는 epics>/${id}-<slug>.md가 있는지 확인하세요.`);
if (!item.role)
  fail(`${item.path}에 '역할' 필드가 없습니다. '- 역할: <agent name>'을 추가하세요(pnpm work:check로 확인).`);
const agents = loadAgents(resolve(root, '.omp/agents'));
const agent = agents.get(item.role);
if (!agent) fail(`역할 '${item.role}'에 맞는 .omp/agents/*.md가 없습니다. 역할을 agent name으로 고치세요.`);
if (!agent.owns.length) {
  fail(`.omp/agents/${item.role}.md frontmatter에 owns가 없습니다. 'owns: <glob>, <glob>' 줄을 추가하세요.`);
}

/** 작은 glob 구현: `**`는 경로 구분자를 넘고 `*`·`?`는 넘지 않습니다. 점으로 시작하는 파일도 일치합니다. */
const globCache = new Map();
const matches = (file, glob) => {
  if (!globCache.has(glob)) {
    const source = glob
      .split(/(\*\*\/|\*\*|\*|\?)/)
      .map(
        (part) =>
          ({ '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' })[part] ??
          part.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
    globCache.set(glob, new RegExp(`^${source}$`));
  }
  return globCache.get(glob).test(file);
};

// 기준 ref 이후 커밋된 변경과 작업 트리의 변경. 이름 변경은 --no-renames로 옛 경로와 새 경로를 모두 셉니다.
const committed = git('diff', '--name-only', '--no-renames', '-z', `${from}...HEAD`).split('\0');
const working = git('status', '--porcelain', '-z', '--no-renames', '--untracked-files=all')
  .split('\0')
  .map((entry) => entry.slice(3));
const changed = [...new Set([...committed, ...working].filter(Boolean))].sort();

const allowed = [...agent.owns, ...ALWAYS_ALLOWED];
const outside = changed.filter((file) => !allowed.some((glob) => matches(file, glob)));

if (outside.length) {
  console.error(
    `work item ${id}(역할 ${item.role})의 소유 경로 밖 변경 ${outside.length}개 (기준 ${baseLabel}...HEAD + 작업 트리):`,
  );
  for (const file of outside) {
    const owners = [...agents.values()]
      .filter((other) => !other.owns.includes('**') && other.owns.some((glob) => matches(file, glob)))
      .map((other) => other.name);
    console.error(`  ${file} — 소유: ${owners.length ? owners.join(', ') : '전용 역할 없음(orchestrator 범위)'}`);
  }
  console.error(
    `허용 경로: ${allowed.join(', ')}\n` +
      '해결: 소유 역할의 별도 티켓으로 나눠 그 브랜치에서 바꾸거나(선행 관계로 순서 지정), ' +
      '여러 영역을 함께 바꿔야 하면 역할을 orchestrator로 둔 티켓에서 진행하세요. 기준: docs/work/README.md',
  );
  process.exit(1);
}
console.log(
  `work:scope 통과: ${id}(역할 ${item.role}) 변경 파일 ${changed.length}개가 모두 소유 경로 안입니다 (기준 ${baseLabel}...HEAD + 작업 트리).`,
);
