'use client';

import { CRELINK_API_PATHS, type InstagramDmOptOutRequest } from '@crelink/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ActionStatus } from '../../../components/ActionStatus';
import { browserApi, BrowserApiError, describeError } from '../../../lib/api/browser';
import { clearOptOutFragment, readOptOutToken, viewForError, type OptOutView } from './opt-out';

/**
 * 인스타그램 댓글 자동 DM 수신 거부 화면. 토큰은 URL 프래그먼트(`#t=`)에서만 읽고, 사용자가 `수신 거부` 버튼을 눌러야 보냅니다.
 * 진입만으로는 거부되지 않습니다(링크 미리보기 크롤러 대비). 토큰은 ref에만 두고 쿼리·로그·분석 이벤트·저장소에 넣지 않으며,
 * 완료나 유효하지 않음이 되면 `history.replaceState`로 프래그먼트를 지웁니다. 오류일 때는 다시 시도할 수 있게 둡니다.
 */
export function DmOptOut() {
  const token = useRef<string | null>(null);
  const [view, setView] = useState<OptOutView>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function read() {
      token.current = readOptOutToken(window.location.hash);
      if (token.current) setView('ready');
      else {
        clearOptOutFragment(window.location, window.history);
        setView('invalid');
      }
    }
    read();
    // 같은 탭에서 프래그먼트만 바뀐 링크를 다시 열어도 새 토큰을 읽습니다.
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  async function submit() {
    if (view === 'pending' || !token.current) return;
    setView('pending');
    setError(null);
    const body: InstagramDmOptOutRequest = { token: token.current };
    try {
      await browserApi<void>(CRELINK_API_PATHS.publicInstagramDmOptOuts, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      token.current = null;
      clearOptOutFragment(window.location, window.history);
      setView('done');
    } catch (caught) {
      const next = viewForError(caught instanceof BrowserApiError ? caught.code : null);
      if (next === 'invalid') {
        token.current = null;
        clearOptOutFragment(window.location, window.history);
      } else setError(describeError(caught));
      setView(next);
    }
  }

  return (
    <main className="public-page narrow-page form-stack">
      <p className="brand-mark">
        <Link href="/">크리링</Link>
      </p>
      <h1>DM 수신 거부</h1>
      {view === 'checking' ? <p role="status">확인 중…</p> : null}
      {view === 'ready' || view === 'pending' || view === 'error' ? (
        <>
          <p>
            크리에이터의 인스타그램 댓글에 대한 자동 DM을 더 받고 싶지 않다면 아래 버튼을 눌러 주세요. 누르기 전에는
            아무것도 바뀌지 않아요.
          </p>
          <p className="section-help">수신 거부하면 이 계정으로는 같은 크리에이터의 자동 DM이 더 가지 않아요.</p>
          <button className="primary" disabled={view === 'pending'} onClick={() => void submit()}>
            {view === 'error' ? '다시 시도' : '수신 거부'}
          </button>
          {view === 'pending' ? <p role="status">처리 중…</p> : null}
          <ActionStatus error={error} />
        </>
      ) : null}
      {view === 'done' ? (
        <div className="empty-state" role="status">
          <h2>수신 거부를 마쳤어요.</h2>
          <p>앞으로 이 계정으로는 자동 DM이 가지 않아요. 이 창은 닫아도 돼요.</p>
        </div>
      ) : null}
      {view === 'invalid' ? (
        <div className="empty-state" role="alert">
          <h2>유효하지 않은 링크예요.</h2>
          <p>링크가 잘못됐거나 일부만 복사됐을 수 있어요. DM에 있던 수신 거부 링크를 다시 열어 주세요.</p>
        </div>
      ) : null}
    </main>
  );
}
