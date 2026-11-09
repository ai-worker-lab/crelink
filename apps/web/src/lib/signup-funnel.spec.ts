// 가입 경로 도우미. 실행: pnpm --filter @crelink/web test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canShowModalDialog,
  chromeIntentUrl,
  signupContextFromPage,
  signupContextFromRequest,
} from './signup-funnel.ts';

const INSTAGRAM = 'Mozilla/5.0 (iPhone) Mobile/15E148 Instagram 339.0.2.12.87 (iPhone14,5; iOS 17_5)';
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1';

test('페이지의 유입값은 UTM과 외부 호스트, 앱 종류만 담는다', () => {
  assert.deepEqual(
    signupContextFromPage(
      '?utm_source=IG&utm_campaign=spring&email=x',
      'https://l.instagram.com/?e=1',
      'links.shaul.kr',
      INSTAGRAM,
    ),
    { source: 'ig', medium: '', campaign: 'spring', referrerHost: 'l.instagram.com', inAppKind: 'instagram' },
  );
  assert.deepEqual(signupContextFromPage('', 'https://links.shaul.kr/p/a', 'links.shaul.kr', SAFARI), {
    source: '',
    medium: '',
    campaign: '',
    referrerHost: '',
    inAppKind: 'none',
  });
});

test('로그인 시작은 같은 출처 Referer의 UTM만 읽고 외부 Referer는 호스트만 남긴다', () => {
  assert.deepEqual(
    signupContextFromRequest('https://links.shaul.kr/?utm_source=fb&utm_medium=social', 'links.shaul.kr', SAFARI),
    { source: 'fb', medium: 'social', campaign: '', referrerHost: '', inAppKind: 'none' },
  );
  assert.deepEqual(signupContextFromRequest('https://evil.test/?utm_source=forged', 'links.shaul.kr', INSTAGRAM), {
    source: '',
    medium: '',
    campaign: '',
    referrerHost: 'evil.test',
    inAppKind: 'instagram',
  });
  assert.deepEqual(signupContextFromRequest(null, 'links.shaul.kr', null), {
    source: '',
    medium: '',
    campaign: '',
    referrerHost: '',
    inAppKind: 'unknown',
  });
  assert.equal(signupContextFromRequest('not a url', 'links.shaul.kr', SAFARI).inAppKind, 'none');
});

test('dialog.showModal이 없으면 안내 시트를 쓸 수 없다고 판단한다', () => {
  assert.equal(canShowModalDialog({}), false);
  assert.equal(canShowModalDialog({ HTMLDialogElement: { prototype: {} } }), false);
  assert.equal(canShowModalDialog({ HTMLDialogElement: { prototype: { showModal: () => {} } } }), true);
});

test('intent 주소는 returnTo를 그대로 싣고 Chrome을 지정한다', () => {
  assert.equal(
    chromeIntentUrl('https://links.shaul.kr/auth/google?returnTo=%2Fp%2Fabc%23guestbook'),
    'intent://links.shaul.kr/auth/google?returnTo=%2Fp%2Fabc%23guestbook#Intent;scheme=https;package=com.android.chrome;end',
  );
  assert.equal(
    chromeIntentUrl('http://127.0.0.1:5293/auth/google'),
    'intent://127.0.0.1:5293/auth/google#Intent;scheme=http;package=com.android.chrome;end',
  );
});
