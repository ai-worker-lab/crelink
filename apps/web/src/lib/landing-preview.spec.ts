// 관리 화면 실시간 미리보기의 초안 덮어쓰기(PRD R18). 실행: pnpm --filter @crelink/web test
import type {
  CreatorBannerView,
  CreatorLandingState,
  LinkView,
  PortfolioItemView,
  PublicBannerView,
  PublicLandingView,
} from '@crelink/shared';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRAFT_ITEM_ID,
  isLinkDraftDirty,
  isProfileDirty,
  isSocialsDirty,
  linkDraftOf,
  portfolioDraftOf,
  previewBannerSlot,
  profileDraftOf,
  socialRowsOf,
  toLandingPreview,
} from './landing-preview.ts';

const adBanner = (id: string, still: string | null = null): PublicBannerView => ({
  id,
  imageUrl: `/img/${id}`,
  stillImageUrl: still,
  alt: `광고 ${id}`,
  clickUrl: `https://${id}.ad.example.com/`,
});

function creatorBanner(id: string, patch: Partial<CreatorBannerView> = {}): CreatorBannerView {
  return {
    id,
    image: { fileId: `f-${id}`, url: `/img/${id}` },
    stillImage: null,
    alt: `배너 ${id}`,
    url: null,
    hidden: false,
    blocked: false,
    blockedReason: null,
    position: 0,
    ...patch,
  };
}

function link(id: string, patch: Partial<LinkView> = {}): LinkView {
  return {
    id,
    title: `링크 ${id}`,
    url: `https://${id}.example.com/`,
    description: null,
    thumbnail: null,
    faviconUrl: `https://${id}.example.com/favicon.ico`,
    hidden: false,
    blocked: false,
    blockedReason: null,
    position: 0,
    ...patch,
  };
}

function item(id: string): PortfolioItemView {
  return { id, title: `작업 ${id}`, url: null, image: null, description: null, position: 0 };
}

function state(patch: Partial<CreatorLandingState> = {}): CreatorLandingState {
  return {
    landing: {
      publicId: 'pub1',
      url: 'http://web.test/p/pub1',
      displayName: '하루',
      bio: '소개',
      avatar: null,
      guestbookEnabled: true,
    },
    shortLink: { url: 'http://short.test/haru', slug: 'haru', isAutoSlug: false, nextChangeAvailableAt: null },
    links: [link('a'), link('h', { hidden: true }), link('b', { blocked: true, blockedReason: '피싱' }), link('c')],
    socials: [{ platform: 'youtube', url: 'https://youtube.com/@haru' }],
    portfolio: [item('p1'), item('p2')],
    limits: { visibleMax: 5, visibleUsed: 2, totalMax: 50, totalUsed: 4 },
    slot: { kind: 'ad', slotIndex: null, grantedAt: null },
    adBanners: [],
    banners: [],
    bannerLimits: { visibleMax: 5, visibleUsed: 0, totalMax: 20, totalUsed: 0 },
    ...patch,
  };
}

const linkIds = (view: PublicLandingView) => view.blocks[0].links.map((l) => l.id);

test('초안이 없으면 저장 상태에서 숨긴·차단 링크를 빼고 순서를 유지한다', () => {
  const view = toLandingPreview(state());
  assert.deepEqual(linkIds(view), ['a', 'c']);
  assert.equal(view.blocks[0].links[0].clickUrl, 'https://a.example.com/');
  assert.equal(view.displayName, '하루');
  assert.deepEqual(view.socials, [{ platform: 'youtube', url: 'https://youtube.com/@haru' }]);
  assert.deepEqual(
    view.portfolio.map((p) => p.id),
    ['p1', 'p2'],
  );
});

test('프로필 초안은 앞뒤 공백을 자르고 빈 값은 비움으로 덮는다', () => {
  const view = toLandingPreview(state(), {
    profile: { displayName: '  새 이름 ', bio: '   ', avatar: { fileId: 'f1', url: '/img/f1' } },
  });
  assert.equal(view.displayName, '새 이름');
  assert.equal(view.bio, null);
  assert.equal(view.avatarUrl, '/img/f1');
});

test('SNS 초안은 빈 주소 행을 빼고 주소 공백을 자른다', () => {
  const view = toLandingPreview(state(), {
    socials: [
      { platform: 'instagram', url: ' https://instagram.com/haru ' },
      { platform: 'tiktok', url: '  ' },
    ],
  });
  assert.deepEqual(view.socials, [{ platform: 'instagram', url: 'https://instagram.com/haru' }]);
});

