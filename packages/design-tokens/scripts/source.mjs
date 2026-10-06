// 토큰 원본(src/tokens.json·src/opendesign.json)을 읽고 CSS 변수 이름을 정하는 공통 함수.
// 생성기(scripts/generate.mjs)와 디자인 산출물 검사(루트 scripts/design.mjs)가 함께 씁니다.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const TOKENS_FILE = 'packages/design-tokens/src/tokens.json';
export const OPENDESIGN_FILE = 'packages/design-tokens/src/opendesign.json';

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** CSS 변수 접두사. 소문자로 시작하는 kebab-case. */
const PREFIX_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** 원본 형식 오류. 메시지에 해결 방법을 담습니다. */
export class TokenSourceError extends Error {}

/** 저장소 기준 경로의 JSON 원본을 읽습니다. */
export function readSource(file) {
  try {
    return JSON.parse(readFileSync(join(repoRoot, file), 'utf8'));
  } catch (error) {
    throw new TokenSourceError(`${file}을 읽을 수 없습니다: ${error.message}`);
  }
}

/**
 * tokens.json 최상위 "$cssPrefix"(CSS 변수 접두사)를 검증해 돌려줍니다. 값 "ds"면 변수는 --ds-color-text-primary입니다.
 * 접두사는 웹 스타일·디자인 산출물·design/system/DESIGN.md가 var(--<접두사>-*)로 참조하므로 바꾸면 소비 코드도 함께 바꿉니다.
 */
export function cssPrefix(source) {
  const prefix = source?.$cssPrefix;
  const howTo = `${TOKENS_FILE} 최상위에 "$cssPrefix": "ds"처럼 소문자로 시작하는 kebab-case(소문자·숫자·하이픈)로 쓰세요. 바꾸는 절차: packages/design-tokens/docs/usage.md#css-변수-접두사`;
  if (prefix === undefined) throw new TokenSourceError(`토큰 CSS 접두사 "$cssPrefix"가 없습니다. 해결: ${howTo}`);
  if (typeof prefix !== 'string' || !PREFIX_PATTERN.test(prefix))
    throw new TokenSourceError(
      `토큰 CSS 접두사 "$cssPrefix" 값 ${JSON.stringify(prefix)}가 형식에 맞지 않습니다. 해결: ${howTo}`,
    );
  return prefix;
}

/** 토큰 트리를 [경로, 값] 목록으로 펼칩니다. 원본 순서를 유지하고, "$"로 시작하는 키(설정)는 토큰이 아니므로 건너뜁니다. */
export function flattenTokens(node, path = [], out = []) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (!KEY_PATTERN.test(key))
      throw new TokenSourceError(
        `${TOKENS_FILE}의 키 "${[...path, key].join('.')}"는 소문자·숫자·하이픈만 쓸 수 있습니다.`,
      );
    const next = [...path, key];
    if (value !== null && typeof value === 'object') flattenTokens(value, next, out);
    else out.push([next, value]);
  }
  return out;
}

/** 토큰 경로의 CSS 변수 이름. 예: cssVariable('ds', ['color', 'text', 'primary']) → --ds-color-text-primary */
export const cssVariable = (prefix, path) => `--${prefix}-${path.join('-')}`;
