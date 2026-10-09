import { COOKIE_NAMES } from '@crelink/shared';
import type { NextRequest } from 'next/server';
import { forwardToApi, proxyErrorResponse } from '../../../../lib/api/proxy';
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
  { methods: ['POST'], pattern: /^api\/me\/banners$/ },
  { methods: ['PUT'], pattern: /^api\/me\/banners\/order$/ },
  { methods: ['PATCH', 'DELETE'], pattern: new RegExp(`^api/me/banners/${ID}$`) },
  { methods: ['POST'], pattern: /^api\/me\/files$/, upload: true },
  { methods: ['GET'], pattern: new RegExp(`^api/files/${ID}$`) },
  { methods: ['GET'], pattern: new RegExp(`^api/public/landings/${ID}$`) },
  { methods: ['GET'], pattern: /^api\/admin\/creators$/ },
  { methods: ['GET'], pattern: new RegExp(`^api/admin/creators/${ID}$`) },
  { methods: ['GET'], pattern: new RegExp(`^api/admin/creators/${ID}/stats$`) },
  {
    methods: ['PUT'],
    pattern: new RegExp(`^api/admin/creators/${ID}/(extra-slots|suspension|banner-slot|metrics-exclusion)$`),
  },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/links/${ID}/block$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/banners/${ID}/block$`) },
  { methods: ['GET', 'POST'], pattern: /^api\/admin\/blocked-domains$/ },
  { methods: ['DELETE'], pattern: new RegExp(`^api/admin/blocked-domains/${ID}$`) },
  // 광고 배너 목록 `GET`은 서버 렌더만 부르므로 넣지 않습니다(설계 docs/specs/crelink-ad-banner.md `권한·보안`).
  { methods: ['POST'], pattern: /^api\/admin\/ad-banners$/ },
  { methods: ['PUT'], pattern: /^api\/admin\/ad-banners\/order$/ },
  { methods: ['PATCH'], pattern: new RegExp(`^api/admin/ad-banners/${ID}$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/ad-banners/${ID}/end$`) },
  // 링크 슬롯 이벤트(R24, 설계 docs/specs/crelink-slot-event.md `API 계약 초안`). 운영자 `GET`의 `?page=`는 다른 경로처럼 그대로 넘깁니다.
  { methods: ['POST'], pattern: /^api\/me\/slot-event\/entry$/ },
  { methods: ['GET', 'PUT'], pattern: /^api\/admin\/slot-event$/ },
  { methods: ['GET', 'POST'], pattern: new RegExp(`^api/landings/${ID}/guestbook$`) },
  { methods: ['DELETE'], pattern: new RegExp(`^api/guestbook/${ID}$`) },
  { methods: ['PUT'], pattern: new RegExp(`^api/guestbook/${ID}/hidden$`) },
  // AI 운영자(설계 docs/specs/crelink-ai-operator.md `화면 상태와 API 대응`). 조회 GET은 서버 렌더만 부르므로 넣지 않습니다.
  { methods: ['PUT'], pattern: /^api\/admin\/ai-operator\/pause$/ },
  { methods: ['PUT'], pattern: new RegExp(`^api/admin/ai-operator/tokens/${ID}/revoke$`) },
];

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
  if (!rule) return proxyErrorResponse('route_not_allowed');
  const mutating = request.method !== 'GET' && request.method !== 'HEAD';
  if (mutating && !isSameOrigin(request)) return proxyErrorResponse('forbidden');
  if (!apiOrigin) return proxyErrorResponse('api_not_configured');

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
  return forwardToApi(target, { method: request.method, headers, body }, { setCookie: true });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
