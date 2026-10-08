'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  CRELINK_WEB_PATHS,
  type CreateGuestbookEntryRequest,
  type GuestbookEntryView,
  type GuestbookPage,
  type SetGuestbookEntryHiddenRequest,
} from '@crelink/shared';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { BrowserApiError, browserApi, describeError } from '../../lib/api/browser';
import { formatDateTime } from '../../lib/format';
import { ActionStatus } from '../ActionStatus';
import { DefaultAvatar } from '../DefaultAvatar';
import { RemoteImage } from '../RemoteImage';

type Viewer = GuestbookPage['viewer'];

/** 목록 상태: 첫 쪽을 부르는 중, 그린 뒤, 부르지 못함(다시 시도), 크리에이터가 방명록을 닫음(404 `guestbook_disabled`). */
type Phase = 'loading' | 'ready' | 'failed' | 'closed';

/**
 * 랜딩 방명록 탭 내용(PRD R19). 보는 사람마다 결과가 달라(비밀글·숨김·내 글) SSR 대신 브라우저가 BFF로 부릅니다.
 * 상태와 API 응답의 대응: docs/specs/crelink-guestbook.md `화면 상태와 API 대응`.
 * - 비회원(`viewer.signedIn=false`)은 작성 폼 대신 로그인 안내(`/auth/google?returnTo=/p/{id}#guestbook`).
 * - 내 글(`mine`)은 삭제, 랜딩 크리에이터(`viewer.isOwner`)는 글마다 숨기기·숨김 해제.
 * - 쓰기 요청의 401은 홈으로 보내지 않고(`useAction`과 다름) 로그인 안내로 바꿉니다. 방문자가 보던 랜딩에 남게 하기 위해서입니다.
 * 본문은 텍스트로만 그립니다(HTML 해석 없음).
 */
