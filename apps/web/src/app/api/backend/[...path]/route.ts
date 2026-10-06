import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const apiOrigin = (process.env.API_INTERNAL_URL ?? '').replace(/\/$/, '');
const rules: ReadonlyArray<{ method: string; pattern: RegExp }> = [{ method: 'GET', pattern: /^api\/health$/ }];

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.map(encodeURIComponent).join('/');
  if (!rules.some((rule) => rule.method === request.method && rule.pattern.test(path))) {
    return NextResponse.json({ code: 'route_not_allowed', message: '허용되지 않은 API 요청이에요.' }, { status: 404 });
  }
  if (!apiOrigin) {
    return NextResponse.json(
      { code: 'api_not_configured', message: 'API 서버 주소가 설정되지 않았어요.' },
      { status: 503 },
    );
  }
  const target = new URL(`${apiOrigin}/${path}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  const headers = new Headers({ Accept: 'application/json' });
  if (request.headers.get('content-type')) headers.set('Content-Type', 'application/json');
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  let upstream: Response;
  try {
    upstream = await fetch(target, { method: request.method, headers, body, cache: 'no-store', redirect: 'manual' });
  } catch {
    return NextResponse.json(
      { code: 'upstream_unavailable', message: 'API 서버에 연결할 수 없어요.' },
      { status: 502 },
    );
  }
  const content = await upstream.text();
  return new NextResponse(content || null, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
