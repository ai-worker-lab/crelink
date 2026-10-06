import 'server-only';

import type { ApiError } from '@crelink/shared';

const apiOrigin = (process.env.API_INTERNAL_URL ?? '').replace(/\/$/, '');

export class ServerApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function serverApi<T>(path: string): Promise<T> {
  if (!apiOrigin) throw new ServerApiError('api_not_configured', 'API 서버 주소가 설정되지 않았어요.', 503);
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}${path}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    throw new ServerApiError('network_error', '서버에 연결할 수 없어요.', 0);
  }
  const body = (await response.json().catch(() => null)) as (ApiError & T) | null;
  if (!response.ok)
    throw new ServerApiError(
      body?.code ?? 'request_failed',
      body?.message ?? `요청에 실패했어요 (${response.status}).`,
      response.status,
    );
  return body as T;
}
