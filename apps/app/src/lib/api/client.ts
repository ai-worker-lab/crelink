export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';

export async function apiRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!apiBase) throw new ApiRequestError('API 주소가 설정되지 않았습니다.', 0, 'API_UNAVAILABLE');
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiRequestError('네트워크에 연결할 수 없습니다.', 0, 'NETWORK_ERROR');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError(`서버 응답을 읽을 수 없습니다 (${response.status}).`, response.status);
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : `요청에 실패했습니다 (${response.status}).`;
    const code =
      payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string'
        ? payload.code
        : undefined;
    throw new ApiRequestError(message, response.status, code);
  }
  return payload as T;
}
