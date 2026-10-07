import * as Sentry from '@sentry/nestjs';
import type { Event } from '@sentry/nestjs';
import { CreatorService } from '../src/creator/creator.service';
import { sentryOptions } from '../src/monitoring/sentry';
import { createTestApp, login, TestApp } from './test-app';

/** 보낸 envelope 원문(쿠키 원문 검사용)과 그 안의 오류 이벤트·span. */
const envelopes: string[] = [];
const events: Event[] = [];
const spans: Array<{ name: string; attributes: Record<string, { value: unknown }> }> = [];

/** 네트워크로 보내지 않고 envelope를 모으는 transport(Sentry `transport` 옵션 + `createTransport`). */
function memoryTransport(options: Parameters<typeof Sentry.createTransport>[0]) {
  return Sentry.createTransport(options, async (request) => {
    const text = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
    envelopes.push(text);
    const lines = text.split('\n').filter(Boolean);
    for (let index = 1; index + 1 < lines.length; index += 2) {
      const header = JSON.parse(lines[index]) as { type: string };
      const payload = JSON.parse(lines[index + 1]);
      if (header.type === 'event') events.push(payload);
      if (header.type === 'span') spans.push(...payload.items);
    }
    return { statusCode: 200 };
  });
}

function reset() {
  envelopes.length = 0;
  events.length = 0;
  spans.length = 0;
}

/**
 * Sentry를 켠 API(가짜 transport)에서 무엇을 보내는지 확인합니다. 다른 시험 파일은 Sentry를 켜지 않습니다(`SENTRY_DSN` 없음).
 * 시험은 모듈을 불러온 뒤 초기화하므로 OpenTelemetry 자동 계측(Express·pg span)은 붙지 않고, 요청 격리 스코프·오류 캡처·HTTP 서버 span만 확인합니다.
 */
describe('Sentry 오류 모니터링', () => {
  let t: TestApp;
  /** `cl_session=<토큰>`과 그 토큰 원문. */
  let cookie: string;
  let sessionToken: string;
  let userId: string;

  beforeAll(async () => {
    Sentry.init({
      ...sentryOptions({ SENTRY_DSN: 'http://public@127.0.0.1:9/1' })!,
      tracesSampleRate: 1,
      transport: memoryTransport,
      // 모듈을 이미 불러온 뒤라 라이브러리 계측 주입(모듈 hook)은 쓸 수 없습니다. 끄지 않으면 경고만 남깁니다.
      enableRuntimeChannelInjection: false,
    });
    t = await createTestApp({ env: { TRUSTED_PROXY_HOPS: '1' } });
    const result = await login(t.baseUrl, 'sentry-subject|sentry@example.com');
    cookie = result.cookie!;
    sessionToken = cookie.split('=')[1];
    userId = result.body.user!.id;
  });

  afterAll(async () => {
    await t?.close();
    await Sentry.close(2000);
  });

  beforeEach(reset);

  it('예상하지 못한 오류(500)는 1건 보내고, user는 내부 ID와 신뢰 프록시 기준 IP뿐이며 쿠키 원문은 없다', async () => {
    jest.spyOn(t.app.get(CreatorService), 'landingState').mockRejectedValueOnce(new Error('sentry-e2e boom'));
    const response = await fetch(`${t.baseUrl}/api/me/landing`, {
      headers: { cookie: `${cookie}; cl_vid=visitor-1`, 'x-forwarded-for': '198.51.100.9, 203.0.113.7' },
    });
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe('internal_error');
    await Sentry.flush(2000);

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.exception?.values?.[0]?.value).toBe('sentry-e2e boom');
    // X-Forwarded-For 첫 값(198.51.100.9, 위조 가능)이 아니라 TRUSTED_PROXY_HOPS=1의 오른쪽 첫 값. 이메일은 없다.
    expect(event.user).toEqual({ id: userId, ip_address: '203.0.113.7' });
    expect(event.request?.cookies).toBeUndefined();
    expect(Object.keys(event.request?.headers ?? {}).map((name) => name.toLowerCase())).not.toContain('cookie');
    expect(envelopes.join('\n')).not.toContain(sessionToken);
    expect(envelopes.join('\n')).not.toContain('sentry@example.com');
  });

  it('동시에 처리 중인 다른 요청의 user(IP)가 섞이지 않는다(요청 격리 스코프)', async () => {
    // API tsconfig의 lib(ES2022)에 Promise.withResolvers 타입이 없어 executor 형태로 둡니다.
    let entered!: () => void;
    let release!: () => void;
    const serviceEntered = new Promise<void>((resolve) => (entered = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    jest.spyOn(t.app.get(CreatorService), 'landingState').mockImplementationOnce(async () => {
      entered();
      await released;
      throw new Error('sentry-e2e slow boom');
    });
    const failing = fetch(`${t.baseUrl}/api/me/landing`, { headers: { cookie, 'x-forwarded-for': '203.0.113.10' } });
    // 실패할 요청이 서비스에서 기다리는 동안 로그인하지 않은 다른 IP의 요청을 끝냅니다.
    await serviceEntered;
    const other = await fetch(`${t.baseUrl}/api/health`, { headers: { 'x-forwarded-for': '203.0.113.99' } });
    expect(other.status).toBe(200);
    release();
    expect((await failing).status).toBe(500);
    await Sentry.flush(2000);

    expect(events).toHaveLength(1);
    expect(events[0].user).toEqual({ id: userId, ip_address: '203.0.113.10' });
  });

  it('4xx(HttpException 401·404, 본문 파서 413·400)는 보내지 않는다', async () => {
    const unauthenticated = await fetch(`${t.baseUrl}/api/me/landing`);
    const notFound = await fetch(`${t.baseUrl}/api/no-such-path`);
    const tooLarge = await fetch(`${t.baseUrl}/api/me/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x'.repeat(110 * 1024) }),
    });
    const badJson = await fetch(`${t.baseUrl}/api/me/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title":',
    });
    expect([unauthenticated.status, notFound.status, tooLarge.status, badJson.status]).toEqual([401, 404, 413, 400]);
    await Sentry.flush(2000);
    expect(events).toHaveLength(0);
  });

  it('성능 span에는 요청 user(내부 ID·IP)가 붙고 쿠키 헤더는 없다', async () => {
    const response = await fetch(`${t.baseUrl}/api/me/landing`, {
      headers: { cookie, 'x-forwarded-for': '203.0.113.8' },
    });
    expect(response.status).toBe(200);
    await Sentry.flush(2000);

    const segment = spans.find((span) => span.attributes['user.id']?.value === userId);
    expect(segment?.attributes['user.ip_address']?.value).toBe('203.0.113.8');
    expect(spans.flatMap((span) => Object.keys(span.attributes))).not.toContain('http.request.header.cookie');
    expect(envelopes.join('\n')).not.toContain(sessionToken);
  });
});
