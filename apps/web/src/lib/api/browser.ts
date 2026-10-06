'use client';

import type { ApiError } from '@crelink/shared';
import { errorMessage } from './errors';

export class BrowserApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * same-origin BFF(`/api/backend`)로 API를 호출합니다. 쿠키는 브라우저가 붙이고 BFF가 `cl_session`만 넘깁니다.
 * `FormData` 본문은 브라우저가 multipart Content-Type(boundary 포함)을 정하게 두고, 그 밖의 본문은 JSON입니다.
 * 204는 undefined를 돌려줍니다.
 */
export async function browserApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`/api/backend${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new BrowserApiError('network_error', errorMessage('network_error', null, 0), 0);
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as (ApiError & T) | null;
  if (!response.ok) {
    const code = body?.code ?? 'request_failed';
    throw new BrowserApiError(code, errorMessage(code, body?.message, response.status), response.status);
  }
  return body as T;
}

/** 오류를 화면 안내 문구로 바꿉니다. */
export function describeError(error: unknown): string {
  if (error instanceof BrowserApiError) return error.message;
  return '알 수 없는 오류가 생겼어요. 잠시 후 다시 시도해 주세요.';
}
