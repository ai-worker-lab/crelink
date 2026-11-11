/**
 * 채널별 짧은 주소 계약. 근거: docs/specs/channel-links.md.
 * `{SHORT}/s/{code}`로 들어온 방문은 저장된 프리셋을 UTM으로 기록하고, 최종 주소창에는 UTM 대신 `via={code}`만 남습니다.
 */
import type { LandingUtm } from './telemetry.js';

export const CHANNEL_LINK_LIMITS = {
  /** 보관하지 않은 주소의 랜딩당 상한. */
  perLanding: 50,
  /** 보관한 주소까지 센 랜딩당 상한. 만들고 보관하기를 되풀이해 코드를 쌓는 것을 막습니다. */
  totalPerLanding: 200,
  /** 새로 발급하는 code 길이. */
  codeLength: 7,
  /** 캠페인 이름 최대 길이(정규화 뒤). */
  campaignMax: 40,
} as const;

/** 라우팅·검증이 받는 code. 발급은 `codeLength`지만 길이만 늘릴 수 있게 7~10자를 받습니다(DB CHECK, Caddy 정규식과 같음). */
export const CHANNEL_LINK_CODE_PATTERN = /^[a-z0-9]{7,10}$/;

/** 캠페인 이름이 비었을 때 쓰는 값. `bio`는 `profile`, 그 밖은 `general`. */
export const CHANNEL_LINK_DEFAULT_CAMPAIGNS = { bio: 'profile', other: 'general' } as const;

export interface ChannelPlacementPreset {
  /** `utm_content`에 저장되는 값. */
  value: string;
  label: string;
}

export interface ChannelPreset {
  /** `utm_source`에 저장되는 값. */
  value: string;
  label: string;
  placements: readonly ChannelPlacementPreset[];
}

const BIO = { value: 'bio', label: '프로필' } as const;
const POST = { value: 'post', label: '게시물' } as const;
const DM = { value: 'dm', label: 'DM' } as const;
const AD = { value: 'ad', label: '광고' } as const;

/** 고를 수 있는 채널과 노출 위치. 직접 입력은 없습니다. */
export const CHANNEL_LINK_PRESETS: readonly ChannelPreset[] = [
  {
    value: 'instagram',
    label: '인스타그램',
    placements: [BIO, { value: 'story', label: '스토리' }, { value: 'reels', label: '릴스' }, POST, DM, AD],
  },
  {
    value: 'youtube',
    label: '유튜브',
    placements: [
      { value: 'channel', label: '채널 소개' },
      { value: 'description', label: '영상 설명' },
      { value: 'shorts', label: '쇼츠' },
      { value: 'community', label: '커뮤니티' },
      AD,
    ],
  },
  {
    value: 'tiktok',
    label: '틱톡',
    placements: [BIO, { value: 'video', label: '영상' }, DM, AD],
  },
  { value: 'threads', label: '스레드', placements: [BIO, POST] },
  { value: 'x', label: 'X', placements: [BIO, POST, AD] },
  { value: 'facebook', label: '페이스북', placements: [BIO, POST, AD] },
  { value: 'naver_blog', label: '네이버 블로그', placements: [BIO, { value: 'post', label: '글' }] },
  {
    value: 'kakao',
    label: '카카오톡',
    placements: [
      { value: 'channel', label: '채널' },
      { value: 'chat', label: '대화' },
    ],
  },
];

export function findChannelPreset(channel: unknown, placement: unknown) {
  const preset = CHANNEL_LINK_PRESETS.find((item) => item.value === channel);
  const found = preset?.placements.find((item) => item.value === placement);
  return preset && found ? { channel: preset, placement: found } : null;
}

/**
 * 캠페인 입력을 저장 형태로 바꿉니다. 소문자로 바꾸고 공백·`_`는 하이픈으로, `[a-z0-9가-힣-]` 밖의 글자는 지운 뒤
 * `campaignMax`자로 자릅니다. 입력이 비어 있으면 `''`(기본값을 쓰라는 뜻), 입력이 있는데 남는 글자가 없으면 `null`(잘못된 입력)입니다.
 */
export function normalizeChannelCampaign(input: string | null | undefined): string | null {
  const text = (input ?? '').trim();
  if (!text) return '';
  const clean = text
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '')
    .slice(0, CHANNEL_LINK_LIMITS.campaignMax);
  return clean || null;
}

/** 저장할 캠페인 값. `campaign`은 `normalizeChannelCampaign`이 `''`를 돌려준 경우 기본값으로 바뀝니다. */
export function channelLinkCampaign(placement: string, campaign: string): string {
  if (campaign) return campaign;
  return placement === 'bio' ? CHANNEL_LINK_DEFAULT_CAMPAIGNS.bio : CHANNEL_LINK_DEFAULT_CAMPAIGNS.other;
}

/** 기본 캠페인 값이면 목록에서 캠페인을 따로 보여 주지 않습니다. */
export function isDefaultChannelCampaign(campaign: string): boolean {
  return campaign === CHANNEL_LINK_DEFAULT_CAMPAIGNS.bio || campaign === CHANNEL_LINK_DEFAULT_CAMPAIGNS.other;
}

/** 저장된 프리셋이 방문에 남기는 UTM. `id`는 code라 릴스 한 편 단위 구분은 기존 `UTM ID` 분포에서 봅니다. */
export function channelLinkUtm(link: {
  code: string;
  channel: string;
  placement: string;
  campaign: string;
}): LandingUtm {
  return {
    source: link.channel,
    medium: link.placement === 'ad' ? 'paid_social' : 'social',
    campaign: link.campaign,
    content: link.placement,
    id: link.code,
  };
}

/** 관리 목록의 한 줄. `url`은 `{SHORT}/s/{code}`. */
export interface ChannelLinkView {
  code: string;
  url: string;
  channel: string;
  placement: string;
  campaign: string;
  createdAt: string;
}

/** `POST /api/me/channel-links`. `campaign`을 생략하거나 비우면 기본값입니다. */
export interface CreateChannelLinkRequest {
  channel: string;
  placement: string;
  campaign?: string | null;
}
