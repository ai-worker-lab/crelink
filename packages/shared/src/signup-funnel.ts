/**
 * 가입 경로 계측 계약(0231, 0087). 저장은 일별 합계뿐이며 이메일·이름·IP·전체 주소·전체 User-Agent·방문자 식별자를 담지 않습니다.
 * 유입값을 같은 출처 주소의 쿼리나 OAuth `state`에 덧붙이지 않습니다. 요청 주소는 오류·성능 진단 기록에, `state`는 구글에 전달되어
 * 개인 단위 유입 기록이 되기 때문입니다(design/landing-footer-cta/handoff.md).
 */
export const SIGNUP_FUNNEL_STEPS = [
  'home_view',
  'signup_click',
  'oauth_start',
  'oauth_callback',
  'signup_complete',
  'first_link',
] as const;
export type SignupFunnelStep = (typeof SIGNUP_FUNNEL_STEPS)[number];

/** 브라우저가 보고하는 단계. 나머지는 서버가 직접 셉니다. */
export const SIGNUP_FUNNEL_CLIENT_STEPS = ['home_view', 'signup_click'] as const;
export type SignupFunnelClientStep = (typeof SIGNUP_FUNNEL_CLIENT_STEPS)[number];

export const IN_APP_BROWSER_KINDS = ['instagram', 'facebook', 'kakaotalk', 'naver', 'line'] as const;
export type InAppBrowserKind = (typeof IN_APP_BROWSER_KINDS)[number];

/** `none`은 앱 내 브라우저가 아님, `unknown`은 알 수 없음(User-Agent 없음 등)입니다. */
export const SIGNUP_IN_APP_KINDS = ['none', 'unknown', ...IN_APP_BROWSER_KINDS] as const;
export type SignupInAppKind = (typeof SIGNUP_IN_APP_KINDS)[number];

export type MobilePlatform = 'android' | 'ios' | 'other';

export interface SignupFunnelContext {
  source: string;
  medium: string;
  campaign: string;
  referrerHost: string;
  inAppKind: SignupInAppKind;
}

/** `POST /api/signup-funnel/events` → 204. 값은 브라우저 보고이며 사람 수의 증명이 아닙니다. */
export interface SignupFunnelEventRequest extends SignupFunnelContext {
  step: SignupFunnelClientStep;
}

export const EMPTY_SIGNUP_FUNNEL_CONTEXT: SignupFunnelContext = {
  source: '',
  medium: '',
  campaign: '',
  referrerHost: '',
  inAppKind: 'unknown',
};

export const SIGNUP_FUNNEL_LIMITS = {
  bodyBytes: 1024,
  valueLength: 64,
  /** 하루 합계 행 상한. 넘으면 새 조합만 `other`로 모아 임의 값으로 행을 늘리지 못하게 합니다. 이미 있는 행에는 계속 더합니다. */
  dailyRowsMax: 2000,
  /** 브라우저 보고의 분당 전체 상한. */
  eventsPerMinute: 600,
  /** OAuth 왕복 동안 묶어 두는 유입값 행 상한. 넘으면 묶지 않고 콜백은 유입값 없이 셉니다. */
  oauthContextsMax: 5000,
  /** 동시에 진행하는 서버 단계 기록 수. DB 풀을 로그인·저장 요청 몫으로 남기려는 값이고 넘는 기록은 버립니다. */
  pendingWritesMax: 5,
} as const;

/** 웹 서버가 API로 넘기는 계측 값 헤더(JSON). 브라우저가 직접 보낼 수 없는 내부 경로에서만 씁니다. */
export const SIGNUP_CONTEXT_HEADER = 'x-crelink-signup-context';

const IN_APP_PATTERNS: ReadonlyArray<readonly [InAppBrowserKind, RegExp]> = [
  ['instagram', /\bInstagram\b/i],
  ['facebook', /FBAN|FBAV|FB_IAB/],
  ['kakaotalk', /\bKAKAOTALK\b/i],
  ['naver', /\bNAVER\(inapp/i],
  ['line', /\bLine\/\d/i],
];

/** 구글이 OAuth를 막는 앱 내 브라우저를 User-Agent로 판별합니다. 아니면 null입니다. */
export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowserKind | null {
  if (!userAgent) return null;
  return IN_APP_PATTERNS.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null;
}

export function inAppKindOfUserAgent(userAgent: string | null | undefined): SignupInAppKind {
  if (!userAgent) return 'unknown';
  return detectInAppBrowser(userAgent) ?? 'none';
}

export function detectMobilePlatform(userAgent: string | null | undefined): MobilePlatform {
  if (!userAgent) return 'other';
  if (/Android/i.test(userAgent)) return 'android';
  return /iPhone|iPad|iPod/.test(userAgent) ? 'ios' : 'other';
}

/** 유입값을 합계에 넣을 수 있는 형태로 바꿉니다. 허용 문자 밖(이메일 모양 등)이거나 너무 길면 `other`, 없으면 빈 문자열입니다. */
export function signupFunnelValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  const clean = value.trim().toLowerCase();
  if (!clean) return '';
  return clean.length <= SIGNUP_FUNNEL_LIMITS.valueLength && /^[a-z0-9._~-]+$/.test(clean) ? clean : 'other';
}

export function signupInAppKind(value: unknown): SignupInAppKind {
  return SIGNUP_IN_APP_KINDS.includes(value as SignupInAppKind) ? (value as SignupInAppKind) : 'unknown';
}

/** 임의 객체에서 계측 값만 골라 정규화합니다. */
export function signupContextOf(input: unknown): SignupFunnelContext {
  const object = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  return {
    source: signupFunnelValue(object.source),
    medium: signupFunnelValue(object.medium),
    campaign: signupFunnelValue(object.campaign),
    referrerHost: signupFunnelValue(object.referrerHost),
    inAppKind: signupInAppKind(object.inAppKind),
  };
}

export function serializeSignupContext(context: SignupFunnelContext): string {
  return JSON.stringify(context);
}

/** `SIGNUP_CONTEXT_HEADER` 값을 읽습니다. 없거나 깨졌으면 빈 값입니다. */
export function parseSignupContextHeader(header: unknown): SignupFunnelContext {
  if (typeof header !== 'string' || !header) return { ...EMPTY_SIGNUP_FUNNEL_CONTEXT };
  try {
    return signupContextOf(JSON.parse(header));
  } catch {
    return { ...EMPTY_SIGNUP_FUNNEL_CONTEXT };
  }
}

/** 주소의 쿼리 문자열에서 UTM 세 값만 읽습니다. */
export function signupUtmOf(search: string): Pick<SignupFunnelContext, 'source' | 'medium' | 'campaign'> {
  const query = new URLSearchParams(search);
  return {
    source: signupFunnelValue(query.get('utm_source')),
    medium: signupFunnelValue(query.get('utm_medium')),
    campaign: signupFunnelValue(query.get('utm_campaign')),
  };
}

/** 외부에서 들어온 경우의 호스트만 돌려줍니다. 경로·쿼리는 읽지 않습니다. */
export function referrerHostOf(referrer: string | null | undefined, ownHost: string): string {
  if (!referrer) return '';
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host === ownHost.toLowerCase() ? '' : signupFunnelValue(host);
  } catch {
    return '';
  }
}
