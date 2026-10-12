import type { BannerLimits, LinkLimits } from '@crelink/shared';

/** 외부 링크 한도 배지·구역 요약 문구(R13). 숨긴·차단 링크도 셉니다(예: `링크 7/50`). */
export function linkLimitLabel(limits: LinkLimits): string {
  return `링크 ${limits.totalUsed}/${limits.totalMax}`;
}

/**
 * 링크를 더 추가할 수 없을 때의 안내(외부 링크 패널과 미리보기 추가 자리가 함께 씀). 추가할 수 있으면 null.
 * 한도는 숨긴 링크를 포함한 계정당 전체 상한 하나뿐입니다(R13). 숨긴 링크를 다시 보이게 하는 것은 한도와 관계없습니다.
 */
export function linkLimitNotice(limits: LinkLimits): string | null {
  if (limits.totalUsed < limits.totalMax) return null;
  return `숨긴 링크를 포함해 링크는 최대 ${limits.totalMax}개까지 둘 수 있어요. 쓰지 않는 링크를 지운 뒤 추가해 주세요.`;
}

/**
 * 배너 한도 오류(409)의 패널 안내(설계 docs/specs/crelink-ad-banner.md `상수·경로·오류 코드`). `errors.ts`의 고정 문구 대신
 * 응답 `bannerLimits`의 n·m을 넣은 문장을 씁니다. 한도 코드가 아니면 null.
 */
export function bannerLimitError(code: string, limits: BannerLimits): string | null {
  if (code === 'banner_limit_reached') {
    return `보이는 배너는 ${limits.visibleMax}장까지예요. 다른 배너를 숨기면 이 배너를 보이게 할 수 있어요.`;
  }
  if (code === 'banner_total_limit_reached') {
    return `배너는 숨긴 것까지 ${limits.totalMax}장까지 둘 수 있어요. 쓰지 않는 배너를 지워 주세요.`;
  }
  return null;
}

/** 배너를 더 추가할 수 없을 때 `배너 추가` 대신 보이는 안내(보관 상한이 먼저). 추가할 수 있으면 null. */
export function bannerAddNotice(limits: BannerLimits): string | null {
  if (limits.totalUsed >= limits.totalMax) return bannerLimitError('banner_total_limit_reached', limits);
  if (limits.visibleUsed >= limits.visibleMax) {
    return `보이는 배너는 ${limits.visibleMax}장까지예요. 다른 배너를 숨기거나 지우면 새 배너를 추가할 수 있어요.`;
  }
  return null;
}
