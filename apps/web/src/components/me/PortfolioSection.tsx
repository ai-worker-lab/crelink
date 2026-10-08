'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type PortfolioItemRequest,
  type PortfolioItemView,
  type ReorderRequest,
} from '@crelink/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { portfolioDraftOf, type PortfolioDraft } from '../../lib/landing-preview';
import { useAction } from '../../lib/use-action';
import { useWideLayout } from '../../lib/use-wide-layout';
import { ActionStatus } from '../ActionStatus';
import { RemoteImage } from '../RemoteImage';
import { EditSheet } from '../manage/EditSheet';
import { useManager } from '../manage/ManagerContext';
import { ImageField } from './ImageField';
import { moveId } from './reorder';

/**
 * 포트폴리오·협업 이력: 추가·수정·삭제(확인)·순서 변경(위·아래 버튼, 바로 저장). 추가·수정 폼은 넓은 화면에서 행 아래 펼침,
 * 좁은 화면에서 하단 시트이고, 입력은 관리 화면 초안(`portfolioDraft`)으로 두어 미리보기가 바로 그립니다.
 */
export function PortfolioSection() {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const { state, reload, portfolioDraft, setPortfolioDraft, dirty } = useManager();
  const wide = useWideLayout();
  const { pending, error, notice, run, setError, setNotice } = useAction();
  /** 폼을 열 때마다 늘어나는 번호(폼 구성 요소의 key). 닫힌 폼의 늦은 업로드 결과가 새 폼에 붙지 않게 합니다. */
  const [formSession, setFormSession] = useState(0);
  const items = state.portfolio;
  const full = items.length >= CRELINK_LIMITS.portfolioItems;
  const formItem = portfolioDraft?.id ? (items.find((item) => item.id === portfolioDraft.id) ?? null) : null;
  // 고치던 항목이 사라졌으면 폼을 그리지 않습니다.
  const formOpen = portfolioDraft !== null && (portfolioDraft.id === null || formItem !== null);

  function openForm(item: PortfolioItemView | null, opener: HTMLElement) {
    if (item && portfolioDraft?.id === item.id) {
      closeForm();
      return;
    }
    setError(null);
    setNotice(null);
    openerRef.current = opener;
    setFormSession((session) => session + 1);
    setPortfolioDraft(portfolioDraftOf(item));
  }

  function closeForm() {
    const opener = openerRef.current;
    const wasNew = portfolioDraft?.id === null;
    openerRef.current = null;
    setPortfolioDraft(null);
    requestAnimationFrame(() => {
      const target = wasNew ? addButtonRef.current : opener;
      if (target?.isConnected) target.focus();
      else headingRef.current?.focus();
    });
  }

  async function save(payload: PortfolioItemRequest, id: string | null) {
    const saved = await run(
      async () => {
        await browserApi<PortfolioItemView>(
          id ? CRELINK_API_PATHS.mePortfolioItem(id) : CRELINK_API_PATHS.mePortfolio,
          {
            method: id ? 'PATCH' : 'POST',
            body: JSON.stringify(payload),
          },
        );
        await reload();
      },
      id ? '포트폴리오 항목을 고쳤어요.' : '포트폴리오 항목을 추가했어요.',
    );
    if (saved) closeForm();
  }

  async function remove(item: PortfolioItemView) {
    if (!window.confirm(`'${item.title}' 항목을 지울까요?`)) return;
    const removed = await run(async () => {
      await browserApi<void>(CRELINK_API_PATHS.mePortfolioItem(item.id), { method: 'DELETE' });
      await reload();
    }, '포트폴리오 항목을 지웠어요.');
    if (removed && portfolioDraft?.id === item.id) closeForm();
  }

  async function move(id: string, offset: -1 | 1) {
    const payload: ReorderRequest = { ids: moveId(items, id, offset) };
    await run(async () => {
      await browserApi<PortfolioItemView[]>(CRELINK_API_PATHS.mePortfolioOrder, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await reload();
    }, '순서를 바꿨어요.');
  }

  const form = (variant: 'inline' | 'sheet') => (
    <PortfolioForm
      key={formSession}
      item={formItem}
      variant={variant}
      pending={pending}
      error={error}
      onSubmit={(payload) => save(payload, formItem?.id ?? null)}
      onRemove={formItem ? () => remove(formItem) : undefined}
      onCancel={closeForm}
    />
  );

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          포트폴리오
        </h2>
        {dirty.portfolio ? <span className="badge dirty-chip">저장 안 함</span> : null}
      </div>
      <p className="section-help">
        협업·작업 이력을 직접 넣어요. 최대 {CRELINK_LIMITS.portfolioItems}개 ({items.length}/
        {CRELINK_LIMITS.portfolioItems}).
      </p>
      {items.length === 0 && !formOpen ? <p className="empty-text">아직 등록한 포트폴리오가 없어요.</p> : null}
      <ul className="edit-list">
        {items.map((item, index) => {
          const expanded = wide && formOpen && portfolioDraft?.id === item.id;
          return (
            <li key={item.id} className={expanded ? 'item-card is-expanded' : 'item-card'}>
              <div className="item-body">
                {item.image ? (
                  <RemoteImage className="item-thumb" src={item.image.url} alt="" width={64} height={64} />
                ) : null}
                <div className="item-text">
                  <h3 className="item-title">{item.title}</h3>
                  {item.url ? <p className="url-text">{item.url}</p> : null}
                  {item.description ? <p className="item-description">{item.description}</p> : null}
                </div>
                <div className="item-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => move(item.id, -1)}
                    disabled={pending || formOpen || index === 0}
                    aria-label={`${item.title} 위로 이동`}
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => move(item.id, 1)}
                    disabled={pending || formOpen || index === items.length - 1}
                    aria-label={`${item.title} 아래로 이동`}
                  >
                    아래로
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={(event) => openForm(item, event.currentTarget)}
                    disabled={pending}
                    aria-label={`${item.title} ${expanded ? '접기' : '수정'}`}
                    aria-expanded={wide ? expanded : undefined}
                    aria-haspopup={wide ? undefined : 'dialog'}
                  >
                    {expanded ? '접기' : '수정'}
                  </button>
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() => remove(item)}
                    disabled={pending}
                    aria-label={`${item.title} 삭제`}
                  >
                    삭제
                  </button>
                </div>
              </div>
              {expanded ? <div className="item-edit-form">{form('inline')}</div> : null}
            </li>
          );
        })}
      </ul>
      {wide && formOpen && portfolioDraft?.id === null ? (
        <div className="item-card">{form('inline')}</div>
      ) : full ? (
        <p className="notice-box">포트폴리오는 최대 {CRELINK_LIMITS.portfolioItems}개까지 넣을 수 있어요.</p>
      ) : (
        <button
          type="button"
          ref={addButtonRef}
          className="secondary"
          onClick={(event) => openForm(null, event.currentTarget)}
          disabled={pending}
          aria-haspopup={wide ? undefined : 'dialog'}
        >
          포트폴리오 추가
        </button>
      )}
      {/* 폼이 열려 있으면 오류는 폼 안(시트 포함)에 보여 줍니다. */}
      <ActionStatus error={formOpen ? null : error} notice={notice} />
      {!wide && formOpen ? (
        <EditSheet
          title={formItem ? '포트폴리오 항목 수정' : '새 포트폴리오 항목'}
          pending={pending}
          onDismiss={closeForm}
        >
          {form('sheet')}
        </EditSheet>
      ) : null}
    </section>
  );
}

