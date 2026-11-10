import { CRELINK_LIMITS, RESERVED_SLUGS, SLUG_PATTERN, type SlugUnavailableReason } from '@crelink/shared';

/** 입력이 바뀐 뒤 이만큼 멈추면 사용 가능 여부를 묻습니다. */
export const SLUG_CHECK_DELAY_MS = 400;

export const SLUG_FORMAT_HELP = `영소문자·숫자·하이픈(-) ${CRELINK_LIMITS.slugMinLength}~${CRELINK_LIMITS.slugMaxLength}자`;

export const SLUG_UNAVAILABLE_MESSAGES: Record<SlugUnavailableReason, string> = {
  slug_invalid: `영소문자·숫자·하이픈(-) ${CRELINK_LIMITS.slugMinLength}~${CRELINK_LIMITS.slugMaxLength}자로, 처음과 끝은 영소문자나 숫자여야 해요.`,
  slug_reserved: '크리링이 쓰는 예약 주소라 쓸 수 없어요.',
  slug_taken: '이미 사용 중이거나 다른 크리에이터를 위해 보관 중인 주소예요.',
  same_as_current: '지금 쓰는 주소와 같아요.',
};

/** 주소를 바꾼 직후 첫 줄. */
export const SLUG_CHANGED_NOTICE = `주소를 바꿨어요. 옛 주소도 ${CRELINK_LIMITS.retiredSlugGraceDays}일 동안 새 주소로 연결돼요.`;

/** 주소를 바꾼 직후 둘째 줄. */
export const SLUG_CHANGED_NEXT_STEP = '인스타그램 프로필 링크도 새 주소로 바꿔 주세요.';

/** 잠금 전체 문장의 앞부분. 뒤에 다음 변경 가능일이 붙습니다. */
export const SLUG_LOCK_LEAD = `주소는 ${CRELINK_LIMITS.slugChangeIntervalDays}일에 한 번 바꿀 수 있어요. 다음 변경 가능일:`;

export type SlugCheck =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; slug: string }
  | { kind: 'unavailable'; reason: SlugUnavailableReason }
  | { kind: 'error'; message: string };

export function normalizeSlugInput(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 서버에 묻기 전에 브라우저에서 거르는 이유. 없으면 null. */
export function localSlugReason(value: string, saved: string): SlugUnavailableReason | null {
  if (
    value.length < CRELINK_LIMITS.slugMinLength ||
    value.length > CRELINK_LIMITS.slugMaxLength ||
    !SLUG_PATTERN.test(value)
  )
    return 'slug_invalid';
  if (RESERVED_SLUGS.includes(value)) return 'slug_reserved';
  if (value === saved) return 'same_as_current';
  return null;
}

/** 상태 문장. `idle`이면 형식 안내입니다. */
export function slugCheckMessage(check: SlugCheck): string {
  switch (check.kind) {
    case 'checking':
      return '사용할 수 있는지 확인하는 중…';
    case 'available':
      return '사용할 수 있는 주소예요.';
    case 'unavailable':
      return SLUG_UNAVAILABLE_MESSAGES[check.reason];
    case 'error':
      return check.message;
    case 'idle':
      return SLUG_FORMAT_HELP;
  }
}

/** 지금 바꿀 수 있을 때의 안내 문장. */
export function slugChangeHelp(isAutoSlug: boolean): string {
  return isAutoSlug
    ? `자동 발급 주소는 지금 바로 바꿀 수 있어요. 그 뒤로는 ${CRELINK_LIMITS.slugChangeIntervalDays}일에 한 번 바꿀 수 있어요.`
    : `지금 바꿀 수 있어요. 바꾸면 ${CRELINK_LIMITS.slugChangeIntervalDays}일 동안 다시 바꿀 수 없어요.`;
}

/** 단축 주소에서 slug를 뺀 앞부분(`https://` 제외). 예: `go.shaul.kr/`. */
export function slugUrlPrefix(url: string, slug: string): string {
  return url.slice(0, url.length - slug.length).replace(/^https?:\/\//, '');
}

export type SlugSaveFailure =
  { kind: 'unusable'; reason: SlugUnavailableReason } | { kind: 'locked' } | { kind: 'retry' };

/** `PUT` 실패 코드를 화면 처리로 나눕니다. 주소 자체를 못 쓰면 재시도해도 소용없고, 잠김은 상태를 다시 읽어야 합니다. */
export function slugSaveFailure(code: string | null): SlugSaveFailure {
  if (code === 'slug_taken' || code === 'slug_reserved' || code === 'slug_invalid') {
    return { kind: 'unusable', reason: code };
  }
  if (code === 'slug_change_too_soon') return { kind: 'locked' };
  return { kind: 'retry' };
}
