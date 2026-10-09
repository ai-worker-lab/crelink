// 배너 한도 안내 문구(설계 docs/specs/crelink-ad-banner.md `상수·경로·오류 코드`). 실행: pnpm --filter @crelink/web test
import type { BannerLimits } from '@crelink/shared';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerAddNotice, bannerLimitError } from './limits.ts';

const limits = (patch: Partial<BannerLimits> = {}): BannerLimits => ({
  visibleMax: 5,
  visibleUsed: 2,
  totalMax: 20,
  totalUsed: 3,
  ...patch,
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
