'use client';

import { GUESTBOOK_TAB_HASH } from '@crelink/shared';
import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { GuestbookPanel } from './GuestbookPanel';

type Tab = 'links' | 'guestbook';

/** `history.replaceState`는 `hashchange`를 내지 않으므로 탭을 바꿀 때 구독자에게 직접 알립니다. */
const hashListeners = new Set<() => void>();

function subscribeHash(listener: () => void) {
  hashListeners.add(listener);
  window.addEventListener('hashchange', listener);
  return () => {
    hashListeners.delete(listener);
    window.removeEventListener('hashchange', listener);
  };
}

/**
 * 랜딩의 `링크`·`방명록` 탭(PRD R19). 고른 탭은 주소 해시(`#guestbook`)가 원본입니다.
 * SSR은 해시를 모르므로 첫 그림은 `링크` 탭이고, 하이드레이션 뒤 해시를 읽어 바꿉니다. 탭을 바꾸면 `history.replaceState`로
 * 해시만 고칩니다(방문 기록을 늘리지 않음). 방명록은 처음 열 때 불러오고, 그 뒤에는 탭을 오가도 내용(쓰던 글 포함)을 유지합니다.
 * 키보드: 좌우 화살표·Home·End로 탭을 옮기면 바로 그 탭이 열립니다.
 */
export function LandingTabs({ publicId, links }: { publicId: string; links: ReactNode }) {
  const baseId = useId();
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => '',
  );
  const tab: Tab = hash === `#${GUESTBOOK_TAB_HASH}` ? 'guestbook' : 'links';
  const [guestbookOpened, setGuestbookOpened] = useState(false);
  if (tab === 'guestbook' && !guestbookOpened) setGuestbookOpened(true);
  const tabRefs = { links: useRef<HTMLButtonElement>(null), guestbook: useRef<HTMLButtonElement>(null) };

  function select(next: Tab, focus = false) {
    const url = new URL(window.location.href);
    url.hash = next === 'guestbook' ? GUESTBOOK_TAB_HASH : '';
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    for (const listener of hashListeners) listener();
    if (focus) tabRefs[next].current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next: Tab | null =
      event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        ? tab === 'links'
          ? 'guestbook'
          : 'links'
        : event.key === 'Home'
          ? 'links'
          : event.key === 'End'
            ? 'guestbook'
            : null;
    if (!next) return;
    event.preventDefault();
    select(next, true);
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'links', label: '링크' },
    { key: 'guestbook', label: '방명록' },
  ];
  return (
    <>
      <div className="landing-tabs" role="tablist" aria-label="랜딩페이지 내용">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            ref={tabRefs[key]}
            type="button"
            role="tab"
            id={`${baseId}-${key}-tab`}
            className="landing-tab"
            aria-selected={tab === key}
            aria-controls={`${baseId}-${key}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => select(key)}
            onKeyDown={onKeyDown}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-links-panel`}
        aria-labelledby={`${baseId}-links-tab`}
        className="landing-tabpanel"
        hidden={tab !== 'links'}
      >
        {links}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-guestbook-panel`}
        aria-labelledby={`${baseId}-guestbook-tab`}
        className="landing-tabpanel"
        hidden={tab !== 'guestbook'}
      >
        {guestbookOpened ? <GuestbookPanel publicId={publicId} /> : null}
      </div>
    </>
  );
}
