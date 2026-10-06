#!/usr/bin/env node
// design/ 산출물 검사와 OpenDesign 디자인 시스템 동기화. 기준 문서: design/docs/opendesign.md
// 사용법:
//   pnpm design:check [--require-lint]  색 리터럴·토큰 이름·handoff.md 검사, OpenDesign이 실행 중이면 od lint
//                                       design/.check-baseline.json에 둔 영역의 실패는 알림으로 보고
//   pnpm design:sync                    design/system 패키지를 로컬 OpenDesign 사용자 디자인 시스템으로 설치
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findDaemonUrl,
  findOpenDesignCli,
  openDesignDataDir,
  openDesignWorkspace,
  runOpenDesign,
} from './lib/opendesign.mjs';
import { findWorkItemFile } from './lib/work-items.mjs';
import {
  OPENDESIGN_FILE,
  TOKENS_FILE,
  TokenSourceError,
  cssPrefix,
  cssVariable,
  flattenTokens,
  readSource,
} from '../packages/design-tokens/scripts/source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEM_DIR = 'design/system';
/** OpenDesign 디자인 시스템 패키지 최소 구성. manifest.json·tokens.css는 pnpm tokens:generate, DESIGN.md는 designer가 씁니다. */
const PACKAGE_FILES = ['manifest.json', 'DESIGN.md', 'tokens.css'];
/** design/ 바로 아래에서 기능 산출물 폴더가 아닌 것. */
const RESERVED = new Set(['shared', 'system', 'docs']);
/** 생성물이라 색 값을 담는 파일. */
const GENERATED = new Set(['design/shared/tokens.css', 'design/system/tokens.css']);
/** 직접 쓰는 디자인 시스템 문서. OpenDesign 프롬프트에 들어가므로 토큰 이름이 실제와 같아야 합니다. */
const SYSTEM_DOC = 'design/system/DESIGN.md';
/** 이식 전 산출물 기준선. 형식은 design/docs/opendesign.md#이식-전-산출물-기준선 */
const BASELINE_FILE = 'design/.check-baseline.json';
const BASELINE_HELP = '형식과 쓰는 때: design/docs/opendesign.md#이식-전-산출물-기준선';
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g;
const CSS_DECLARATION = /(?<![\w-])(--[a-zA-Z0-9_-]+)\s*:/g;
const CSS_REFERENCE = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
/** Markdown 인라인 코드로 쓴 변수 이름. `--ds-color-text-primary`, `--ds-space-*` */
const DOC_REFERENCE = /`(--[a-z0-9]+(?:-[a-z0-9]+)*)(-\*)?`/g;
const LINT_THRESHOLD = 'p1';

const [command, ...rest] = process.argv.slice(2);
const usage = '사용법: pnpm design:check [--require-lint] | pnpm design:sync';

function designFiles() {
  const list = (...args) =>
    execFileSync('git', ['ls-files', ...args, '--', 'design'], { cwd: root, encoding: 'utf8' }).split('\n');
  return [...new Set([...list(), ...list('--others', '--exclude-standard')])]
    .filter((file) => file && existsSync(join(root, file)))
    .filter((file) => !file.startsWith('design/.') && !file.includes('/.od-skills/'))
    .sort();
}

