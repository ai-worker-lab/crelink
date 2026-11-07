import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { forwardVisitorEvent, readVisitorEventBody } from './visitor-event.ts';

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

describe('등록 대기 중 이탈 이벤트의 BFF 순차 전달', () => {
  const pageView = {
    type: 'page_view',
    token: 'signed',
    sessionId: '11111111-1111-4111-8111-111111111111',
    pageViewId: '22222222-2222-4222-8222-222222222222',
    eventId: '33333333-3333-4333-8333-333333333333',
    language: 'ko-KR',
    utm: { utm_source: 'instagram' },
  };
  const event = {
    ...pageView,
    type: 'click',
    eventId: '44444444-4444-4444-8444-444444444444',
    targetKind: 'link',
    targetId: 'abcdefghij',
  };

  it('등록 응답 전에는 후속 이벤트를 보내지 않고 실제204 뒤 최종 실패도 그대로 반환한다', async () => {
    let release!: (response: Response) => void;
    const registration = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const sent: string[] = [];
    const delivery = forwardVisitorEvent(JSON.stringify({ pageView, event }), async (body) => {
      sent.push(JSON.parse(body).type);
      return sent.length === 1 ? registration : new Response('target denied', { status: 403 });
    });
    assert.deepEqual(sent, ['page_view']);
    release(new Response(null, { status: 204 }));
    const response = await delivery;
    assert.deepEqual(sent, ['page_view', 'click']);
    assert.equal(response.status, 403);
    assert.equal(await response.text(), 'target denied');
  });

  it('첫 요청의400/403/413/429/5xx/비204 성공을 보존하고 후속 호출이나 재시도하지 않는다', async () => {
    for (const status of [200, 400, 403, 413, 429, 502, 503]) {
      const sent: string[] = [];
      const result = await forwardVisitorEvent(JSON.stringify({ pageView, event }), async (body) => {
        sent.push(JSON.parse(body).type);
        return new Response('registration failed', { status, headers: { 'Retry-After': '60' } });
      });
      assert.equal(result.status, status);
      assert.equal(await result.text(), 'registration failed');
      assert.equal(result.headers.get('Retry-After'), '60');
      assert.deepEqual(sent, ['page_view']);
    }
  });

  it('다른 바인딩·동일eventId·허용하지 않은 envelope는 upstream 부작용 전에 거절한다', async () => {
    for (const envelope of [
      { pageView, event: { ...event, token: 'other' } },
      { pageView, event: { ...event, sessionId: 'other' } },
      { pageView, event: { ...event, pageViewId: 'other' } },
      { pageView, event: { ...event, eventId: pageView.eventId } },
      { pageView: { ...pageView, type: 'click' }, event },
      { pageView, event: { ...event, type: 'page_view' } },
      { pageView, event: { ...event, type: 'impression' } },
      { pageView, event, extra: true },
      { pageView: null, event },
      { pageView, event: [] },
    ]) {
      let called = false;
      const response = await forwardVisitorEvent(JSON.stringify(envelope), async () => {
        called = true;
        return new Response(null, { status: 204 });
      });
      assert.equal(response.status, 400);
      assert.equal(called, false);
    }
  });
});
