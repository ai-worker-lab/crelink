import { CRELINK_API_PATHS } from '@crelink/shared';
import type { NextFunction, Request, Response } from 'express';

/**
 * 웹훅 원문 상한. Caddy 웹 호스트의 `request_body max_size 6MB`와 같은 값이고, Caddy의 MB는 1000 기준입니다.
 * 배치가 최대 1000건이라 작은 상한은 413으로 배치 전체를 잃습니다. 근거: docs/specs/instagram-comment-dm.md `웹훅 수신 경로`.
 */
export const INSTAGRAM_WEBHOOK_BODY_LIMIT = 6_000_000;

/** `ApiExceptionFilter`가 4xx로 돌려주는 http-errors 형식의 오류. */
function clientError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status, expose: true });
}

/**
 * `POST /api/webhooks/instagram` 본문만 그대로 읽어 `request.rawBody`에 둡니다. 서명은 원문 바이트로 검사하기 때문입니다.
 * 스트림을 다 읽은 요청은 body-parser가 건너뜁니다. 경로가 정확히 같을 때만 동작하고, 다른 표기(대소문자, 끝 슬래시)로 들어온
 * 요청은 `rawBody`가 없어 서명 검사에서 403입니다.
 */
export function instagramWebhookRawBody(
  request: Request & { rawBody?: Buffer },
  response: Response,
  next: NextFunction,
): void {
  if (request.method !== 'POST' || request.path !== CRELINK_API_PATHS.instagramWebhook) {
    next();
    return;
  }
  // 읽기를 시작하지 않은 요청의 나머지 본문은 Node가 응답 뒤에 버립니다.
  if (Number(request.headers['content-length']) > INSTAGRAM_WEBHOOK_BODY_LIMIT) {
    next(clientError(413, 'webhook body too large'));
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  const stop = () => {
    request.off('data', onData);
    request.off('end', onEnd);
    request.off('error', onError);
  };
  const onData = (chunk: Buffer) => {
    size += chunk.length;
    if (size <= INSTAGRAM_WEBHOOK_BODY_LIMIT) {
      chunks.push(chunk);
      return;
    }
    // Content-Length 없이 상한을 넘긴 경우입니다. 끝없는 본문을 계속 받지 않도록 응답 뒤 연결을 끊습니다.
    stop();
    response.setHeader('Connection', 'close');
    response.once('finish', () => request.destroy());
    next(clientError(413, 'webhook body too large'));
  };
  const onEnd = () => {
    stop();
    request.rawBody = Buffer.concat(chunks, size);
    next();
  };
  const onError = () => {
    stop();
    next(clientError(400, 'webhook body aborted'));
  };
  request.on('data', onData);
  request.on('end', onEnd);
  request.on('error', onError);
}
