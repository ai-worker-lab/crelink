// docs/work/의 work item을 읽고 규칙을 검사합니다. 규칙의 기준은 docs/work/README.md입니다.
// 에픽은 docs/work/epics/, 티켓·하위 티켓은 docs/work/<역할>/에 둡니다. 계층은 폴더가 아니라 `상위` 필드입니다.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, posix, relative } from 'node:path';
import { loadAgents } from './agents.mjs';

export const LEVELS = ['에픽', '티켓', '하위 티켓'];
export const STATES = ['분류 대기', '준비', '진행', '검증', '완료', '보류/종료'];
export const KINDS = ['기능', '결함', '유지보수', '운영', '제품 결정'];
export const CLOSED = new Set(['완료', '보류/종료']);
const REQUIRED = ['단계', '상태', '종류', '우선순위', '작성일'];
const KNOWN = new Set([...REQUIRED, '역할', '상위', '선행']);
const PARENT_LEVEL = { '하위 티켓': '티켓', 티켓: '에픽' };
/** 에픽을 두는 폴더. 티켓·하위 티켓은 `역할`(agent 이름)과 같은 이름의 폴더에 둡니다. */
export const EPIC_FOLDER = 'epics';
const ROOT_FILES = new Set(['README.md', 'TEMPLATE.md']);

/**
 * workDir 아래 work item 후보 Markdown 파일(루트의 README.md·TEMPLATE.md 제외)을 하위 폴더까지 찾아
 * workDir 기준 경로(`/` 구분)로 돌려줍니다. 번호 순, 같은 번호면 경로 순입니다.
 * @param {string} workDir
 * @returns {string[]}
 */
export function workItemFiles(workDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(workDir, dir), { withFileTypes: true })) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md') && !(dir === '' && ROOT_FILES.has(entry.name))) files.push(path);
    }
  };
  walk('');
  const name = (path) => posix.basename(path);
  return files.sort((a, b) => name(a).localeCompare(name(b)) || a.localeCompare(b));
}

/**
 * 번호로 work item 파일의 절대 경로를 찾습니다. 폴더와 관계없이 찾으므로 옮긴 work item도 찾습니다.
 * @param {string} workDir
 * @param {string} id 4자리 번호
 * @returns {string | undefined}
 */
export function findWorkItemFile(workDir, id) {
  const file = workItemFiles(workDir).find((path) => posix.basename(path).startsWith(`${id}-`));
  return file && join(workDir, file);
}

/**
 * @typedef {{ id: string, title: string | undefined, path: string, level: string | undefined,
 *   state: string | undefined, kind: string | undefined, priority: string | undefined,
 *   created: string | undefined, role: string | undefined, parent: string | undefined, after: string[] }} WorkItem
 */

/**
 * `placements`는 폴더가 단계·역할과 맞지 않는 work item입니다. `to`는 옮길 저장소 기준 경로이며, 단계·역할이
 * 잘못돼 정할 수 없으면 undefined입니다.
 * @param {{ root: string, workDir?: string, agentsDir?: string }} options
 * @returns {{ items: Map<string, WorkItem>, children: Map<string, WorkItem[]>, errors: string[],
 *   placements: { id: string, path: string, to: string | undefined }[] }}
 */
