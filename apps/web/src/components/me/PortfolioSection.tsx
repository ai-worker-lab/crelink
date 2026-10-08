'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type PortfolioItemRequest,
  type PortfolioItemView,
  type ReorderRequest,
} from '@crelink/shared';
import { useId, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { draftKey, type PortfolioDraft } from '../../lib/landing-preview';
import { useAction, type ActionState } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { RemoteImage } from '../RemoteImage';
import { useManager } from '../manage/ManagerContext';
import { ImageField } from './ImageField';
import { moveId } from './reorder';

/**
 * `페이지 편집` 포트폴리오 구역 패널: 목록, 순서 변경(위·아래 버튼, 바로 저장), `포트폴리오 추가`.
 * `수정`·`포트폴리오 추가`는 그 항목을 골라 패널을 폼(`PortfolioForm`)으로 바꿉니다. `notice`는 폼에서 돌아올 때 보여 줄 결과 안내입니다.
 */
export function PortfolioSection({ notice: doneNotice }: { notice?: string | null }) {
  const { state, reload, select, isPortfolioDirty } = useManager();
  const { pending, error, notice, run } = useAction();
  const items = state.portfolio;
  const full = items.length >= CRELINK_LIMITS.portfolioItems;

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

  return (
    <>
      <p className="section-help">
        협업·작업 이력을 직접 넣어요. 최대 {CRELINK_LIMITS.portfolioItems}개 ({items.length}/
        {CRELINK_LIMITS.portfolioItems}).
      </p>
      <ActionStatus error={error} notice={notice ?? doneNotice ?? null} />
      {items.length === 0 ? <p className="empty-text">아직 등록한 포트폴리오가 없어요.</p> : null}
      <ul className="edit-list">
        {items.map((item, index) => (
          <li key={item.id} className="item-card">
            <div className="item-body">
              {item.image ? (
                <RemoteImage className="item-thumb" src={item.image.url} alt="" width={64} height={64} />
              ) : null}
              <div className="item-text">
                <h3 className="item-title">{item.title}</h3>
                {item.url ? <p className="url-text">{item.url}</p> : null}
                {item.description ? <p className="item-description">{item.description}</p> : null}
                {isPortfolioDirty(item.id) ? (
                  <p className="badges">
                    <span className="badge dirty-chip">저장 안 함</span>
                  </p>
                ) : null}
              </div>
              <div className="item-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => move(item.id, -1)}
                  disabled={pending || index === 0}
                  aria-label={`${item.title} 위로 이동`}
                >
                  위로
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => move(item.id, 1)}
                  disabled={pending || index === items.length - 1}
                  aria-label={`${item.title} 아래로 이동`}
                >
                  아래로
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => select({ kind: 'portfolio-item', id: item.id })}
                  disabled={pending}
                  aria-label={`${item.title} 수정`}
                >
                  수정
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {full ? (
        <p className="notice-box">포트폴리오는 최대 {CRELINK_LIMITS.portfolioItems}개까지 넣을 수 있어요.</p>
      ) : (
        <button
          type="button"
          className="secondary link-add"
          onClick={() => select({ kind: 'portfolio-item', id: null })}
          disabled={pending}
        >
          포트폴리오 추가
        </button>
      )}
    </>
  );
}

/**
 * 포트폴리오 추가·수정 폼(제목·링크·이미지·설명, 저장·취소·삭제). 입력값은 그 항목의 초안(`portfolioDrafts`)에 두어 미리보기가 바로 그립니다.
 * 편집 패널(`panel`, Esc로 취소)과 하단 시트(`sheet`)가 같은 폼을 씁니다. `취소`는 초안을 버리고, 다른 항목으로 옮긴 뒤 끝난 이미지 업로드도
 * 이 항목의 초안에 붙습니다. 저장·삭제가 끝나면 편집 상태를 다시 읽고 `onDone`을 부릅니다.
 */
export function PortfolioForm({
  item,
  variant,
  action,
  onDone,
  onCancel,
}: {
  item: PortfolioItemView | null;
  variant: 'panel' | 'sheet';
  action: ActionState;
  onDone: (result: string) => void;
  onCancel: () => void;
}) {
  const baseId = useId();
  const { portfolioDrafts, editPortfolioDraft, reload } = useManager();
  const key = draftKey(item?.id ?? null);
  const { pending, error, run } = action;

  const draft = portfolioDrafts.get(key);
  if (!draft) return null;
  const update = (patch: Partial<PortfolioDraft>) => editPortfolioDraft(key, patch);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const payload: PortfolioItemRequest = {
      title: draft.title.trim(),
      url: draft.url.trim() || null,
      imageFileId: draft.image?.fileId ?? null,
      description: draft.description.trim() || null,
    };
    const saved = await run(async () => {
      await browserApi<PortfolioItemView>(
        item ? CRELINK_API_PATHS.mePortfolioItem(item.id) : CRELINK_API_PATHS.mePortfolio,
        { method: item ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      );
      await reload();
    });
    if (saved) onDone(item ? '포트폴리오 항목을 고쳤어요.' : '포트폴리오 항목을 추가했어요.');
  }

  async function remove() {
    if (!item || !window.confirm(`'${item.title}' 항목을 지울까요?`)) return;
    const removed = await run(async () => {
      await browserApi<void>(CRELINK_API_PATHS.mePortfolioItem(item.id), { method: 'DELETE' });
      await reload();
    });
    if (removed) onDone('포트폴리오 항목을 지웠어요.');
  }

  return (
    <form
      className="form-stack edit-form"
      onSubmit={submit}
      aria-label={item ? `${item.title} 포트폴리오 수정` : '새 포트폴리오'}
      onKeyDown={(event) => {
        if (variant === 'panel' && event.key === 'Escape' && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="field">
        <label htmlFor={`${baseId}-title`}>제목 (필수)</label>
        <input
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
      <ImageField label="이미지" value={draft.image} onChange={(image) => update({ image })} disabled={pending} />
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
        <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
          취소
        </button>
        {item ? (
          <button type="button" className="secondary danger" onClick={remove} disabled={pending}>
            삭제
          </button>
        ) : null}
      </div>
    </form>
  );
}
