'use client';

import { CRELINK_API_PATHS, type InstagramDmMediaView } from '@crelink/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserApiError, browserApi, describeError } from '../../../lib/api/browser';
import { formatDate } from '../../../lib/format';
import { RemoteImage } from '../../RemoteImage';

interface MediaPage {
  items: InstagramDmMediaView[];
  nextCursor: string | null;
}

/**
 * 규칙을 붙일 게시물 고르기(`GET /api/me/instagram/media?after=`, 25건씩). 더 보기·빈 상태·오류 재시도를 둡니다.
 * 409 `instagram_reauth_required`면 연결이 끊긴 것이라 `onReauthRequired`로 화면 상태를 바꿉니다.
 * 썸네일은 인스타그램 CDN 주소를 그대로 보여 주고(웹 설정에 CSP 없음), 처음 화면 밖이라 lazy로 둡니다.
 */
export function MediaPicker({
  value,
  takenMediaIds,
  onChange,
  onReauthRequired,
}: {
  value: string;
  takenMediaIds: ReadonlySet<string>;
  onChange: (media: InstagramDmMediaView) => void;
  onReauthRequired: () => void;
}) {
  const [items, setItems] = useState<InstagramDmMediaView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  /** 한 쪽을 읽어 상태에 반영합니다. 상태 변경은 모두 응답 뒤(비동기)에서만 합니다. */
  const fetchPage = useCallback(
    (after: string | null) =>
      browserApi<MediaPage>(
        `${CRELINK_API_PATHS.meInstagramMedia}${after ? `?after=${encodeURIComponent(after)}` : ''}`,
      ).then(
        (page) => {
          if (!alive.current) return;
          setItems((current) => (after ? [...current, ...page.items] : page.items));
          setCursor(page.nextCursor);
          setLoaded(true);
          setLoading(false);
        },
        (caught: unknown) => {
          if (!alive.current) return;
          if (caught instanceof BrowserApiError && caught.code === 'instagram_reauth_required') {
            onReauthRequired();
            return;
          }
          setError(describeError(caught));
          setLoading(false);
        },
      ),
    [onReauthRequired],
  );

  useEffect(() => {
    alive.current = true;
    void fetchPage(null);
    return () => {
      alive.current = false;
    };
  }, [fetchPage]);

  function load(after: string | null) {
    setLoading(true);
    setError(null);
    void fetchPage(after);
  }

  return (
    <div className="ig-media" aria-busy={loading || undefined}>
      {!loaded && loading ? <p className="empty-text">게시물을 불러오는 중이에요…</p> : null}
      {loaded && items.length === 0 ? (
        <p className="empty-text">고를 수 있는 게시물이 없어요. 인스타그램에 게시물을 올린 뒤 다시 열어 주세요.</p>
      ) : null}
      {items.length > 0 ? (
        <ul className="ig-media-list" role="radiogroup" aria-label="게시물 고르기">
          {items.map((media) => {
            const taken = takenMediaIds.has(media.id);
            const selected = value === media.id;
            return (
              <li key={media.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={taken}
                  className={`ig-media-item${selected ? ' is-selected' : ''}`}
                  onClick={() => onChange(media)}
                >
                  <RemoteImage
                    className="ig-media-thumb"
                    src={media.thumbnailUrl}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                  />
                  <span className="ig-media-text">
                    <span className="ig-media-caption">{media.caption || '캡션 없음'}</span>
                    <span className="field-help">
                      {formatDate(media.timestamp)}
                      {taken ? ' · 이미 규칙이 있어요' : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <div className="ig-media-error" role="alert">
          <p className="form-error">{error}</p>
          <button type="button" className="secondary" onClick={() => load(items.length ? cursor : null)}>
            다시 시도
          </button>
        </div>
      ) : null}
      {cursor && !error ? (
        <button type="button" className="secondary" disabled={loading} onClick={() => load(cursor)}>
          {loading ? '불러오는 중…' : '더 보기'}
        </button>
      ) : null}
    </div>
  );
}
