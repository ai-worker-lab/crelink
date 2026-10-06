// 저장소 Markdown 문서의 링크·anchor·연결·ADR 형식·변경 기록 순서·AGENTS.md 크기·조사 문서 확인일과 출처를 검사합니다.
// 사용법: pnpm docs:check. 규칙의 기준은 루트 AGENTS.md입니다.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { linkPath, markdownFiles, proseLines, relativeLinks } from './lib/markdown-links.mjs';

// AGENTS.md는 에이전트가 매 작업마다 읽는 지도라 길이가 곧 컨텍스트 비용입니다. 세부 내용은 docs/에 두고 링크합니다.
const ROOT_AGENTS_MAX_LINES = 100;
const ROOT_AGENTS_MAX_CHARS = 3500;
const AREA_AGENTS_MAX_LINES = 40;
const ENTRY_POINTS = ['README.md', 'AGENTS.md', 'docs/README.md'];
const ADR_STATES = ['제안', '승인', '대체됨', '폐기'];
const ORPHAN_SCOPE = /^(docs|apps\/[^/]+\/docs|packages\/[^/]+\/docs|infra\/docs|design\/docs)\//;
const WORK_ITEM = /^docs\/work\/(?:[^/]+\/)*\d{4}-[^/]+\.md$/;
const ADR_FILE = /(^|\/)adr\/(\d{4})-[^/]+\.md$/;
/** 외부 정보를 다루는 조사 문서. 확인일과 출처가 없으면 사실이 언제 기준인지 알 수 없습니다(docs/product/README.md). */
const RESEARCH_FILE = /^docs\/(references|product\/research)\/(?!TEMPLATE\.md$|README\.md$)[^/]+\.md$/;

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const errors = [];
const report = (file, line, problem, fix) => errors.push(`${file}:${line}: ${problem} — 해결: ${fix}`);

const files = markdownFiles(root);

/** GitHub이 제목에 붙이는 anchor slug와 같은 규칙입니다. */
function headingSlugs(lines) {
  const slugs = new Set();
  const seen = new Map();
  for (const line of lines) {
    for (const [, id] of line.matchAll(/<a\s[^>]*(?:id|name)="([^"]+)"/g)) slugs.add(id);
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1];
    if (heading === undefined) continue;
    const base = heading
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count ? `${base}-${count}` : base);
  }
  return slugs;
}

const docs = new Map(
  files.map((file) => {
    const lines = proseLines(readFileSync(join(root, file), 'utf8'));
    return [file, { lines, links: relativeLinks(lines), slugs: headingSlugs(lines) }];
  }),
);

/** 링크 대상의 저장소 기준 경로. 디렉터리는 끝에 '/'를 붙입니다. 없으면 null. */
function resolveTarget(file, target) {
  const path = linkPath(file, target);
  if (path === null) return null;
  const absolute = join(root, path);
  if (!existsSync(absolute)) return null;
  return statSync(absolute).isDirectory() ? `${path.replace(/\/$/, '')}/` : path;
}

// (1)(2) 링크 대상과 anchor. ADR은 work item에 링크하지 않습니다(지속 기록이 진행 기록에 기대면 이식·정리 후 끊깁니다).
const edges = new Map();
for (const [file, doc] of docs) {
  const reached = [];
  for (const { line, target, anchor } of doc.links) {
    const resolved = resolveTarget(file, target);
    if (resolved !== null && ADR_FILE.test(file) && WORK_ITEM.test(resolved)) {
      report(
        file,
        line,
        `ADR이 work item '${resolved}'에 링크합니다. ADR은 지속 기록이고 work item은 진행 기록이라, 하네스를 옮긴 저장소나 정리 후에는 끊긴 링크가 됩니다`,
        '결정 내용은 그대로 두고 링크만 현재 기준 문서(docs/development/ 등 해당 결정을 설명하는 문서)로 바꾸세요',
      );
    }
    if (resolved === null) {
      report(
        file,
        line,
        `링크 대상 '${target}'이 없습니다`,
        '경로를 실제 파일로 고치거나, 대상이 삭제되었다면 링크를 지우세요',
      );
      continue;
    }
    const markdown = resolved.endsWith('/') ? `${resolved}README.md` : resolved;
    if (docs.has(markdown)) reached.push(markdown);
    if (anchor && docs.has(markdown) && !docs.get(markdown).slugs.has(anchor)) {
      report(
        file,
        line,
        `'${markdown}'에 anchor '#${anchor}'에 해당하는 제목이 없습니다`,
        '대상 문서의 제목을 GitHub slug(소문자, 공백→-, 문장부호 제거, 중복 제목은 -1 접미)로 바꾼 값을 쓰세요',
      );
    }
  }
  edges.set(file, reached);
}

