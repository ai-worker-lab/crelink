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

  it('방문자 바인딩 표시는 목적과 페이지가 다른 계측 토큰으로 사용할 수 없다', () => {
    const visitor = '11111111-2222-4333-8444-555555555555';
    const bound = pass.issue('abcdefghij', now, visitor);
    expect(pass.verify('abcdefghij', bound, now)).toBe(true);
    expect(pass.verify('abcdefghij', bound.replace(visitor, '22222222-2222-4333-8444-555555555555'), now)).toBe(false);
    const token = pass.telemetryToken('abcdefghij', bound, now)!;
    expect(pass.verifyTelemetry('abcdefghij', token, now)).toEqual({ visitorId: visitor, sourceAt: now / 1000 });
    expect(pass.verifyTelemetry('another-id', token, now)).toBeNull();
    expect(pass.verifyTelemetry('abcdefghij', bound, now)).toBeNull();
    expect(pass.verify('abcdefghij', token, now)).toBe(false);
    expect(pass.verifyTelemetry('abcdefghij', token, now + 24 * 60 * 60 * 1000 + 1)).toBeNull();
    expect(pass.telemetryToken('abcdefghij', pass.issue('abcdefghij', now), now)).toBeNull();
  });
});
