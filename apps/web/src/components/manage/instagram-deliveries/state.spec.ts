import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InstagramDmDeliveryStatus, InstagramDmDeliveryView } from '@crelink/shared';
import { appendDeliveries, deliveryQuery, deliveryStatusLabel } from './state.ts';

test('발송 상태 7개를 계약의 화면 문구로 표시한다', () => {
  const expected: Record<InstagramDmDeliveryStatus, string> = {
    pending: '대기',
    sending: '대기',
    sent: '보냄',
    failed: '실패',
    unknown: '확인 필요',
    expired: '시간 초과',
    cancelled: '취소',
  };
  for (const status of Object.keys(expected) as InstagramDmDeliveryStatus[]) {
    assert.equal(deliveryStatusLabel(status), expected[status]);
  }
});

test('더 보기에서 규칙 필터와 불투명 커서를 보존하고 필터 변경 시 커서를 지운다', () => {
  assert.equal(deliveryQuery('', null), '');
  assert.equal(deliveryQuery('rule-2', null), '?rule=rule-2');
  assert.equal(deliveryQuery('', 'next'), '?cursor=next');
  const query = new URLSearchParams(deliveryQuery('규칙&1', 'opaque+/='));
  assert.equal(query.get('rule'), '규칙&1');
  assert.equal(query.get('cursor'), 'opaque+/=');
});

test('더 보기의 중복 행을 갱신하고 기존 순서와 원본 목록을 보존한다', () => {
  const delivery = (id: string, status: InstagramDmDeliveryStatus = 'pending'): InstagramDmDeliveryView => ({
    id,
    ruleId: 'rule-1',
    keyword: '링크',
    mediaPreview: '게시물',
    status,
    createdAt: '2026-11-11T00:00:00Z',
    sentAt: null,
  });
  const current = [delivery('newest'), delivery('overlap')];
  const incoming = [delivery('overlap', 'sent'), delivery('oldest')];
  const result = appendDeliveries(current, incoming);
  assert.deepEqual(
    result.map((item) => [item.id, item.status]),
    [
      ['newest', 'pending'],
      ['overlap', 'sent'],
      ['oldest', 'pending'],
    ],
  );
  assert.equal(current[1].status, 'pending');
  assert.equal(incoming.length, 2);
});
