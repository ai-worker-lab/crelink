'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type CreateLinkRequest,
  type ImageRef,
  type LinkView,
} from '@crelink/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { ImageField } from '../me/ImageField';

/**
 * 링크 추가·수정 하단 시트. 네이티브 `<dialog>`를 `showModal()`로 열어 바깥을 비활성(inert)으로 만들고 포커스를 가둡니다.
 * Esc·배경 누르기·닫기 버튼으로 닫히며, 열면 표시 이름 입력에 포커스를 둡니다. 닫힌 뒤 포커스 복귀는 여는 쪽이 맡습니다.
 * 저장·삭제가 끝나면 `onChanged`(편집 상태 다시 읽기)를 기다린 뒤 결과 안내와 함께 닫습니다.
 */
export function LinkSheet({
  link,
  onChanged,
  onClose,
}: {
  /** 수정할 링크. null이면 새 링크 추가. */
  link: LinkView | null;
  onChanged: () => Promise<void>;
  /** 시트가 닫힌 뒤 불립니다. 저장·삭제로 닫혔으면 결과 안내 문구를 넘깁니다. */
  onClose: (result: string | null) => void;
}) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<string | null>(null);
  const pressedBackdrop = useRef(false);
  const { pending, error, run } = useAction();
  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [description, setDescription] = useState(link?.description ?? '');
  const [thumbnail, setThumbnail] = useState<ImageRef | null>(link?.thumbnail ?? null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    titleInputRef.current?.focus();
  }, []);

  function close(result: string | null) {
    resultRef.current = result;
    dialogRef.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: CreateLinkRequest = {
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || null,
      thumbnailFileId: thumbnail?.fileId ?? null,
    };
    const saved = await run(async () => {
      await browserApi<LinkView>(link ? CRELINK_API_PATHS.meLink(link.id) : CRELINK_API_PATHS.meLinks, {
        method: link ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await onChanged();
    });
    if (saved) close(link ? `'${payload.title}' 링크를 고쳤어요.` : `'${payload.title}' 링크를 추가했어요.`);
  }

  async function remove() {
    if (!link || !window.confirm(`'${link.title}' 링크를 지울까요? 지우면 되돌릴 수 없어요.`)) return;
    const removed = await run(async () => {
      await browserApi<void>(CRELINK_API_PATHS.meLink(link.id), { method: 'DELETE' });
      await onChanged();
    });
    if (removed) close(`'${link.title}' 링크를 지웠어요.`);
  }

  const headingId = `${baseId}-heading`;
  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={headingId}
      onCancel={(event) => {
        // 저장 중에는 Esc로 닫지 않습니다(결과 안내를 잃지 않도록).
        if (pending) event.preventDefault();
      }}
      onClose={() => onClose(resultRef.current)}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // 시트 바깥(배경)을 눌렀다 뗀 경우만 닫습니다. 입력 안에서 끌다가 바깥에서 뗀 경우는 닫지 않습니다.
        if (pressedBackdrop.current && event.target === event.currentTarget && !pending) close(null);
        pressedBackdrop.current = false;
      }}
    >
      <form className="sheet-body form-stack" onSubmit={submit}>
        <h2 id={headingId} className="sheet-title">
          {link ? '링크 수정' : '새 링크'}
        </h2>
        <div className="field">
          <label htmlFor={`${baseId}-title`}>표시 이름 (필수)</label>
          <input
            ref={titleInputRef}
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
        <ActionStatus error={error} />
        <div className="form-actions sheet-actions">
          <button type="submit" className="primary" disabled={pending}>
            {pending ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="secondary" onClick={() => close(null)} disabled={pending}>
            닫기
          </button>
          {link ? (
            <button type="button" className="secondary danger" onClick={remove} disabled={pending}>
              삭제
            </button>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}
