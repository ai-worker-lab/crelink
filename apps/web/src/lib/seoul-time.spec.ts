// 운영자 게시 기간 `datetime-local` ↔ API 시각 변환(설계 docs/specs/crelink-ad-banner.md B9). 실행: pnpm --filter @crelink/web test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromSeoulInput, nowSeoulInput, toSeoulInput } from './seoul-time.ts';

test('toSeoulInput: 어떤 시간대의 시각이든 한국 시간 입력값, 초 이하 버림', () => {
  assert.equal(toSeoulInput('2026-10-09T05:30:00.000Z'), '2026-10-09T14:30');
  assert.equal(toSeoulInput('2026-10-09T14:30:59+09:00'), '2026-10-09T14:30');
  // UTC로는 전날이지만 한국 시간으로는 다음 날 0시.
  assert.equal(toSeoulInput('2026-12-31T15:00:00Z'), '2027-01-01T00:00');
  assert.equal(toSeoulInput('2026-10-09T00:00:00-07:00'), '2026-10-09T16:00');
});

test('fromSeoulInput: +09:00을 붙인 ISO, 형식이 아니거나 없는 날짜는 null', () => {
  assert.equal(fromSeoulInput('2026-10-09T14:30'), '2026-10-09T14:30:00+09:00');
  assert.equal(Date.parse(fromSeoulInput('2027-01-01T00:00') ?? ''), Date.parse('2026-12-31T15:00:00Z'));
  assert.equal(fromSeoulInput(''), null);
  assert.equal(fromSeoulInput('2026-10-09'), null);
  assert.equal(fromSeoulInput('2026-10-09T14:30:15'), null);
  assert.equal(fromSeoulInput('2026-02-30T10:00'), null);
});

test('왕복: 입력값 → ISO → 입력값이 같음', () => {
  for (const value of ['2026-01-01T00:00', '2026-06-15T23:59', '2028-02-29T12:00']) {
    assert.equal(toSeoulInput(fromSeoulInput(value) ?? ''), value);
  }
});

test('nowSeoulInput: 지금 시각의 한국 시간 분 단위', () => {
  assert.equal(nowSeoulInput(Date.parse('2026-10-09T05:30:42Z')), '2026-10-09T14:30');
});
