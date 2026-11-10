import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backendRules } from './api/backend-rules.ts';
import { channelLinkTitle, readLandingVia } from './channel-links.ts';

test('목록 이름: 채널 · 위치, 기본 캠페인이 아니면 캠페인을 덧붙인다', () => {
  assert.equal(
    channelLinkTitle({ channel: 'instagram', placement: 'bio', campaign: 'profile' }),
    '인스타그램 · 프로필',
  );
  assert.equal(channelLinkTitle({ channel: 'youtube', placement: 'shorts', campaign: 'general' }), '유튜브 · 쇼츠');
  assert.equal(
    channelLinkTitle({ channel: 'instagram', placement: 'reels', campaign: 'spring' }),
    '인스타그램 · 릴스 · spring',
  );
  assert.equal(
    channelLinkTitle({ channel: 'naver_blog', placement: 'post', campaign: 'general' }),
    '네이버 블로그 · 글',
  );
  // 프리셋에서 빠진 옛 값은 저장된 글자 그대로 보여 준다.
  assert.equal(channelLinkTitle({ channel: 'myspace', placement: 'bio', campaign: 'profile' }), 'myspace · bio');
});

test('via는 code 모양의 문자열일 때만 받는다', () => {
  assert.equal(readLandingVia('abc1234'), 'abc1234');
  assert.equal(readLandingVia('abc1234567'), 'abc1234567');
  for (const value of [undefined, 'abc123', 'ABC1234', 'abc12345678', ['abc1234', 'abc1235'], 'a b1234', '']) {
    assert.equal(readLandingVia(value), undefined);
  }
});

test('BFF 허용 목록: 목록·생성(GET·POST)과 보관(POST)만 열고 삭제·수정·잘못된 경로는 막는다', () => {
  const allowed = (method: string, path: string) =>
    backendRules.some((rule) => rule.methods.includes(method) && rule.pattern.test(path));
  assert.equal(allowed('GET', 'api/me/channel-links'), true);
  assert.equal(allowed('POST', 'api/me/channel-links'), true);
  assert.equal(allowed('POST', 'api/me/channel-links/abc1234/archive'), true);
  for (const [method, path] of [
    ['DELETE', 'api/me/channel-links'],
    ['PUT', 'api/me/channel-links'],
    ['GET', 'api/me/channel-links/abc1234/archive'],
    ['DELETE', 'api/me/channel-links/abc1234'],
    ['POST', 'api/me/channel-links/abc1234/archive/extra'],
  ]) {
    assert.equal(allowed(method, path), false, `${method} ${path}`);
  }
});
