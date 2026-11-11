import { BlockList, isIPv6 } from 'node:net';

/** Meta가 Instagram 등의 링크를 자동 검사할 때 쓰는 대역. User-Agent가 일반 브라우저라 `isBotUserAgent`로 걸러지지 않습니다(0233). */
const META_CRAWLER_RANGES = new BlockList();
META_CRAWLER_RANGES.addSubnet('2a03:2880::', 32, 'ipv6');

/** 저장된 방문 IP가 Meta 링크 검사 대역인지 판별합니다. 값이 없거나 IPv6가 아니면 사람으로 둡니다. 서버에서만 쓰고 원문은 응답에 넣지 않습니다. */
export function isMetaCrawlerIp(ip: string | null | undefined): boolean {
  return !!ip && isIPv6(ip) && META_CRAWLER_RANGES.check(ip, 'ipv6');
}
