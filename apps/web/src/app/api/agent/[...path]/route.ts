import type { NextRequest } from 'next/server';
import {
  agentForwardHeaders,
  agentProxyPath,
  agentRequestRejection,
  agentTargetUrl,
} from '../../../../lib/api/agent-proxy';
import { forwardToApi, proxyErrorResponse } from '../../../../lib/api/proxy';
import { apiOrigin, apiRequestHeaders } from '../../../../lib/api/server';

export const dynamic = 'force-dynamic';

/**
 * AI 운영자 토큰 전용 경로(`AI_AGENT_PROXY_PATH`). `Authorization: Bearer`로 같은 색 API를 부르며 쿠키를 넘기지도 돌려주지도 않습니다.
 * 판정 규칙은 `src/lib/api/agent-proxy.ts`, 설계는 docs/specs/crelink-ai-operator.md `웹 토큰 경로`.
 * 이 경로는 CORS 허용 헤더를 내지 않으므로 교차 출처 브라우저는 `Authorization`을 붙여 부를 수 없고, `Origin`이 있는 요청도 거절합니다.
 */
async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = agentProxyPath((await context.params).path);
  if (!path) return proxyErrorResponse('route_not_allowed');
  const rejection = agentRequestRejection(request.headers);
  if (rejection) return proxyErrorResponse(rejection);
  if (!apiOrigin) return proxyErrorResponse('api_not_configured');
  const target = agentTargetUrl(apiOrigin, path, request.nextUrl.searchParams);
  if (!target) return proxyErrorResponse('route_not_allowed');

  const headers = agentForwardHeaders(
    request.headers,
    apiRequestHeaders({ Accept: request.headers.get('accept') ?? 'application/json' }),
  );
  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // 본문은 원래 Content-Type(multipart boundary 포함)과 함께 바이트 그대로 넘깁니다.
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 0) {
      body = bytes;
      const contentType = request.headers.get('content-type');
      if (contentType) headers.set('Content-Type', contentType);
    }
  }
  return forwardToApi(target, { method: request.method, headers, body }, { setCookie: false });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
