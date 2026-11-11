'use client';

import {
  CRELINK_API_PATHS,
  INSTAGRAM_DM_LIMITS,
  type InstagramDmDeliveryView,
  type InstagramDmRuleView,
} from '@crelink/shared';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { BrowserApiError, browserApi, describeError } from '../../../lib/api/browser';
import { formatDateTime } from '../../../lib/format';
import { ErrorPanel } from '../../ErrorPanel';
import { managerHref } from '../menu';
import { appendDeliveries, deliveryQuery, deliveryStatusLabel, type DeliveryPage } from './state';

/** 기존 규칙 카드와 목록 스타일을 사용하는 소유자 전용 발송 내역입니다. */
export function InstagramDeliveries({ publicId }: { publicId: string }) {
  const headingId = useId();
  const filterId = useId();
  const [forbidden, setForbidden] = useState(false);
  const [rule, setRule] = useState('');
  const [rules, setRules] = useState<InstagramDmRuleView[] | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [reloadRules, setReloadRules] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    browserApi<{ rules: InstagramDmRuleView[] }>(CRELINK_API_PATHS.meInstagramRules, {
      signal: controller.signal,
    }).then(
      (data) => {
        if (active) setRules(data.rules);
      },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof BrowserApiError && caught.status === 403) setForbidden(true);
        else setRulesError(describeError(caught));
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadRules]);

  if (forbidden) {
    return (
      <ErrorPanel
        title="소유자만 쓸 수 있어요."
        message="인스타그램 자동 DM은 페이지 소유자만 연결하고 설정할 수 있어요."
        action={{ href: managerHref(publicId, ''), label: '페이지 편집으로' }}
      />
    );
  }

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <div>
          <h1 id={headingId} className="card-title">
            발송 내역
          </h1>
          <p className="card-subtitle">
            자동 DM 발송 상태를 최신순으로 {INSTAGRAM_DM_LIMITS.deliveryPageSize}건씩 확인해요.
          </p>
        </div>
        <Link className="secondary" href={managerHref(publicId, 'instagram')}>
          설정으로
        </Link>
      </div>
      <div className="field">
        <label htmlFor={filterId}>규칙</label>
        <select
          id={filterId}
          className="input"
          value={rule}
          onChange={(event) => setRule(event.target.value)}
          disabled={rules === null}
        >
          <option value="">전체 규칙</option>
          {(rules ?? []).map((item) => (
            <option key={item.publicId} value={item.publicId}>
              {item.matchAllComments ? '모든 댓글' : item.keyword} · {item.mediaCaptionPreview || '캡션 없음'}
            </option>
          ))}
        </select>
        {rulesError ? (
          <div role="alert" className="ig-media-error">
            <p className="form-error">규칙 목록을 불러오지 못했어요. {rulesError}</p>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setRulesError(null);
                setReloadRules((value) => value + 1);
              }}
            >
              다시 시도
            </button>
          </div>
        ) : null}
      </div>
      <DeliveryList key={rule} rule={rule} onForbidden={setForbidden} />
    </section>
  );
}

function DeliveryList({ rule, onForbidden }: { rule: string; onForbidden: (value: boolean) => void }) {
  const [items, setItems] = useState<InstagramDmDeliveryView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<{ cursor: string | null; attempt: number }>({ cursor: null, attempt: 0 });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    browserApi<DeliveryPage>(`${CRELINK_API_PATHS.meInstagramDeliveries}${deliveryQuery(rule, request.cursor)}`, {
      signal: controller.signal,
    }).then(
      (page) => {
        if (!active) return;
        setItems((current) => (request.cursor ? appendDeliveries(current, page.items) : page.items));
        setNextCursor(page.nextCursor);
        setLoaded(true);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        if (caught instanceof BrowserApiError && caught.status === 403) onForbidden(true);
        else setError(describeError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [rule, request, onForbidden]);

  function load(cursor: string | null) {
    if (loading) return;
    setLoading(true);
    setError(null);
    setRequest((current) => ({ cursor, attempt: current.attempt + 1 }));
  }

  return (
    <div className="ig-media" aria-busy={loading}>
      {loading ? (
        <p className="visually-hidden" role="status">
          발송 내역을 불러오는 중이에요.
        </p>
      ) : null}
      {!loaded && loading ? (
        <div className="skeleton-menu" aria-hidden="true">
          <span className="skeleton-bar" />
          <span className="skeleton-bar" />
          <span className="skeleton-bar" />
        </div>
      ) : null}
      {loaded && items.length === 0 ? (
        <p className="empty-text">
          {rule
            ? '이 규칙의 발송 내역이 아직 없어요.'
            : '발송 내역이 아직 없어요. 키워드 댓글에 자동 DM을 보내면 여기에 보여요.'}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="edit-list channel-list" aria-label="발송 내역">
          {items.map((item) => (
            <li key={item.id} className="item-card ig-rule">
              <div className="ig-rule-main">
                <strong className="ig-rule-message">{item.matchAllComments ? '모든 댓글' : item.keyword}</strong>
                <p className="ig-rule-media">{item.mediaPreview || '캡션 없음'}</p>
                <p className="field-help">
                  접수 <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                </p>
                {item.sentAt ? (
                  <p className="field-help">
                    발송 <time dateTime={item.sentAt}>{formatDateTime(item.sentAt)}</time>
                  </p>
                ) : null}
              </div>
              <span className="ig-label">{deliveryStatusLabel(item.status)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <div className="ig-media-error" role="alert">
          <p className="form-error">발송 내역을 불러오지 못했어요. {error}</p>
          <button type="button" className="secondary" disabled={loading} onClick={() => load(request.cursor)}>
            다시 시도
          </button>
        </div>
      ) : null}
      {nextCursor && !error ? (
        <button type="button" className="secondary" disabled={loading} onClick={() => load(nextCursor)}>
          {loading ? '불러오는 중…' : '더 보기'}
        </button>
      ) : null}
    </div>
  );
}
