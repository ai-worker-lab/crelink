import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scrubBreadcrumb, scrubLog } from './monitoring.ts';

describe('Sentry 로그 개인정보 지우기(scrubLog)', () => {
  it('쿠키·인증 헤더·토큰·비밀값·비밀번호·이메일 키와 user.email·user.name을 지우고 user.id와 일반 속성은 남긴다', () => {
    const log = scrubLog({
      level: 'error',
      message: 'BFF 요청 실패',
      attributes: {
        'sentry.origin': 'auto.log.console',
        'user.id': '0b9f7c1e-3f1d-4c55-9a7e-1f2d3c4b5a69',
        'user.email': 'creator@example.com',
        'user.name': '크리에이터',
        cookie: 'cl_session=secret',
        'http.request.header.authorization': 'Bearer x',
        'x-crelink-internal': 't',
        accessToken: 't',
        clientSecret: 's',
        password: 'p',
        contactEmail: 'a@b.co',
        status: 502,
      },
    });
    assert.deepEqual(log.attributes, {
      'sentry.origin': 'auto.log.console',
      'user.id': '0b9f7c1e-3f1d-4c55-9a7e-1f2d3c4b5a69',
      status: 502,
    });
  });

  it('콘솔 인자로 들어온 중첩 객체·배열에서도 같은 키를 지운다', () => {
    const log = scrubLog({
      level: 'warn',
      message: '요청',
      attributes: {
        'sentry.message.parameter.0': {
          headers: { Cookie: 'cl_session=secret', accept: '*/*' },
          ids: [{ token: 't', id: 1 }],
        },
      },
    });
    assert.deepEqual(log.attributes, {
      'sentry.message.parameter.0': { headers: { accept: '*/*' }, ids: [{ id: 1 }] },
    });
  });

  it('본문과 문자열 속성 값의 이메일 모양 글자를 [email]로 바꾼다', () => {
    const log = scrubLog({
      level: 'error',
      message: '로그인 실패 creator.name+tag@example.co.kr (재시도 1)',
      attributes: {
        'sentry.message.template': '로그인 실패 {} (재시도 {})',
        'sentry.message.parameter.0': 'creator.name+tag@example.co.kr',
        'sentry.message.parameter.1': ['x', 'a@b.co'],
      },
    });
    assert.equal(log.message, '로그인 실패 [email] (재시도 1)');
    assert.deepEqual(log.attributes, {
      'sentry.message.template': '로그인 실패 {} (재시도 {})',
      'sentry.message.parameter.0': '[email]',
      'sentry.message.parameter.1': ['x', '[email]'],
    });
  });
});

describe('Sentry breadcrumb 개인정보 지우기(scrubBreadcrumb)', () => {
  it('콘솔 breadcrumb의 문구와 arguments(중첩 포함)의 이메일을 가리고 민감한 키를 지운다', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'console',
      level: 'warning',
      message: '초대 실패 owner@example.com',
      data: {
        logger: 'console',
        arguments: ['초대 실패 owner@example.com', { to: 'owner@example.com', token: 't', tries: 2 }],
      },
    });
    assert.deepEqual(breadcrumb, {
      category: 'console',
      level: 'warning',
      message: '초대 실패 [email]',
      data: { logger: 'console', arguments: ['초대 실패 [email]', { to: '[email]', tries: 2 }] },
    });
  });
});
