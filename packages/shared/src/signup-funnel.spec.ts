import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectInAppBrowser,
  detectMobilePlatform,
  EMPTY_SIGNUP_FUNNEL_CONTEXT,
  inAppKindOfUserAgent,
  parseSignupContextHeader,
  referrerHostOf,
  signupContextOf,
  signupFunnelValue,
  signupUtmOf,
} from './signup-funnel.ts';

const IN_APP_USER_AGENTS = [
  [
    'instagram',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.2.12.87 (iPhone14,5; iOS 17_5; ko_KR; ko; scale=3.00; 1170x2532; 614259851)',
  ],
  [
    'instagram',
    'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 Instagram 339.0.0.43.96 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 620000000)',
  ],
  [
    'facebook',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/ko_KR;FBOP/5]',
  ],
  [
    'facebook',
    'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/483.0.0.61.77;]',
  ],
  [
    'kakaotalk',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
  ],
  [
    'kakaotalk',
    'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410850',
  ],
  [
    'naver',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.8.1; 14)',
  ],
  [
    'naver',
    'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.1)',
  ],
  [
    'line',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.16.0',
  ],
  [
    'line',
    'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 Line/14.16.2/IAB',
  ],
] as const;

const REGULAR_USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Whale/3.28.266.14 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
];

for (const [kind, userAgent] of IN_APP_USER_AGENTS) {
  test(`앱 내 브라우저 판별: ${kind} ${userAgent.includes('Android') ? 'Android' : 'iOS'}`, () => {
    assert.equal(detectInAppBrowser(userAgent), kind);
    assert.equal(inAppKindOfUserAgent(userAgent), kind);
  });
}

for (const userAgent of REGULAR_USER_AGENTS) {
  test(`일반 브라우저는 앱 내 브라우저가 아니다: ${userAgent.slice(13, 50)}`, () => {
    assert.equal(detectInAppBrowser(userAgent), null);
    assert.equal(inAppKindOfUserAgent(userAgent), 'none');
  });
}

test('User-Agent가 없으면 판별하지 않고 unknown으로 둔다', () => {
  assert.equal(detectInAppBrowser(null), null);
  assert.equal(detectInAppBrowser(''), null);
  assert.equal(inAppKindOfUserAgent(undefined), 'unknown');
});

test('기기 종류로 외부 브라우저 안내를 고른다', () => {
  assert.equal(detectMobilePlatform(IN_APP_USER_AGENTS[0][1]), 'ios');
  assert.equal(detectMobilePlatform(IN_APP_USER_AGENTS[1][1]), 'android');
  assert.equal(detectMobilePlatform(REGULAR_USER_AGENTS[5]), 'other');
  assert.equal(detectMobilePlatform(null), 'other');
});

test('유입값은 허용 문자만 남기고 이메일 모양·긴 값은 other로 모은다', () => {
  assert.equal(signupFunnelValue(' Instagram '), 'instagram');
  assert.equal(signupFunnelValue('spring_sale-2026.v1'), 'spring_sale-2026.v1');
  assert.equal(signupFunnelValue('someone@example.com'), 'other');
  assert.equal(signupFunnelValue('봄맞이'), 'other');
  assert.equal(signupFunnelValue('x'.repeat(65)), 'other');
  assert.equal(signupFunnelValue(''), '');
  assert.equal(signupFunnelValue(undefined), '');
  assert.equal(signupFunnelValue(['a']), '');
});

test('쿼리에서 UTM 세 값만 읽고 다른 값은 버린다', () => {
  assert.deepEqual(signupUtmOf('?utm_source=IG&utm_medium=social&utm_campaign=c1&email=private&utm_term=t'), {
    source: 'ig',
    medium: 'social',
    campaign: 'c1',
  });
  assert.deepEqual(signupUtmOf(''), { source: '', medium: '', campaign: '' });
});

test('유입 호스트는 외부일 때 호스트만 남긴다', () => {
  assert.equal(
    referrerHostOf('https://l.instagram.com/?u=https%3A%2F%2Fa.test&e=secret', 'links.shaul.kr'),
    'l.instagram.com',
  );
  assert.equal(referrerHostOf('https://links.shaul.kr/p/abc', 'links.shaul.kr'), '');
  assert.equal(referrerHostOf('', 'links.shaul.kr'), '');
  assert.equal(referrerHostOf('not a url', 'links.shaul.kr'), '');
});

test('헤더는 깨졌거나 없으면 빈 값이고 알 수 없는 종류는 unknown이다', () => {
  assert.deepEqual(parseSignupContextHeader(undefined), EMPTY_SIGNUP_FUNNEL_CONTEXT);
  assert.deepEqual(parseSignupContextHeader('{not json'), EMPTY_SIGNUP_FUNNEL_CONTEXT);
  assert.deepEqual(
    parseSignupContextHeader(JSON.stringify({ source: 'a@b.c', inAppKind: 'telegram', ip: '1.2.3.4' })),
    {
      ...EMPTY_SIGNUP_FUNNEL_CONTEXT,
      source: 'other',
    },
  );
  assert.equal(signupContextOf({ inAppKind: 'line' }).inAppKind, 'line');
});
