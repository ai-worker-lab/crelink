#!/usr/bin/env node
// 이 checkout 인스턴스의 서비스 로그를 출력합니다. api·web·app은 PM2 로그 파일, infra는 Compose 로그입니다.
// 사용법: pnpm logs <api|web|app|infra> [--lines N] [--follow]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readInstanceEnv } from './lib/instance.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICES = ['api', 'web', 'app', 'infra'];
const USAGE = '사용법: pnpm logs <api|web|app|infra> [--lines N] [--follow]';

function fail(message) {
  console.error(`logs: ${message}`);
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { lines: { type: 'string', short: 'n', default: '100' }, follow: { type: 'boolean', short: 'f' } },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values, positionals } = parsed;
const service = positionals[0];
if (positionals.length !== 1 || !SERVICES.includes(service)) fail(`서비스를 하나 지정하세요.\n${USAGE}`);
const lines = Number(values.lines);
if (!Number.isInteger(lines) || lines < 0) fail(`--lines는 0 이상의 정수여야 합니다.\n${USAGE}`);

let command;
if (service === 'infra') {
  const env =
    readInstanceEnv(root) ?? fail('.local/instance.env가 없습니다. make infra-up으로 인스턴스와 인프라를 시작하세요.');
  const local = join(root, 'infra/local');
  const compose = [
    'compose',
    '--project-name',
    env.COMPOSE_PROJECT_NAME,
    '--project-directory',
    local,
    '--env-file',
    join(local, '.env'),
    '-f',
    join(local, 'compose.yaml'),
  ];
  const containers = spawnSync('docker', [...compose, 'ps', '--all', '--quiet'], { encoding: 'utf8' });
  if (containers.error || containers.status !== 0) {
    fail(
      `docker compose를 실행하지 못했습니다. Docker가 실행 중인지 확인하세요.\n${containers.stderr ?? containers.error}`,
    );
  }
  if (!containers.stdout.trim()) {
    fail(`Compose project ${env.COMPOSE_PROJECT_NAME}에 컨테이너가 없습니다. make infra-up으로 시작하세요.`);
  }
  const args = [...compose, 'logs', '--tail', String(lines), '--no-color', ...(values.follow ? ['--follow'] : [])];
  command = ['docker', [...args, 'postgres', 'valkey']];
} else {
  // PM2_HOME은 Makefile이 .local/pm2로 지정합니다. 프로세스 이름은 ecosystem.config.cjs의 crelink-<서비스>입니다.
  const files = ['out', 'error']
    .map((stream) => join(root, '.local/pm2/logs', `crelink-${service}-${stream}.log`))
    .filter((file) => existsSync(file));
  if (files.length === 0) fail(`${service} 로그가 없습니다(.local/pm2/logs/). make ${service}-up으로 시작하세요.`);
  command = ['tail', ['-n', String(lines), ...(values.follow ? ['-F'] : []), ...files]];
}

// --follow를 끝낼 때 자식 프로세스가 남지 않도록 종료 신호를 넘깁니다.
const child = spawn(...command, { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => fail(error.message));
child.on('exit', (code) => process.exit(code ?? 0));
