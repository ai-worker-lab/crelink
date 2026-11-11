import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { backendRules } from '../../../lib/api/backend-rules.ts';
import { clearOptOutFragment, readOptOutToken, viewForError } from './opt-out.ts';

test('프래그먼트 #t만 토큰으로 읽고 없거나 비었거나 길면 null', () => {
  assert.equal(readOptOutToken('#t=abc-_DEF123'), 'abc-_DEF123');
  assert.equal(readOptOutToken('t=abc'), 'abc');
  assert.equal(readOptOutToken(''), null);
  assert.equal(readOptOutToken('#'), null);
  assert.equal(readOptOutToken('#t='), null);
  assert.equal(readOptOutToken('#x=abc'), null);
  assert.equal(readOptOutToken(`#t=${'a'.repeat(513)}`), null);
});

test('처리 뒤 프래그먼트를 지우되 경로와 쿼리는 둔다', () => {
  const calls: string[] = [];
  const history = { replaceState: (_d: unknown, _u: string, url: string) => void calls.push(url) };
  clearOptOutFragment({ pathname: '/dm-opt-out', search: '?a=1', hash: '#t=abc' }, history);
  clearOptOutFragment({ pathname: '/dm-opt-out', search: '', hash: '' }, history);
  assert.deepEqual(calls, ['/dm-opt-out?a=1']);
});

test('opt_out_invalid만 유효하지 않음, 나머지는 재시도 오류', () => {
  assert.equal(viewForError('opt_out_invalid'), 'invalid');
  assert.equal(viewForError('network_error'), 'error');
  assert.equal(viewForError('telemetry_rate_limited'), 'error');
  assert.equal(viewForError(null), 'error');
});

test('BFF가 공개 수신 거부 POST를 허용하고 검색 봇은 /dm-opt-out을 보지 않는다', async () => {
  const path = 'api/public/instagram-dm-opt-outs';
  assert.ok(backendRules.some((rule) => rule.methods.includes('POST') && rule.pattern.test(path)));
  const site = await readFile(new URL('../../../lib/site.ts', import.meta.url), 'utf8');
  assert.match(site, /ROBOTS_DISALLOW = \[[^\]]*'\/dm-opt-out'/);
});
