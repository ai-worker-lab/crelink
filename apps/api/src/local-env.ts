import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 로컬 `apps/api/.env`(또는 `file`)를 읽어 비어 있는 환경변수만 채웁니다(실행 환경 값이 우선). 파일이 없으면(컨테이너·CI) 아무것도 하지 않습니다.
 * Sentry 초기화(`src/instrument.ts`)가 다른 모듈보다 먼저 이 값을 읽어야 하므로 Node 내장 모듈만 씁니다.
 * 기본 경로는 `src`·`dist` 바로 아래 파일 기준이고, 더 깊은 곳(`src/cli`)에서 부르면 절대 경로를 넘깁니다.
 */
export function loadLocalEnvironment(file: string = resolve(__dirname, '../.env')): void {
  if (!existsSync(file)) return;
  for (const row of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = row.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
