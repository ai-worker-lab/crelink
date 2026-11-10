import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHANNEL_LINK_CODE_PATTERN,
  CHANNEL_LINK_PRESETS,
  channelLinkCampaign,
  channelLinkUtm,
  findChannelPreset,
  isDefaultChannelCampaign,
  normalizeChannelCampaign,
} from './channel-links.ts';

test('프리셋은 설계 표와 같은 채널 8개와 노출 위치를 가진다', () => {
  assert.deepEqual(
    CHANNEL_LINK_PRESETS.map((item) => [item.value, item.label, item.placements.map((place) => place.value)]),
    [
      ['instagram', '인스타그램', ['bio', 'story', 'reels', 'post', 'dm', 'ad']],
      ['youtube', '유튜브', ['channel', 'description', 'shorts', 'community', 'ad']],
      ['tiktok', '틱톡', ['bio', 'video', 'dm', 'ad']],
      ['threads', '스레드', ['bio', 'post']],
      ['x', 'X', ['bio', 'post', 'ad']],
      ['facebook', '페이스북', ['bio', 'post', 'ad']],
      ['naver_blog', '네이버 블로그', ['bio', 'post']],
      ['kakao', '카카오톡', ['channel', 'chat']],
    ],
  );
  assert.equal(findChannelPreset('instagram', 'bio')?.placement.label, '프로필');
  assert.equal(findChannelPreset('naver_blog', 'post')?.placement.label, '글');
  assert.equal(findChannelPreset('instagram', 'video'), null);
  assert.equal(findChannelPreset('myspace', 'bio'), null);
});

test('캠페인 이름: 소문자·하이픈·허용 글자·40자, 비면 기본값, 남는 글자가 없으면 거부', () => {
  assert.equal(normalizeChannelCampaign(undefined), '');
  assert.equal(normalizeChannelCampaign('   '), '');
  assert.equal(normalizeChannelCampaign(' Summer_Sale 2026!! '), 'summer-sale-2026');
  assert.equal(normalizeChannelCampaign('여름 이벤트'), '여름-이벤트');
  assert.equal(normalizeChannelCampaign('a'.repeat(60)), 'a'.repeat(40));
  assert.equal(normalizeChannelCampaign('!!!###'), null);
  assert.equal(channelLinkCampaign('bio', ''), 'profile');
  assert.equal(channelLinkCampaign('reels', ''), 'general');
  assert.equal(channelLinkCampaign('bio', 'spring'), 'spring');
  assert.equal(isDefaultChannelCampaign('profile'), true);
  assert.equal(isDefaultChannelCampaign('spring'), false);
});

test('UTM: 광고는 paid_social, 그 밖은 social, id는 code', () => {
  assert.deepEqual(channelLinkUtm({ code: 'abc1234', channel: 'instagram', placement: 'bio', campaign: 'profile' }), {
    source: 'instagram',
    medium: 'social',
    campaign: 'profile',
    content: 'bio',
    id: 'abc1234',
  });
  assert.equal(
    channelLinkUtm({ code: 'abc1234', channel: 'youtube', placement: 'ad', campaign: 'general' }).medium,
    'paid_social',
  );
});

test('code 패턴은 7~10자 영소문자·숫자만 받는다', () => {
  for (const code of ['abc1234', 'abc1234567']) assert.equal(CHANNEL_LINK_CODE_PATTERN.test(code), true);
  for (const code of ['abc123', 'abc12345678', 'ABC1234', 'abc-234', 'abc1234\n']) {
    assert.equal(CHANNEL_LINK_CODE_PATTERN.test(code), false);
  }
});
