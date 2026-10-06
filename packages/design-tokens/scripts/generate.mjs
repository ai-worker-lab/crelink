// 토큰 원본(src/tokens.json)에서 웹 CSS 변수, RN용 JS 객체·타입, 디자인 tokens.css,
// OpenDesign 디자인 시스템 패키지(design/system/의 tokens.css·manifest.json)를 만든다.
// CSS 변수 접두사는 src/tokens.json 최상위 "$cssPrefix"가 정한다(scripts/source.mjs).
// 사용법: node scripts/generate.mjs [--check]
//   --check: 파일을 쓰지 않고 생성물이 원본과 일치하는지만 확인한다. 다르면 종료 코드 1.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  OPENDESIGN_FILE,
  TOKENS_FILE,
  TokenSourceError,
  cssPrefix,
  cssVariable,
  flattenTokens,
  readSource,
  repoRoot,
} from './source.mjs';

const packageDir = join(repoRoot, 'packages/design-tokens');

/** CSS에서 px 단위를 붙이는 숫자 토큰 경로 접두사. 나머지 숫자(font.weight)는 단위 없이 쓴다. */
const PX_PREFIXES = ['space', 'corner', 'font.size'];
const COLOR_PATTERN = /^(#[0-9a-f]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\))$/;
const REF_PATTERN = /^\{([a-z0-9.-]+)\}$/;
/** 슬롯 값 안에 섞인 토큰 참조. "0 8px 24px {color.overlay.shadow}" → var(--<접두사>-color-overlay-shadow) */
const INLINE_REF = /\{([a-z0-9.-]+)\}/g;
/** OpenDesign 리터럴 값에 색을 직접 쓰지 못하게 한다. 색은 tokens.json을 참조한다. */
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

/** 빠진 슬롯 안내에 쓰는 값 형식. */
const SLOT_KINDS = {
  color: '색 토큰 참조(예: "{color.<쓰임새>}")',
  font: '글꼴 스택 토큰 참조(예: "{font.<글꼴>}")',
  size: '글자 크기 토큰 참조(예: "{font.size.<크기>}")',
  number: '단위 없는 숫자(예: "1.5")',
  tracking: 'letter-spacing 값(예: "0", "-0.01em")',
  space: '간격 토큰 참조(예: "{space.<크기>}")',
  radius: '모서리 토큰 참조나 길이(예: "{corner.<크기>}", "9999px")',
  shadow:
    'box-shadow 값. 색은 슬롯 var()나 토큰 참조로(예: "none", "0 0 0 1px var(--border)", "0 8px 24px {color.<그림자>}")',
  time: '시간(예: "150ms")',
  easing: 'easing 함수(예: "cubic-bezier(0.23, 1, 0.32, 1)")',
  length: '길이(예: "1060px")',
};

/**
 * OpenDesign 디자인 시스템 tokens.css가 선언해야 하는 공통 슬롯(A1·A2·B): 이름 → [쓰임새, 값 형식].
 * 기준: https://github.com/nexu-io/open-design/blob/main/packages/contracts/src/design-systems/token-schema.ts
 * 빠지면 OpenDesign 산출물의 var()가 비어 규칙이 사라지므로 생성 단계에서 막는다.
 */
const OPENDESIGN_SLOTS = {
  '--bg': ['화면 배경', 'color'],
  '--surface': ['카드·컨테이너 면', 'color'],
  '--surface-warm': ['띄운 면(팝오버·선택 행)', 'color'],
  '--fg': ['본문 글자', 'color'],
  '--fg-2': ['보조 글자', 'color'],
  '--muted': ['흐린 글자', 'color'],
  '--meta': ['메타 정보(날짜·캡션) 글자', 'color'],
  '--border': ['기본 테두리', 'color'],
  '--border-soft': ['약한 구분선', 'color'],
  '--accent': ['주요 행동(강조색)', 'color'],
  '--accent-on': ['강조색 위 글자', 'color'],
  '--accent-hover': ['강조색 hover', 'color'],
  '--accent-active': ['강조색 눌림', 'color'],
  '--success': ['성공 상태', 'color'],
  '--warn': ['경고 상태', 'color'],
  '--danger': ['위험 상태', 'color'],
  '--font-display': ['제목 글꼴', 'font'],
  '--font-body': ['본문 글꼴', 'font'],
  '--font-mono': ['고정폭 글꼴(숫자·코드)', 'font'],
  '--text-xs': ['가장 작은 글자(캡션)', 'size'],
  '--text-sm': ['작은 글자(보조)', 'size'],
  '--text-base': ['본문 글자 크기', 'size'],
  '--text-lg': ['소제목', 'size'],
  '--text-xl': ['큰 소제목', 'size'],
  '--text-2xl': ['화면 제목', 'size'],
  '--text-3xl': ['큰 화면 제목', 'size'],
  '--text-4xl': ['대표 제목', 'size'],
  '--leading-body': ['본문 줄 간격', 'number'],
  '--leading-tight': ['제목 줄 간격', 'number'],
  '--tracking-display': ['제목 자간', 'tracking'],
  '--space-1': ['간격 1단계(가장 좁음)', 'space'],
  '--space-2': ['간격 2단계', 'space'],
  '--space-3': ['간격 3단계', 'space'],
  '--space-4': ['간격 4단계', 'space'],
  '--space-5': ['간격 5단계', 'space'],
  '--space-6': ['간격 6단계', 'space'],
  '--space-8': ['간격 8단계', 'space'],
  '--space-12': ['간격 12단계(가장 넓음)', 'space'],
  '--section-y-desktop': ['구획 위아래 여백(데스크톱)', 'space'],
  '--section-y-tablet': ['구획 위아래 여백(태블릿)', 'space'],
  '--section-y-phone': ['구획 위아래 여백(휴대폰)', 'space'],
  '--radius-sm': ['작은 요소 모서리', 'radius'],
  '--radius-md': ['기본 모서리', 'radius'],
  '--radius-lg': ['큰 면 모서리', 'radius'],
  '--radius-pill': ['알약 모양 모서리', 'radius'],
  '--elev-flat': ['평면(그림자 없음)', 'shadow'],
  '--elev-ring': ['테두리 고리', 'shadow'],
  '--elev-raised': ['띄운 면 그림자', 'shadow'],
  '--focus-ring': ['포커스 링', 'shadow'],
  '--motion-fast': ['빠른 전환 시간', 'time'],
  '--motion-base': ['기본 전환 시간', 'time'],
  '--ease-standard': ['기본 easing', 'easing'],
  '--container-max': ['내용 최대 폭', 'length'],
  '--container-gutter-desktop': ['좌우 여백(데스크톱)', 'space'],
  '--container-gutter-tablet': ['좌우 여백(태블릿)', 'space'],
  '--container-gutter-phone': ['좌우 여백(휴대폰)', 'space'],
};

function fail(message) {
  console.error(`design-tokens: ${message}`);
  process.exit(1);
}

function resolveTokens(entries) {
  const byPath = new Map(entries.map(([path, value]) => [path.join('.'), value]));
  const resolved = new Map();
  const visit = (key, stack) => {
    if (resolved.has(key)) return resolved.get(key);
    if (!byPath.has(key)) fail(`참조 대상 "${key}"가 없습니다 (${stack.join(' → ')}).`);
    if (stack.includes(key)) fail(`순환 참조: ${[...stack, key].join(' → ')}`);
    const raw = byPath.get(key);
    const ref = typeof raw === 'string' ? REF_PATTERN.exec(raw) : null;
    const value = ref ? visit(ref[1], [...stack, key]) : raw;
    resolved.set(key, value);
    return value;
  };
  return entries.map(([path]) => {
    const key = path.join('.');
    const value = visit(key, []);
    if (path[0] === 'color' && (typeof value !== 'string' || !COLOR_PATTERN.test(value))) {
      fail(`색 토큰 "${key}" 값 "${value}"는 소문자 6자리 hex 또는 "rgba(r, g, b, a)" 형식이어야 합니다.`);
    }
    if (path[0] !== 'color' && typeof value === 'number' && !Number.isFinite(value))
      fail(`"${key}" 값이 유한한 숫자가 아닙니다.`);
    return [path, value];
  });
}

function cssValue(path, value) {
  if (typeof value !== 'number') return value;
  const key = path.join('.');
  return PX_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}.`)) ? `${value}px` : String(value);
}

const camel = (key) => key.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const jsKey = (key) =>
  /^\d+$/.test(key) ? key : /^[a-zA-Z_$][\w$]*$/.test(camel(key)) ? camel(key) : JSON.stringify(camel(key));

function nest(entries) {
  const root = {};
  for (const [path, value] of entries) {
    let node = root;
    path.slice(0, -1).forEach((key) => (node = node[key] ??= {}));
    node[path.at(-1)] = value;
  }
  return root;
}

function renderJs(node, indent) {
  const pad = '  '.repeat(indent + 1);
  const lines = Object.entries(node).map(
    ([key, value]) =>
      `${pad}${jsKey(key)}: ${typeof value === 'object' ? renderJs(value, indent + 1) : JSON.stringify(value)},`,
  );
  return `{\n${lines.join('\n')}\n${'  '.repeat(indent)}}`;
}

function renderDts(node, indent) {
  const pad = '  '.repeat(indent + 1);
  const lines = Object.entries(node).map(
    ([key, value]) =>
      `${pad}readonly ${jsKey(key)}: ${typeof value === 'object' ? renderDts(value, indent + 1) : JSON.stringify(value)};`,
  );
  return `{\n${lines.join('\n')}\n${'  '.repeat(indent)}}`;
}

const HEADER =
  '@crelink/design-tokens에서 생성한 파일. 직접 고치지 않는다. 원본: packages/design-tokens/src/tokens.json, 생성: pnpm tokens:generate';

/**
 * src/opendesign.json의 슬롯을 검증하고 [이름, CSS 값] 목록으로 바꾼다. 값 전체가 참조("{color.text.primary}")면
 * 해석한 값을, 다른 글자와 섞인 참조("0 8px 24px {color.overlay.shadow}")는 var(--<접두사>-...)를 쓴다.
 * 문제는 모두 모아 한 번에 보고한다.
 */
function openDesignTokens(slots, entries, prefix) {
  const byKey = new Map(entries.map(([path, value]) => [path.join('.'), cssValue(path, value)]));
  const problems = [];
  const missing = Object.keys(OPENDESIGN_SLOTS).filter((name) => !(name in slots));
  if (missing.length > 0) {
    const width = Math.max(...missing.map((name) => name.length)) + 2;
    problems.push(
      [
        `"tokens"에 OpenDesign 공통 슬롯 ${missing.length}개가 없습니다. 해결: ${OPENDESIGN_FILE}의 "tokens" 객체에 아래 키를 추가하고, 값을 쓰임새에 맞는 ${TOKENS_FILE} 토큰 참조나 CSS 값으로 정한 뒤 pnpm tokens:generate를 다시 실행하세요(슬롯 목록·쓰임새: packages/design-tokens/scripts/generate.mjs의 OPENDESIGN_SLOTS).`,
        ...missing.map((name) => {
          const [role, kind] = OPENDESIGN_SLOTS[name];
          return `    ${JSON.stringify(name).padEnd(width)} ${role} — ${SLOT_KINDS[kind]}`;
        }),
      ].join('\n'),
    );
  }
  const values = [];
  for (const [name, raw] of Object.entries(slots)) {
    if (!(name in OPENDESIGN_SLOTS)) {
      problems.push(
        `"${name}"은 OpenDesign 공통 슬롯이 아닙니다. 해결: 키를 지우거나 OPENDESIGN_SLOTS의 이름으로 고치세요.`,
      );
      continue;
    }
    if (typeof raw !== 'string' || !raw.trim()) {
      problems.push(`"${name}" 값은 비어 있지 않은 문자열이어야 합니다.`);
      continue;
    }
    if (COLOR_LITERAL.test(raw)) {
      problems.push(
        `"${name}"에 색 리터럴 "${raw}"가 있습니다. 해결: tokens.json에 색 토큰을 두고 "{color...}"로 참조하세요.`,
      );
      continue;
    }
    const refs = [...raw.matchAll(INLINE_REF)].map((match) => match[1]);
    const unknown = refs.filter((ref) => !byKey.has(ref));
    if (unknown.length > 0) {
      problems.push(
        `"${name}"이 참조하는 토큰 ${unknown.map((ref) => `"${ref}"`).join(', ')}가 ${TOKENS_FILE}에 없습니다. 해결: 있는 토큰 경로로 고치거나 토큰을 추가하세요.`,
      );
      continue;
    }
    const whole = REF_PATTERN.exec(raw);
    values.push([
      name,
      whole ? byKey.get(whole[1]) : raw.replace(INLINE_REF, (_, ref) => `var(${cssVariable(prefix, ref.split('.'))})`),
    ]);
  }
  if (problems.length > 0)
    fail(`${OPENDESIGN_FILE} 검사 실패 ${problems.length}건:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  return values;
}