/** CSS로 해석되는 구간만 돌려줍니다: .css 전체, HTML의 <style> 블록과 style 속성. [시작 위치, 내용] */
function cssRegions(file, text) {
  if (file.endsWith('.css')) return [[0, text]];
  const regions = [];
  for (const match of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    regions.push([match.index + match[0].indexOf(match[1]), match[1]]);
  for (const match of text.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi))
    regions.push([match.index + match[0].indexOf(match[2]), match[2]]);
  return regions;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** design/<영역>/ 아래 파일이면 영역 이름, 아니면(예약 폴더·design/ 바로 아래) null. */
function areaOf(file) {
  const [, area, ...inside] = file.split('/');
  return inside.length > 0 && !RESERVED.has(area) ? area : null;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * 기준선 파일을 읽습니다. 파일이 없으면 기준선 없음입니다.
 * @returns {{ areas: Map<string, { reason: string, workItem: string, hit: boolean }>, errors: string[] }}
 */
function loadBaseline() {
  const areas = new Map();
  const errors = [];
  const path = join(root, BASELINE_FILE);
  if (!existsSync(path)) return { areas, errors };
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(
      `${BASELINE_FILE}: JSON을 읽지 못했습니다(${error.message}) — 해결: JSON 문법을 고치세요. ${BASELINE_HELP}`,
    );
    return { areas, errors };
  }
  if (!isObject(data) || !isObject(data.areas) || Object.keys(data).length !== 1) {
    errors.push(
      `${BASELINE_FILE}: 최상위는 { "areas": { "<영역>": { "reason": "...", "workItem": "NNNN" } } } 형식이어야 합니다 — 해결: ${BASELINE_HELP}`,
    );
    return { areas, errors };
  }
  for (const [area, entry] of Object.entries(data.areas)) {
    const problems = [];
    const dir = join(root, 'design', area);
    if (RESERVED.has(area)) problems.push(`design/${area}/는 예약 폴더라 기준선에 넣을 수 없습니다`);
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(area) || !existsSync(dir) || !statSync(dir).isDirectory())
      problems.push(`산출물 폴더 design/${area}/가 없습니다(영역 이름은 design/ 바로 아래 kebab-case 폴더)`);
    if (!isObject(entry)) problems.push('값은 { "reason", "workItem" } 객체여야 합니다');
    else {
      const unknown = Object.keys(entry).filter((key) => key !== 'reason' && key !== 'workItem');
      if (unknown.length > 0) problems.push(`알 수 없는 키 ${unknown.map((key) => `"${key}"`).join(', ')}`);
      if (typeof entry.reason !== 'string' || !entry.reason.trim())
        problems.push('"reason"(기준선에 둔 이유)이 없습니다');
      if (typeof entry.workItem !== 'string' || !/^\d{4}$/.test(entry.workItem))
        problems.push('"workItem"(정리 work item 번호, 예: "0021")이 없거나 네 자리 숫자 문자열이 아닙니다');
      else if (!findWorkItemFile(join(root, 'docs/work'), entry.workItem))
        problems.push(`정리 work item docs/work/<역할 또는 epics>/${entry.workItem}-*.md가 없습니다`);
    }
    if (problems.length > 0)
      errors.push(
        `${BASELINE_FILE}의 "${area}": ${problems.join(', ')} — 해결: 영역 폴더·사유·정리 work item을 고치세요. ${BASELINE_HELP}`,
      );
    else areas.set(area, { reason: entry.reason, workItem: entry.workItem, hit: false });
  }
  return { areas, errors };
}

/** 토큰 원본에서 접두사, 앱 토큰 CSS 변수, 알려진 변수(앱 토큰 + OpenDesign 공통 슬롯)를 읽습니다. */
function tokenNames() {
  const source = readSource(TOKENS_FILE);
  const prefix = cssPrefix(source);
  const app = new Set(flattenTokens(source).map(([path]) => cssVariable(prefix, path)));
  const slots = Object.keys(readSource(OPENDESIGN_FILE).tokens ?? {});
  return { prefix, app, known: new Set([...app, ...slots]) };
}

/**
 * 알려지지 않은 토큰 변수 참조를 가립니다. 현재 접두사로 시작하는데 없는 이름은 'unknown',
 * 다른 접두사 뒤에 있는 토큰 경로(--ds-color-text-primary, 현재 접두사 pk)는 'prefix'와 고칠 이름을 돌려줍니다.
 * 그 밖의 이름(산출물이 직접 정의한 변수 등)은 null입니다. wildcard면 name은 `-*` 앞부분입니다.
 */
function classifyReference(name, wildcard, { prefix, app, known }) {
  const has = (set, candidate) =>
    wildcard ? [...set].some((key) => key.startsWith(`${candidate}-`)) : set.has(candidate);
  if (has(known, name)) return null;
  if (name.startsWith(`--${prefix}-`)) return { problem: 'unknown' };
  const parts = name.slice(2).split('-');
  for (let index = 1; index < parts.length; index++) {
    const fixed = `--${prefix}-${parts.slice(index).join('-')}`;
    if (has(app, fixed)) return { problem: 'prefix', fixed: wildcard ? `${fixed}-*` : fixed };
  }
  return null;
}

const listed = (found) =>
  found.length > 6 ? `${found.slice(0, 6).join(', ')} 외 ${found.length - 6}개` : found.join(', ');

