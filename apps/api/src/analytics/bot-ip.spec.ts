import { isMetaCrawlerIp } from './bot-ip';

describe('Meta 링크 검사 IP 판별', () => {
  it.each([
    '2a03:2880::',
    '2a03:2880::1',
    '2a03:2880:f800:1::',
    '2A03:2880:F800:1::',
    '2a03:2880:ffff:ffff:ffff:ffff:ffff:ffff',
  ])('대역 안의 %s는 봇이다', (ip) => {
    expect(isMetaCrawlerIp(ip)).toBe(true);
  });

  it.each([
    '2a03:287f:ffff:ffff:ffff:ffff:ffff:ffff',
    '2a03:2881::',
    '2a03:2881::1',
    '2a02:2880::1',
    '2001:db8::1',
    '::1',
  ])('대역 밖의 %s는 사람이다', (ip) => {
    expect(isMetaCrawlerIp(ip)).toBe(false);
  });

  it.each(['31.13.24.1', '192.0.2.77', '127.0.0.1', '::ffff:31.13.24.1'])('IPv4 %s는 사람이다', (ip) => {
    expect(isMetaCrawlerIp(ip)).toBe(false);
  });

  it.each([null, undefined, '', 'not-an-ip', '2a03:2880::1/128', '2a03:2880'])(
    '빈 값·형식 오류 %s는 사람이다',
    (ip) => {
      expect(isMetaCrawlerIp(ip)).toBe(false);
    },
  );
});
