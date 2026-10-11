#!/usr/bin/env node
// checkout 경로와 사용자별로 PM2 소켓 경로를 짧게 고정합니다. Makefile과 logs.mjs의 공통 원본입니다.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const root = realpathSync(join(dirname(script), '..'));
const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
const temporaryRoot = process.platform === 'win32' ? tmpdir() : '/tmp';
export const pm2Home = process.env.PM2_HOME || join(temporaryRoot, `crelink-pm2-${process.getuid?.() ?? 'user'}`, key);

if (process.argv[1] && realpathSync(process.argv[1]) === script) console.log(pm2Home);
