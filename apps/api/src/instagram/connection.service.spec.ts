import { InstagramOAuthState, signOAuthState, verifyOAuthState } from './connection.service';

describe('Instagram OAuth state 서명', () => {
  const secret = 'test-secret';
  const now = 1_800_000_000;
  const payload: InstagramOAuthState = { uid: 'user-1', exp: now + 600, nonce: 'abc', rev: 3 };

  it('서명한 값을 그대로 돌려준다', () => {
    expect(verifyOAuthState(secret, signOAuthState(secret, payload), now)).toEqual(payload);
  });

  it('만료된 state는 거부한다', () => {
    expect(verifyOAuthState(secret, signOAuthState(secret, { ...payload, exp: now }), now)).toBeNull();
  });

  it('다른 시크릿의 서명은 거부한다', () => {
    expect(verifyOAuthState('other', signOAuthState(secret, payload), now)).toBeNull();
  });

  it('본문을 바꾸면 거부한다', () => {
    const [, mac] = signOAuthState(secret, payload).split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, uid: 'user-2' })).toString('base64url');
    expect(verifyOAuthState(secret, `${forged}.${mac}`, now)).toBeNull();
  });

  it('앱 시크릿으로 직접 만든 HMAC은 state 서명이 아니다', () => {
    const { createHmac } = jest.requireActual<typeof import('node:crypto')>('node:crypto');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const mac = createHmac('sha256', secret).update(body).digest('base64url');
    expect(verifyOAuthState(secret, `${body}.${mac}`, now)).toBeNull();
  });

  it.each(['', 'a', 'a.b.c', '.', 'a.', '.b', '%%%.%%%'])('형식이 틀린 값 %p는 거부한다', (value) => {
    expect(verifyOAuthState(secret, value, now)).toBeNull();
  });

  it('서명의 끝 글자 변형은 거부한다', () => {
    const token = signOAuthState(secret, payload);
    const last = token.at(-1)!;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const variants = [...alphabet].filter((char) => char !== last).map((char) => token.slice(0, -1) + char);
    for (const variant of variants) expect(verifyOAuthState(secret, variant, now)).toBeNull();
  });
});
