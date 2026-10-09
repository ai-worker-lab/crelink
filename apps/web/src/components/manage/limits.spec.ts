// 링크·배너 한도 안내 문구(설계 docs/specs/crelink-ad-banner.md `상수·경로·오류 코드`, docs/specs/crelink-slot-event.md
// `화면 상태와 API 대응` 한도 참). 실행: pnpm --filter @crelink/web test
import type { BannerLimits, CreatorSlotEventState, LinkLimits, SlotEventView } from '@crelink/shared';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerAddNotice, bannerLimitError, linkLimitNotice } from './limits.ts';

const limits = (patch: Partial<BannerLimits> = {}): BannerLimits => ({
  visibleMax: 5,
  visibleUsed: 2,
  totalMax: 20,
  totalUsed: 3,
  ...patch,
});

const linkLimits = (patch: Partial<LinkLimits> = {}): LinkLimits => ({
  visibleMax: 5,
  visibleUsed: 5,
  totalMax: 50,
  totalUsed: 7,
  ...patch,
});

const event = (status: SlotEventView['status']): SlotEventView => ({
  bonusLinks: 5,
  startsAt: '2026-10-10T00:00:00.000Z',
  endsAt: null,
  status,
});

const ENTRY = { appliedAt: '2026-10-10T03:00:00.000Z', bonusLinks: 5 };
const NO_EVENT: CreatorSlotEventState = { event: null, entry: null };
const VISIBLE_FULL =
  '보이는 링크 한도(5개)에 도달했어요. 다른 링크를 숨기거나 지우면 새 링크를 추가할 수 있어요. 한도를 늘리려면 크리링 운영자에게 문의해 주세요.';

test('보이는 링크가 한도보다 적으면 이벤트와 관계없이 null(경계 n-1)', () => {
  assert.equal(linkLimitNotice(linkLimits({ visibleUsed: 4 }), { event: event('open'), entry: null }), null);
});

test('한도 참 · 미신청 · 진행 중이면 이벤트 안내가 든 문구(B7)', () => {
  assert.equal(
    linkLimitNotice(linkLimits(), { event: event('open'), entry: null }),
    '보이는 링크 한도(5개)에 도달했어요. 이벤트를 신청하면 5개 더 둘 수 있어요. 다른 링크를 숨기거나 지워도 새 링크를 추가할 수 있어요.',
  );
  assert.equal(
    linkLimitNotice(linkLimits({ visibleMax: 7, visibleUsed: 8 }), {
      event: { ...event('open'), bonusLinks: 3 },
      entry: null,
    }),
    '보이는 링크 한도(7개)에 도달했어요. 이벤트를 신청하면 3개 더 둘 수 있어요. 다른 링크를 숨기거나 지워도 새 링크를 추가할 수 있어요.',
  );
});

test('신청함(B8)·시작 전·끝남·이벤트 없음(B9)이면 지금 문구 그대로', () => {
  assert.equal(
    linkLimitNotice(linkLimits({ visibleMax: 10, visibleUsed: 10 }), { event: event('open'), entry: ENTRY }),
    VISIBLE_FULL.replace('5개', '10개'),
  );
  assert.equal(linkLimitNotice(linkLimits(), { event: event('scheduled'), entry: null }), VISIBLE_FULL);
  assert.equal(linkLimitNotice(linkLimits(), { event: event('ended'), entry: null }), VISIBLE_FULL);
  assert.equal(linkLimitNotice(linkLimits(), NO_EVENT), VISIBLE_FULL);
});

test('숨긴 링크 포함 전체 상한 문구가 이벤트 안내보다 먼저', () => {
  assert.equal(
    linkLimitNotice(linkLimits({ totalUsed: 50 }), { event: event('open'), entry: null }),
    '숨긴 링크를 포함해 링크는 최대 50개까지 둘 수 있어요. 쓰지 않는 링크를 지운 뒤 추가해 주세요.',
  );
});

test('한도 코드는 응답 bannerLimits의 n·m을 넣은 패널 문장, 다른 코드는 null', () => {
  assert.equal(
    bannerLimitError('banner_limit_reached', limits({ visibleMax: 3 })),
    '보이는 배너는 3장까지예요. 다른 배너를 숨기면 이 배너를 보이게 할 수 있어요.',
  );
  assert.equal(
    bannerLimitError('banner_total_limit_reached', limits({ totalMax: 12 })),
    '배너는 숨긴 것까지 12장까지 둘 수 있어요. 쓰지 않는 배너를 지워 주세요.',
  );
  assert.equal(bannerLimitError('link_domain_blocked', limits()), null);
});

test('배너 추가는 보관 상한을 먼저, 그다음 보이는 배너 n장에서 막는다(경계 n-1·n)', () => {
  assert.equal(bannerAddNotice(limits({ visibleUsed: 4 })), null);
  assert.equal(
    bannerAddNotice(limits({ visibleUsed: 5 })),
    '보이는 배너는 5장까지예요. 다른 배너를 숨기거나 지우면 새 배너를 추가할 수 있어요.',
  );
  assert.equal(
    bannerAddNotice(limits({ visibleUsed: 5, totalUsed: 20 })),
    '배너는 숨긴 것까지 20장까지 둘 수 있어요. 쓰지 않는 배너를 지워 주세요.',
  );
});