function build() {
  let source;
  let openDesign;
  let prefix;
  let flat;
  try {
    source = readSource(TOKENS_FILE);
    openDesign = readSource(OPENDESIGN_FILE);
    prefix = cssPrefix(source);
    flat = flattenTokens(source);
  } catch (error) {
    if (error instanceof TokenSourceError) fail(error.message);
    throw error;
  }
  const entries = resolveTokens(flat);
  const clashes = entries.map(([path]) => cssVariable(prefix, path)).filter((name) => name in OPENDESIGN_SLOTS);
  if (clashes.length > 0)
    fail(
      `토큰 CSS 변수 ${clashes.join(', ')}가 OpenDesign 공통 슬롯 이름과 겹칩니다. 해결: ${TOKENS_FILE}의 "$cssPrefix"를 슬롯 이름(--bg, --text-*, --space-* 등)과 겹치지 않는 값으로 바꾸세요.`,
    );
  const declarations = entries.map(([path, value]) => `  ${cssVariable(prefix, path)}: ${cssValue(path, value)};`);
  const css = `/* ${HEADER} */\n:root {\n${declarations.join('\n')}\n}\n`;
  const tree = nest(entries);
  const groups = Object.keys(tree);
  const js = `// ${HEADER}\n${groups.map((group) => `export const ${jsKey(group)} = ${renderJs(tree[group], 0)};\n`).join('\n')}\nexport const tokens = { ${groups.map(jsKey).join(', ')} };\n`;
  const dts = `// ${HEADER}\n${groups.map((group) => `export declare const ${jsKey(group)}: ${renderDts(tree[group], 0)};\n`).join('\n')}\nexport declare const tokens: {\n${groups.map((group) => `  readonly ${jsKey(group)}: typeof ${jsKey(group)};`).join('\n')}\n};\nexport type Tokens = typeof tokens;\n`;

  // OpenDesign 디자인 시스템 패키지: 앱 토큰(--<접두사>-*)과 OpenDesign 공통 슬롯을 한 :root에 둔다.
  // OpenDesign 에이전트는 이 블록을 산출물에 붙이고, 저장소에 스냅숏할 때는 이 파일을 링크한다(design/docs/opendesign.md).
  const slots = openDesignTokens(openDesign.tokens ?? {}, entries, prefix);
  const openDesignCss = `/* ${HEADER}, packages/design-tokens/src/opendesign.json */\n:root {\n${declarations.join('\n')}\n\n  /* OpenDesign 공통 슬롯 */\n${slots.map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}\n`;
  for (const key of ['id', 'name', 'category', 'description'])
    if (typeof openDesign[key] !== 'string' || !openDesign[key])
      fail(`${OPENDESIGN_FILE}에 "${key}" 문자열이 필요합니다.`);
  const manifest = {
    schemaVersion: 'od-design-system-project/v1',
    id: openDesign.id,
    name: openDesign.name,
    category: openDesign.category,
    description: openDesign.description,
    source: {
      type: 'local',
      origin: 'packages/design-tokens/src/tokens.json + src/opendesign.json (pnpm tokens:generate)',
    },
    files: { design: 'DESIGN.md', tokens: 'tokens.css' },
  };
  return new Map([
    [join(packageDir, 'generated/tokens.css'), css],
    [join(packageDir, 'generated/index.js'), js],
    [join(packageDir, 'generated/index.d.ts'), dts],
    [join(repoRoot, 'design/shared/tokens.css'), css],
    [join(repoRoot, 'design/system/tokens.css'), openDesignCss],
    [join(repoRoot, 'design/system/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`],
  ]);
}

const outputs = build();
if (process.argv.includes('--check')) {
  const stale = [...outputs]
    .filter(([file, content]) => !existsSync(file) || readFileSync(file, 'utf8') !== content)
    .map(([file]) => relative(repoRoot, file));
  if (stale.length) fail(`생성물이 원본과 다릅니다. \`pnpm tokens:generate\`를 실행하세요:\n  ${stale.join('\n  ')}`);
  console.log(`design-tokens: 생성물 ${outputs.size}개가 최신입니다.`);
} else {
  for (const [file, content] of outputs) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`design-tokens: ${relative(repoRoot, file)}`);
  }
}
