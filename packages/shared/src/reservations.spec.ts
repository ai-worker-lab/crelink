import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatReservationContact, normalizeReservationContact } from './crelink.ts';

test('이메일은 소문자로 맞추고 첫 글자가 영숫자이며 254자 이하일 때만 받는다', () => {
  assert.equal(normalizeReservationContact('email', '  Fan.One+tag@Example.COM '), 'fan.one+tag@example.com');
  for (const value of ['=1+1@x.com', '@x.com', 'a@b', 'a b@x.com', `${'a'.repeat(250)}@x.com`, '한글@x.com'])
    assert.equal(normalizeReservationContact('email', value), null, value);
  assert.equal(normalizeReservationContact('email', 'a\u0000b@x.com'), null);
});

test('휴대폰은 숫자만 남기고 +82를 0으로 바꾸며 01[016-9]만 받는다', () => {
  assert.equal(normalizeReservationContact('phone', '010-1234-5678'), '01012345678');
  assert.equal(normalizeReservationContact('phone', '+82 10 1234 5678'), '01012345678');
  assert.equal(normalizeReservationContact('phone', '+82-010-1234-5678'), '01012345678');
  assert.equal(normalizeReservationContact('phone', '011 234 5678'), '0112345678');
  for (const value of ['02-1234-5678', '015-1234-5678', '010-123', '+1 212 555 0100', '010-1234-5678-9', 'abc'])
    assert.equal(normalizeReservationContact('phone', value), null, value);
});

test('휴대폰 표시 형식은 자릿수에 맞춰 나눈다', () => {
  assert.equal(formatReservationContact('phone', '01012345678'), '010-1234-5678');
  assert.equal(formatReservationContact('phone', '0112345678'), '011-234-5678');
  assert.equal(formatReservationContact('email', 'a@x.com'), 'a@x.com');
});