// (3) 진입점에서 닿지 않는 문서. work item은 지속 진입점이 아니므로 그 안의 링크는 따라가지 않습니다.
const reachable = new Set();
const queue = ENTRY_POINTS.filter((file) => docs.has(file));
while (queue.length) {
  const file = queue.shift();
  if (reachable.has(file)) continue;
  reachable.add(file);
  if (!WORK_ITEM.test(file)) queue.push(...edges.get(file));
}
for (const file of docs.keys()) {
  if (ORPHAN_SCOPE.test(file) && !file.startsWith('docs/work/') && !reachable.has(file)) {
    report(
      file,
      1,
      `진입점(${ENTRY_POINTS.join(', ')})에서 링크를 따라 닿지 않는 고아 문서입니다`,
      '가장 가까운 색인(docs/README.md, 영역 README.md 또는 AGENTS.md)에 링크를 추가하거나, 목적이 끝난 문서면 삭제하세요',
    );
  }
}

// (4) ADR 형식과 폴더별 번호
const adrNumbers = new Map();
for (const file of docs.keys()) {
  const number = ADR_FILE.exec(file)?.[2];
  if (!number) continue;
  const folder = posix.dirname(file);
  const key = `${folder}/${number}`;
  if (adrNumbers.has(key)) {
    report(
      file,
      1,
      `ADR 번호 ${number}가 ${adrNumbers.get(key)}와 겹칩니다`,
      `${folder}/의 다음 빈 번호로 파일명과 제목을 바꾸세요`,
    );
  } else {
    adrNumbers.set(key, file);
  }
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  if (!lines[0].startsWith(`# ADR ${number}: `)) {
    report(
      file,
      1,
      `첫 줄이 '# ADR ${number}: 제목' 형식이 아닙니다`,
      `첫 줄을 '# ADR ${number}: <결정 제목>'으로 쓰세요(번호는 파일명과 같게)`,
    );
  }
  const field = (name) => {
    const index = lines.findIndex((line) => line.startsWith(`- ${name}:`));
    return index < 0 ? null : { line: index + 1, value: lines[index].slice(name.length + 3).trim() };
  };
  const fix = (name, example) =>
    `머리말에 '- ${name}: ${example}' 줄을 추가하세요(형식은 docs/adr/0005-keep-valkey-local-infra.md 참고)`;
  const date = field('날짜');
  if (!date) report(file, 1, `'날짜' 필드가 없습니다`, fix('날짜', 'YYYY-MM-DD'));
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    report(file, date.line, `날짜 '${date.value}'가 YYYY-MM-DD 형식이 아닙니다`, `'- 날짜: 2026-10-01'처럼 쓰세요`);
  }
  const state = field('상태');
  const stateValue = state?.value.split(/[\s(]/, 1)[0];
  if (!state) report(file, 1, `'상태' 필드가 없습니다`, fix('상태', ADR_STATES.join(' | ')));
  else if (!ADR_STATES.includes(stateValue)) {
    report(file, state.line, `상태 '${stateValue}'는 허용 값이 아닙니다`, `${ADR_STATES.join(', ')} 중 하나를 쓰세요`);
  } else if (stateValue === '대체됨' && !/\]\((?:[^)]*\/)?\d{4}-[^)]+\.md\)/.test(state.value)) {
    report(
      file,
      state.line,
      `'대체됨' ADR에 대체한 ADR 링크가 없습니다`,
      `'- 상태: 대체됨 ([ADR NNNN](NNNN-제목.md))'처럼 새 ADR을 링크하세요`,
    );
  }
  if (!field('범위')) report(file, 1, `'범위' 필드가 없습니다`, fix('범위', '영향 영역'));
}