export function loadWorkItems({ root, workDir = join(root, 'docs/work'), agentsDir = join(root, '.omp/agents') }) {
  const agents = loadAgents(agentsDir);
  const errors = [];
  const items = new Map();
  const placements = [];
  const workPath = relative(root, workDir);

  for (const file of workItemFiles(workDir)) {
    const name = basename(file);
    const folder = posix.dirname(file) === '.' ? '' : posix.dirname(file);
    const path = relative(root, join(workDir, file));
    const fail = (message) => errors.push(`${path}: ${message}`);
    const id = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(name)?.[1];
    if (!id) {
      fail(
        folder === ''
          ? '파일 이름은 NNNN-short-title.md 형식이어야 합니다'
          : `파일 이름은 NNNN-short-title.md 형식이어야 합니다. ${workPath}/의 하위 폴더에는 work item만 둡니다`,
      );
      continue;
    }
    const lines = readFileSync(join(workDir, file), 'utf8').split('\n');
    const title = new RegExp(`^# ${id} (.+)$`).exec(lines[0] ?? '')?.[1];
    if (!title) fail(`첫 줄은 "# ${id} 제목"이어야 합니다`);
    if (items.has(id)) fail(`번호 ${id}가 ${items.get(id).path}와 중복됩니다`);

    const fields = {};
    for (const line of lines.slice(1)) {
      if (line.startsWith('## ')) break;
      const field = /^- ([^:]+):\s*(.*)$/.exec(line);
      if (!field) continue;
      const [, key, value] = field;
      if (!KNOWN.has(key)) fail(`알 수 없는 필드 "${key}"`);
      else if (key in fields) fail(`필드 "${key}"가 중복됩니다`);
      else fields[key] = value.trim();
    }
    for (const key of REQUIRED) if (!fields[key]) fail(`필수 필드 "${key}"가 없습니다`);

    const { 단계: level, 상태: state, 종류: kind, 우선순위: priority, 작성일: created, 역할: role } = fields;
    if (level && !LEVELS.includes(level)) fail(`허용되지 않은 단계 "${level}". 허용 값: ${LEVELS.join(', ')}`);
    if (state && !STATES.includes(state)) fail(`허용되지 않은 상태 "${state}". 허용 값: ${STATES.join(', ')}`);
    if (kind && !KINDS.includes(kind)) fail(`허용되지 않은 종류 "${kind}". 허용 값: ${KINDS.join(', ')}`);
    if (priority && !/^P[0-3](?: \(AI 제안\))?$/.test(priority))
      fail(`우선순위 형식 오류 "${priority}". 형식: P0~P3, 선택적으로 " (AI 제안)"`);
    if (created && !/^\d{4}-\d{2}-\d{2}$/.test(created)) fail(`작성일 형식 오류 "${created}". 형식: YYYY-MM-DD`);

    if (level === '에픽') {
      if (role !== undefined) fail('에픽에는 역할을 쓰지 않습니다');
      if (fields.상위 !== undefined) fail('에픽에는 상위가 없습니다');
    } else if (level) {
      if (!role) fail(`${level}에는 역할이 필요합니다`);
      else if (!agents.has(role))
        fail(`.omp/agents에 없는 역할 "${role}". 허용 값: ${[...agents.keys()].sort().join(', ')}`);
      if (level === '하위 티켓' && !fields.상위) fail('하위 티켓에는 상위 티켓이 필요합니다');
    }

    const parseRef = (value) =>
      /^\d{4}$/.test(value) ? value : (fail(`"${value}"는 4자리 work item 번호가 아닙니다`), undefined);
    const parent = fields.상위 === undefined ? undefined : parseRef(fields.상위);
    const after =
      fields.선행 === undefined
        ? []
        : fields.선행
            .split(',')
            .map((value) => parseRef(value.trim()))
            .filter(Boolean);

    // 폴더 배치: 에픽은 epics/, 티켓·하위 티켓은 역할 폴더. 단계·역할이 잘못됐으면 위 오류를 먼저 고칩니다.
    const expected = level === '에픽' ? EPIC_FOLDER : LEVELS.includes(level) && agents.has(role) ? role : undefined;
    const knownFolder = folder === EPIC_FOLDER || agents.has(folder);
    if (folder !== expected && (expected !== undefined || !knownFolder)) {
      const where =
        folder === ''
          ? `${workPath}/ 바로 아래에는 README.md·TEMPLATE.md만 둡니다`
          : folder.includes('/')
            ? `폴더 ${folder}/는 한 단계를 넘습니다(${workPath}/<폴더>/NNNN-slug.md)`
            : knownFolder
              ? `${folder}/ 폴더에 있습니다`
              : `알 수 없는 폴더 ${folder}/입니다(폴더는 ${EPIC_FOLDER}/ 또는 .omp/agents의 역할 이름)`;
      const to = expected && relative(root, join(workDir, expected, name));
      placements.push({ id, path, to });
      if (to) {
        const what = level === '에픽' ? '에픽' : `역할이 ${role}인 ${level}`;
        fail(
          `${where}. ${what}은 ${posix.dirname(to)}/에 둡니다. 해결: pnpm work:place ${id} (다른 문서의 링크도 함께 고침)`,
        );
      } else {
        fail(`${where}. 단계·역할을 고친 뒤 pnpm work:place ${id}로 맞는 폴더에 옮기세요`);
      }
    }
    items.set(id, { id, title, path, level, state, kind, priority, created, role, parent, after });
  }

  for (const item of items.values()) {
    const fail = (message) => errors.push(`${item.path}: ${message}`);
    if (item.parent !== undefined) {
      const parent = items.get(item.parent);
      if (!parent) fail(`상위 ${item.parent}가 없습니다`);
      else if (item.parent === item.id) fail('자기 자신을 상위로 둘 수 없습니다');
      else if (PARENT_LEVEL[item.level] && parent.level !== PARENT_LEVEL[item.level]) {
        fail(`${item.level}의 상위는 ${PARENT_LEVEL[item.level]}만 가능합니다 (${item.parent}: ${parent.level})`);
      } else if (item.level === '하위 티켓' && parent.role !== item.role) {
        fail(`하위 티켓의 역할 "${item.role}"과 상위 티켓의 역할 "${parent.role}"이 다릅니다`);
      }
    }
    for (const ref of item.after) {
      if (ref === item.id) fail('자기 자신을 선행으로 둘 수 없습니다');
      else if (!items.has(ref)) fail(`선행 ${ref}가 없습니다`);
    }
  }

  // 선행 관계의 순환을 찾습니다. 상위 관계는 단계 규칙상 순환할 수 없습니다.
  const visiting = new Set();
  const done = new Set();
  const reported = new Set();
  const visit = (id, chain) => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      const cycle = [...chain.slice(chain.indexOf(id)), id];
      const key = [...cycle].sort().join();
      if (!reported.has(key)) {
        reported.add(key);
        errors.push(`${items.get(id).path}: 선행 관계가 순환합니다 (${cycle.join(' → ')})`);
      }
      return;
    }
    visiting.add(id);
    for (const ref of items.get(id)?.after ?? []) if (ref !== id && items.has(ref)) visit(ref, [...chain, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of items.keys()) visit(id, []);

  const children = new Map();
  for (const item of items.values()) {
    if (item.parent && items.has(item.parent)) children.set(item.parent, [...(children.get(item.parent) ?? []), item]);
  }
  for (const item of items.values()) {
    const open = (children.get(item.id) ?? []).filter((child) => !CLOSED.has(child.state));
    if (item.state === '완료' && open.length > 0) {
      errors.push(
        `${item.path}: 완료 상태이지만 끝나지 않은 하위 항목이 있습니다 (${open.map((child) => child.id).join(', ')})`,
      );
    }
  }

  return { items, children, errors, placements };
}

