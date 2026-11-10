import {
  CHANNEL_LINK_CODE_PATTERN,
  findChannelPreset,
  isDefaultChannelCampaign,
  type ChannelLinkView,
} from '@crelink/shared';

/** 목록의 한 줄 이름. 예: `인스타그램 · 프로필`, 캠페인이 기본값이 아니면 `인스타그램 · 릴스 · spring`. */
export function channelLinkTitle(link: Pick<ChannelLinkView, 'channel' | 'placement' | 'campaign'>): string {
  const found = findChannelPreset(link.channel, link.placement);
  const parts = [found?.channel.label ?? link.channel, found?.placement.label ?? link.placement];
  if (!isDefaultChannelCampaign(link.campaign)) parts.push(link.campaign);
  return parts.join(' · ');
}

/** 주소의 `via` 쿼리를 채널 주소 code 모양일 때만 문자열로 돌려줍니다(배열·형식 오류는 없는 것으로 봄). */
export function readLandingVia(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && CHANNEL_LINK_CODE_PATTERN.test(value) ? value : undefined;
}
