'use client';

import { CRELINK_API_PATHS, CRELINK_LIMITS, type CreateLinkRequest, type LinkView } from '@crelink/shared';
import { useId, type FormEvent } from 'react';
import { browserApi } from '../../lib/api/browser';
import { draftKey, type LinkDraft } from '../../lib/landing-preview';
import type { ActionState } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { ImageField } from '../me/ImageField';
import { useManager } from './ManagerContext';

/**
 * 링크 추가·수정 폼(표시 이름·주소·설명·썸네일, 저장·취소·삭제). 입력값은 관리 화면의 그 링크 초안(`linkDrafts`)에 두어 미리보기가 바로 그립니다.
 * 넓은 화면은 편집 패널(`panel`: 제목은 패널 머리, Esc로 취소), 좁은 화면은 하단 시트(`sheet`: 제목·닫기는 `EditSheet` 머리)가 감쌉니다.
 * `취소`는 초안을 버리고, 닫기·`← 전체`는 초안을 남깁니다. 다른 항목으로 옮긴 뒤 끝난 썸네일 업로드도 이 링크의 초안에 붙습니다.
 * 저장·삭제가 끝나면 편집 상태를 다시 읽은 뒤 결과 안내와 함께 `onDone`을 부릅니다. 삭제는 확인을 거칩니다.
 */
export function LinkForm({
  link,
  variant,
  action,
  onDone,
  onCancel,
}: {
  /** 고칠 링크. null이면 새 링크. */
  link: LinkView | null;
  variant: 'panel' | 'sheet';
  /** 감싸는 쪽(시트)이 저장 중 여부를 함께 보도록 밖에서 받습니다. */
  action: ActionState;
  onDone: (result: string) => void;
  onCancel: () => void;
}) {
  const baseId = useId();
  const { linkDrafts, editLinkDraft, reload } = useManager();
  const key = draftKey(link?.id ?? null);
  const { pending, error, run } = action;

  const draft = linkDrafts.get(key);
  if (!draft) return null;
  const update = (patch: Partial<LinkDraft>) => editLinkDraft(key, patch);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const payload: CreateLinkRequest = {
      title: draft.title.trim(),
      url: draft.url.trim(),
      description: draft.description.trim() || null,
      thumbnailFileId: draft.thumbnail?.fileId ?? null,
    };
    const saved = await run(async () => {
      await browserApi<LinkView>(link ? CRELINK_API_PATHS.meLink(link.id) : CRELINK_API_PATHS.meLinks, {
        method: link ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await reload();
    });
    if (saved) onDone(link ? `'${payload.title}' 링크를 고쳤어요.` : `'${payload.title}' 링크를 추가했어요.`);
  }

  async function remove() {
    if (!link || !window.confirm(`'${link.title}' 링크를 지울까요? 지우면 되돌릴 수 없어요.`)) return;
    const removed = await run(async () => {
      await browserApi<void>(CRELINK_API_PATHS.meLink(link.id), { method: 'DELETE' });
      await reload();
    });
    if (removed) onDone(`'${link.title}' 링크를 지웠어요.`);
  }

  return (
    <form
      className="form-stack edit-form"
      onSubmit={submit}
      aria-label={link ? `${link.title} 링크 수정` : '새 링크'}
      onKeyDown={(event) => {
        if (variant === 'panel' && event.key === 'Escape' && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="field">
        <label htmlFor={`${baseId}-title`}>표시 이름 (필수)</label>
        <input
          id={`${baseId}-title`}
          className="input"
          data-autofocus
          required
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
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
          value={draft.url}
          onChange={(event) => update({ url: event.target.value })}
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
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          maxLength={CRELINK_LIMITS.linkDescriptionMax}
          disabled={pending}
        />
        <p className="field-help">
          {draft.description.length}/{CRELINK_LIMITS.linkDescriptionMax}자
        </p>
      </div>
      <ImageField
        label="썸네일"
        value={draft.thumbnail}
        onChange={(thumbnail) => update({ thumbnail })}
        disabled={pending}
      />
      <ActionStatus error={error} />
      <div className="form-actions edit-form-actions">
        <button type="submit" className="primary" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
          취소
        </button>
        {link ? (
          <button type="button" className="secondary danger" onClick={remove} disabled={pending}>
            삭제
          </button>
        ) : null}
      </div>
    </form>
  );
}
