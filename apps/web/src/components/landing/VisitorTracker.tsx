'use client';

import {
  CRELINK_API_PATHS,
  LANDING_TARGET_KINDS,
  type LandingEventRequest,
  type LandingTargetKind,
  type LandingUtm,
} from '@crelink/shared';
import { useEffect, useRef } from 'react';
import {
  registerVisitorPageView,
  touchVisitorSession,
  VisitorPageView,
  visitorMetadata,
  type VisitorSession,
} from '../../lib/visitor-telemetry';

const TARGET = '[data-visitor-kind][data-visitor-id]';
type ViewState = {
  publicId: string;
  token: string;
  sessionKey: string;
  view: VisitorPageView;
  ready: boolean;
  failed: boolean;
  pending: LandingEventRequest[];
  last: { activeMs: number; scrollPercent: number };
};

/** HTTPS가 아닌 로컬·기기 미리보기에서도 지문 정보 없이 임의 UUID를 만듭니다. */
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 검증된 공개 랜딩에만 둡니다. 공용 Landing·관리 미리보기에는 마운트하지 않습니다. */
export function VisitorTracker({
  publicId,
  token,
  sessionKey,
  utm,
}: {
  publicId: string;
  token: string;
  sessionKey: string;
  utm: LandingUtm;
}) {
  const current = useRef<ViewState | null>(null);
  const sessionRef = useRef<VisitorSession | null>(null);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-visitor-root]');
    if (!root) return;
    const endpoint = `/api/backend${CRELINK_API_PATHS.landingEvents(publicId)}`;
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      // 사생활 모드에서 저장소가 막히면 이 문서의 메모리 세션으로 계속합니다.
    }
    if (current.current?.publicId !== publicId || current.current.sessionKey !== sessionKey) sessionRef.current = null;
    const touchSession = () => {
      sessionRef.current = touchVisitorSession(
        storage,
        `crelink:visitor-session:${publicId}:${sessionKey}`,
        sessionRef.current,
        Date.now(),
        randomId,
      );
      return sessionRef.current;
    };
    // 최대 스크롤은 문서에서 화면 아래 끝까지 본 비율입니다. 짧은 문서는 처음부터 100%입니다.
    const depth = () =>
      ((window.scrollY + window.innerHeight) / Math.max(1, document.documentElement.scrollHeight)) * 100;
    const createState = (): ViewState => {
      const view = new VisitorPageView(randomId(), touchSession().id);
      view.setVisible(document.visibilityState === 'visible', performance.now());
      return {
        publicId,
        token,
        sessionKey,
        view,
        ready: false,
        failed: false,
        pending: [],
        last: view.snapshot(performance.now(), depth()),
      };
    };
    if (
      !current.current ||
      current.current.publicId !== publicId ||
      current.current.token !== token ||
      current.current.sessionKey !== sessionKey
    )
      current.current = createState();
    let state = current.current;
    state.view.setVisible(document.visibilityState === 'visible', performance.now());

    async function post(payload: LandingEventRequest, beacon = false): Promise<number> {
      const body = JSON.stringify(payload);
      if (beacon) {
        try {
          if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) return 204;
        } catch {
          // 큐에 넣지 못한 beacon만 keepalive로 다시 시도합니다.
        }
      }
      try {
        return (
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          })
        ).status;
      } catch {
        return 0;
      }
    }

    function payload(type: LandingEventRequest['type'], extra: Partial<LandingEventRequest> = {}): LandingEventRequest {
      return {
        token,
        eventId: randomId(),
        sessionId: state.view.sessionId,
        pageViewId: state.view.id,
        type,
        ...extra,
      };
    }

    function register() {
      if (!state.view.claimPageView()) return;
      const registered = state;
      let timeZone: string | undefined;
      try {
        timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        // 지원하지 않는 환경은 시간대만 비워 둡니다.
      }
      const event = payload('page_view', {
        ...visitorMetadata({
          language: navigator.language,
          timeZone,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          pixelRatio: window.devicePixelRatio,
        }),
        utm,
      });
      void registerVisitorPageView(event, post).then((accepted) => {
        registered.ready = accepted;
        registered.failed = !accepted;
        const queued = registered.pending.splice(0);
        if (accepted) for (const item of queued) void post(item, document.visibilityState !== 'visible');
      });
    }

    function emit(type: LandingEventRequest['type'], extra: Partial<LandingEventRequest> = {}, beacon = false) {
      if (state.failed) return;
      const event = payload(type, extra);
      if (state.ready) void post(event, beacon);
      else if (state.pending.length < 256) state.pending.push(event);
    }

    function flush(beacon = false) {
      if (document.visibilityState === 'visible') touchSession();
      const next = state.view.snapshot(performance.now(), depth());
      if (next.activeMs === state.last.activeMs && next.scrollPercent === state.last.scrollPercent) return;
      state.last = next;
      emit('engagement', next, beacon);
    }

    function target(element: Element): { targetKind: LandingTargetKind; targetId: string } | null {
      if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return null;
      const kind = element.getAttribute('data-visitor-kind') as LandingTargetKind;
      const id = element.getAttribute('data-visitor-id');
      return LANDING_TARGET_KINDS.includes(kind) && id && id.length <= 128 ? { targetKind: kind, targetId: id } : null;
    }

    function click(event: MouseEvent) {
      if (event.defaultPrevented || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
      const anchor = event.target instanceof Element ? event.target.closest(`a${TARGET}`) : null;
      if (!anchor || !root!.contains(anchor)) return;
      const selected = target(anchor);
      if (selected) {
        touchSession();
        emit('click', selected, true);
      }
    }

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (document.visibilityState !== 'visible') return;
              for (const entry of entries) {
                const selected = target(entry.target);
                if (
                  !selected ||
                  !entry.isIntersecting ||
                  (selected.targetKind !== 'block' && entry.intersectionRatio < 0.5)
                )
                  continue;
                if (state.view.firstImpression(selected.targetKind, selected.targetId)) emit('impression', selected);
              }
            },
            { threshold: [0, 0.5] },
          );
    function observe() {
      observer?.disconnect();
      for (const element of root!.querySelectorAll(TARGET)) observer?.observe(element);
    }
    const mutations = new MutationObserver(observe);
    mutations.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'inert', 'aria-hidden'],
    });

    function resume(restored: boolean) {
      if (restored || touchSession().id !== state.view.sessionId) {
        state = createState();
        current.current = state;
        register();
      } else state.view.setVisible(true, performance.now());
      observe();
    }
    let inPageCache = false;
    function visibility() {
      if (document.visibilityState === 'visible') {
        if (!inPageCache) resume(false);
      } else {
        state.view.setVisible(false, performance.now());
        flush(true);
      }
    }
    function pageHide(event: PageTransitionEvent) {
      inPageCache = event.persisted;
      state.view.setVisible(false, performance.now());
      flush(true);
    }
    function pageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        inPageCache = false;
        resume(true);
      }
    }
    let frame = 0;
    function scroll() {
      if (frame || document.visibilityState !== 'visible') return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        touchSession();
        state.view.snapshot(performance.now(), depth());
      });
    }

    register();
    observe();
    root.addEventListener('click', click);
    root.addEventListener('auxclick', click);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    window.addEventListener('scroll', scroll, { passive: true });
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') flush();
    }, 15_000);
    return () => {
      state.view.setVisible(false, performance.now());
      flush(true);
      clearInterval(timer);
      cancelAnimationFrame(frame);
      mutations.disconnect();
      observer?.disconnect();
      root.removeEventListener('click', click);
      root.removeEventListener('auxclick', click);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
      window.removeEventListener('scroll', scroll);
    };
  }, [publicId, token, sessionKey, utm]);

  return null;
}
