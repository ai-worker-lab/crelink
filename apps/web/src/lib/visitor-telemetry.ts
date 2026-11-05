import { LANDING_EVENT_LIMITS, type LandingEventRequest, type LandingTargetKind } from '@crelink/shared';

const SESSION_IDLE_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface VisitorSession {
  id: string;
  lastActive: number;
}

/** 최초 등록만 같은 eventId로 한 번 재시도합니다. 잘못된 입력·서명·제한 응답은 반복하지 않습니다. */
export async function registerVisitorPageView(
  event: LandingEventRequest,
  send: (event: LandingEventRequest) => Promise<number>,
): Promise<boolean> {
  let status = await send(event);
  if (status === 0 || (status >= 500 && status <= 599)) status = await send(event);
  return status === 204;
}

/** 저장소 거부·손상 때도 현재 문서 안의 세션은 유지합니다. */
export function touchVisitorSession(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  key: string,
  previous: VisitorSession | null,
  now: number,
  newId: () => string,
): VisitorSession {
  let stored: VisitorSession | null = previous;
  if (!stored) {
    try {
      stored = JSON.parse(storage?.getItem(key) ?? 'null') as VisitorSession | null;
    } catch {
      stored = null;
    }
  }
  const valid =
    stored &&
    UUID.test(stored.id) &&
    Number.isFinite(stored.lastActive) &&
    stored.lastActive <= now &&
    now - stored.lastActive < SESSION_IDLE_MS;
  const session = { id: valid && stored ? stored.id : newId(), lastActive: now };
  try {
    storage?.setItem(key, JSON.stringify(session));
  } catch {
    // 저장소가 막힌 방문자도 문서 안에서는 메모리 세션을 씁니다.
  }
  return session;
}

/** StrictMode 재설치에는 같은 인스턴스, BFCache 복원에는 새 인스턴스를 씁니다. */
export class VisitorPageView {
  readonly id: string;
  readonly sessionId: string;
  private visibleSince: number | null = null;
  private activeMs = 0;
  private scrollPercent = 0;
  private claimed = false;
  private readonly impressions = new Set<string>();

  constructor(id: string, sessionId: string) {
    this.id = id;
    this.sessionId = sessionId;
  }

  claimPageView(): boolean {
    if (this.claimed) return false;
    this.claimed = true;
    return true;
  }

  setVisible(visible: boolean, now: number): void {
    if (visible && this.visibleSince === null) this.visibleSince = now;
    if (!visible && this.visibleSince !== null) {
      this.activeMs += Math.max(0, now - this.visibleSince);
      this.visibleSince = null;
    }
  }

  snapshot(now: number, scrollPercent: number): { activeMs: number; scrollPercent: number } {
    if (Number.isFinite(scrollPercent))
      this.scrollPercent = Math.max(this.scrollPercent, Math.min(100, Math.max(0, scrollPercent)));
    const elapsed = this.visibleSince === null ? 0 : Math.max(0, now - this.visibleSince);
    return {
      activeMs: Math.min(LANDING_EVENT_LIMITS.activeMsMax, Math.floor(this.activeMs + elapsed)),
      scrollPercent: Math.round(this.scrollPercent),
    };
  }

  firstImpression(kind: LandingTargetKind, id: string): boolean {
    const key = `${kind}:${id}`;
    if (this.impressions.has(key)) return false;
    this.impressions.add(key);
    return true;
  }
}

type Metadata = Pick<
  LandingEventRequest,
  'language' | 'timeZone' | 'viewportWidth' | 'viewportHeight' | 'screenWidth' | 'screenHeight' | 'pixelRatio'
>;

/** 허용한 환경 값만 복사합니다. 주소·본문·입력값은 이 함수의 입력에도 없습니다. */
export function visitorMetadata(input: Metadata): Metadata {
  const result: Metadata = {};
  for (const key of ['language', 'timeZone'] as const) {
    const limit = key === 'language' ? LANDING_EVENT_LIMITS.languageLength : LANDING_EVENT_LIMITS.timeZoneLength;
    const value = input[key]
      // eslint-disable-next-line no-control-regex -- 브라우저 메타데이터의 제어 문자 제거.
      ?.replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, limit);
    if (value) result[key] = value;
  }
  for (const key of ['viewportWidth', 'viewportHeight', 'screenWidth', 'screenHeight'] as const) {
    const value = input[key];
    if (value !== undefined && Number.isFinite(value) && value >= 1) {
      result[key] = Math.min(LANDING_EVENT_LIMITS.dimensionMax, Math.round(value));
    }
  }
  if (input.pixelRatio !== undefined && Number.isFinite(input.pixelRatio) && input.pixelRatio >= 0.1) {
    result.pixelRatio = Math.min(LANDING_EVENT_LIMITS.pixelRatioMax, input.pixelRatio);
  }
  return result;
}