/** 포트폴리오 추가·수정 폼(제목·링크·이미지·설명). 펼침(`inline`: 제목·취소)과 하단 시트(`sheet`)가 같은 폼을 씁니다. */
function PortfolioForm({
  item,
  variant,
  pending,
  error,
  onSubmit,
  onRemove,
  onCancel,
}: {
  item: PortfolioItemView | null;
  variant: 'inline' | 'sheet';
  pending: boolean;
  error: string | null;
  onSubmit: (payload: PortfolioItemRequest) => Promise<void>;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const baseId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  /** 이 폼(한 번 연 것)이 아직 열려 있는지. 닫히거나 다른 폼으로 바뀐 뒤 끝난 이미지 업로드는 버립니다. */
  const opened = useRef(false);
  const { portfolioDraft, setPortfolioDraft } = useManager();

  useEffect(() => {
    opened.current = true;
    return () => {
      opened.current = false;
    };
  }, []);

  useEffect(() => {
    // 시트는 showModal() 뒤에 EditSheet가 [data-autofocus]로 옮깁니다.
    if (variant === 'inline') titleInputRef.current?.focus();
  }, [variant]);

  if (!portfolioDraft) return null;
  const draft = portfolioDraft;
  const update = (patch: Partial<PortfolioDraft>) =>
    setPortfolioDraft((current) => (current ? { ...current, ...patch } : current));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      title: draft.title.trim(),
      url: draft.url.trim() || null,
      imageFileId: draft.image?.fileId ?? null,
      description: draft.description.trim() || null,
    });
  }

  const headingId = `${baseId}-heading`;
  return (
    <form
      className="form-stack edit-form"
      onSubmit={submit}
      aria-labelledby={variant === 'inline' ? headingId : undefined}
      onKeyDown={(event) => {
        if (variant === 'inline' && event.key === 'Escape' && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      {variant === 'inline' ? (
        <h3 id={headingId} className="form-title">
          {item ? '포트폴리오 항목 수정' : '새 포트폴리오 항목'}
        </h3>
      ) : null}
      <div className="field">
        <label htmlFor={`${baseId}-title`}>제목 (필수)</label>
        <input
          ref={titleInputRef}
          id={`${baseId}-title`}
          className="input"
          data-autofocus
          required
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          maxLength={CRELINK_LIMITS.portfolioTitleMax}
          disabled={pending}
        />
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-url`}>링크</label>
        <input
          id={`${baseId}-url`}
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={draft.url}
          onChange={(event) => update({ url: event.target.value })}
          maxLength={CRELINK_LIMITS.urlMax}
          disabled={pending}
        />
      </div>
      <ImageField
        label="이미지"
        value={draft.image}
        onChange={(image) => {
          if (opened.current) update({ image });
        }}
        disabled={pending}
      />
      <div className="field">
        <label htmlFor={`${baseId}-description`}>설명</label>
        <textarea
          id={`${baseId}-description`}
          className="input"
          rows={3}
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          maxLength={CRELINK_LIMITS.portfolioDescriptionMax}
          disabled={pending}
        />
        <p className="field-help">
          {draft.description.length}/{CRELINK_LIMITS.portfolioDescriptionMax}자
        </p>
      </div>
      <ActionStatus error={error} />
      <div className="form-actions edit-form-actions">
        <button type="submit" className="primary" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </button>
        {variant === 'inline' ? (
          <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
            취소
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" className="secondary danger" onClick={onRemove} disabled={pending}>
            삭제
          </button>
        ) : null}
      </div>
    </form>
  );
}
