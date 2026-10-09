/**
 * 웹 route handler가 요청을 Nest API로 넘길 때 함께 쓰는 도구: 같은 출처 BFF(`/api/backend`)와 AI 토큰 경로(`/api/agent`).
 * 오류 응답 형식, 돌려줄 응답 헤더 고르기, upstream 호출을 한 곳에 둡니다. `next`·`server-only`를 부르지 않아 단위 시험이 됩니다.
 * 근거: docs/specs/crelink-ai-operator.md `웹 토큰 경로`.
 */

/** 그대로 돌려줄 API 응답 헤더. `Set-Cookie`는 여러 줄이라 `setCookie`일 때만 따로 옮깁니다. */
export const PASSTHROUGH_RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag', 'last-modified'] as const;

/** 웹 전용 전달 오류(`route_not_allowed`·`api_not_configured`·`upstream_unavailable`)와 전달 전에 거절하는 인증·권한 오류. */
const PROXY_ERRORS = {
  route_not_allowed: { status: 404, message: '허용되지 않은 API 요청이에요.' },
  unauthenticated: { status: 401, message: '로그인이 필요해요. 다시 로그인해 주세요.' },
  forbidden: { status: 403, message: '이 작업을 할 권한이 없어요.' },
  api_not_configured: { status: 503, message: 'API 서버 주소가 설정되지 않았어요.' },
  upstream_unavailable: { status: 502, message: 'API 서버에 연결할 수 없어요.' },
} as const;

export type ProxyErrorCode = keyof typeof PROXY_ERRORS;

/** API 오류와 같은 형식(`{ code, message }`)의 JSON 응답. */
export function proxyErrorResponse(code: ProxyErrorCode): Response {
  const { status, message } = PROXY_ERRORS[code];
  return Response.json({ code, message }, { status });
}

/** API 응답에서 돌려줄 헤더만 고릅니다. `setCookie`가 거짓이면 `Set-Cookie`는 넘기지 않습니다. */
export function pickResponseHeaders(upstream: Headers, options: { setCookie: boolean }): Headers {
  const headers = new Headers();
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.get(name);
    if (value) headers.set(name, value);
  }
  if (options.setCookie) for (const cookie of upstream.getSetCookie()) headers.append('Set-Cookie', cookie);
  return headers;
}

/**
 * API를 부르고 상태·본문(이미지 바이너리 포함)과 고른 헤더로 응답을 만듭니다. 연결 실패는 502 `upstream_unavailable`,
 * 204·304는 본문 없이 돌려줍니다. 리디렉트는 따라가지 않습니다.
 */
export async function forwardToApi(
  target: URL,
  init: { method: string; headers: Headers; body?: ArrayBuffer | string },
  options: { setCookie: boolean },
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(target, { ...init, cache: 'no-store', redirect: 'manual' });
  } catch {
    return proxyErrorResponse('upstream_unavailable');
  }
  const empty = upstream.status === 204 || upstream.status === 304;
  return new Response(empty ? null : upstream.body, {
    status: upstream.status,
    headers: pickResponseHeaders(upstream.headers, options),
  });
}