test('고치는 링크는 제자리에서 바뀌고 주소가 바뀌면 사이트 아이콘을 비운다', () => {
  const draft = { ...linkDraftOf(link('a')), title: '고친 이름', description: '설명', url: 'https://new.example.com' };
  const view = toLandingPreview(state(), { links: [draft] });
  assert.deepEqual(linkIds(view), ['a', 'c']);
  const edited = view.blocks[0].links[0];
  assert.equal(edited.title, '고친 이름');
  assert.equal(edited.description, '설명');
  assert.equal(edited.faviconUrl, '');
  assert.equal(edited.clickUrl, 'https://new.example.com');

  const sameUrl = toLandingPreview(state(), { links: [{ ...linkDraftOf(link('c')), title: '이름만' }] });
  assert.equal(sameUrl.blocks[0].links[1].faviconUrl, 'https://c.example.com/favicon.ico');
});

test('숨긴·차단된 링크를 고치는 초안은 미리보기에 나오지 않는다', () => {
  const hidden = toLandingPreview(state(), {
    links: [{ ...linkDraftOf(link('h', { hidden: true })), title: '보이면 안 됨' }],
  });
  const blocked = toLandingPreview(state(), { links: [{ ...linkDraftOf(link('b')), title: '보이면 안 됨' }] });
  assert.deepEqual(linkIds(hidden), ['a', 'c']);
  assert.deepEqual(linkIds(blocked), ['a', 'c']);
});

test('새 링크 초안은 표시 이름이 있을 때만 맨 끝에 기본 아이콘으로 붙는다', () => {
  const empty = toLandingPreview(state(), { links: [{ ...linkDraftOf(null), url: 'https://x.example.com' }] });
  assert.deepEqual(linkIds(empty), ['a', 'c']);
  const named = toLandingPreview(state(), { links: [{ ...linkDraftOf(null), title: ' 새 링크 ' }] });
  assert.deepEqual(linkIds(named), ['a', 'c', DRAFT_ITEM_ID]);
  assert.equal(named.blocks[0].links[2].title, '새 링크');
  assert.equal(named.blocks[0].links[2].faviconUrl, '');
});

test('여러 항목의 초안을 한꺼번에 덮어 그린다(고른 항목을 바꿔도 다른 초안이 남음)', () => {
  const view = toLandingPreview(state(), {
    links: [
      { ...linkDraftOf(link('c')), title: '둘째 고침' },
      { ...linkDraftOf(null), title: '새 링크' },
      { ...linkDraftOf(link('a')), title: '첫째 고침' },
    ],
    portfolio: [
      { ...portfolioDraftOf(item('p1')), title: '작업 고침' },
      { ...portfolioDraftOf(null), title: '새 작업' },
    ],
  });
  assert.deepEqual(
    view.blocks[0].links.map((l) => [l.id, l.title]),
    [
      ['a', '첫째 고침'],
      ['c', '둘째 고침'],
      [DRAFT_ITEM_ID, '새 링크'],
    ],
  );
  assert.deepEqual(
    view.portfolio.map((p) => [p.id, p.title]),
    [
      ['p1', '작업 고침'],
      ['p2', '작업 p2'],
      [DRAFT_ITEM_ID, '새 작업'],
    ],
  );
});

test('포트폴리오 초안은 고치는 항목을 제자리에서 바꾸고 새 항목은 제목이 있을 때만 붙인다', () => {
  const edited = toLandingPreview(state(), {
    portfolio: [{ ...portfolioDraftOf(item('p2')), title: '고친 작업', url: ' https://work.example.com ' }],
  });
  assert.deepEqual(
    edited.portfolio.map((p) => [p.id, p.title, p.url]),
    [
      ['p1', '작업 p1', null],
      ['p2', '고친 작업', 'https://work.example.com'],
    ],
  );
  const untitled = toLandingPreview(state(), { portfolio: [portfolioDraftOf(null)] });
  assert.equal(untitled.portfolio.length, 2);
  const added = toLandingPreview(state(), { portfolio: [{ ...portfolioDraftOf(null), title: '새 작업' }] });
  assert.deepEqual(
    added.portfolio.map((p) => p.id),
    ['p1', 'p2', DRAFT_ITEM_ID],
  );
});

