import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLandingUtm, withLandingUtm } from './telemetry.ts';

test('UTM 화이트리스트·길이·중복·제어문자만 처리한다', () => {
  const input = new URLSearchParams(
    'utm_source=instagram&utm_medium=social&utm_id=campaign1&email=private&pass=secret',
  );
  assert.deepEqual(readLandingUtm(input), { source: 'instagram', medium: 'social', id: 'campaign1' });
  input.append('utm_source', 'another');
  assert.equal(readLandingUtm(input).source, undefined);
  assert.deepEqual(
    readLandingUtm({ utm_source: ['bad', 'duplicate'], utm_campaign: 'x'.repeat(250), utm_term: 'a\0b\nc' }),
    { campaign: 'x'.repeat(200), term: 'abc' },
  );
});

test('기존 목적지·pass·hash를 유지하고 허용 UTM만 추가한다', () => {
  const result = new URL(
    withLandingUtm('https://web.example/p/abcdefghij?pass=signed#list', { source: 'a&b', id: 'sale' }),
  );
  assert.equal(result.origin, 'https://web.example');
  assert.equal(result.searchParams.get('pass'), 'signed');
  assert.equal(result.searchParams.get('utm_source'), 'a&b');
  assert.equal(result.hash, '#list');
});
