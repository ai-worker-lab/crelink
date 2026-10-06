import * as http from 'node:http';
import type { Socket } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { Database } from '../src/database';
import { RetentionService } from '../src/retention/retention.service';
import { enableGracefulShutdown } from '../src/shutdown';
import { createTestApp, login } from './test-app';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const BOUNDARY = 'crelink-shutdown-test';

/** 본문 앞부분만 보내고 멈춘 업로드. `finish()`가 나머지를 보내고 응답을 돌려줍니다. */
function startSlowUpload(baseUrl: string, cookie: string, agent: http.Agent) {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`,
  );
  const body = Buffer.concat([head, PNG, Buffer.from(`\r\n--${BOUNDARY}--\r\n`)]);
  const request = http.request(`${baseUrl}/api/me/files`, {
    method: 'POST',
    agent,
    headers: {
      cookie,
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      'content-length': body.length,
    },
  });
  const response = new Promise<{ status: number; connection: string | undefined; body: string }>((resolve, reject) => {
    request.on('response', (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode!, connection: res.headers.connection, body: text }));
    });
    request.on('error', reject);
  });
  request.write(body.subarray(0, head.length + 4));
  return {
    finish: () => {
      request.end(body.subarray(head.length + 4));
      return response;
    },
  };
}

describe('graceful shutdown(SIGTERM)과 DATABASE_POOL_MAX', () => {
  it('DATABASE_POOL_MAX가 pg Pool max에 들어가고, 잘못된 값이면 기동을 거부한다', async () => {
    const t = await createTestApp({ env: { DATABASE_POOL_MAX: '3' } });
    try {
      expect(t.app.get(Database).pool.options.max).toBe(3);
    } finally {
      await t.close();
      delete process.env.DATABASE_POOL_MAX;
    }
    await expect(createTestApp({ env: { DATABASE_POOL_MAX: '0' } })).rejects.toThrow(
      'DATABASE_POOL_MAX는 1 이상의 정수여야 합니다',
    );
    delete process.env.DATABASE_POOL_MAX;
  });

  it('진행 중 업로드를 201로 끝내고, 새 연결은 거부하며, 그 뒤 pool·보존 작업을 정리하고 종료 코드 0으로 끝낸다', async () => {
    const t = await createTestApp();
    const database = t.app.get(Database);
    const retention = t.app.get(RetentionService);
    const destroyDatabase = jest.spyOn(database, 'onModuleDestroy');
    const clearTimer = jest.spyOn(global, 'clearInterval');
    let exitedAt = 0;
    let resolveExit!: (code: number) => void;
    const exitCode = new Promise<number>((resolve) => (resolveExit = resolve));
    const dispose = enableGracefulShutdown(t.app, (code) => {
      exitedAt = Date.now();
      resolveExit(code);
    });
    const idleAgent = new http.Agent({ keepAlive: true });
    const uploadAgent = new http.Agent({ keepAlive: true });
    try {
      const { cookie } = await login(t.baseUrl, 'shutdown-creator|shutdown-creator@example.com');
      // keep-alive 연결을 하나 idle로 남겨 둡니다. 종료를 막으면 안 됩니다.
      const idleSocket = await new Promise<Socket>((resolve, reject) =>
        http
          .get(`${t.baseUrl}/api/health`, { agent: idleAgent }, (res) => {
            const socket = res.socket as Socket;
            res.resume();
            res.on('end', () => resolve(socket));
          })
          .on('error', reject),
      );
      const idleClosed = new Promise<void>((resolve) => idleSocket.once('close', () => resolve()));

      const upload = startSlowUpload(t.baseUrl, cookie!, uploadAgent);
      await sleep(300);
      process.emit('SIGTERM', 'SIGTERM');
      await sleep(300);

      await idleClosed;
      await expect(fetch(`${t.baseUrl}/api/health`)).rejects.toThrow();
      expect(destroyDatabase).not.toHaveBeenCalled();
      expect(exitedAt).toBe(0);

      const result = await upload.finish();
      const respondedAt = Date.now();
      expect(result.status).toBe(201);
      expect(JSON.parse(result.body)).toEqual(expect.objectContaining({ fileId: expect.any(String) }));
      // keep-alive 연결이라도 진행 중이던 응답은 Connection: close로 끝내 keepAliveTimeout(5초)을 기다리지 않습니다.
      expect(result.connection).toBe('close');

      expect(await exitCode).toBe(0);
      expect(exitedAt - respondedAt).toBeLessThan(1000);
      expect(destroyDatabase).toHaveBeenCalledTimes(1);
      expect(database.pool.ending).toBe(true);
      expect(clearTimer).toHaveBeenCalledWith(retention['timer']);
    } finally {
      dispose();
      clearTimer.mockRestore();
      idleAgent.destroy();
      uploadAgent.destroy();
      await t.close();
    }
  });
});
