// 링크·배너 한도 안내 문구(설계 docs/specs/crelink-ad-banner.md `상수·경로·오류 코드`, docs/specs/crelink-link-limit-ad-toggle.md
// `화면 상태와 API 대응`). 실행: pnpm --filter @crelink/web test
import type { BannerLimits, LinkLimits } from '@crelink/shared';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerAddNotice, bannerLimitError, linkLimitLabel, linkLimitNotice } from './limits.ts';

const limits = (patch: Partial<BannerLimits> = {}): BannerLimits => ({
  visibleMax: 5,
  visibleUsed: 2,
  totalMax: 20,
  totalUsed: 3,
  ...patch,
});

const linkLimits = (patch: Partial<LinkLimits> = {}): LinkLimits => ({
  totalMax: 50,
  totalUsed: 7,
  ...patch,
});

const TOTAL_FULL = '숨긴 링크를 포함해 링크는 최대 50개까지 둘 수 있어요. 쓰지 않는 링크를 지운 뒤 추가해 주세요.';

test('링크 배지는 숨긴 링크를 포함한 전체 수 / 상한', () => {
  assert.equal(linkLimitLabel(linkLimits()), '링크 7/50');
  assert.equal(linkLimitLabel(linkLimits({ totalUsed: 50 })), '링크 50/50');
});

test('전체 상한보다 적으면 링크를 추가할 수 있다(경계 n-1)', () => {
  assert.equal(linkLimitNotice(linkLimits({ totalUsed: 49 })), null);
  assert.equal(linkLimitNotice(linkLimits({ totalUsed: 0 })), null);
});

test('전체 상한에 닿으면 숨긴 링크 포함 안내(경계 n·n+1), 운영자 문의·이벤트 문구 없음', () => {
  assert.equal(linkLimitNotice(linkLimits({ totalUsed: 50 })), TOTAL_FULL);
  assert.equal(linkLimitNotice(linkLimits({ totalUsed: 51 })), TOTAL_FULL);
  assert.equal(
    linkLimitNotice(linkLimits({ totalMax: 10, totalUsed: 10 })),
    '숨긴 링크를 포함해 링크는 최대 10개까지 둘 수 있어요. 쓰지 않는 링크를 지운 뒤 추가해 주세요.',
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