export function GuestbookPanel({ publicId }: { publicId: string }) {
  const baseId = useId();
  const [phase, setPhase] = useState<Phase>('loading');
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<GuestbookEntryView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer>({ signedIn: false, isOwner: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState('');
  const [secret, setSecret] = useState(false);
  const [posting, setPosting] = useState(false);
  const [bodyInvalid, setBodyInvalid] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 마지막 쓰기·더 보기 요청의 결과 안내. 작성 폼과 목록 사이 한 곳에 둡니다. */
  const [status, setStatus] = useState<{ error?: string; notice?: string }>({});

  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const page = await browserApi<GuestbookPage>(CRELINK_API_PATHS.landingGuestbook(publicId));
        if (!current) return;
        setEntries(page.entries);
        setNextCursor(page.nextCursor);
        setViewer(page.viewer);
        setPhase('ready');
      } catch (caught) {
        if (!current) return;
        if (caught instanceof BrowserApiError && caught.code === 'guestbook_disabled') {
          setPhase('closed');
          return;
        }
        setLoadError(describeError(caught));
        setPhase('failed');
      }
    })();
    return () => {
      current = false;
    };
  }, [publicId, attempt]);

  /** 쓰기 요청 오류를 화면 상태로 바꾸고 안내 문구를 돌려줍니다(없으면 화면 전체가 바뀐 경우). */
  function writeError(caught: unknown): string | undefined {
    if (caught instanceof BrowserApiError) {
      if (caught.code === 'guestbook_disabled') {
        setPhase('closed');
        return undefined;
      }
      if (caught.status === 401) {
        setViewer({ signedIn: false, isOwner: false });
        return '로그인이 끝났어요. 다시 로그인한 뒤 이용해 주세요.';
      }
    }
    return describeError(caught);
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setStatus({});
    try {
      const page = await browserApi<GuestbookPage>(CRELINK_API_PATHS.landingGuestbook(publicId, nextCursor));
      setEntries((current) => [...current, ...page.entries.filter((entry) => !current.some((e) => e.id === entry.id))]);
      setNextCursor(page.nextCursor);
      setViewer(page.viewer);
    } catch (caught) {
      setStatus({ error: writeError(caught) });
    } finally {
      setLoadingMore(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || posting) return;
    setPosting(true);
    setBodyInvalid(false);
    setStatus({});
    const payload: CreateGuestbookEntryRequest = { body, secret };
    try {
      const created = await browserApi<GuestbookEntryView>(CRELINK_API_PATHS.landingGuestbook(publicId), {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setEntries((current) => [created, ...current]);
      setBody('');
      setSecret(false);
      setStatus({ notice: created.secret ? '비밀글을 남겼어요.' : '방명록을 남겼어요.' });
    } catch (caught) {
      if (caught instanceof BrowserApiError && caught.status === 400) setBodyInvalid(true);
      setStatus({ error: writeError(caught) });
    } finally {
      setPosting(false);
    }
  }

  async function remove(entry: GuestbookEntryView) {
    if (!window.confirm('이 방명록 글을 지울까요? 지우면 되돌릴 수 없어요.')) return;
    setBusyId(entry.id);
    setStatus({});
    try {
      await browserApi<void>(CRELINK_API_PATHS.guestbookEntry(entry.id), { method: 'DELETE' });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setStatus({ notice: '방명록 글을 지웠어요.' });
    } catch (caught) {
      setStatus({ error: writeError(caught) });
    } finally {
      setBusyId(null);
    }
  }

  async function setHidden(entry: GuestbookEntryView, hidden: boolean) {
    setBusyId(entry.id);
    setStatus({});
    const payload: SetGuestbookEntryHiddenRequest = { hidden };
    try {
      const saved = await browserApi<GuestbookEntryView>(CRELINK_API_PATHS.guestbookEntryHidden(entry.id), {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setEntries((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setStatus({ notice: hidden ? '글을 숨겼어요. 작성자와 나만 볼 수 있어요.' : '숨김을 풀었어요.' });
    } catch (caught) {
      setStatus({ error: writeError(caught) });
    } finally {
      setBusyId(null);
    }
  }

  if (phase === 'loading') {
    return (
      <p className="empty-text" role="status">
        방명록을 불러오는 중…
      </p>
    );
  }
  if (phase === 'closed') {
    return (
      <div className="empty-state" role="status">
        <p className="guestbook-state-title">방명록을 닫은 페이지예요.</p>
        <p>크리에이터가 방명록을 닫아 지금은 글을 보거나 남길 수 없어요.</p>
      </div>
    );
  }
  if (phase === 'failed') {
    return (
      <div className="empty-state" role="alert">
        <span className="error-badge" aria-hidden="true">
          !
        </span>
        <p className="guestbook-state-title">방명록을 불러오지 못했어요.</p>
        <p>{loadError}</p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setPhase('loading');
            setAttempt((value) => value + 1);
          }}
        >
          다시 시도
        </button>
      </div>
    );
  }

  const bodyId = `${baseId}-body`;
  const countId = `${baseId}-count`;
  return (
    <div className="guestbook">
      {viewer.signedIn ? (
        <form className="guestbook-form" onSubmit={submit} aria-label="방명록 남기기">
          <div className="field">
            <label htmlFor={bodyId}>방명록 글</label>
            <textarea
              id={bodyId}
              className="input"
              rows={4}
              maxLength={CRELINK_LIMITS.guestbookBodyMax}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setBodyInvalid(false);
              }}
              aria-describedby={countId}
              aria-invalid={bodyInvalid || undefined}
              placeholder="크리에이터에게 남기고 싶은 말을 적어 주세요."
            />
            <p className="field-help guestbook-count" id={countId}>
              {body.length}/{CRELINK_LIMITS.guestbookBodyMax}자
            </p>
          </div>
          <div className="guestbook-form-row">
            <span className="guestbook-secret">
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={secret}
                  onChange={(event) => setSecret(event.target.checked)}
                  aria-describedby={`${baseId}-secret-help`}
                />
                비밀글
              </label>
              <span className="field-help" id={`${baseId}-secret-help`}>
                크리에이터와 나만 봐요
              </span>
            </span>
            <button type="submit" className="primary" disabled={posting || !body.trim()}>
              {posting ? '남기는 중…' : '남기기'}
            </button>
          </div>
        </form>
      ) : (
        <div className="empty-state guestbook-signin">
          <p>방명록은 로그인한 회원만 남길 수 있어요. 읽기는 누구나 할 수 있어요.</p>
          {/* route handler로 가는 전체 이동이라 next/link 대신 a를 씁니다. */}
          <a className="primary" href={CRELINK_WEB_PATHS.googleLogin(CRELINK_WEB_PATHS.landingGuestbook(publicId))}>
            로그인하고 남기기
          </a>
        </div>
      )}
      <ActionStatus error={status.error} notice={status.notice} />
      {entries.length === 0 ? (
        <p className="empty-text">아직 방명록이 없어요. 첫 방명록을 남겨 주세요.</p>
      ) : (
        <ul className="guestbook-list" aria-label="방명록 글 목록">
          {entries.map((entry) => (
            <GuestbookEntry
              key={entry.id}
              entry={entry}
              authorId={`${baseId}-${entry.id}-author`}
              isOwner={viewer.isOwner}
              busy={busyId === entry.id}
              onRemove={remove}
              onSetHidden={setHidden}
            />
          ))}
        </ul>
      )}
      {nextCursor ? (
        <button type="button" className="secondary guestbook-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? '불러오는 중…' : '더 보기'}
        </button>
      ) : null}
    </div>
  );
}

/** 방명록 글 한 개: 작성자 사진·이름(없으면 '크리링 회원')·날짜·본문, 비밀글·숨김 표시, 삭제(내 글)·숨기기(크리에이터). */
function GuestbookEntry({
  entry,
  authorId,
  isOwner,
  busy,
  onRemove,
  onSetHidden,
}: {
  entry: GuestbookEntryView;
  authorId: string;
  isOwner: boolean;
  busy: boolean;
  onRemove: (entry: GuestbookEntryView) => void;
  onSetHidden: (entry: GuestbookEntryView, hidden: boolean) => void;
}) {
  const name = entry.author.displayName ?? '크리링 회원';
  return (
    <li className={entry.hidden ? 'guestbook-entry is-hidden' : 'guestbook-entry'}>
      <div className="guestbook-entry-head">
        {entry.author.avatarUrl ? (
          <RemoteImage className="guestbook-avatar" src={entry.author.avatarUrl} alt="" width={40} height={40} />
        ) : (
          <DefaultAvatar className="guestbook-avatar" />
        )}
        <span className="guestbook-meta">
          <span className="guestbook-author" id={authorId}>
            {name}
          </span>
          <time className="guestbook-date" dateTime={entry.createdAt}>
            {formatDateTime(entry.createdAt)}
          </time>
        </span>
      </div>
      {entry.secret || entry.hidden ? (
        <p className="badges">
          {entry.secret ? <span className="badge">비밀글</span> : null}
          {entry.hidden ? <span className="badge">숨김</span> : null}
        </p>
      ) : null}
      <p className="guestbook-body">{entry.body}</p>
      {entry.mine || isOwner ? (
        <div className="button-row">
          {isOwner ? (
            <button
              type="button"
              className="secondary"
              aria-describedby={authorId}
              disabled={busy}
              onClick={() => onSetHidden(entry, !entry.hidden)}
            >
              {entry.hidden ? '숨김 해제' : '숨기기'}
            </button>
          ) : null}
          {entry.mine ? (
            <button
              type="button"
              className="secondary danger"
              aria-describedby={authorId}
              disabled={busy}
              onClick={() => onRemove(entry)}
            >
              삭제
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
