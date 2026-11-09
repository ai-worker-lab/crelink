// pnpm ci:local의 판정 규칙입니다. 프로세스를 띄우지 않아 단위 시험(ci-local.test.mjs)으로 고정합니다.
// 기준 문서: docs/development/verification.md#로컬-ci

export const REPORT_CONTEXT = 'CI 통과';
export const USAGE = '사용법: pnpm ci:local [--report [--dry-run]]';

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
  const unknown = args.filter((arg) => arg !== '--report' && arg !== '--dry-run');
  if (unknown.length > 0) throw new Error(`알 수 없는 인자: ${unknown.join(' ')}`);
  const report = args.includes('--report');
  const dryRun = args.includes('--dry-run');
  if (dryRun && !report) throw new Error('--dry-run은 --report와 함께 씁니다.');
  return { report, dryRun };
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
