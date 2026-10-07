import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent } from '@sentry/nestjs';
import { DEFAULT_TRACES_SAMPLE_RATE, parseTracesSampleRate, scrubEvent, scrubSpan, sentryOptions } from './sentry';

describe('Sentry 설정', () => {
  it('SENTRY_DSN이 없거나 공백이면 설정이 없고(초기화하지 않음) Sentry는 꺼져 있다', () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: '  ' })).toBeNull();
    expect(Sentry.isInitialized()).toBe(false);
    expect(Sentry.isEnabled()).toBe(false);
  });

  it('DSN이 있으면 기본 환경은 NODE_ENV에 따르고 traces 비율은 0.1, IP 자동 추론·쿠키·본문·DB 파라미터는 끈다', () => {
    const dsn = 'https://public@o1.ingest.us.sentry.io/1';
    expect(sentryOptions({ SENTRY_DSN: dsn, NODE_ENV: 'production' })).toMatchObject({
      dsn,
      environment: 'production',
      release: undefined,
      tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
      dataCollection: { userInfo: false, cookies: false, httpBodies: [], databaseQueryData: false },
    });
    expect(sentryOptions({ SENTRY_DSN: dsn })?.environment).toBe('development');
    expect(
      sentryOptions({
        SENTRY_DSN: dsn,
        SENTRY_ENVIRONMENT: 'staging',
        SENTRY_RELEASE: 'abc123',
        NODE_ENV: 'production',
      }),
    ).toMatchObject({ environment: 'staging', release: 'abc123' });
  });

  it('SENTRY_TRACES_SAMPLE_RATE는 0~1 사이 수만 받는다', () => {
    expect(parseTracesSampleRate(undefined)).toBe(0.1);
    expect(parseTracesSampleRate('0')).toBe(0);
    expect(parseTracesSampleRate('1')).toBe(1);
    expect(() => parseTracesSampleRate('1.5')).toThrow('SENTRY_TRACES_SAMPLE_RATE');
    expect(() => parseTracesSampleRate('abc')).toThrow('SENTRY_TRACES_SAMPLE_RATE');
  });

  it('이벤트의 쿠키와 인증·내부 토큰 헤더를 지운다', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        cookies: { cl_session: 'secret' },
        headers: { Cookie: 'cl_session=secret', authorization: 'Bearer x', 'x-crelink-internal': 't', accept: '*/*' },
      },
    } as ErrorEvent);
    expect(event.request).toEqual({ headers: { accept: '*/*' } });
  });

  it('span 속성의 쿠키·인증 헤더를 지운다', () => {
    const span = scrubSpan({
      trace_id: 't',
      span_id: 's',
      name: 'GET /api/me',
      start_timestamp: 0,
      status: 'ok',
      is_segment: true,
      attributes: {
        'http.request.header.cookie': ['cl_session=secret'],
        'http.request.header.x-crelink-internal': ['t'],
        'http.response.header.set-cookie': ['cl_session=secret'],
        'http.request.header.accept': ['*/*'],
      },
    });
    expect(span.attributes).toEqual({ 'http.request.header.accept': ['*/*'] });
  });
});
