import { clientIp } from './tracking.service';

describe('clientIp (TRUSTED_PROXY_HOPS)', () => {
  it('hops=0이면 X-Forwarded-For를 무시하고 소켓 주소를 쓴다', () => {
    expect(clientIp('::ffff:10.0.0.2', '203.0.113.9', 0)).toBe('10.0.0.2');
    expect(clientIp(undefined, '203.0.113.9', 0)).toBeNull();
  });

  it('hops=N이면 오른쪽에서 N번째 값을 쓰고 앞쪽(클라이언트가 넣은) 값은 무시한다', () => {
    expect(clientIp('172.18.0.3', '1.1.1.1, 203.0.113.9', 1)).toBe('203.0.113.9');
    expect(clientIp('172.18.0.3', '1.1.1.1, 203.0.113.9, 172.18.0.9', 2)).toBe('203.0.113.9');
    expect(clientIp('172.18.0.3', ['1.1.1.1', '203.0.113.9'], 1)).toBe('203.0.113.9');
  });

  it('IPv6는 소문자로, IPv4-mapped IPv6는 IPv4로 바꾼다', () => {
    expect(clientIp('172.18.0.3', '2001:DB8::1', 1)).toBe('2001:db8::1');
    expect(clientIp('172.18.0.3', '::FFFF:198.51.100.7', 1)).toBe('198.51.100.7');
  });

  it('헤더가 없거나 값이 모자라거나 IP가 아니면 소켓 주소로 돌아간다', () => {
    expect(clientIp('172.18.0.3', undefined, 1)).toBe('172.18.0.3');
    expect(clientIp('172.18.0.3', '203.0.113.9', 2)).toBe('172.18.0.3');
    expect(clientIp('172.18.0.3', '1.1.1.1, not-an-ip', 1)).toBe('172.18.0.3');
    expect(clientIp('172.18.0.3', '1.1.1.1, 203.0.113.9:443', 1)).toBe('172.18.0.3');
    expect(clientIp('172.18.0.3', '', 1)).toBe('172.18.0.3');
  });
});
