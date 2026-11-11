#!/usr/bin/env node
// 0280 Coordinator용 실제 웹·Nest·격리 DB fixture. 브라우저를 조작하지 않습니다.
// pnpm --filter @crelink/shared build && node tests/e2e/ego/instagram-all-comments.fixture.mjs
// Ctrl-C는 이 실행이 만든 서버·일회용 DB만 정리합니다. 개발 DB·Compose·볼륨은 건드리지 않습니다.
/* global console, URL */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import ts from 'typescript';
import next from 'next';
import { SyntheticData } from './lib/data.mjs';
import { interruptController, loadTargets } from './lib/harness.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outputDir = '/tmp/crelink-0280-ui';
const require = createRequire(join(root, 'package.json'));
// 기존 API test-app.ts/test-database.ts를 그대로 사용합니다. 런타임 코드와 분리된 이 프로세스에서만 TS를 변환합니다.
const originalTs = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  if (!filename.startsWith(join(root, 'apps/api/'))) {
    if (originalTs) return originalTs(module, filename);
    throw new Error('fixture TypeScript 로더 범위 밖입니다.');
  }
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};
const { createTestApp } = require(join(root, 'apps/api/test/test-app.ts'));
const { AppConfig } = require(join(root, 'apps/api/src/config.service.ts'));
const { encryptToken } = require(join(root, 'apps/api/src/instagram/crypto.ts'));
const { InstagramGraph } = require(join(root, 'apps/api/src/instagram/graph.ts'));
const { InstagramWorkerService } = require(join(root, 'apps/api/src/instagram/worker.service.ts'));
const { InstagramTokenHealthService } = require(join(root, 'apps/api/src/instagram/token-health.service.ts'));
const { RetentionService } = require(join(root, 'apps/api/src/retention/retention.service.ts'));
if (originalTs) require.extensions['.ts'] = originalTs;
else delete require.extensions['.ts'];

if (process.argv.includes('--check')) {
  console.log('0280 fixture: API TS 로더·기존 test-app·provider 읽기 통과(서버/DB 기동 제외)');
  process.exit(0);
}

