import { INestApplication, Logger } from '@nestjs/common';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/**
 * 종료 신호(SIGTERM·SIGINT)를 받으면 진행 중 요청을 끝낸 뒤 앱을 닫고 종료 코드 0으로 끝냅니다. `app.listen` 전에 부릅니다.
 *
 * 1. HTTP 서버를 닫아 새 연결을 받지 않습니다. idle keep-alive 연결은 바로 끊고(Node 19+ `server.close()`), 진행 중 요청과 종료 중
 *    기존 연결로 들어온 요청은 `Connection: close`로 응답한 뒤 연결을 끊습니다. 응답 헤더를 이미 보낸 요청은 응답을 마치면 idle 연결로 끊습니다.
 *    이 처리가 없으면 keep-alive 연결(Caddy 등)이 `keepAliveTimeout`(5초)마다 종료를 늦추거나, 요청이 계속 오면 끝나지 않습니다.
 * 2. 모든 연결이 끝나면 `app.close()`로 `onModuleDestroy`(pg pool `end`, 보존 작업 timer 정리)를 부릅니다.
 *
 * `app.enableShutdownHooks()`는 쓰지 않습니다. Nest 11은 `onModuleDestroy`를 HTTP 서버를 닫기 **전에** 부르므로
 * (`NestApplicationContext.close`: destroy hook → beforeShutdown hook → HTTP 서버 close) 진행 중 요청이 닫힌 pool을 써서 실패하고,
 * 끝에 같은 신호로 자신을 다시 죽여 종료 코드가 0이 아닙니다(컨테이너 143). 근거: docs/work/api/0032-api-graceful-shutdown-pool-max.md
 *
 * 반환값은 신호 처리를 해제합니다(테스트용). `exit`는 테스트에서 프로세스 종료 대신 쓸 함수입니다.
 */
export function enableGracefulShutdown(
  app: INestApplication,
  exit: (code: number) => void = (code) => process.exit(code),
): () => void {
  const logger = new Logger('Shutdown');
  const server = app.getHttpServer() as Server;
  const pending = new Set<ServerResponse>();
  let closing = false;

  // Express보다 먼저 받아야 응답 헤더를 쓰기 전에 Connection: close를 넣을 수 있습니다.
  server.prependListener('request', (_request: IncomingMessage, response: ServerResponse) => {
    if (closing) response.setHeader('connection', 'close');
    pending.add(response);
    response.on('finish', () => {
      if (closing) setImmediate(() => server.closeIdleConnections());
    });
    response.on('close', () => pending.delete(response));
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    // 종료 중 같은 신호가 다시 오면 무시합니다(compose는 grace가 지나면 SIGKILL).
    if (closing) return;
    closing = true;
    logger.log(`${signal} 수신: 새 연결을 받지 않고 진행 중 요청 ${pending.size}건을 마친 뒤 종료합니다.`);
    for (const response of pending) if (!response.headersSent) response.setHeader('connection', 'close');
    try {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      logger.log('HTTP 서버를 닫았습니다(진행 중 요청 완료).');
      await app.close();
      logger.log('종료합니다.');
      exit(0);
    } catch (error) {
      logger.error(`종료 중 오류: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      exit(1);
    }
  };
  for (const signal of SHUTDOWN_SIGNALS) process.on(signal, shutdown);
  return () => {
    for (const signal of SHUTDOWN_SIGNALS) process.off(signal, shutdown);
  };
}
