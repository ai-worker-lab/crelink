import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readVisitorEventBody } from './visitor-event.ts';

describe('방문 이벤트 BFF 본문 경계', () => {
  const request = (body: string, headers: Record<string, string> = {}) =>
    new Request('http://web.test/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', ...headers },
      body,
    });

  it('JSON 바이트를 그대로 전달하고 16KiB 경계를 허용한다', async () => {
    assert.equal(await readVisitorEventBody(request('{"type":"page_view"}')), '{"type":"page_view"}');
    assert.equal((await readVisitorEventBody(request('x'.repeat(16 * 1024)))) as string, 'x'.repeat(16 * 1024));
  });

  it('text/plain beacon과 form 요청은 거절한다', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      const response = await readVisitorEventBody(request('{}', { 'content-type': type }));
      assert.ok(response instanceof Response);
      assert.equal(response.status, 415);
    }
  });

  it('Content-Length 없이도 실제 UTF-8 바이트 수가 한도를 넘으면 거절한다', async () => {
    const response = await readVisitorEventBody(request('가'.repeat(6000)));
    assert.ok(response instanceof Response);
    assert.equal(response.status, 413);
  });

  it('선언한 길이가 크면 본문을 읽기 전에 거절한다', async () => {
    const response = await readVisitorEventBody(request('{}', { 'content-length': '16385' }));
    assert.ok(response instanceof Response);
    assert.equal(response.status, 413);
  });
});