function check() {
  const requireLint = rest.includes('--require-lint');
  const errors = [];
  const notes = [];
  const files = designFiles();
  const html = [];
  const baseline = loadBaseline();
  errors.push(...baseline.errors);
  /** 영역 실패: 기준선 영역이면 정리 work item을 붙인 알림, 아니면 실패. */
  const report = (area, message) => {
    const entry = area ? baseline.areas.get(area) : undefined;
    if (!entry) return errors.push(message);
    entry.hit = true;
    notes.push(`[기준선, ${entry.workItem}에서 정리] ${message}`);
  };

  let names = null;
  try {
    names = tokenNames();
  } catch (error) {
    if (!(error instanceof TokenSourceError)) throw error;
    errors.push(`토큰 원본: ${error.message}`);
  }
  const tokenVar = names ? `var(--${names.prefix}-*)` : 'var(--<접두사>-*)';

  /** 영역(없으면 파일)별로 산출물이 직접 선언한 변수. 이 이름은 토큰 참조 검사에서 뺍니다. */
  const local = new Map();
  /** [파일, 영역, 줄, 이름, wildcard] */
  const references = [];

  for (const file of files) {
    const area = areaOf(file);
    if (file === SYSTEM_DOC) {
      const text = readFileSync(join(root, file), 'utf8');
      for (const match of text.matchAll(DOC_REFERENCE))
        references.push([file, area, lineOf(text, match.index), match[1], Boolean(match[2])]);
      continue;
    }
    if (!/\.(html|css)$/.test(file) || GENERATED.has(file)) continue;
    const text = readFileSync(join(root, file), 'utf8');
    const regions = cssRegions(file, text);
    const found = regions.flatMap(([offset, region]) =>
      [...region.matchAll(COLOR_LITERAL)].map((match) => `${lineOf(text, offset + match.index)}줄 ${match[0]}`),
    );
    if (found.length > 0) {
      report(
        area,
        `${file}: 색 리터럴 ${found.length}개(${listed(found)}) — 해결: ${tokenVar} 토큰을 쓰고, 붙여 넣은 :root 블록은 <link rel="stylesheet" href="../system/tokens.css">로 바꾸세요. 새 색은 packages/design-tokens/src/tokens.json에 추가합니다(ADR 0001).`,
      );
    }
    const scope = area ?? file;
    if (!local.has(scope)) local.set(scope, new Set());
    for (const [offset, region] of regions) {
      for (const match of region.matchAll(CSS_DECLARATION)) local.get(scope).add(match[1]);
      for (const match of region.matchAll(CSS_REFERENCE))
        references.push([file, area, lineOf(text, offset + match.index), match[1], false]);
    }
    if (file.endsWith('.html') && area) html.push(file);
  }

  if (names) {
    const byFile = new Map();
    for (const [file, area, line, name, wildcard] of references) {
      if (local.get(area ?? file)?.has(name)) continue;
      const result = classifyReference(name, wildcard, names);
      if (!result) continue;
      const key = `${file}\n${result.problem}`;
      if (!byFile.has(key)) byFile.set(key, { file, area, problem: result.problem, found: [] });
      const shown = `${line}줄 ${name}${wildcard ? '-*' : ''}`;
      byFile.get(key).found.push(result.fixed ? `${shown} → ${result.fixed}` : shown);
    }
    for (const { file, area, problem, found } of byFile.values()) {
      report(
        area,
        problem === 'prefix'
          ? `${file}: 토큰 접두사가 다른 변수 ${found.length}개(${listed(found)}) — 해결: 토큰 CSS 변수 접두사는 ${TOKENS_FILE}의 "$cssPrefix"("${names.prefix}")가 정합니다. 화살표 뒤 이름(--${names.prefix}-*)으로 바꾸세요.`
          : `${file}: 없는 토큰 변수 ${found.length}개(${listed(found)}) — 해결: design/system/tokens.css에 있는 이름을 쓰거나, 필요한 토큰을 ${TOKENS_FILE}에 추가하고 pnpm tokens:generate를 실행하세요.`,
      );
    }
  }

  for (const area of new Set(html.map(areaOf))) {
    if (!existsSync(join(root, 'design', area, 'handoff.md'))) {
      report(
        area,
        `design/${area}/: handoff.md가 없습니다 — 해결: 구현 담당자가 읽을 인계 문서(OpenDesign 프로젝트·화면 상태·토큰·검증)를 design/docs/opendesign.md#인계-문서 형식으로 쓰세요.`,
      );
    }
  }

  // OpenDesign이 없거나 꺼져 있으면 CI·다른 PC를 위해 건너뛰고, --require-lint면 실패로 봅니다.
  const skip = (message) => (requireLint ? errors : notes).push(`od lint: ${message}`);
  const cli = findOpenDesignCli();
  let linted = 0;
  if (html.length === 0) notes.push('od lint: 검사할 산출물 HTML이 없습니다.');
  else if (!cli) skip('건너뜀 — 로컬 OpenDesign이 없습니다(design/docs/opendesign.md#준비).');
  else {
    for (const file of html) {
      const result = runOpenDesign(['lint', join(root, file), '--fail-on', LINT_THRESHOLD, '--json']);
      if (!result.reachable) {
        skip('건너뜀 — OpenDesign 데몬에 닿지 않습니다. Open Design 앱을 실행한 뒤 다시 실행하세요.');
        break;
      }
      let lint;
      try {
        lint = JSON.parse(result.stdout);
      } catch {
        errors.push(
          `${file}: od lint 결과를 읽지 못했습니다 — ${(result.stderr || result.stdout).trim().slice(0, 200)}`,
        );
        continue;
      }
      linted++;
      for (const { severity = '', id = '', message = '', fix = '' } of lint.findings ?? []) {
        const line = `${file}: od lint ${severity} ${id} — ${message} 해결: ${fix}`;
        if (['P0', 'P1'].includes(severity.toUpperCase())) report(areaOf(file), line);
        else notes.push(line);
      }
    }
    if (linted > 0) notes.push(`od lint: 산출물 ${linted}개 검사(${LINT_THRESHOLD.toUpperCase()} 이상 실패)`);
  }

  for (const [area, { workItem, hit }] of baseline.areas) {
    if (hit) continue;
    notes.push(
      `${BASELINE_FILE}: design/${area}/에 기준선으로 낮춘 실패가 없습니다 — 해결: 기준선에서 "${area}"를 지우고 정리 work item ${workItem}에 기록하세요.${linted > 0 ? '' : ' od lint는 실행하지 않았으므로 OpenDesign을 켜고 pnpm design:check --require-lint로도 확인하세요.'}`,
    );
  }

  for (const note of notes) console.log(note);
  if (errors.length > 0) {
    console.error(`\n디자인 산출물 검사 실패 ${errors.length}건:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`디자인 산출물 검사 통과: 파일 ${files.length}개, 산출물 HTML ${html.length}개`);
}

// 설치 방식(OpenDesign 데스크톱 0.24.1에서 확인):
// - `od design-systems import-local`은 폴더를 코드 프로젝트로 보고 DESIGN.md를 새로 추출해 우리 문서를 버리므로 쓰지 않습니다.
// - 처음에는 데몬 `POST /api/design-systems/install`(source: local)로 패키지를 그대로 설치하고 Workspace에 묶습니다.
//   Workspace에 묶이지 않은 사용자 디자인 시스템은 프로젝트에서 찾을 수 없습니다(DESIGN_SYSTEM_NOT_FOUND).
// - 이후에는 패키지 파일을 설치 폴더에 덮어씁니다. 목록은 요청마다 폴더를 다시 읽습니다.
// - 사용자 디자인 시스템 기본 상태는 draft이고 draft는 프로젝트에 지정할 수 없으므로 metadata.json에 published를 둡니다.
// - local 설치는 설치 폴더를 원본(임시 staging) 경로의 심볼릭 링크로 만들 수 있습니다. 설치 직후 링크를 실제 폴더 사본으로
//   바꾸고, 이전 설치가 지워진 staging을 가리키는 끊긴 링크로 남았으면 지우고 다시 설치합니다.
async function sync() {
  const manifest = JSON.parse(readFileSync(join(root, SYSTEM_DIR, 'manifest.json'), 'utf8'));
  const id = `user:${manifest.id}`;
  const fail = (message) => {
    console.error(`design:sync: ${message}`);
    process.exit(1);
  };
  const dataDir = openDesignDataDir();
  if (!findOpenDesignCli() || !dataDir)
    fail(
      '로컬 OpenDesign을 찾지 못했습니다. 설치·연결 방법은 design/docs/opendesign.md#준비를 보세요(OD_DATA_DIR로 데이터 폴더 지정).',
    );
  const daemonUrl = await findDaemonUrl();
  if (!daemonUrl)
    fail('OpenDesign 데몬을 찾지 못했습니다. Open Design 앱을 실행한 뒤 다시 실행하세요(OD_DAEMON_URL로 지정 가능).');

  const workspace = openDesignWorkspace();
  if (!workspace)
    fail(
      'OpenDesign Workspace를 찾지 못했습니다. 앱에서 프로젝트를 하나 만든 뒤 다시 실행하거나 OD_WORKSPACE_ID·OD_WORKSPACE_MEMBER_ID를 지정하세요.',
    );
  const workspaceHeaders = {
    'x-od-workspace-id': workspace.workspaceId,
    'x-od-workspace-member-id': workspace.memberId,
  };
  const target = join(dataDir, 'design-systems', manifest.id);
  const metadataPath = join(target, 'metadata.json');
  const isLink = () => lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
  if (isLink() && !existsSync(target)) {
    unlinkSync(target);
    console.log(`design:sync: ${target}가 지워진 임시 폴더를 가리키는 링크라 지우고 다시 설치합니다.`);
  }
  const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, 'utf8')) : {};
  const catalog = await (await fetch(`${daemonUrl}/api/design-systems`, { headers: workspaceHeaders })).json();
  if (!catalog.designSystems.some((system) => system.id === id)) {
    // 설치 폴더 이름이 디자인 시스템 id가 되므로 manifest.id 이름의 임시 폴더로 옮겨 설치합니다.
    const stage = join(mkdtempSync(join(tmpdir(), 'design-sync-')), manifest.id);
    mkdirSync(stage);
    for (const file of PACKAGE_FILES) copyFileSync(join(root, SYSTEM_DIR, file), join(stage, file));
    const response = await fetch(`${daemonUrl}/api/design-systems/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: daemonUrl, ...workspaceHeaders },
      body: JSON.stringify({ source: 'local', path: stage }),
    });
    // 임시 원본을 지우기 전에 링크로 만들어진 설치 폴더를 실제 폴더 사본으로 바꿉니다.
    if (response.ok && isLink()) {
      unlinkSync(target);
      cpSync(stage, target, { recursive: true });
    }
    rmSync(dirname(stage), { recursive: true, force: true });
    if (response.status === 409) {
      // 설치 폴더만 지워지고 Workspace 연결 기록이 남은 경우입니다. 연결을 그대로 쓰고 폴더를 다시 만듭니다.
      mkdirSync(target, { recursive: true });
      metadata.workspaceId = workspace.workspaceId;
      console.log(`design:sync: ${id}의 기존 Workspace 연결을 다시 씁니다.`);
    } else if (!response.ok) {
      fail(`설치에 실패했습니다(${response.status}): ${(await response.text()).slice(0, 300)}`);
    } else {
      Object.assign(metadata, JSON.parse(readFileSync(metadataPath, 'utf8')));
      console.log(`design:sync: ${id} 설치(Workspace ${workspace.workspaceId})`);
    }
  }

  if (!existsSync(target))
    fail(`설치 폴더 ${target}가 없습니다. OD_DATA_DIR이 실행 중인 OpenDesign의 데이터 폴더인지 확인하세요.`);
  for (const file of PACKAGE_FILES) copyFileSync(join(root, SYSTEM_DIR, file), join(target, file));
  writeFileSync(metadataPath, `${JSON.stringify({ ...metadata, status: 'published' }, null, 2)}\n`);

  // 프로젝트가 쓰는 것과 같은 Workspace 범위로 목록을 다시 읽어 지정 가능한지 확인합니다.
  const scoped = await (await fetch(`${daemonUrl}/api/design-systems`, { headers: workspaceHeaders })).json();
  const installed = scoped.designSystems.find((system) => system.id === id);
  if (installed?.status !== 'published')
    fail(`Workspace ${workspace.workspaceId}에서 ${id}를 published로 찾지 못했습니다(${installed?.status ?? '없음'}).`);
  console.log(
    `design:sync: ${SYSTEM_DIR} → ${id} (published, Workspace ${workspace.workspaceId}). 새 프로젝트에 지정하세요: create_project의 designSystem "${id}".`,
  );
}

if (command === 'check') check();
else if (command === 'sync') await sync();
else {
  console.error(usage);
  process.exit(2);
}
