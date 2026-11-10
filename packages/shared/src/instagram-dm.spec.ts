import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INSTAGRAM_DM_LIMITS } from './instagram-dm.ts';

test('Instagram 댓글 자동 DM 한도는 설계와 같다', () => {
  assert.deepEqual(INSTAGRAM_DM_LIMITS, {
    activeRules: 10,
    totalRules: 100,
    mediaPageSize: 25,
    deliveryPageSize: 20,
    keywordMaxLength: 30,
    messageMaxLength: 250,
  });
});
