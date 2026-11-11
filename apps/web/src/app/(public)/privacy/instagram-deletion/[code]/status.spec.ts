import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIRMATION_CODE_PATTERN, deletionView } from './status.ts';

test('확인 코드는 소문자·숫자 16자만 받는다', () => {
  assert.ok(CONFIRMATION_CODE_PATTERN.test('abcdef0123456789'));
  assert.ok(!CONFIRMATION_CODE_PATTERN.test('ABCDEF0123456789'));
  assert.ok(!CONFIRMATION_CODE_PATTERN.test('abc'));
  assert.ok(!CONFIRMATION_CODE_PATTERN.test('abcdef0123456789/../x'));
});

test('200과 처리 시각이면 처리됨', () => {
  assert.deepEqual(deletionView({ status: 200, processedAt: '2026-11-11T01:02:03.000Z' }), {
    kind: 'processed',
    processedAt: '2026-11-11T01:02:03.000Z',
  });
});

test('404는 찾을 수 없음', () => {
  assert.deepEqual(deletionView({ status: 404 }), { kind: 'not_found' });
});

test('그 밖의 실패와 이상한 본문은 확인 불가', () => {
  assert.deepEqual(deletionView({ status: 503 }), { kind: 'unavailable' });
  assert.deepEqual(deletionView({ status: 0 }), { kind: 'unavailable' });
  assert.deepEqual(deletionView({ status: 200 }), { kind: 'unavailable' });
  assert.deepEqual(deletionView({ status: 200, processedAt: 'x' }), { kind: 'unavailable' });
});
