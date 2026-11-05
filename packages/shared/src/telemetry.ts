/** 공개 랜딩 계측 계약. 값은 브라우저 보고이며 본인 확인이나 실제 사람 방문의 증명이 아닙니다. */
export const LANDING_EVENT_TYPES = ['page_view', 'click', 'impression', 'engagement'] as const;
export const LANDING_TARGET_KINDS = ['block', 'link', 'social', 'portfolio', 'creator_banner', 'ad_banner'] as const;
export type LandingEventType = (typeof LANDING_EVENT_TYPES)[number];
export type LandingTargetKind = (typeof LANDING_TARGET_KINDS)[number];

export const LANDING_UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content', 'id'] as const;
export type LandingUtm = Partial<Record<(typeof LANDING_UTM_KEYS)[number], string>>;
export const LANDING_EVENT_LIMITS = {
  bodyBytes: 16 * 1024,
  utmValueLength: 200,
  languageLength: 64,
  timeZoneLength: 100,
  dimensionMax: 32768,
  pixelRatioMax: 16,
  activeMsMax: 24 * 60 * 60 * 1000,
} as const;

/** `POST /api/landings/{publicId}/events` → 204. token은 관리 세션이 아닌 랜딩·익명 방문자 한정 계측 서명입니다. */
export interface LandingEventRequest {
  token: string;
  eventId: string;
  sessionId: string;
  pageViewId: string;
  type: LandingEventType;
  targetKind?: LandingTargetKind;
  targetId?: string;
  /** 페이지 표시 이후 보이는 동안의 누적 밀리초. 서버는 합하지 않고 최댓값을 보관합니다. */
  activeMs?: number;
  /** 문서 끝까지 도달한 최대 스크롤 비율(0~100). */
  scrollPercent?: number;
  language?: string;
  timeZone?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
  pixelRatio?: number;
  utm?: LandingUtm;
}

/** URL에 남길 UTM만 골라 길이를 제한합니다. 나머지 쿼리·중복 값·제어 문자는 수집하지 않습니다. */
export function readLandingUtm(query: URLSearchParams | Record<string, unknown>): LandingUtm {
  const result: LandingUtm = {};
  for (const key of LANDING_UTM_KEYS) {
    const name = `utm_${key}`;
    const value =
      query instanceof URLSearchParams ? (query.getAll(name).length === 1 ? query.get(name) : null) : query[name];
    if (typeof value !== 'string') continue;
    const clean = value
      .replace(/\p{Cc}/gu, '')
      .trim()
      .slice(0, LANDING_EVENT_LIMITS.utmValueLength);
    if (clean) result[key] = clean;
  }
  return result;
}

/** 고정된 절대 목적 URL에 화이트리스트 UTM만 덧붙입니다. */
export function withLandingUtm(url: string, utm: LandingUtm): string {
  const target = new URL(url);
  for (const key of LANDING_UTM_KEYS) if (utm[key]) target.searchParams.set(`utm_${key}`, utm[key]!);
  return target.toString();
}
