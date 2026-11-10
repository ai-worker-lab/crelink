import { createHmac } from 'node:crypto';
import { constantTimeEquals, parseSignedRequest, verifyWebhookSignature } from './signed-request';

const SECRET = 'unit-test-secret';
const signedRequest = (payload: unknown, secret = SECRET) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${createHmac('sha256', secret).update(encoded).digest('base64url')}.${encoded}`;
};

describe('verifyWebhookSignature', () => {
  const body = Buffer.from('{"a":1}');
  const header = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;

  it('원문 바이트의 HMAC이 맞으면 통과한다', () => {
    expect(verifyWebhookSignature(SECRET, body, header)).toBe(true);
  });

  it.each([
    ['다른 본문', Buffer.from('{"a":2}'), header],
    ['다른 서명', body, `sha256=${'0'.repeat(64)}`],
    ['대문자 접두어', body, header.replace('sha256', 'SHA256')],
    ['뒤에 군더더기', body, `${header}00`],
    ['문자열 아님', body, undefined],
  ])('%s는 거부한다', (_name, candidate, value) => {
    expect(verifyWebhookSignature(SECRET, candidate, value)).toBe(false);
  });
});

describe('parseSignedRequest', () => {
  it('서명이 맞으면 user_id를 돌려준다', () => {
    expect(parseSignedRequest(SECRET, signedRequest({ algorithm: 'HMAC-SHA256', user_id: '123' }))).toEqual({
      userId: '123',
    });
  });

  it('base64 패딩이 붙어도 읽는다', () => {
    const [signature, encoded] = signedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }).split('.');
    expect(parseSignedRequest(SECRET, `${signature}=.${encoded}`)).toEqual({ userId: '1' });
  });

  it.each([
    ['다른 시크릿', signedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'other')],
    ['구분자 없음', 'abc'],
    ['점이 둘', 'a.b.c'],
    ['알고리즘 없음', signedRequest({ user_id: '1' })],
    ['빈 user_id', signedRequest({ algorithm: 'HMAC-SHA256', user_id: '' })],
    ['소수 user_id', signedRequest({ algorithm: 'HMAC-SHA256', user_id: 1.5 })],
    ['객체 아님', signedRequest('text')],
  ])('%s는 null', (_name, value) => {
    expect(parseSignedRequest(SECRET, value)).toBeNull();
  });
});

describe('constantTimeEquals', () => {
  it('길이가 달라도 예외 없이 비교한다', () => {
    expect(constantTimeEquals('token', 'token')).toBe(true);
    expect(constantTimeEquals('token', 'tok')).toBe(false);
  });
});
