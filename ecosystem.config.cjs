const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = __dirname;
// 이 checkout의 인스턴스 설정(scripts/lib/instance.mjs가 생성). 각 앱에는 자기 포트·연결 값만 넘깁니다.
const instancePath = join(root, '.local', 'instance.env');
if (!existsSync(instancePath)) {
  throw new Error(`${instancePath}가 없습니다. 저장소 루트에서 pnpm instance 또는 make up을 먼저 실행하세요.`);
}
const instance = Object.fromEntries(
  readFileSync(instancePath, 'utf8')
    .split('\n')
    .map((line) => /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
const pick = (...keys) => Object.fromEntries(keys.map((key) => [key, instance[key]]));

module.exports = {
  apps: [
    {
      name: 'crelink-api',
      cwd: root,
      script: 'pnpm',
      args: ['--filter', '@crelink/api', 'start:dev'],
      interpreter: 'none',
      env: pick('PORT', 'DATABASE_URL', 'WEB_URL', 'SHORT_LINK_BASE_URL'),
      autorestart: false,
    },
    {
      name: 'crelink-web',
      cwd: root,
      script: 'pnpm',
      args: ['--filter', '@crelink/web', 'start'],
      interpreter: 'none',
      env: pick('WEB_PORT', 'API_INTERNAL_URL'),
      autorestart: false,
    },
    {
      name: 'crelink-app',
      cwd: root,
      script: 'pnpm',
      args: ['--filter', '@crelink/app', 'start'],
      interpreter: 'none',
      env: { ...pick('EXPO_PORT', 'EXPO_PUBLIC_API_BASE_URL'), CI: 'false' },
      autorestart: false,
    },
  ],
};
