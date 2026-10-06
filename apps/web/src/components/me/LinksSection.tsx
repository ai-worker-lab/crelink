'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type CreateLinkRequest,
  type ImageRef,
  type LinkLimits,
  type LinkView,
  type ReorderRequest,
  type UpdateLinkRequest,
} from '@crelink/shared';
import { useId, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { Favicon } from '../Favicon';
import { RemoteImage } from '../RemoteImage';
import { ImageField } from './ImageField';
import { moveId } from './reorder';

/** 외부 링크 목록(리스트형 구역): 추가·수정·삭제·숨기기·순서 변경과 보이는 링크 한도. */
export function LinksSection({
  links,
  limits,
  reload,
}: {
  links: LinkView[];
  limits: LinkLimits;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const { pending, error, notice, run } = useAction();
  const visibleFull = limits.visibleUsed >= limits.visibleMax;
  const totalFull = limits.totalUsed >= limits.totalMax;

  async function save(payload: CreateLinkRequest, id: string | null): Promise<boolean> {
    const saved = await run(
      async () => {
        await browserApi<LinkView>(id ? CRELINK_API_PATHS.meLink(id) : CRELINK_API_PATHS.meLinks, {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        await reload();
      },
      id ? '링크를 고쳤어요.' : '링크를 추가했어요.',
    );
    if (saved) setEditing(null);
    return saved;
  }

  async function setHidden(link: LinkView, hidden: boolean) {
    const payload: UpdateLinkRequest = { hidden };
    await run(
      async () => {
        await browserApi<LinkView>(CRELINK_API_PATHS.meLink(link.id), {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        await reload();
      },
      hidden ? `'${link.title}' 링크를 숨겼어요.` : `'${link.title}' 링크를 다시 보이게 했어요.`,
    );
  }

  async function remove(link: LinkView) {
    if (!window.confirm(`'${link.title}' 링크를 지울까요?`)) return;
    await run(async () => {
      await browserApi<void>(CRELINK_API_PATHS.meLink(link.id), { method: 'DELETE' });
      await reload();
    }, '링크를 지웠어요.');
  }

  async function move(id: string, offset: -1 | 1) {
    const payload: ReorderRequest = { ids: moveId(links, id, offset) };
    await run(async () => {
      await browserApi<LinkView[]>(CRELINK_API_PATHS.meLinksOrder, { method: 'PUT', body: JSON.stringify(payload) });
      await reload();
    }, '순서를 바꿨어요.');
  }

  return (
    <section className="card" aria-labelledby="links-title">
      <div className="section-head">
        <h2 id="links-title">외부 링크</h2>
        <p className={`limit-badge${visibleFull ? ' limit-full' : ''}`}>
          보이는 링크 {limits.visibleUsed}/{limits.visibleMax}
        </p>
      </div>
      <p className="section-help">
        방문자 화면에 위에서부터 차례로 보여요. 숨긴 링크와 차단된 링크는 한도에 들어가지 않아요. 숨긴 링크 포함 전체{' '}
        {limits.totalUsed}/{limits.totalMax}개.
      </p>
      {links.length === 0 ? <p className="empty-text">아직 추가한 링크가 없어요.</p> : null}
      <ul className="edit-list">
        {links.map((link, index) => (
          <li key={link.id} className={`item-card${link.blocked ? ' item-blocked' : ''}`}>
            {editing === link.id ? (
              <LinkForm
                initial={link}
                pending={pending}
                onSubmit={(payload) => save(payload, link.id)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="item-body">
                <Favicon key={link.faviconUrl} src={link.faviconUrl} />
                <div className="item-text">
                  <h3 className="item-title">{link.title}</h3>
                  <p className="url-text">{link.url}</p>
                  {link.description ? <p className="item-description">{link.description}</p> : null}
                  <p className="badges">
                    {link.hidden ? <span className="badge">숨김</span> : null}
                    {link.blocked ? <span className="badge badge-danger">차단됨</span> : null}
                  </p>
                  {link.blocked ? (
                    <p className="blocked-reason">
                      크리링이 이 링크를 차단해 방문자에게 보이지 않아요.
                      {link.blockedReason ? ` 사유: ${link.blockedReason}` : ''}
                    </p>
                  ) : null}
                </div>
                {link.thumbnail ? (
                  <RemoteImage className="item-thumb" src={link.thumbnail.url} alt="" width={64} height={64} />
                ) : null}
                <div className="item-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => move(link.id, -1)}
                    disabled={pending || index === 0}
                    aria-label={`${link.title} 위로 이동`}
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => move(link.id, 1)}
                    disabled={pending || index === links.length - 1}
                    aria-label={`${link.title} 아래로 이동`}
                  >
                    아래로
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditing(link.id)}
                    disabled={pending}
                    aria-label={`${link.title} 수정`}
                  >
                    수정
                  </button>
                  {!link.hidden ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setHidden(link, true)}
                      disabled={pending}
                      aria-label={`${link.title} 숨기기`}
                    >
                      숨기기
                    </button>
                  ) : visibleFull && !link.blocked ? (
                    <span className="inline-notice">한도가 차서 다시 보이게 할 수 없어요</span>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setHidden(link, false)}
                      disabled={pending}
                      aria-label={`${link.title} 보이기`}
                    >
                      보이기
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary danger"
                    onClick={() => remove(link)}
                    disabled={pending}
                    aria-label={`${link.title} 삭제`}
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
          <LinkForm
            initial={null}
            pending={pending}
            onSubmit={(payload) => save(payload, null)}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : totalFull ? (
        <p className="notice-box">
          숨긴 링크를 포함해 링크는 최대 {limits.totalMax}개까지 둘 수 있어요. 쓰지 않는 링크를 지운 뒤 추가해 주세요.
        </p>
      ) : visibleFull ? (
        <p className="notice-box">
          보이는 링크 한도({limits.visibleMax}개)에 도달했어요. 다른 링크를 숨기거나 지우면 새 링크를 추가할 수 있어요.
          한도를 늘리려면 크리링 운영자에게 문의해 주세요.
        </p>
      ) : (
        <button type="button" className="secondary" onClick={() => setEditing('new')} disabled={pending}>
          링크 추가
        </button>
      )}
      <ActionStatus error={error} notice={notice} />
    </section>
  );
}

function LinkForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: LinkView | null;
  pending: boolean;
  onSubmit: (payload: CreateLinkRequest) => Promise<boolean>;
  onCancel: () => void;
}) {
  const baseId = useId();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [thumbnail, setThumbnail] = useState<ImageRef | null>(initial?.thumbnail ?? null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || null,
      thumbnailFileId: thumbnail?.fileId ?? null,
    });
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <h3 className="form-title">{initial ? '링크 수정' : '새 링크'}</h3>
      <div className="field">
        <label htmlFor={`${baseId}-title`}>표시 이름 (필수)</label>
        <input
          id={`${baseId}-title`}
          className="input"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={CRELINK_LIMITS.linkTitleMax}
          disabled={pending}
        />
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-url`}>주소 (필수)</label>
        <input
          id={`${baseId}-url`}
          className="input"
          type="url"
          inputMode="url"
          required
          placeholder="https://"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          maxLength={CRELINK_LIMITS.urlMax}
          disabled={pending}
        />
        <p className="field-help">http:// 또는 https://로 시작하는 주소만 저장할 수 있어요.</p>
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-description`}>설명</label>
        <textarea
          id={`${baseId}-description`}
          className="input"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={CRELINK_LIMITS.linkDescriptionMax}
          disabled={pending}
        />
        <p className="field-help">
          {description.length}/{CRELINK_LIMITS.linkDescriptionMax}자
        </p>
      </div>
      <ImageField label="썸네일" value={thumbnail} onChange={setThumbnail} disabled={pending} />
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
