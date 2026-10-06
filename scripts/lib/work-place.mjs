// work item을 단계·역할에 맞는 폴더로 옮기고(`pnpm work:place`) 저장소 Markdown의 상대 링크를 함께 고칩니다.
// 링크를 찾고 해석하는 규칙은 `pnpm docs:check`와 같습니다(./markdown-links.mjs): 코드 블록·인라인 코드 안의 경로와
// 외부 URL은 건드리지 않습니다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { linkPath, markdownFiles, proseLines, relativeLinks } from './markdown-links.mjs';

/** 새 위치의 문서에서 대상을 가리키는 상대 경로. 원래 `./`로 시작했으면 그 표기를 유지합니다. */
function relativeTarget(fromFile, to, original) {
  const path = posix.relative(posix.dirname(fromFile), to) || '.';
  return original.startsWith('./') && !path.startsWith('.') ? `./${path}` : path;
}

/**
 * 옮길 파일(저장소 기준 경로 from → to)에 맞춰 바꿀 Markdown 내용을 계산합니다. 파일은 바꾸지 않습니다.
 * - 다른 문서에서 옮긴 파일을 가리키는 상대 링크와, 옮긴 파일 안에서 바깥을 가리키는 상대 링크를 고칩니다.
 * - `changes`는 고친 링크, `mentions`는 고친 뒤에도 남은 옛 경로 문자열(코드 표기·문장 속 언급)입니다.
 * @param {string} root
 * @param {Map<string, string>} moves
 * @returns {{ edits: Map<string, string>, changes: { file: string, line: number, from: string, to: string }[],
 *   mentions: { file: string, line: number, path: string }[] }}
 */
export function planLinkUpdates(root, moves) {
  const edits = new Map();
  const changes = [];
  const mentions = [];
  for (const file of markdownFiles(root)) {
    const text = readFileSync(join(root, file), 'utf8');
    const lines = text.split('\n');
    const newFile = moves.get(file) ?? file;
    const replacements = [];
    for (const link of relativeLinks(proseLines(text))) {
      if (!link.target) continue; // 같은 문서 안의 anchor
      const resolved = linkPath(file, link.target);
      if (resolved === null) continue;
      const slash = resolved.endsWith('/') ? '/' : '';
      const target = resolved.replace(/\/$/, '');
      const dest = moves.get(target) ?? target;
      if (newFile === file && dest === target) continue;
      let next;
      if (link.target.startsWith('/')) {
        if (dest === target) continue; // 저장소 루트 기준 링크는 문서를 옮겨도 그대로입니다.
        next = `/${dest}${slash}`;
      } else {
        next = `${relativeTarget(newFile, dest, link.target)}${slash}`;
      }
      if (next === link.target) continue;
      const value = link.raw.replace(/^<|>$/g, '');
      const hash = value.indexOf('#');
      const encoded = hash < 0 ? value : value.slice(0, hash);
      const rest = value.slice(encoded.length);
      const written = encoded === link.target ? next : encodeURI(next);
      const raw = link.raw.startsWith('<') ? `<${written}${rest}>` : `${written}${rest}`;
      replacements.push({ ...link, replacement: raw });
      changes.push({ file: newFile, line: link.line, from: link.raw, to: raw });
    }
    // 같은 줄의 여러 링크는 뒤에서부터 바꿔 앞쪽 열 위치를 유지합니다.
    for (const { line, column, raw, replacement } of replacements.sort(
      (a, b) => b.line - a.line || b.column - a.column,
    )) {
      const current = lines[line - 1];
      lines[line - 1] = current.slice(0, column) + replacement + current.slice(column + raw.length);
    }
    lines.forEach((line, index) => {
      for (const from of moves.keys()) {
        if (line.includes(from)) mentions.push({ file: newFile, line: index + 1, path: from });
      }
    });
    if (replacements.length > 0) edits.set(newFile, lines.join('\n'));
  }
  return { edits, changes, mentions };
}

/**
 * 파일을 옮기고(추적 중이면 `git mv`, 아니면 이름 변경) planLinkUpdates의 내용을 씁니다. 옮긴 뒤 빈 폴더는
 * workDir 안에서만 지웁니다.
 * @param {string} root
 * @param {string} workDir
 * @param {Map<string, string>} moves
 * @param {Map<string, string>} edits
 */
export function applyMoves(root, workDir, moves, edits) {
  for (const [from, to] of moves) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    let tracked = true;
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', '--', from], { cwd: root, stdio: 'ignore' });
    } catch {
      tracked = false;
    }
    if (tracked) execFileSync('git', ['mv', '--', from, to], { cwd: root, stdio: 'inherit' });
    else renameSync(join(root, from), join(root, to));
  }
  for (const [file, text] of edits) writeFileSync(join(root, file), text);
  for (const from of moves.keys()) {
    for (let dir = dirname(join(root, from)); dir.startsWith(`${workDir}/`); dir = dirname(dir)) {
      if (!existsSync(dir) || readdirSync(dir).length > 0) break;
      rmdirSync(dir);
    }
  }
}
