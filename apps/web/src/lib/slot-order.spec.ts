// 외부 링크 패널의 광고 블록·배너 슬롯 행 정렬(설계 docs/specs/crelink-ad-banner.md `위치 모델`). 실행: pnpm --filter @crelink/web test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mixedOrder, SLOT_ROW_ID, slotPositionLabel, slotRowName, splitOrder, withParticle } from './slot-order.ts';

test('mixedOrder: null·링크 수 이상은 맨 뒤, k는 k개 링크 다음', () => {
  assert.deepEqual(mixedOrder(['a', 'b', 'c'], null), ['a', 'b', 'c', SLOT_ROW_ID]);
  assert.deepEqual(mixedOrder(['a', 'b', 'c'], 3), ['a', 'b', 'c', SLOT_ROW_ID]);
  assert.deepEqual(mixedOrder(['a', 'b', 'c'], 7), ['a', 'b', 'c', SLOT_ROW_ID]);
  assert.deepEqual(mixedOrder(['a', 'b', 'c'], 0), [SLOT_ROW_ID, 'a', 'b', 'c']);
  assert.deepEqual(mixedOrder(['a', 'b', 'c'], 2), ['a', 'b', SLOT_ROW_ID, 'c']);
  assert.deepEqual(mixedOrder([], null), [SLOT_ROW_ID]);
});

test('splitOrder: 슬롯 행 앞 링크 수를 늘 slotIndex로 돌려줌(링크만 옮겨도)', () => {
  assert.deepEqual(splitOrder([SLOT_ROW_ID, 'a', 'b']), { ids: ['a', 'b'], slotIndex: 0 });
  assert.deepEqual(splitOrder(['a', SLOT_ROW_ID, 'b']), { ids: ['a', 'b'], slotIndex: 1 });
  assert.deepEqual(splitOrder(['b', 'a', SLOT_ROW_ID]), { ids: ['b', 'a'], slotIndex: 2 });
  // 링크가 슬롯 행을 건너간 경우: 화면 순서 그대로 슬롯 앞 링크 수가 바뀜.
  const moved = mixedOrder(['a', 'b', 'c'], 1);
  assert.deepEqual(splitOrder([moved[2], moved[0], moved[1], moved[3]]), { ids: ['b', 'a', 'c'], slotIndex: 2 });
  assert.deepEqual(splitOrder(['a', 'b']), { ids: ['a', 'b'], slotIndex: 2 });
});

test('slotPositionLabel: 맨 앞·n번째 링크 다음·맨 뒤', () => {
  assert.equal(slotPositionLabel(null, 3), '링크 목록 맨 뒤');
  assert.equal(slotPositionLabel(3, 3), '링크 목록 맨 뒤');
  assert.equal(slotPositionLabel(0, 3), '링크 목록 맨 앞');
  assert.equal(slotPositionLabel(2, 3), '2번째 링크 다음');
  assert.equal(slotPositionLabel(0, 0), '링크 목록 맨 뒤');
});

test('slotRowName·withParticle: 종류별 안내 문장 이름과 조사', () => {
  assert.equal(withParticle(slotRowName('ad'), '을', '를'), '크리링 광고 블록을');
  assert.equal(withParticle(slotRowName('creator'), '이', '가'), '배너 슬롯이');
  assert.equal(withParticle('유튜브 링크', '을', '를'), '유튜브 링크를');
  assert.equal(withParticle('Shop', '을', '를'), 'Shop를');
});
