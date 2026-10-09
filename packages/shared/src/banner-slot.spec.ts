// 광고 블록·배너 슬롯 배치·숨김 규칙(R20 ①⑥, R21 ①③). 근거: docs/specs/crelink-ad-banner.md `resolveBannerSlot`.
// 실행: pnpm --filter @crelink/shared test
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveBannerSlot, type ResolveBannerSlotInput } from './crelink.ts';

const AD = ['ad-1', 'ad-2'];
const MINE = ['mine-1'];

function input(patch: Partial<ResolveBannerSlotInput<string>> = {}): ResolveBannerSlotInput<string> {
  return {
    granted: false,
    slotIndex: null,
    linkVisible: [true, true, true],
    hasPortfolio: false,
    adBanners: AD,
    creatorBanners: MINE,
    ...patch,
  };
}

describe('종류와 배너 목록', () => {
  test('부여되지 않았으면 광고, 크리링 배너를 순서대로 쓴다', () => {
    const slot = resolveBannerSlot(input());
    assert.equal(slot.kind, 'ad');
    assert.deepEqual(slot.banners, AD);
    assert.equal(slot.hidden, null);
  });

  test('부여됐으면 크리에이터 배너를 쓰고 크리링 배너는 쓰지 않는다', () => {
    const slot = resolveBannerSlot(input({ granted: true }));
    assert.equal(slot.kind, 'creator');
    assert.deepEqual(slot.banners, MINE);
    assert.equal(slot.hidden, null);
  });

  test('돌려준 배너 목록은 입력 배열과 다른 사본이다', () => {
    const slot = resolveBannerSlot(input());
    assert.notEqual(slot.banners, AD);
  });
});

describe('위치(afterLinkCount)', () => {
  const cases: Array<[string, number | null, number]> = [
    ['맨 뒤(null)', null, 3],
    ['맨 앞(0)', 0, 0],
    ['사이(2)', 2, 2],
    ['링크 수와 같으면 맨 뒤', 3, 3],
    ['링크 수보다 크면 맨 뒤', 10, 3],
  ];
  for (const granted of [false, true]) {
    for (const [name, slotIndex, expected] of cases) {
      test(`${granted ? '배너 슬롯' : '광고'} ${name}`, () => {
        assert.equal(resolveBannerSlot(input({ granted, slotIndex })).afterLinkCount, expected);
      });
    }
  }

  test('슬롯 앞의 숨긴 링크는 세지 않아 남은 링크 사이의 같은 상대 자리에 온다', () => {
    const linkVisible = [true, false, true, true];
    assert.equal(resolveBannerSlot(input({ linkVisible, slotIndex: 2 })).afterLinkCount, 1);
    assert.equal(resolveBannerSlot(input({ linkVisible, slotIndex: 1 })).afterLinkCount, 1);
    assert.equal(resolveBannerSlot(input({ linkVisible, slotIndex: 0 })).afterLinkCount, 0);
    assert.equal(resolveBannerSlot(input({ linkVisible, slotIndex: null })).afterLinkCount, 3);
  });

  test('슬롯 뒤의 숨긴 링크는 위치에 영향이 없다', () => {
    assert.equal(resolveBannerSlot(input({ linkVisible: [true, true, false], slotIndex: 2 })).afterLinkCount, 2);
  });

  test('숨김일 때도 위치를 계산한다(미리보기 점선 자리)', () => {
    const slot = resolveBannerSlot(input({ adBanners: [], slotIndex: 1 }));
    assert.equal(slot.hidden, 'no_banners');
    assert.equal(slot.afterLinkCount, 1);
  });
});

describe('숨김(hidden)', () => {
  // [종류, 보이는 링크, 포트폴리오, 배너, 기대]
  const table: Array<[boolean, boolean, boolean, boolean, 'no_banners' | 'no_content' | null]> = [
    [false, true, false, true, null],
    [false, true, true, true, null],
    [false, false, true, true, null],
    [false, false, false, true, 'no_content'],
    [false, true, false, false, 'no_banners'],
    [false, false, true, false, 'no_banners'],
    [false, false, false, false, 'no_content'],
    [true, true, false, true, null],
    [true, false, true, true, null],
    [true, false, false, true, null],
    [true, true, false, false, 'no_banners'],
    [true, false, false, false, 'no_banners'],
  ];
  for (const [granted, visibleLink, hasPortfolio, hasBanners, expected] of table) {
    for (const slotIndex of [null, 0, 1]) {
      test(`${granted ? '배너 슬롯' : '광고'}·링크 ${visibleLink ? '있음' : '없음'}·포트폴리오 ${hasPortfolio ? '있음' : '없음'}·배너 ${hasBanners ? '있음' : '없음'}·위치 ${slotIndex} → ${expected}`, () => {
        const slot = resolveBannerSlot(
          input({
            granted,
            slotIndex,
            linkVisible: [false, visibleLink],
            hasPortfolio,
            adBanners: hasBanners ? AD : [],
            creatorBanners: hasBanners ? MINE : [],
          }),
        );
        assert.equal(slot.hidden, expected);
      });
    }
  }

  test('링크가 하나도 없는 광고: 포트폴리오가 있으면 보이고(맨 앞) 없으면 no_content', () => {
    assert.deepEqual(resolveBannerSlot(input({ linkVisible: [], hasPortfolio: true })), {
      kind: 'ad',
      afterLinkCount: 0,
      banners: AD,
      hidden: null,
    });
    assert.equal(resolveBannerSlot(input({ linkVisible: [] })).hidden, 'no_content');
  });

  test('숨기거나 차단된 링크만 있으면 보이는 링크 0개로 본다', () => {
    assert.equal(resolveBannerSlot(input({ linkVisible: [false, false] })).hidden, 'no_content');
  });

  test('부여된 슬롯은 링크·포트폴리오가 없어도 보인다(빈 랜딩에서도 배너 슬롯)', () => {
    assert.equal(resolveBannerSlot(input({ granted: true, linkVisible: [] })).hidden, null);
  });
});
