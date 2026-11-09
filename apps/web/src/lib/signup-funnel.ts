import {
  CRELINK_API_PATHS,
  EMPTY_SIGNUP_FUNNEL_CONTEXT,
  inAppKindOfUserAgent,
  referrerHostOf,
  signupFunnelValue,
  signupUtmOf,
  type SignupFunnelClientStep,
  type SignupFunnelContext,
  type SignupFunnelEventRequest,
} from '@crelink/shared';

/** 지금 페이지에서 읽을 수 있는 유입값. 외부에서 온 경우 호스트만 남깁니다. */
export function signupContextFromPage(
  search: string,
  referrer: string,
  ownHost: string,
  userAgent: string,
): SignupFunnelContext {
  return {
    ...signupUtmOf(search),
    referrerHost: referrerHostOf(referrer, ownHost),
    inAppKind: inAppKindOfUserAgent(userAgent),
  };
}

/**
 * `/auth/google` 요청의 유입값. 같은 출처 Referer의 UTM만 읽어 내부 주소에 쿼리를 더하지 않습니다.
 * 외부 Referer는 호스트만 남기고, 경로·쿼리는 읽지 않습니다.
 */
export function signupContextFromRequest(
  referer: string | null,
  host: string | null,
  userAgent: string | null,
): SignupFunnelContext {
  const inAppKind = inAppKindOfUserAgent(userAgent);
  let url: URL | null = null;
  try {
    url = referer ? new URL(referer) : null;
  } catch {
    url = null;
  }
  if (!url) return { ...EMPTY_SIGNUP_FUNNEL_CONTEXT, inAppKind };
  if (host && url.host === host) return { ...EMPTY_SIGNUP_FUNNEL_CONTEXT, ...signupUtmOf(url.search), inAppKind };
  return { ...EMPTY_SIGNUP_FUNNEL_CONTEXT, referrerHost: signupFunnelValue(url.hostname), inAppKind };
}

/**
 * 안드로이드에서 같은 주소를 Chrome으로 여는 intent 주소. 앱 안 브라우저로 되돌아오지 않도록 `S.browser_fallback_url`을 두지 않으며,
 * Chrome이 없거나 앱이 intent를 막으면 아무 일도 일어나지 않습니다(안내의 주소 복사·`그래도 계속`이 남습니다).
 */
export function chromeIntentUrl(absoluteUrl: string): string {
  const url = new URL(absoluteUrl);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`;
}

/** 브라우저 보고 전송. 실패해도 화면 동작에 영향을 주지 않습니다. */
export function sendSignupFunnelEvent(step: SignupFunnelClientStep, context: SignupFunnelContext): void {
  const endpoint = `/api/backend${CRELINK_API_PATHS.signupFunnelEvents}`;
  const event: SignupFunnelEventRequest = { step, ...context };
  const body = JSON.stringify(event);
  try {
    if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) return;
  } catch {
    // 큐에 넣지 못한 beacon만 keepalive로 다시 시도합니다.
  }
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}
