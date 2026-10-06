#!/usr/bin/env node
// 로컬 OpenDesign의 od CLI를 실행합니다. macOS의 `od`는 시스템 명령이므로 이 래퍼를 씁니다.
// 사용법: pnpm od <명령> [인자...]   예: pnpm od lint design/<기능>/index.html, pnpm od design-systems list
// 기준 문서: design/docs/opendesign.md
import { runOpenDesign } from './lib/opendesign.mjs';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('사용법: pnpm od <명령> [인자...]  (전체 명령: pnpm od --help)');
  process.exit(2);
}
const result = runOpenDesign(args);
if (!result) {
  console.error('od: 로컬 OpenDesign이 없습니다. 설치·연결 방법은 design/docs/opendesign.md#준비를 보세요.');
  process.exit(1);
}
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (!result.reachable)
  console.error('od: OpenDesign 데몬에 닿지 않습니다. Open Design 앱을 실행한 뒤 다시 실행하세요.');
process.exit(result.status ?? 1);
