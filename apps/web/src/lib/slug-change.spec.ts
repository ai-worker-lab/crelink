// 주소 변경 입력 판정(design/manager-address-bar/handoff.md). 실행: pnpm --filter @crelink/web test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  localSlugReason,
  normalizeSlugInput,
  slugCheckMessage,
  slugSaveFailure,
  slugUrlPrefix,
} from './slug-change.ts';

test('normalizeSlugInput: 앞뒤 공백을 지우고 소문자로', () => {
  assert.equal(normalizeSlugInput('  My-Name '), 'my-name');
});

test('localSlugReason: 형식·예약어·지금 주소를 서버에 묻기 전에 거름', () => {
  assert.equal(localSlugReason('ab', 'saved-one'), 'slug_invalid');
  assert.equal(localSlugReason('-abc', 'saved-one'), 'slug_invalid');
  assert.equal(localSlugReason('a'.repeat(31), 'saved-one'), 'slug_invalid');
  assert.equal(localSlugReason('admin', 'saved-one'), 'slug_reserved');
  assert.equal(localSlugReason('saved-one', 'saved-one'), 'same_as_current');
  assert.equal(localSlugReason('new-name', 'saved-one'), null);
});

test('slugCheckMessage: idle은 형식 안내, 불가는 이유별 문구', () => {
  assert.equal(slugCheckMessage({ kind: 'idle' }), '영소문자·숫자·하이픈(-) 3~30자');
  assert.equal(
    slugCheckMessage({ kind: 'unavailable', reason: 'slug_reserved' }),
    '크리링이 쓰는 예약 주소라 쓸 수 없어요.',
  );
  assert.equal(slugCheckMessage({ kind: 'error', message: '연결 오류' }), '연결 오류');
});

test('slugUrlPrefix: slug와 프로토콜을 뺀 앞부분', () => {
  assert.equal(slugUrlPrefix('https://go.shaul.kr/zbx9a07', 'zbx9a07'), 'go.shaul.kr/');
  assert.equal(slugUrlPrefix('http://127.0.0.1:3220/ab1', 'ab1'), '127.0.0.1:3220/');
});

test('slugSaveFailure: 주소를 못 쓰는 오류·잠김·재시도 가능을 나눔', () => {
  assert.deepEqual(slugSaveFailure('slug_taken'), { kind: 'unusable', reason: 'slug_taken' });
  assert.deepEqual(slugSaveFailure('slug_reserved'), { kind: 'unusable', reason: 'slug_reserved' });
  assert.deepEqual(slugSaveFailure('slug_invalid'), { kind: 'unusable', reason: 'slug_invalid' });
  assert.deepEqual(slugSaveFailure('slug_change_too_soon'), { kind: 'locked' });
  assert.deepEqual(slugSaveFailure('internal_error'), { kind: 'retry' });
  assert.deepEqual(slugSaveFailure(null), { kind: 'retry' });
});
