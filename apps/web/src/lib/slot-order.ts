import type { BannerSlotKind } from '@crelink/shared';

/**
 * 외부 링크 패널에서 링크 행 사이에 섞어 끄는 광고 블록·배너 슬롯 행의 화면 전용 id(dnd-kit). 링크 id(uuid)와 겹치지 않습니다.
 * 저장(`PUT /api/me/links/order`)에는 쓰지 않고 `slotIndex`로 바꿔 보냅니다(설계 docs/specs/crelink-ad-banner.md `위치 모델`).
 */
export const SLOT_ROW_ID = 'banner-slot-row';

/**
 * 링크 id(숨김·차단 포함 전체 순서)와 슬롯 위치로 섞인 목록을 만듭니다. `slotIndex`가 null(맨 뒤에 붙어 있음)이거나 링크 수 이상이면 맨 뒤입니다.
 */
export function mixedOrder(linkIds: readonly string[], slotIndex: number | null): string[] {
  const at = Math.min(slotIndex ?? linkIds.length, linkIds.length);
  return [...linkIds.slice(0, at), SLOT_ROW_ID, ...linkIds.slice(at)];
}

/**
 * 섞인 목록을 저장 요청 값으로 나눕니다. `slotIndex`는 슬롯 행 앞 링크 수이고, 무엇을 옮겼든 늘 보냅니다(링크가 슬롯 행을 건너가도
 * 화면 순서와 저장 순서가 같도록).
 */
export function splitOrder(mixed: readonly string[]): { ids: string[]; slotIndex: number } {
  const at = mixed.indexOf(SLOT_ROW_ID);
  const ids = mixed.filter((id) => id !== SLOT_ROW_ID);
  return { ids, slotIndex: at < 0 ? ids.length : at };
}

/** 지금 위치 문장: `링크 목록 맨 앞`·`n번째 링크 다음`·`링크 목록 맨 뒤`(숨김·차단 포함 전체 순서 기준). */
export function slotPositionLabel(slotIndex: number | null, linkCount: number): string {
  if (slotIndex === null || slotIndex >= linkCount) return '링크 목록 맨 뒤';
  if (slotIndex <= 0) return '링크 목록 맨 앞';
  return `${slotIndex}번째 링크 다음`;
}

/** 외부 링크 패널 행·스크린리더 안내에 쓰는 슬롯 행 이름. */
export function slotRowName(kind: BannerSlotKind): string {
  return kind === 'ad' ? '크리링 광고 블록' : '배너 슬롯';
}

/**
 * 낱말 끝 받침에 맞는 조사(`을`/`를`, `이`/`가`)를 붙입니다. 한글 음절이 아니면(영문·숫자로 끝남) 받침 없는 쪽을 씁니다.
 * 예: `withParticle('크리링 광고 블록', '을', '를')` → `크리링 광고 블록을`.
 */
export function withParticle(word: string, batchim: string, plain: string): string {
  const code = word.charCodeAt(word.length - 1);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  return `${word}${hangul && (code - 0xac00) % 28 !== 0 ? batchim : plain}`;
}
