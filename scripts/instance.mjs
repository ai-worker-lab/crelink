#!/usr/bin/env node
// 현재 checkout의 로컬 인스턴스 설정(.local/instance.env)을 만들거나 읽어 이름·포트·주소를 출력합니다.
// 슬롯 0 포트 원본은 infra/local/.env.example입니다(scripts/lib/instance.mjs).
// 사용법: pnpm instance [--print-env | --get <KEY>]   슬롯 지정: PORT_SLOT=<번호> pnpm instance
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ensureInstance, INSTANCE_KEYS } from './lib/instance.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const usage = '사용법: pnpm instance [--print-env | --get <KEY>]  (슬롯 지정: PORT_SLOT=<번호> pnpm instance)';
let values;
let env;
try {
  ({ values } = parseArgs({ options: { 'print-env': { type: 'boolean' }, get: { type: 'string' } } }));
  if (values.get !== undefined && !INSTANCE_KEYS.includes(values.get)) {
    throw new Error(
      `--get "${values.get}"은 인스턴스 키가 아닙니다. 다음 중 하나를 지정하세요: ${INSTANCE_KEYS.join(', ')}`,
    );
  }
  env = ensureInstance(root);
} catch (error) {
  console.error(`instance: ${error.message}\n${usage}`);
  process.exit(1);
}

if (values.get !== undefined) {
  console.log(env[values.get]);
} else if (values['print-env']) {
  for (const key of INSTANCE_KEYS) console.log(`${key}=${env[key]}`);
} else {
  const rows = [
    ['api', env.API_PORT, `${env.API_URL}/api/health/ready`],
    ['web', env.WEB_PORT, env.WEB_URL],
    ['app', env.EXPO_PORT, `http://127.0.0.1:${env.EXPO_PORT}`],
    ['postgres', env.POSTGRES_PORT, `127.0.0.1:${env.POSTGRES_PORT}`],
    ['valkey', env.VALKEY_PORT, `127.0.0.1:${env.VALKEY_PORT}`],
  ];
  const widths = [0, 1].map((column) => Math.max(...rows.map((row) => row[column].length)));
  console.log(
    `인스턴스 ${env.INSTANCE_NAME} (슬롯 ${env.PORT_SLOT}, Compose project ${env.COMPOSE_PROJECT_NAME}, 설정 .local/instance.env)\n`,
  );
  for (const [service, port, url] of rows)
    console.log(`  ${service.padEnd(widths[0])}  ${port.padEnd(widths[1])}  ${url}`);
  console.log('\n전체 값(연결 문자열 포함): pnpm instance --print-env');
}
