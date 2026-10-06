#!/usr/bin/env node
// docs/work/의 work item을 검사(--check)하거나, 착수 가능한 항목을 계산(--next [--json] [--all])하거나,
// 단계·역할에 맞는 폴더로 옮기거나(--place [NNNN ...] [--dry-run]), 에픽 → 티켓 → 하위 티켓 트리와 진행률을
// 출력합니다. 규칙의 기준은 docs/work/README.md입니다.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkItems, rankWorkItems, readClaims } from './lib/work-items.mjs';
import { applyMoves, planLinkUpdates } from './lib/work-place.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workDir = resolve(process.env.WORK_DIR ?? join(root, 'docs/work'));
const { items, children, errors, placements } = loadWorkItems({
  root,
  workDir,
  agentsDir: process.env.AGENTS_DIR,
});

if (process.argv.includes('--place')) {
  const USAGE = '사용법: pnpm work:place [NNNN ...] [--dry-run]';
  const args = process.argv.slice(2).filter((arg) => arg !== '--place');
  const dryRun = args.includes('--dry-run');
  const ids = args.filter((arg) => arg !== '--dry-run');
  const invalid = ids.filter((arg) => !/^\d{4}$/.test(arg) || !items.has(arg));
  if (invalid.length > 0) {
    console.error(`알 수 없는 인자 또는 없는 work item 번호: ${invalid.join(' ')}\n${USAGE}`);
    process.exit(2);
  }
  const selected = placements.filter((placement) => ids.length === 0 || ids.includes(placement.id));
  for (const id of ids) {
    if (!selected.some((placement) => placement.id === id))
      console.log(`${id}: 이미 맞는 폴더에 있습니다 (${items.get(id).path})`);
  }
  const blocked = selected.filter((placement) => !placement.to);
  const moves = new Map(selected.filter((placement) => placement.to).map(({ path, to }) => [path, to]));
  const problems = blocked.map(
    ({ path }) => `${path}: 단계·역할이 잘못돼 옮길 폴더를 정할 수 없습니다. pnpm work:check로 확인하세요`,
  );
  const destinations = new Set();
  for (const [from, to] of moves) {
    if (existsSync(join(root, to)) || destinations.has(to))
      problems.push(`${from}: 옮길 위치 ${to}에 이미 파일이 있습니다`);
    destinations.add(to);
  }
  if (problems.length > 0) {
    console.error(`옮기지 못하는 work item ${problems.length}건(아무것도 바꾸지 않았습니다):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  if (moves.size === 0) {
    console.log('옮길 work item이 없습니다. 모두 단계·역할에 맞는 폴더에 있습니다.');
    process.exit(0);
  }

  const { edits, changes, mentions } = planLinkUpdates(root, moves);
  console.log(`${dryRun ? '옮길' : '옮긴'} work item ${moves.size}개:`);
  for (const [from, to] of moves) console.log(`  ${from} → ${to}`);
  console.log(`\n${dryRun ? '고칠' : '고친'} 상대 링크 ${changes.length}곳:`);
  if (changes.length === 0) console.log('  (없음)');
  for (const change of changes) console.log(`  ${change.file}:${change.line}  ${change.from} → ${change.to}`);
  if (mentions.length > 0) {
    const byFile = new Map();
    for (const { file, line } of mentions) byFile.set(file, [...new Set([...(byFile.get(file) ?? []), line])]);
    console.log(
      '\n링크가 아닌 옛 경로 언급(코드 표기·문장)은 그대로 둡니다. 현재 위치를 안내하는 문장이면 직접 고치세요:',
    );
    for (const [file, lines] of byFile) console.log(`  ${file}:${lines.join(',')}`);
  }
  if (dryRun) {
    console.log('\n--dry-run이라 아무것도 바꾸지 않았습니다.');
    process.exit(0);
  }
  applyMoves(root, workDir, moves, edits);
  console.log('\n이동은 git mv로 스테이징했습니다. pnpm work:check와 pnpm docs:check로 확인하고 함께 커밋하세요.');
  process.exit(0);
}

if (process.argv.includes('--check')) {
  if (errors.length > 0) {
    console.error(`work item 규칙 위반 ${errors.length}건:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`work item ${items.size}개가 규칙을 통과했습니다.`);
  process.exit(0);
}

if (process.argv.includes('--next')) {
  const all = process.argv.includes('--all');
  const rows = rankWorkItems({ items, children }, readClaims(root)).filter((row) => all || row.reasons.length === 0);
  if (errors.length > 0) console.error(`규칙 위반 ${errors.length}건이 있습니다. pnpm work:check로 확인하세요.\n`);
  if (process.argv.includes('--json')) {
    const json = rows.map(({ item, reasons }) => ({
      ...item,
      eligible: reasons.length === 0,
      reasons,
    }));
    console.log(JSON.stringify(json, null, 2));
    process.exit(0);
  }
  const line = ({ item, reasons }) => {
    const role = item.role ? `${item.role} · ` : '';
    const why = reasons.length > 0 ? `\n    - ${reasons.join('\n    - ')}` : '';
    return `  ${item.id} [${item.priority}] ${role}${item.title} (${item.path})${why}`;
  };
  const eligible = rows.filter((row) => row.reasons.length === 0);
  console.log('착수 가능 (우선순위 → 번호 순)');
  if (eligible.length === 0) console.log('  (없음)');
  for (const row of eligible) console.log(line(row));
  if (all) {
    const excluded = rows.filter((row) => row.reasons.length > 0);
    console.log('\n제외');
    if (excluded.length === 0) console.log('  (없음)');
    for (const row of excluded) console.log(line(row));
  } else if (eligible.length === 0) {
    console.log('\n제외 사유는 pnpm work:next --all로 확인합니다.');
  }
  process.exit(0);
}

const progress = (item) => {
  const counted = (children.get(item.id) ?? []).filter((child) => child.state !== '보류/종료');
  if (counted.length === 0) return '';
  return `  (하위 ${counted.filter((child) => child.state === '완료').length}/${counted.length} 완료)`;
};
const print = (item, depth) => {
  const role = item.role ? `${item.role} · ` : '';
  console.log(`${'  '.repeat(depth)}${item.id} [${item.state}] ${role}${item.title}${progress(item)}`);
  for (const child of children.get(item.id) ?? []) print(child, depth + 1);
};
const roots = [...items.values()].filter((item) => !item.parent || !items.has(item.parent));
const epics = roots.filter((item) => item.level === '에픽');
const standalone = roots.filter((item) => item.level !== '에픽');
console.log('에픽');
if (epics.length === 0) console.log('  (없음)');
for (const epic of epics) print(epic, 1);
console.log('\n독립 티켓');
if (standalone.length === 0) console.log('  (없음)');
for (const item of standalone) print(item, 1);
if (errors.length > 0) console.error(`\n규칙 위반 ${errors.length}건이 있습니다. pnpm work:check로 확인하세요.`);