// (5) 변경 기록 날짜 제목은 엄격한 최신순
for (const [file, doc] of docs) {
  if (posix.basename(file) !== 'CHANGELOGS.md') continue;
  let previous = null;
  doc.lines.forEach((line, index) => {
    const date = /^## (\d{4}-\d{2}-\d{2})\s*$/.exec(line)?.[1];
    if (!date) return;
    if (previous && date >= previous) {
      report(
        file,
        index + 1,
        date === previous
          ? `날짜 제목 ${date}가 중복됩니다`
          : `날짜 제목 ${date}가 앞선 ${previous}보다 최신이라 최신순이 아닙니다`,
        '같은 날짜 항목은 한 제목 아래로 합치고, 날짜 제목은 최신 날짜가 위에 오도록 옮기세요',
      );
    }
    previous = date;
  });
}

// (6) AGENTS.md 크기 예산
for (const file of docs.keys()) {
  if (posix.basename(file) !== 'AGENTS.md') continue;
  const text = readFileSync(join(root, file), 'utf8');
  const lineCount = text.replace(/\n$/, '').split('\n').length;
  const why = '매 작업마다 읽히는 지도라 길이가 컨텍스트 비용입니다';
  const fix = '세부 절차·배경은 docs/의 해당 문서로 옮기고 AGENTS.md에는 한 줄 요약과 링크만 남기세요';
  const maxLines = file === 'AGENTS.md' ? ROOT_AGENTS_MAX_LINES : AREA_AGENTS_MAX_LINES;
  if (lineCount > maxLines) report(file, maxLines + 1, `${lineCount}줄로 예산 ${maxLines}줄을 넘습니다(${why})`, fix);
  if (file === 'AGENTS.md' && text.length > ROOT_AGENTS_MAX_CHARS) {
    report(file, 1, `${text.length}자로 예산 ${ROOT_AGENTS_MAX_CHARS}자를 넘습니다(${why})`, fix);
  }
}

// (7) 조사 문서의 확인일·출처. 확인일 뒤의 보충 설명(`- 확인일: 2026-10-01 (메모)`)과 링크 문법 없는 맨 URL 출처도 받습니다.
const isCalendarDate = (value) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
};
for (const [file, doc] of docs) {
  if (!RESEARCH_FILE.test(file)) continue;
  const checked = doc.lines.findIndex((line) => line.startsWith('- 확인일:'));
  if (checked === -1) {
    report(
      file,
      1,
      `조사 문서에 '- 확인일: YYYY-MM-DD' 줄이 없습니다`,
      '제목 아래 필드 목록에 외부 정보를 확인한 날짜를 적으세요(docs/product/README.md#조사-품질-기준)',
    );
  } else {
    const date = /^- 확인일: (\d{4}-\d{2}-\d{2})(?:\s|$)/.exec(doc.lines[checked])?.[1];
    if (!date || !isCalendarDate(date)) {
      report(
        file,
        checked + 1,
        `확인일 값 '${doc.lines[checked].slice('- 확인일:'.length).trim()}'이 형식에 맞지 않습니다(실제 날짜 YYYY-MM-DD, 메모는 날짜 뒤 공백 다음)`,
        `'- 확인일: 2026-10-01' 또는 날짜 뒤에 공백과 메모를 붙인 '- 확인일: 2026-10-01 (메모)'처럼 쓰세요`,
      );
    }
  }
  if (!doc.lines.some((line) => /https?:\/\/[^\s)>]/.test(line))) {
    report(
      file,
      1,
      '조사 문서에 출처 URL이 없습니다',
      "'## 출처'에 확인한 외부 자료를 [이름](URL) 또는 맨 URL(https://...)로 적으세요",
    );
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n문서 검사 실패: ${errors.length}건 (검사한 Markdown ${docs.size}개)`);
  process.exit(1);
}
console.log(`문서 검사 통과: Markdown ${docs.size}개`);