/** work item 작업 브랜치 접두. `work/NNNN-<slug>` 브랜치의 존재가 착수 점유입니다(docs/work/README.md). */
export const WORK_BRANCH_PREFIX = 'work/';

/**
 * `work/NNNN-*` 브랜치 이름(원격이면 `remotes/<remote>/` 접두 허용)에서 work item 번호를 꺼냅니다.
 * @param {string} branch
 * @returns {string | undefined}
 */
export function branchItemId(branch) {
  return /^(?:remotes\/[^/]+\/)?work\/(\d{4})-/.exec(branch)?.[1];
}

/**
 * 로컬·원격의 `work/NNNN-*` 브랜치를 읽어 점유된 work item 번호와 브랜치 이름을 돌려줍니다.
 * @param {string} root
 * @returns {Map<string, string[]>}
 */
export function readClaims(root) {
  const output = execFileSync('git', ['branch', '-a', '--list', `${WORK_BRANCH_PREFIX}*`, `*/${WORK_BRANCH_PREFIX}*`], {
    cwd: root,
    encoding: 'utf8',
  });
  const claims = new Map();
  for (const line of output.split('\n')) {
    const branch = line.slice(2).trim();
    const id = branchItemId(branch);
    if (id) claims.set(id, [...(claims.get(id) ?? []), branch]);
  }
  return claims;
}

const priorityRank = (priority) => Number(/^P(\d)/.exec(priority ?? '')?.[1] ?? 9);

/**
 * 착수 가능 여부를 계산해 우선순위(`(AI 제안)` 무시) → 번호 순으로 돌려줍니다. 제외 사유가 없으면 착수 가능입니다.
 * @param {{ items: Map<string, WorkItem>, children: Map<string, WorkItem[]> }} workItems
 * @param {Map<string, string[]>} claims readClaims의 결과
 * @returns {{ item: WorkItem, reasons: string[] }[]}
 */
export function rankWorkItems({ items, children }, claims) {
  const rows = [];
  for (const item of items.values()) {
    const reasons = [];
    if (item.level === '에픽') reasons.push('에픽 (하위 티켓으로 착수)');
    const kids = children.get(item.id) ?? [];
    if (kids.length > 0) reasons.push(`하위 항목 있음 (${kids.map((kid) => kid.id).join(', ')})`);
    if (item.state !== '준비') reasons.push(`상태 ${item.state ?? '없음'} (준비만 착수)`);
    const seen = new Set();
    for (let owner = item; owner && !seen.has(owner.id); owner = items.get(owner.parent)) {
      seen.add(owner.id);
      for (const ref of owner.after) {
        const state = items.get(ref)?.state;
        if (state === '완료') continue;
        const whose = owner === item ? '' : `상위 ${owner.id}의 `;
        reasons.push(`${whose}선행 ${ref} 미완료 (${state ?? '없음'})`);
      }
    }
    const branches = claims.get(item.id);
    if (branches) reasons.push(`점유 브랜치 ${branches.join(', ')}`);
    rows.push({ item, reasons });
  }
  return rows.sort(
    (a, b) => priorityRank(a.item.priority) - priorityRank(b.item.priority) || a.item.id.localeCompare(b.item.id),
  );
}
