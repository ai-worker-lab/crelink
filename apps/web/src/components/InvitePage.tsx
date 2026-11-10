'use client';

import { CRELINK_API_PATHS, type PageInvitePreview, type PageInviteAccepted } from '@crelink/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { browserApi, BrowserApiError, describeError } from '../lib/api/browser';
import { INVITE_STORAGE_KEY, takeInviteToken } from '../lib/invite';
import { ActionStatus } from './ActionStatus';
import { SignInLink } from './SignInLink';

export function InvitePage() {
  const started = useRef(false);
  const token = useRef<string | null>(null);
  const [preview, setPreview] = useState<PageInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState(false);
  const [pending, setPending] = useState(true);

  function fail(caught: unknown) {
    if (caught instanceof BrowserApiError && caught.status === 401) {
      try {
        sessionStorage.setItem(INVITE_STORAGE_KEY, token.current!);
        setLogin(true);
        setError(null);
      } catch {
        setError('초대를 보관할 수 없어요. 로그인한 뒤 초대 링크를 다시 열어 주세요.');
      }
    } else setError(describeError(caught));
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = takeInviteToken(window.location, window.history, {
      getItem: (key) => sessionStorage.getItem(key),
      removeItem: (key) => sessionStorage.removeItem(key),
    });
    if (!token.current) {
      setError('초대 링크를 다시 열어 주세요.');
      setPending(false);
      return;
    }
    browserApi<PageInvitePreview>(CRELINK_API_PATHS.pageInvitePreview, {
      method: 'POST',
      body: JSON.stringify({ token: token.current }),
    })
      .then(setPreview)
      .catch(fail)
      .finally(() => setPending(false));
  }, []);

  async function accept() {
    if (pending || !token.current) return;
    setPending(true);
    setError(null);
    try {
      const result = await browserApi<PageInviteAccepted>(CRELINK_API_PATHS.pageInviteAccept, {
        method: 'POST',
        body: JSON.stringify({ token: token.current }),
      });
      token.current = null;
      window.location.assign('/me/landings/' + encodeURIComponent(result.publicId));
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="public-page narrow-page form-stack">
      <h1>공유 페이지 초대</h1>
      {pending ? <p role="status">처리 중…</p> : null}
      {login ? (
        <>
          <p>초대를 확인하려면 로그인해 주세요.</p>
          <SignInLink returnTo="/invite">로그인</SignInLink>
        </>
      ) : preview ? (
        <>
          <h2>{preview.displayName ?? '이름 없는 페이지'}</h2>
          <p className="notice-box">수락하면 내 이메일이 소유자에게 보여요</p>
          <button className="primary" disabled={pending} onClick={() => void accept()}>
            수락
          </button>
        </>
      ) : null}
      <ActionStatus error={error} />
      <Link
        className="secondary"
        href="/me"
        onClick={() => {
          token.current = null;
          try {
            sessionStorage.removeItem(INVITE_STORAGE_KEY);
          } catch {
            /* 저장소 차단 */
          }
        }}
      >
        거절
      </Link>
    </main>
  );
}
