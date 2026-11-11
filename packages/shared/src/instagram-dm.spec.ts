import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CRELINK_API_PATHS } from './crelink.ts';
import { INSTAGRAM_DM_LIMITS } from './instagram-dm.ts';

test('Instagram 댓글 자동 DM 한도는 설계와 같다', () => {
  assert.deepEqual(INSTAGRAM_DM_LIMITS, {
    activeRules: 10,
    totalRules: 100,
    mediaPageSize: 25,
    deliveryPageSize: 20,
    keywordMaxLength: 30,
    messageMaxLength: 250,
    replyMessageMaxLength: 300,
  });
});

test('Instagram API 계약 경로는 실제 라우트 선언과 일치한다', () => {
  assert.deepEqual(
    {
      meInstagram: CRELINK_API_PATHS.meInstagram,
      meInstagramConnect: CRELINK_API_PATHS.meInstagramConnect,
      meInstagramCallback: CRELINK_API_PATHS.meInstagramCallback,
      meInstagramRecheck: CRELINK_API_PATHS.meInstagramRecheck,
      meInstagramPause: CRELINK_API_PATHS.meInstagramPause,
      meInstagramMedia: CRELINK_API_PATHS.meInstagramMedia,
      meInstagramRules: CRELINK_API_PATHS.meInstagramRules,
      meInstagramRule: CRELINK_API_PATHS.meInstagramRule('public-id'),
      meInstagramDeliveries: CRELINK_API_PATHS.meInstagramDeliveries,
      adminInstagramDm: CRELINK_API_PATHS.adminInstagramDm,
      adminInstagramDmConnectionPause: CRELINK_API_PATHS.adminInstagramDmConnectionPause('user-id'),
      instagramWebhook: CRELINK_API_PATHS.instagramWebhook,
      instagramDataDeletionWebhook: CRELINK_API_PATHS.instagramDataDeletionWebhook,
      publicInstagramDeletion: CRELINK_API_PATHS.publicInstagramDeletion('code'),
      publicInstagramDmOptOuts: CRELINK_API_PATHS.publicInstagramDmOptOuts,
    },
    {
      meInstagram: '/api/me/instagram',
      meInstagramConnect: '/api/me/instagram/connect',
      meInstagramCallback: '/api/me/instagram/callback',
      meInstagramRecheck: '/api/me/instagram/recheck',
      meInstagramPause: '/api/me/instagram/pause',
      meInstagramMedia: '/api/me/instagram/media',
      meInstagramRules: '/api/me/instagram/rules',
      meInstagramRule: '/api/me/instagram/rules/public-id',
      meInstagramDeliveries: '/api/me/instagram/deliveries',
      adminInstagramDm: '/api/admin/instagram-dm',
      adminInstagramDmConnectionPause: '/api/admin/instagram-dm/connections/user-id/pause',
      instagramWebhook: '/api/webhooks/instagram',
      instagramDataDeletionWebhook: '/api/webhooks/instagram/data-deletion',
      publicInstagramDeletion: '/api/public/instagram-deletions/code',
      publicInstagramDmOptOuts: '/api/public/instagram-dm-opt-outs',
    },
  );
});

test('Instagram 규칙 텍스트 경계는 유니코드 코드 포인트 기준이다', () => {
  const within = (value: string, max: number) => value.trim().length > 0 && Array.from(value).length <= max;

  assert.equal(within('가', INSTAGRAM_DM_LIMITS.keywordMaxLength), true);
  assert.equal(within('가'.repeat(30), INSTAGRAM_DM_LIMITS.keywordMaxLength), true);
  assert.equal(within('가'.repeat(31), INSTAGRAM_DM_LIMITS.keywordMaxLength), false);
  assert.equal(within('😀', INSTAGRAM_DM_LIMITS.messageMaxLength), true);
  assert.equal(within('😀'.repeat(250), INSTAGRAM_DM_LIMITS.messageMaxLength), true);
  assert.equal(within('😀'.repeat(251), INSTAGRAM_DM_LIMITS.messageMaxLength), false);
});