test('저장 안 함 판정은 저장 규칙(앞뒤 공백 자름)을 따르고, 추가한 빈 SNS 행도 바뀐 것으로 본다', () => {
  const saved = state();
  assert.equal(isProfileDirty(saved.landing, profileDraftOf(saved.landing)), false);
  assert.equal(isProfileDirty(saved.landing, { ...profileDraftOf(saved.landing), displayName: ' 하루 ' }), false);
  assert.equal(isProfileDirty(saved.landing, { ...profileDraftOf(saved.landing), bio: '' }), true);

  assert.equal(isSocialsDirty(saved.socials, socialRowsOf(saved.socials)), false);
  assert.equal(
    isSocialsDirty(saved.socials, [...socialRowsOf(saved.socials), { key: 9, platform: 'x', url: '' }]),
    true,
  );

  assert.equal(isLinkDraftDirty(saved.links, linkDraftOf(saved.links[0])), false);
  assert.equal(isLinkDraftDirty(saved.links, { ...linkDraftOf(saved.links[0]), description: '추가' }), true);
  assert.equal(isLinkDraftDirty(saved.links, linkDraftOf(null)), false);
});

test('광고 블록: 게시 중 배너가 있으면 slot을 싣고, afterLinkCount는 숨김·차단 포함 전체 순서의 slotIndex 앞 보이는 링크 수', () => {
  // 링크 순서 a, h(숨김), b(차단), c. slotIndex 3 = c 앞 → 보이는 링크 a 하나 다음.
  const view = toLandingPreview(
    state({ adBanners: [adBanner('x'), adBanner('y')], slot: { kind: 'ad', slotIndex: 3, grantedAt: null } }),
  );
  assert.deepEqual(view.blocks[0].slot, { kind: 'ad', afterLinkCount: 1, banners: [adBanner('x'), adBanner('y')] });
  const front = toLandingPreview(
    state({ adBanners: [adBanner('x')], slot: { kind: 'ad', slotIndex: 0, grantedAt: null } }),
  );
  assert.equal(front.blocks[0].slot?.afterLinkCount, 0);
  const back = toLandingPreview(state({ adBanners: [adBanner('x')] }));
  assert.equal(back.blocks[0].slot?.afterLinkCount, 2);
});

test('게시 0장이면 slot null이고 미리보기 점선 자리(no_banners)는 위치를 유지한다', () => {
  const saved = state({ slot: { kind: 'ad', slotIndex: 1, grantedAt: null } });
  assert.equal(toLandingPreview(saved).blocks[0].slot, null);
  const slot = previewBannerSlot(saved);
  assert.equal(slot.hidden, 'no_banners');
  assert.equal(slot.afterLinkCount, 1);
});

test('광고는 보이는 링크·포트폴리오가 없으면 no_content, 새 링크 초안이 있으면 보이고 슬롯이 맨 뒤면 초안도 슬롯 앞', () => {
  const bare = state({ links: [link('h', { hidden: true })], portfolio: [], adBanners: [adBanner('x')] });
  assert.equal(previewBannerSlot(bare).hidden, 'no_content');
  assert.equal(toLandingPreview(bare).blocks[0].slot, null);
  const drafted = previewBannerSlot(bare, { links: [{ ...linkDraftOf(null), title: '새 링크' }] });
  assert.equal(drafted.hidden, null);
  assert.equal(drafted.afterLinkCount, 1);
  const portfolioOnly = previewBannerSlot(bare, { portfolio: [{ ...portfolioDraftOf(null), title: '새 작업' }] });
  assert.equal(portfolioOnly.hidden, null);
});

test('배너 슬롯은 숨김·차단 배너를 빼고 저장된 URL·정지 이미지를 싣고, 빈 랜딩에서도 보인다', () => {
  const granted = state({
    links: [],
    portfolio: [],
    slot: { kind: 'creator', slotIndex: null, grantedAt: '2026-10-09T00:00:00.000Z' },
    adBanners: [adBanner('x')],
    banners: [
      creatorBanner('b1', { url: 'https://me.example.com/', stillImage: { fileId: 's1', url: '/img/s1' } }),
      creatorBanner('b2', { hidden: true }),
      creatorBanner('b3', { blocked: true, blockedReason: '피싱' }),
    ],
  });
  assert.deepEqual(toLandingPreview(granted).blocks[0].slot, {
    kind: 'creator',
    afterLinkCount: 0,
    banners: [
      { id: 'b1', imageUrl: '/img/b1', stillImageUrl: '/img/s1', alt: '배너 b1', clickUrl: 'https://me.example.com/' },
    ],
  });
  const allHidden = state({
    slot: { kind: 'creator', slotIndex: 0, grantedAt: '2026-10-09T00:00:00.000Z' },
    banners: [creatorBanner('b2', { hidden: true })],
  });
  assert.equal(previewBannerSlot(allHidden).hidden, 'no_banners');
  assert.equal(previewBannerSlot(allHidden).kind, 'creator');
});
