import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiError, CrelinkErrorCode } from '@crelink/shared';
import type { Request, Response } from 'express';
import { randomInt } from 'node:crypto';

/** `{ code, message }` 형식의 오류. message는 사용자에게 보여 줄 한국어 문구입니다. */
export function apiError(status: HttpStatus, code: CrelinkErrorCode, message: string): HttpException {
  const body: ApiError = { code, message };
  return new HttpException(body, status);
}

const FALLBACK_CODES: Partial<Record<number, { code: string; message: string }>> = {
  400: { code: 'validation_failed', message: '요청 형식이 올바르지 않습니다.' },
  401: { code: 'unauthenticated', message: '로그인이 필요합니다.' },
  403: { code: 'forbidden', message: '권한이 없습니다.' },
  404: { code: 'not_found', message: '요청한 경로를 찾을 수 없습니다.' },
  413: { code: 'validation_failed', message: '요청 본문이 너무 큽니다.' },
  415: { code: 'validation_failed', message: '지원하지 않는 요청 본문 형식입니다.' },
};

/**
 * express 미들웨어(body-parser 등)가 컨트롤러 전에 내는 클라이언트 오류의 상태 코드. 이 오류는 Nest `HttpException`이 아니라
 * http-errors 객체(`status`, `expose`)라서 따로 읽습니다. 4xx이고 `expose`(클라이언트에 알려도 되는 오류)일 때만 씁니다.
 * 예: 본문 한도 초과 413(`entity.too.large`), 지원하지 않는 문자셋 415(`charset.unsupported`).
 */
function clientErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const { status, expose } = exception as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true ? status : null;
}

/** 모든 오류 응답을 `ApiError`로 맞춥니다. 프레임워크가 만든 오류(잘못된 JSON, 본문 한도 초과, 없는 경로 등)도 포함합니다. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'code' in body && 'message' in body) {
        response.status(status).json({ code: body.code, message: body.message });
        return;
      }
      response.status(status).json(fallbackBody(status));
      return;
    }
    const clientStatus = clientErrorStatus(exception);
    if (clientStatus !== null) {
      response.status(clientStatus).json(fallbackBody(clientStatus));
      return;
    }
    const request = host.switchToHttp().getRequest<Request>();
    this.logger.error(
      `${request.method} ${request.path} 처리 중 오류`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ code: 'internal_error', message: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  }
}

function fallbackBody(status: number): { code: string; message: string } {
  return FALLBACK_CODES[status] ?? { code: 'http_error', message: '요청을 처리할 수 없습니다.' };
}

/** `Cookie` 헤더에서 이름이 같은 첫 값을 읽습니다. */
export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** HttpOnly·SameSite=Lax·Path=/ 쿠키. maxAgeSeconds가 0이면 삭제 쿠키입니다. */
export function serializeCookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    ...(maxAgeSeconds === 0 ? ['Expires=Thu, 01 Jan 1970 00:00:00 GMT'] : []),
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 영소문자·숫자 무작위 문자열(공개 ID, 자동 단축 주소). */
export function randomId(length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) value += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return value;
}

/**
 * 무작위 ID로 `INSERT … ON CONFLICT DO NOTHING RETURNING`을 시도하고, 겹치면 새 ID로 다시 시도합니다.
 * insert는 행을 만들었으면 결과를, 겹쳐서 만들지 못했으면 undefined를 돌려줍니다.
 */
export async function insertWithRandomId<T>(
  length: number,
  insert: (id: string) => Promise<T | undefined>,
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await insert(randomId(length));
    if (result !== undefined) return result;
  }
  throw new Error(`무작위 ID(${length}자)를 10번 연속 겹쳐 만들지 못했습니다.`);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
