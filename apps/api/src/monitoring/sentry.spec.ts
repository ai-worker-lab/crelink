import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent } from '@sentry/nestjs';
import {
  DEFAULT_TRACES_SAMPLE_RATE,
  parseTracesSampleRate,
  scrubEvent,
  scrubLog,
  scrubMetric,
  scrubSpan,
  sentryOptions,
} from './sentry';

const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

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

  it('로그는 쿠키·인증·토큰·비밀값·이메일 속성과 user 이메일·이름을 지우고, 본문·문자열 속성의 이메일과 JWT를 가린다', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6ImFAYi5jb20ifQ.c2lnbmF0dXJl';
    const log = scrubLog({
      level: 'warn',
      message: `구글 code 교환·ID 토큰 검증 실패: Invalid token signature: ${jwt} {"email":"Creator.One+x@Example.co.kr"}`,
      attributes: {
        'nest.context': 'AuthService',
        'nest.stack': 'Error: creator@example.com 처리 실패\n    at login (auth.service.ts:1:1)',
        'user.id': USER_ID,
        'user.email': 'creator@example.com',
        'user.name': 'Creator',
        'http.request.header.cookie': 'cl_session=secret',
        Authorization: 'Bearer secret',
        sessionToken: 'secret',
        client_secret: 'secret',
        password: 'secret',
        contactEmail: 'creator@example.com',
        'sentry.environment': 'production',
      },
    });
    expect(log.message).toBe('구글 code 교환·ID 토큰 검증 실패: Invalid token signature: [token] {"email":"[email]"}');
    expect(log.attributes).toEqual({
      'nest.context': 'AuthService',
      'nest.stack': 'Error: [email] 처리 실패\n    at login (auth.service.ts:1:1)',
      'user.id': USER_ID,
      'sentry.environment': 'production',
    });
  });

  it('지표 속성에서 사용자 ID·이메일·이름·IP를 지우고 열거값은 남긴다', () => {
    const metric = scrubMetric({
      name: 'crelink.auth.login',
      type: 'counter',
      value: 1,
      attributes: {
        result: 'success',
        'user.id': USER_ID,
        'user.email': 'creator@example.com',
        'user.name': 'Creator',
        'user.ip_address': '203.0.113.7',
        'client.address': '203.0.113.7',
        ip: '203.0.113.7',
        email: 'creator@example.com',
        'sentry.environment': 'production',
      },
    });
    expect(metric).toEqual({
      name: 'crelink.auth.login',
      type: 'counter',
      value: 1,
      attributes: { result: 'success', 'sentry.environment': 'production' },
    });
  });
});
