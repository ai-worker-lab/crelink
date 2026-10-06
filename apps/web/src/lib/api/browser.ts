'use client';

import type { ApiError } from '@crelink/shared';

export class BrowserApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function browserApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`/api/backend${path}`, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new BrowserApiError('network_error', '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.', 0);
  }
  const body = (await response.json().catch(() => null)) as (ApiError & T) | null;
  if (!response.ok)
    throw new BrowserApiError(
      body?.code ?? 'request_failed',
      body?.message ?? `요청을 처리하지 못했어요 (${response.status}).`,
      response.status,
    );
  return body as T;
}
