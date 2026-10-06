'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type ImageRef,
  type PortfolioItemRequest,
  type PortfolioItemView,
  type ReorderRequest,
} from '@crelink/shared';
import { useId, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { RemoteImage } from '../RemoteImage';
import { ImageField } from './ImageField';
import { moveId } from './reorder';

/** 포트폴리오·협업 이력: 추가·수정·삭제·순서 변경(위·아래 버튼). */
export function PortfolioSection({ items, reload }: { items: PortfolioItemView[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const { pending, error, notice, run } = useAction();
  const full = items.length >= CRELINK_LIMITS.portfolioItems;

  async function save(payload: PortfolioItemRequest, id: string | null): Promise<boolean> {
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
    if (saved) setEditing(null);
    return saved;
  }

  async function remove(item: PortfolioItemView) {
    if (!window.confirm(`'${item.title}' 항목을 지울까요?`)) return;
    await run(async () => {
      await browserApi<void>(CRELINK_API_PATHS.mePortfolioItem(item.id), { method: 'DELETE' });
      await reload();
    }, '포트폴리오 항목을 지웠어요.');
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

  return (
    <section className="card" aria-labelledby="portfolio-title">
      <h2 id="portfolio-title">포트폴리오</h2>
      <p className="section-help">
        협업·작업 이력을 직접 넣어요. 최대 {CRELINK_LIMITS.portfolioItems}개 ({items.length}/
        {CRELINK_LIMITS.portfolioItems}).
      </p>
      {items.length === 0 ? <p className="empty-text">아직 등록한 포트폴리오가 없어요.</p> : null}
      <ul className="edit-list">
        {items.map((item, index) => (
          <li key={item.id} className="item-card">
            {editing === item.id ? (
              <PortfolioForm
                initial={item}
                pending={pending}
                onSubmit={(payload) => save(payload, item.id)}
                onCancel={() => setEditing(null)}
              />
            ) : (
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
                    onClick={() => setEditing(item.id)}
                    disabled={pending}
                    aria-label={`${item.title} 수정`}
                  >
                    수정
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
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? (
        <div className="item-card">
          <PortfolioForm
            initial={null}
            pending={pending}
            onSubmit={(payload) => save(payload, null)}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : full ? (
        <p className="notice-box">포트폴리오는 최대 {CRELINK_LIMITS.portfolioItems}개까지 넣을 수 있어요.</p>
      ) : (
        <button type="button" className="secondary" onClick={() => setEditing('new')} disabled={pending}>
          포트폴리오 추가
        </button>
      )}
      <ActionStatus error={error} notice={notice} />
    </section>
  );
}

function PortfolioForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: PortfolioItemView | null;
  pending: boolean;
  onSubmit: (payload: PortfolioItemRequest) => Promise<boolean>;
  onCancel: () => void;
}) {
  const baseId = useId();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [image, setImage] = useState<ImageRef | null>(initial?.image ?? null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      title: title.trim(),
      url: url.trim() || null,
      imageFileId: image?.fileId ?? null,
      description: description.trim() || null,
    });
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <h3 className="form-title">{initial ? '포트폴리오 항목 수정' : '새 포트폴리오 항목'}</h3>
      <div className="field">
        <label htmlFor={`${baseId}-title`}>제목 (필수)</label>
        <input
          id={`${baseId}-title`}
          className="input"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
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
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          maxLength={CRELINK_LIMITS.urlMax}
          disabled={pending}
        />
      </div>
      <ImageField label="이미지" value={image} onChange={setImage} disabled={pending} />
      <div className="field">
        <label htmlFor={`${baseId}-description`}>설명</label>
        <textarea
          id={`${baseId}-description`}
          className="input"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={CRELINK_LIMITS.portfolioDescriptionMax}
          disabled={pending}
        />
        <p className="field-help">
          {description.length}/{CRELINK_LIMITS.portfolioDescriptionMax}자
        </p>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
          취소
        </button>
      </div>
    </form>
  );
}
