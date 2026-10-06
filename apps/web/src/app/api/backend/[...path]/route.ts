import { COOKIE_NAMES } from '@crelink/shared';
import { NextRequest, NextResponse } from 'next/server';
import { apiOrigin, apiRequestHeaders } from '../../../../lib/api/server';

export const dynamic = 'force-dynamic';

/**
 * 브라우저가 부를 수 있는 API 경로. 계약 원본: packages/shared/src/crelink.ts `CRELINK_API_PATHS`.
 * 로그인 시작·콜백은 BFF가 아니라 전용 route handler(`/auth/google`, `/auth/google/callback`)가 부릅니다.
 * `upload`는 multipart 본문과 Content-Type(boundary 포함)을 그대로 넘기는 경로입니다.
 */
const ID = '[^/]+';
const rules: ReadonlyArray<{ methods: readonly string[]; pattern: RegExp; upload?: true }> = [
  { methods: ['GET'], pattern: /^api\/health$/ },
  { methods: ['POST'], pattern: /^api\/auth\/logout$/ },
  { methods: ['GET'], pattern: /^api\/me$/ },
  { methods: ['GET', 'PATCH'], pattern: /^api\/me\/landing$/ },
  { methods: ['GET'], pattern: /^api\/me\/short-link\/availability$/ },
  { methods: ['PUT'], pattern: /^api\/me\/short-link\/slug$/ },
  { methods: ['POST'], pattern: /^api\/me\/links$/ },
  { methods: ['PUT'], pattern: /^api\/me\/links\/order$/ },
  { methods: ['PATCH', 'DELETE'], pattern: new RegExp(`^api/me/links/${ID}$`) },
  { methods: ['PUT'], pattern: /^api\/me\/socials$/ },
  { methods: ['POST'], pattern: /^api\/me\/portfolio$/ },
  { methods: ['PUT'], pattern: /^api\/me\/portfolio\/order$/ },
  { methods: ['PATCH', 'DELETE'], pattern: new RegExp(`^api/me/portfolio/${ID}$`) },
  { methods: ['POST'], pattern: /^api\/me\/files$/, upload: true },
  { methods: ['GET'], pattern: new RegExp(`^api/files/${ID}$`) },
  { methods: ['GET'], pattern: new RegExp(`^api/public/landings/${ID}$`) },
  { methods: ['GET'], pattern: /^api\/admin\/creators$/ },
  { methods: ['GET'], pattern: new RegExp(`^api/admin/creators/${ID}$`) },
  { methods: ['GET'], pattern: new RegExp(`^api/admin/creators/${ID}/stats$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/creators/${ID}/(extra-slots|suspension)$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/links/${ID}/block$`) },
  { methods: ['GET', 'POST'], pattern: /^api\/admin\/blocked-domains$/ },
  { methods: ['DELETE'], pattern: new RegExp(`^api/admin/blocked-domains/${ID}$`) },
];

/** 그대로 돌려줄 API 응답 헤더. `Set-Cookie`는 여러 줄이라 따로 옮깁니다. */
const PASSTHROUGH_RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag', 'last-modified'];

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status });
}

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
  const rule = rules.find((candidate) => candidate.methods.includes(request.method) && candidate.pattern.test(path));
  if (!rule) return errorResponse(404, 'route_not_allowed', '허용되지 않은 API 요청이에요.');
  const mutating = request.method !== 'GET' && request.method !== 'HEAD';
  if (mutating && !isSameOrigin(request)) return errorResponse(403, 'forbidden', '이 작업을 할 권한이 없어요.');
  if (!apiOrigin) return errorResponse(503, 'api_not_configured', 'API 서버 주소가 설정되지 않았어요.');

  const target = new URL(`${apiOrigin}/${path}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  const headers = apiRequestHeaders({ Accept: request.headers.get('accept') ?? 'application/json' });
  const session = request.cookies.get(COOKIE_NAMES.session)?.value;
  if (session) headers.set('Cookie', `${COOKIE_NAMES.session}=${session}`);
  let body: ArrayBuffer | string | undefined;
  if (mutating) {
    const contentType = request.headers.get('content-type');
    if (rule.upload) {
      if (contentType) headers.set('Content-Type', contentType);
      body = await request.arrayBuffer();
    } else {
      body = await request.text();
      if (body) headers.set('Content-Type', 'application/json');
      else body = undefined;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: request.method, headers, body, cache: 'no-store', redirect: 'manual' });
  } catch {
    return errorResponse(502, 'upstream_unavailable', 'API 서버에 연결할 수 없어요.');
  }
  const responseHeaders = new Headers();
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('Set-Cookie', cookie);
  const empty = upstream.status === 204 || upstream.status === 304;
  return new NextResponse(empty ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
