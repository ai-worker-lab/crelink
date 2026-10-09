// 화면 표기 도우미. 실행: pnpm --filter @crelink/web test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDuration } from './format.ts';

test('formatDuration: 분 단위로 버리고 1시간부터 시간·분, 1분 미만·음수는 `1분 미만`', () => {
  assert.equal(formatDuration(-5_000), '1분 미만');
  assert.equal(formatDuration(0), '1분 미만');
  assert.equal(formatDuration(59_999), '1분 미만');
  assert.equal(formatDuration(60_000), '1분');
  assert.equal(formatDuration(89 * 60_000 + 59_000), '1시간 29분');
  assert.equal(formatDuration(120 * 60_000), '2시간');
  assert.equal(formatDuration(1000 * 60 * 60_000), '1,000시간');
});
