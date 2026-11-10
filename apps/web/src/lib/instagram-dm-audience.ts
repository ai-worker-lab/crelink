import type { InstagramDmAudience } from '@crelink/shared';

/** 운영자 스위치 선택지. 근거: docs/specs/instagram-comment-dm.md `API 계약 초안`(`audience`). */
export const INSTAGRAM_DM_AUDIENCE_OPTIONS: ReadonlyArray<{
  value: InstagramDmAudience;
  label: string;
  help: string;
}> = [
  { value: 'off', label: '끔', help: '모든 크리에이터에게 메뉴가 보이지 않고 새 DM 발송이 멈춰요.' },
  { value: 'operators', label: '운영자만', help: '운영자 계정에서만 쓸 수 있어요. 시험과 심사 준비용이에요.' },
  { value: 'everyone', label: '모든 크리에이터', help: '일반 공개예요. 모든 크리에이터에게 메뉴가 열려요.' },
];

export const INSTAGRAM_DM_EVERYONE_WARNING =
  '모든 크리에이터에게 공개하는 설정이에요. 비즈니스 인증과 앱 검수가 끝나기 전에는 켜지 마세요.';

/** 바꿀 값이 현재와 같으면 요청하지 않고, `everyone`만 확인을 거칩니다. */
export function planAudienceChange(
  current: InstagramDmAudience,
  next: InstagramDmAudience,
): 'none' | 'confirm' | 'save' {
  if (current === next) return 'none';
  return next === 'everyone' ? 'confirm' : 'save';
}

export const INSTAGRAM_DM_AUDIENCE_NOTICE: Record<InstagramDmAudience, string> = {
  off: '인스타그램 DM을 껐어요. 새 DM 발송이 멈춰요.',
  operators: '인스타그램 DM을 운영자에게만 열었어요.',
  everyone: '인스타그램 DM을 모든 크리에이터에게 열었어요.',
};
