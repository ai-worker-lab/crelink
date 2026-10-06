import 'server-only';

import { COOKIE_NAMES, type ApiError } from '@crelink/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { errorMessage } from './errors';

/** Nest API 주소(서버 전용). 비어 있으면 API 호출은 `api_not_configured`입니다. 운영은 https 외부 호스트(Caddy)입니다. */
export const apiOrigin = (process.env.API_INTERNAL_URL ?? '').replace(/\/$/, '');

/**
 * 운영 API 호스트(Caddy)가 `/api/*`를 API로 넘길지 판단하는 내부 토큰(서버 전용 `API_INTERNAL_TOKEN`).
 * 비밀값이라 로그·오류 메시지·응답에 쓰지 않습니다. 근거: docs/specs/crelink-prod-deploy.md "Caddy 공개 정책".
 */
const internalToken = process.env.API_INTERNAL_TOKEN ?? '';

/** 웹이 Nest API로 보내는 모든 서버 측 요청의 헤더. 토큰이 있을 때만 `X-Crelink-Internal`을 붙입니다(로컬은 없음). */
export function apiRequestHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (internalToken) headers.set('X-Crelink-Internal', internalToken);
  return headers;
}

export class ServerApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface ServerApiOptions {
  /** 현재 요청의 `cl_session` 쿠키를 API로 함께 보냅니다(로그인이 필요한 조회). */
  session?: boolean;
}

/** Server Component·route handler에서 Nest API를 직접 호출합니다. 204는 undefined를 돌려줍니다. */
export async function serverApi<T>(path: string, options: ServerApiOptions = {}): Promise<T> {
  if (!apiOrigin) throw new ServerApiError('api_not_configured', errorMessage('api_not_configured', null, 503), 503);
  const headers = apiRequestHeaders({ Accept: 'application/json' });
  if (options.session) {
    const token = (await cookies()).get(COOKIE_NAMES.session)?.value;
    if (!token) throw new ServerApiError('unauthenticated', errorMessage('unauthenticated', null, 401), 401);
    headers.set('Cookie', `${COOKIE_NAMES.session}=${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}${path}`, { headers, cache: 'no-store' });
  } catch {
    throw new ServerApiError('network_error', errorMessage('network_error', null, 0), 0);
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as (ApiError & T) | null;
  if (!response.ok) {
    const code = body?.code ?? 'request_failed';
    throw new ServerApiError(code, errorMessage(code, body?.message, response.status), response.status);
  }
  return body as T;
}

export type ServerApiResult<T> = { ok: true; data: T } | { ok: false; error: ServerApiError };

/**
 * 로그인이 필요한 화면의 조회. 401이면 홈(`/`)으로 보내고, 그 밖의 API 오류는 화면이 상태별 안내를 그리도록 돌려줍니다.
 */
export async function loadSignedIn<T>(path: string): Promise<ServerApiResult<T>> {
  try {
    return { ok: true, data: await serverApi<T>(path, { session: true }) };
  } catch (error) {
    if (!(error instanceof ServerApiError)) throw error;
    if (error.status === 401) redirect('/');
    return { ok: false, error };
  }
}
