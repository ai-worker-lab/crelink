import { backendRules } from '../../../../lib/api/backend-rules';
import { forwardPageHeader } from '../../../../lib/api/page-context';
import {
  COOKIE_NAMES,
  EMPTY_SIGNUP_FUNNEL_CONTEXT,
  inAppKindOfUserAgent,
  serializeSignupContext,
  SIGNUP_CONTEXT_HEADER,
} from '@crelink/shared';
import type { NextRequest } from 'next/server';
import { forwardToApi, proxyErrorResponse } from '../../../../lib/api/proxy';
import { apiOrigin, apiRequestHeaders } from '../../../../lib/api/server';
import { forwardVisitorEvent, readVisitorEventBody } from '../../../../lib/api/visitor-event';

export const dynamic = 'force-dynamic';

/**
 * 브라우저가 부를 수 있는 API 경로. 계약 원본: packages/shared/src/crelink.ts `CRELINK_API_PATHS`.
 * 로그인 시작·콜백은 BFF가 아니라 전용 route handler(`/auth/google`, `/auth/google/callback`)가 부릅니다.
 * `upload`는 multipart 본문과 Content-Type(boundary 포함)을 그대로 넘기는 경로입니다.
 * `signupInAppKind`는 첫 링크 합계(0231)에 쓸 앱 내 브라우저 종류만 내부 헤더로 넘기는 경로입니다. User-Agent 원문은 넘기지 않습니다.
 */
/** 상태 변경 요청은 같은 출처에서 온 것만 받습니다. Origin이 없거나 요청 호스트와 다르면 거부합니다. */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.map(encodeURIComponent).join('/');
  const rule = backendRules.find(
    (candidate) => candidate.methods.includes(request.method) && candidate.pattern.test(path),
  );
  if (!rule) return proxyErrorResponse('route_not_allowed');
  const mutating = request.method !== 'GET' && request.method !== 'HEAD';
  if (mutating && !isSameOrigin(request)) return proxyErrorResponse('forbidden');
  if (!apiOrigin) return proxyErrorResponse('api_not_configured');

  const target = new URL(`${apiOrigin}/${path}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  const headers = apiRequestHeaders({ Accept: request.headers.get('accept') ?? 'application/json' });
  forwardPageHeader(request.headers, headers);
  const session = request.cookies.get(COOKIE_NAMES.session)?.value;
  if (session && !rule.visitorEvent) headers.set('Cookie', `${COOKIE_NAMES.session}=${session}`);
  if (rule.signupInAppKind) {
    headers.set(
      SIGNUP_CONTEXT_HEADER,
      serializeSignupContext({
        ...EMPTY_SIGNUP_FUNNEL_CONTEXT,
        inAppKind: inAppKindOfUserAgent(request.headers.get('user-agent')),
      }),
    );
  }
  let body: ArrayBuffer | string | undefined;
  if (mutating) {
    const contentType = request.headers.get('content-type');
    if (rule.visitorEvent) {
      const eventBody = await readVisitorEventBody(request);
      if (eventBody instanceof Response) return eventBody;
      headers.set('Content-Type', 'application/json');
      headers.set('Origin', request.headers.get('origin')!);
      return forwardVisitorEvent(eventBody, (event) =>
        forwardToApi(target, { method: request.method, headers, body: event }, { setCookie: true }),
      );
    } else if (rule.upload) {
      if (contentType) headers.set('Content-Type', contentType);
      body = await request.arrayBuffer();
    } else {
      body = await request.text();
      if (body) headers.set('Content-Type', 'application/json');
      else body = undefined;
    }
  }
  return forwardToApi(target, { method: request.method, headers, body }, { setCookie: true });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
