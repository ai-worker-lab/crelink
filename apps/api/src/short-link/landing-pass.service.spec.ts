import { LANDING_PASS_TTL_SECONDS, LandingPassService } from './landing-pass.service';

describe('LandingPassService (단축 주소 통과 표시)', () => {
  const now = Date.UTC(2026, 9, 7, 12, 0, 0);
  const pass = new LandingPassService();

  it('발급한 표시는 같은 publicId에 대해 만료 시각까지 유효하다', () => {
    const token = pass.issue('abcdefghij', now);
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]{22}$/);
    expect(pass.verify('abcdefghij', token, now)).toBe(true);
    expect(pass.verify('abcdefghij', token, now + LANDING_PASS_TTL_SECONDS * 1000)).toBe(true);
    expect(pass.verify('abcdefghij', token, now + LANDING_PASS_TTL_SECONDS * 1000 + 1)).toBe(false);
  });

  it('다른 publicId·변조한 서명·만료 시각·다른 프로세스 키는 거부한다', () => {
    const token = pass.issue('abcdefghij', now);
    const [expires, signature] = token.split('.');
    expect(pass.verify('zzzzzzzzzz', token, now)).toBe(false);
    const flipped = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    expect(pass.verify('abcdefghij', `${expires}.${flipped}`, now)).toBe(false);
    expect(pass.verify('abcdefghij', `${Number(expires) + 3600}.${signature}`, now)).toBe(false);
    expect(new LandingPassService().verify('abcdefghij', token, now)).toBe(false);
  });

  it('없거나 형식이 틀린 값은 거부한다', () => {
    for (const value of [undefined, '', 'x', '123', '123.', `123.${'a'.repeat(21)}`, ['1.a'], 42]) {
      expect(pass.verify('abcdefghij', value, now)).toBe(false);
    }
  });
});
