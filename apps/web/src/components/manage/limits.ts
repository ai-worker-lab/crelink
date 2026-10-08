import type { LinkLimits } from '@crelink/shared';

/** 링크를 더 추가할 수 없을 때의 안내(외부 링크 패널과 미리보기 추가 자리가 함께 씀). 추가할 수 있으면 null. */
export function linkLimitNotice(limits: LinkLimits): string | null {
  if (limits.totalUsed >= limits.totalMax) {
    return `숨긴 링크를 포함해 링크는 최대 ${limits.totalMax}개까지 둘 수 있어요. 쓰지 않는 링크를 지운 뒤 추가해 주세요.`;
  }
  if (limits.visibleUsed >= limits.visibleMax) {
    return `보이는 링크 한도(${limits.visibleMax}개)에 도달했어요. 다른 링크를 숨기거나 지우면 새 링크를 추가할 수 있어요. 한도를 늘리려면 크리링 운영자에게 문의해 주세요.`;
  }
  return null;
}