const interrupt = interruptController();
const env = loadTargets(root); // 네 대상 루프백 guard가 모든 연결·정리보다 먼저 실행됩니다.
process.env.TEST_DATABASE_URL = env.DATABASE_URL;
process.env.DATABASE_URL = env.DATABASE_URL;
for (const key of ['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'API_INTERNAL_TOKEN'])
  process.env[key] = '';
process.env.NEXT_TELEMETRY_DISABLED = '1';
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('0280 fixture는 외부 HTTP를 금지합니다.');
  return nativeFetch(input, init);
};

let apiApp;
let data;
let web;
let handle;
const server = createServer((request, response) => {
  if (!handle) {
    response.writeHead(503).end();
    return;
  }
  void handle(request, response);
});
const igUserId = `fixture0280-${randomBytes(6).toString('hex')}`;
let ready = false;
async function main() {
  try {
    await new Promise((done, fail) => {
      server.once('error', fail);
      server.listen(0, '127.0.0.1', done);
    });
    const webUrl = `http://127.0.0.1:${server.address().port}`;
    const media = ['post-a', 'post-b', 'post-c'].map((id) => ({
      id,
      caption: `0280 로컬 게시물 ${id}`,
      permalink: `https://instagram.test/p/${id}/`,
      thumbnailUrl: `${webUrl}/icons/sns/instagram.png`,
      timestamp: new Date().toISOString(),
      mediaType: 'IMAGE',
      childIds: [],
    }));
    apiApp = await createTestApp({
      env: {
        WEB_URL: webUrl,
        META_APP_ID: 'fixture0280',
        META_APP_SECRET: 'fixture0280-local-only',
        META_LOGIN_CONFIG_ID: 'fixture0280',
        META_WEBHOOK_VERIFY_TOKEN: 'fixture0280',
        INSTAGRAM_TOKEN_KEYS: `1:${randomBytes(32).toString('base64')}`,
        INSTAGRAM_TOKEN_KEY_CURRENT: '1',
        INSTAGRAM_COMMENTER_HASH_KEY: randomBytes(32).toString('base64'),
        INSTAGRAM_OPT_OUT_KEY: randomBytes(32).toString('base64'),
      },
      configure: (app) => {
        for (const provider of [InstagramWorkerService, InstagramTokenHealthService, RetentionService]) {
          app.get(provider).onApplicationBootstrap = () => undefined;
        }
        const graph = app.get(InstagramGraph);
        for (const method of Object.getOwnPropertyNames(InstagramGraph.prototype)) {
          if (method !== 'constructor')
            graph[method] = async () => {
              throw new Error('0280 fixture: 지정하지 않은 Graph 호출 차단');
            };
        }
        graph.listMedia = async () => ({ items: media, nextCursor: null });
        graph.unsubscribeApp = async () => undefined;
      },
    });
    process.env.API_INTERNAL_URL = apiApp.baseUrl;
    process.env.API_URL = apiApp.baseUrl;
    process.env.SHORT_LINK_BASE_URL = apiApp.baseUrl;
    await apiApp.pool.query("UPDATE platform_settings SET instagram_dm_audience='everyone'"); // 이 실행의 일회용 DB에만 적용
    data = new SyntheticData(apiApp.pool, { root, webUrl, shortUrl: apiApp.baseUrl });
    const creator = await data.user({ displayName: '0280 모든 댓글 로컬 확인' });
    const connectionId = randomUUID();
    const token = encryptToken(apiApp.app.get(AppConfig).instagram.tokenKeyring, connectionId, 'fixture0280-dummy');
    await apiApp.pool.query(
      `INSERT INTO instagram_connections
      (id,user_id,ig_user_id,meta_user_id,ig_username,status,token_ciphertext,token_key_version)
      VALUES ($1,$2,$3,'fixture0280-meta','fixture0280','active',$4,$5)`,
      [connectionId, creator.userId, igUserId, token.ciphertext, token.keyVersion],
    );
    const settingsPath = `/me/landings/${creator.publicId}/instagram`;
    web = next({
      dev: true,
      dir: join(root, 'apps/web'),
      hostname: '127.0.0.1',
      port: server.address().port,
      httpServer: server,
      conf: { distDir: '.next/0280-ui', agentRules: false, allowedDevOrigins: ['127.0.0.1'], reactStrictMode: true },
    });
    await web.prepare();
    handle = web.getRequestHandler();
    const config = {
      taskSpaceName: 'crelink-0280-ui',
      webUrl,
      apiUrl: apiApp.baseUrl,
      shortUrl: apiApp.baseUrl,
      outputDir,
      sessionToken: creator.sessionToken,
      publicId: creator.publicId,
      settingsUrl: `${webUrl}${settingsPath}`,
      deliveriesUrl: `${webUrl}${settingsPath}/deliveries`,
      apiRulesUrl: `${apiApp.baseUrl}/api/me/instagram/rules`,
    };
    mkdirSync(outputDir, { recursive: true, mode: 0o700 });
    writeFileSync(join(outputDir, 'config.json'), JSON.stringify(config, null, 2), { mode: 0o600 });
    writeFileSync(join(outputDir, 'pid'), `${process.pid}\n`, { mode: 0o600 });
    ready = true;
    console.log(
      `0280 fixture 준비: ${config.settingsUrl}\n/tmp/crelink-0280-ui/config.json (합성 세션), Ctrl-C로 종료·격리 DB 정리`,
    );
    if (!interrupt.signal.aborted)
      await new Promise((done) => interrupt.signal.addEventListener('abort', done, { once: true }));
  } finally {
    handle = null;
    server.closeAllConnections();
    if (server.listening) await new Promise((done) => server.close(done));
    await web?.close();
    if (apiApp) {
      await apiApp.pool.query('DELETE FROM instagram_dm_recipients WHERE ig_user_id=$1', [igUserId]);
      await data?.dispose();
      await apiApp.close(); // 기존 test-database.drop(): 이 실행이 만든 DB만 파기
    }
    if (ready) {
      rmSync(join(outputDir, 'config.json'), { force: true });
      rmSync(join(outputDir, 'pid'), { force: true });
    }
  }
}
main().then(
  () => process.exit(interrupt.exitCode() ?? 0),
  (error) => {
    console.error(`0280 fixture 기동 실패: ${error.message}`);
    process.exit(1);
  },
);
