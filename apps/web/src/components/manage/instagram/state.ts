import {
  INSTAGRAM_DM_LIMITS,
  type CreatorLandingState,
  type InstagramConnectionView,
  type InstagramDmRuleView,
} from '@crelink/shared';

/** 설계 docs/specs/instagram-comment-dm.md `화면 상태와 API 대응`의 화면 상태를 정하는 순수 함수 모음입니다. */

/** 만료 14일 전부터 재연결을 안내합니다(설계 `OAuth·토큰·삭제`의 토큰 수명 표). */
export const TOKEN_EXPIRY_WARNING_DAYS = 14;

const DAY_MS = 86_400_000;

/** 서버 렌더가 화면 기준 시각을 넘길 때 씁니다(렌더 함수 안에서 `Date.now()`를 직접 부르지 않기 위한 분리). */
export function currentTimeMs(): number {
  return Date.now();
}

export type ExpiryNotice = { kind: 'soon'; days: number } | { kind: 'expired' } | null;

/** `tokenExpiresAt`이 없으면(무기한) 표시하지 않습니다. 형식이 잘못된 값도 표시하지 않습니다. */
export function tokenExpiryNotice(tokenExpiresAt: string | null, now: number): ExpiryNotice {
  if (!tokenExpiresAt) return null;
  const expires = Date.parse(tokenExpiresAt);
  if (!Number.isFinite(expires)) return null;
  const left = expires - now;
  if (left <= 0) return { kind: 'expired' };
  if (left > TOKEN_EXPIRY_WARNING_DAYS * DAY_MS) return null;
  return { kind: 'soon', days: Math.max(1, Math.ceil(left / DAY_MS)) };
}

export type ConnectionScreen =
  'unavailable' | 'disconnected' | 'active' | 'messages_access_required' | 'reauth_required';

export function connectionScreen(available: boolean, connection: InstagramConnectionView | null): ConnectionScreen {
  if (!connection) return available ? 'disconnected' : 'unavailable';
  return connection.status;
}

/** 규칙을 만들고 고치고 켜고 끌 수 있는지. `재연결 필요`에서는 읽기 전용입니다. */
export function rulesEditable(connection: InstagramConnectionView | null): boolean {
  return connection !== null && connection.status !== 'reauth_required';
}

/** 메뉴 `인스타그램 DM` 표시. 편집자이거나 `instagramDmAvailable`이 true가 아니면 숨깁니다. */
export function instagramMenuVisible(state: Pick<CreatorLandingState, 'pageAccess' | 'instagramDmAvailable'>): boolean {
  return state.pageAccess?.role !== 'editor' && state.instagramDmAvailable;
}

/** 콜백 route(0263)가 화면으로 돌려보낼 때 붙이는 오류 코드 중 이 화면이 안내하는 것. 그 밖의 값은 무시합니다. */
export const CONNECT_FAILURE_CODES = [
  'instagram_account_in_use',
  'instagram_operator_paused',
  'instagram_account_selection_required',
  'instagram_account_not_professional',
  'instagram_upstream_failed',
  'oauth_state_invalid',
  'instagram_access_denied',
] as const;

export type ConnectFailureCode = (typeof CONNECT_FAILURE_CODES)[number];

export function readConnectFailure(value: string | string[] | undefined): ConnectFailureCode | null {
  return typeof value === 'string' && (CONNECT_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as ConnectFailureCode)
    : null;
}

/** 연결 실패 문구. 계정 선택 오류는 별도 안내(하나만 골라 다시 연결)라 `selection`으로 구분해 그립니다. */
export const CONNECT_FAILURE_MESSAGES: Record<ConnectFailureCode, string> = {
  instagram_account_in_use: '이 인스타그램 계정은 이미 다른 페이지에 연결되어 있어요. 다른 계정으로 연결해 주세요.',
  instagram_operator_paused: '운영자가 자동 DM을 멈춘 인스타그램 계정이라 연결할 수 없어요.',
  instagram_account_selection_required:
    '연결할 계정을 하나만 골라야 해요. 동의 화면에서 계정을 하나만 선택한 뒤 다시 연결해 주세요.',
  instagram_account_not_professional:
    '프로페셔널(비즈니스·크리에이터) 계정만 연결할 수 있어요. 인스타그램 설정에서 계정 유형을 바꾼 뒤 다시 연결해 주세요.',
  instagram_upstream_failed: '인스타그램에서 응답을 받지 못했어요. 잠시 뒤 다시 연결해 주세요.',
  oauth_state_invalid:
    '연결 시간이 지났거나 다른 브라우저에서 이어졌어요. 이 브라우저에서 처음부터 다시 연결해 주세요.',
  instagram_access_denied: '인스타그램 동의를 마치지 않아 연결하지 못했어요. 다시 연결하고 권한을 허용해 주세요.',
};

/** 규칙 입력 검사. 문구 내용은 제한하지 않고 길이만 봅니다(설계: 서버 문구 검사 없음). */
export interface RuleDraft {
  mediaId: string;
  keyword: string;
  message: string;
}

export type RuleDraftProblem = 'media' | 'keyword' | 'message';

export function ruleDraftProblem(draft: RuleDraft, requireMedia: boolean): RuleDraftProblem | null {
  if (requireMedia && !draft.mediaId) return 'media';
  const keyword = draft.keyword.trim();
  if (keyword.length < 1 || keyword.length > INSTAGRAM_DM_LIMITS.keywordMaxLength) return 'keyword';
  const message = draft.message.trim();
  if (message.length < 1 || message.length > INSTAGRAM_DM_LIMITS.messageMaxLength) return 'message';
  return null;
}

export type RuleLimit = 'active_full' | 'total_full' | null;

/** 규칙 한도. 새 규칙은 활성 한도와 전체 한도를 모두 넘기지 않아야 합니다. 서버 한도는 `limits`가 우선입니다. */
export function ruleLimit(
  rules: ReadonlyArray<Pick<InstagramDmRuleView, 'enabled'>>,
  limits: { activeRules: number; totalRules: number },
): RuleLimit {
  if (rules.length >= limits.totalRules) return 'total_full';
  if (rules.filter((rule) => rule.enabled).length >= limits.activeRules) return 'active_full';
  return null;
}

/** 규칙 입력의 안내 문구(placeholder·예시). 독점 콘텐츠 표현과 팔로우 조건을 넣지 않습니다. */
export const RULE_FIELD_COPY = {
  keywordPlaceholder: '예: 링크',
  messagePlaceholder: '예: 안녕하세요. 요청하신 링크를 보내 드려요.',
} as const;
