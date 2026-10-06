// Markdown 문서의 상대 링크를 찾고 저장소 기준 경로로 해석합니다. `pnpm docs:check`(링크 검사)와
// `pnpm work:place`(work item을 옮긴 뒤 링크 고치기)가 같은 규칙을 쓰도록 한 곳에 둡니다.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';

/** 검사·수정 대상에서 빼는 Markdown: 의존성과 OpenDesign이 설치한 스킬 사본. */
const EXCLUDED = /(^|\/)node_modules\/|^design\/\.od-skills\//;

/**
 * Git이 추적하거나 무시하지 않는 새 Markdown 파일(저장소 기준 경로, 정렬).
 * @param {string} root
 */
export function markdownFiles(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  return [
    ...new Set([...git('ls-files', '-z', '*.md'), ...git('ls-files', '-z', '--others', '--exclude-standard', '*.md')]),
  ]
    .filter((file) => !EXCLUDED.test(file) && existsSync(join(root, file)))
    .sort();
}

/** 코드 블록 줄을 빈 줄로 바꿔 줄 번호를 유지한 본문 줄을 돌려줍니다. */
export function proseLines(text) {
  let fence = null;
  return text.split('\n').map((line) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return '';
    }
    if (marker) {
      fence = marker;
      return '';
    }
    return line;
  });
}

/** 인라인 코드를 같은 길이의 공백으로 바꿉니다. 열 위치가 원문과 같게 유지됩니다. */
const withoutInlineCode = (line) => line.replace(/(`+)[^`]*?\1/g, (code) => ' '.repeat(code.length));

const decode = (part) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part; // 잘못된 퍼센트 인코딩은 원문 그대로 씁니다.
  }
};

/**
 * 상대 링크 목록. 외부 URL과 mailto 등 scheme 링크, 코드 블록·인라인 코드 안의 링크는 제외합니다.
 * `column`과 `raw`는 원문 줄에서 링크 대상(`<…>` 포함)의 위치와 문자열입니다.
 * @param {string[]} lines proseLines의 결과
 * @returns {{ line: number, column: number, raw: string, target: string, anchor: string | undefined }[]}
 */
export function relativeLinks(lines) {
  const links = [];
  lines.map(withoutInlineCode).forEach((line, index) => {
    const matches = [
      ...line.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)/g),
      ...line.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/g),
    ];
    for (const match of matches) {
      const raw = match[1];
      const value = raw.replace(/^<|>$/g, '');
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(value)) continue;
      const [target, anchor] = value.split('#', 2).map(decode);
      links.push({ line: index + 1, column: match.index + match[0].length - raw.length, raw, target, anchor });
    }
  });
  return links;
}

/**
 * 링크 대상의 저장소 기준 경로(존재 여부는 보지 않음). `/`로 시작하면 저장소 루트 기준, 빈 대상은 문서 자신,
 * 저장소 밖을 가리키면 null입니다. 대상 끝의 `/`는 그대로 둡니다.
 * @param {string} file 링크가 있는 문서의 저장소 기준 경로
 * @param {string} target relativeLinks의 target
 */
export function linkPath(file, target) {
  if (!target) return file;
  const path = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(file), target));
  return path.startsWith('..') ? null : path;
}
