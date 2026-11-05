import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { registerVisitorPageView, touchVisitorSession, VisitorPageView, visitorMetadata } from './visitor-telemetry.ts';
import type { LandingEventRequest } from '@crelink/shared';

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const IDLE = 30 * 60 * 1000;

describe('최초 페이지뷰 등록', () => {
  const event: LandingEventRequest = {
    token: 'signed',
    eventId: FIRST,
    sessionId: FIRST,
    pageViewId: FIRST,
    type: 'page_view',
  };

  it('네트워크·5xx만 같은 eventId로 한 번 더 전송한다', async () => {
    for (const failure of [0, 500, 503]) {
      const sent: LandingEventRequest[] = [];
      assert.equal(
        await registerVisitorPageView(event, async (payload) => {
          sent.push(payload);
          return sent.length === 1 ? failure : 204;
        }),
        true,
      );
      assert.equal(sent.length, 2);
      assert.equal(sent[0], sent[1]);
      assert.equal(sent[0].eventId, FIRST);
    }
  });

  it('성공·400·403·429는 반복하지 않고 5xx가 계속되어도 두 번에서 멈춘다', async () => {
    for (const status of [204, 400, 403, 429, 503]) {
      let calls = 0;
      assert.equal(
        await registerVisitorPageView(event, async () => {
          calls += 1;
          return status;
        }),
        status === 204,
      );
      assert.equal(calls, status === 503 ? 2 : 1);
    }
  });
});

describe('방문 세션: 페이지별 30분 유휴', () => {
  it('방문자 쿠키가 바뀌면 남아 있는 sessionStorage와 다른 익명 바인딩의 세션을 만든다', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const before = touchVisitorSession(storage, 'page:a:visitor:first', null, 1, () => FIRST);
    const afterCookieReset = touchVisitorSession(storage, 'page:a:visitor:second', null, 2, () => SECOND);
    assert.notEqual(before.id, afterCookieReset.id);
    assert.equal(touchVisitorSession(storage, 'page:a:visitor:first', null, 3, () => SECOND).id, FIRST);
    assert.equal(touchVisitorSession(storage, 'page:a:visitor:second', null, 3, () => FIRST).id, SECOND);
  });

  it('저장된 세션을 재사용하고 정확히 30분이면 새 세션을 만든다', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const initial = touchVisitorSession(storage, 'page:a', null, 0, () => FIRST);
    const reopened = touchVisitorSession(storage, 'page:a', null, IDLE - 1, () => SECOND);
    assert.equal(reopened.id, initial.id);
    assert.equal(touchVisitorSession(storage, 'page:a', reopened, reopened.lastActive + IDLE, () => SECOND).id, SECOND);
    assert.equal(touchVisitorSession(storage, 'page:b', null, 1, () => SECOND).id, SECOND);
  });

  it('저장소 거부는 메모리 세션으로 이어가고 손상·미래 시각·잘못된 ID는 새로 만든다', () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const initial = touchVisitorSession(blocked, 'page:a', null, 1, () => FIRST);
    assert.equal(touchVisitorSession(blocked, 'page:a', initial, 2, () => SECOND).id, FIRST);
    for (const value of [
      '{broken',
      'null',
      '42',
      JSON.stringify({ id: 'bad', lastActive: 0 }),
      JSON.stringify({ id: FIRST, lastActive: 100 }),
    ]) {
      const storage = { getItem: () => value, setItem: () => {} };
      assert.equal(touchVisitorSession(storage, 'page:a', null, 1, () => SECOND).id, SECOND);
    }
  });
});

describe('페이지뷰 수명주기', () => {
  it('StrictMode 효과 재설치에도 page_view 한 번이며 숨긴 시간은 누적하지 않는다', () => {
    const view = new VisitorPageView(FIRST, FIRST);
    assert.equal(view.claimPageView(), true);
    view.setVisible(true, 0);
    view.setVisible(false, 100);
    view.setVisible(false, 100);
    assert.equal(view.claimPageView(), false);
    view.setVisible(true, 100);
    assert.equal(view.snapshot(400, 25).activeMs, 400);
    view.setVisible(false, 500);
    assert.equal(view.snapshot(5000, 50).activeMs, 500);
    view.setVisible(true, 5000);
    assert.deepEqual(view.snapshot(5300, 10), { activeMs: 800, scrollPercent: 50 });
    assert.deepEqual(view.snapshot(5300, Number.NaN), { activeMs: 800, scrollPercent: 50 });
  });

  it('BFCache 복원은 새 페이지뷰이며 대상 노출은 각 페이지뷰 안에서 한 번이다', () => {
    const before = new VisitorPageView(FIRST, FIRST);
    const restored = new VisitorPageView(SECOND, FIRST);
    assert.notEqual(before.id, restored.id);
    assert.equal(before.sessionId, restored.sessionId);
    assert.equal(before.firstImpression('link', 'item'), true);
    assert.equal(before.firstImpression('link', 'item'), false);
    assert.equal(before.firstImpression('portfolio', 'item'), true);
    assert.equal(restored.claimPageView(), true);
    assert.equal(restored.firstImpression('link', 'item'), true);
    assert.deepEqual(restored.snapshot(10000, 101), { activeMs: 0, scrollPercent: 100 });
  });

  it('누적 스냅샷을 반복해서 읽어도 체류가 중복 합산되지 않고 계약 상한을 지킨다', () => {
    const view = new VisitorPageView(FIRST, FIRST);
    view.setVisible(true, 0);
    assert.equal(view.snapshot(1000, -1).activeMs, 1000);
    assert.equal(view.snapshot(1000, 0).activeMs, 1000);
    assert.deepEqual(view.snapshot(25 * 60 * 60 * 1000, 200), { activeMs: 86400000, scrollPercent: 100 });
  });
});

describe('입력 환경 메타데이터', () => {
  it('허용한 키와 유한한 범위만 보내며 주소·내용·입력값을 복사하지 않는다', () => {
    const input = {
      language: ' ko-KR\u0000 ',
      timeZone: 'Asia/Seoul',
      viewportWidth: 390.2,
      viewportHeight: Number.NaN,
      screenWidth: 100000,
      screenHeight: 0,
      pixelRatio: Infinity,
      href: 'https://example.test/?password=secret',
      text: 'private',
      value: 'private',
    };
    assert.deepEqual(visitorMetadata(input), {
      language: 'ko-KR',
      timeZone: 'Asia/Seoul',
      viewportWidth: 390,
      screenWidth: 32768,
    });
    assert.equal(visitorMetadata({ pixelRatio: 50 }).pixelRatio, 16);
    assert.equal(visitorMetadata({ language: 'a'.repeat(100) }).language?.length, 64);
  });
});
