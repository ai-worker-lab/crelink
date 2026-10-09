'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type CreateBannerRequest,
  type CreatorBannerView,
  type UpdateBannerRequest,
} from '@crelink/shared';
import { useId, useRef, useState, type FormEvent } from 'react';
import { BrowserApiError, browserApi } from '../../lib/api/browser';
import { errorMessage } from '../../lib/api/errors';
import { draftKey, type BannerDraft } from '../../lib/landing-preview';
import type { ActionState } from '../../lib/use-action';
import { ImageField } from '../me/ImageField';
import { rethrowBannerError } from './BannerSlotSection';
import { useManager } from './ManagerContext';

type FieldErrors = { image?: string; alt?: string; url?: string };

/** 입력란 아래에 보이는 API 오류(연결 URL 칸). */
const URL_ERROR_CODES = new Set(['link_url_invalid', 'link_domain_blocked']);

/** 서버·연결 문제라 같은 요청을 다시 보내 볼 만한 실패인지(`다시 시도`). 입력·한도·권한 오류는 다시 보내도 같습니다. */
function isRetryable(caught: unknown): boolean {
  if (!(caught instanceof BrowserApiError)) return true;
  return caught.status === 0 || caught.status >= 500 || caught.code === 'request_failed';
}

/** 연결 URL 형식: 비었거나 http·https 주소(공백 없음). 서버도 같은 규칙으로 `link_url_invalid`를 줍니다. */
function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(value)) return false;
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * 배너 추가·수정 폼(디자인 design/ad-banner-block/handoff.md `배너 폼`, 설계 docs/specs/crelink-ad-banner.md `배너 초안 규칙`).
 * 이미지(필수, 3:1, 움직이는 이미지면 정지 이미지를 함께 올림)·대체 문구(필수, n/100)·연결 URL(선택). 입력값은 그 배너의 초안(`bannerDrafts`)에
 * 두어 미리보기가 바로 덮어 그립니다. 편집 패널(`panel`, Esc로 취소)과 하단 시트(`sheet`)가 같은 폼을 씁니다.
 * 저장 전에 필수 항목·주소 형식을 검사하고, 주소 오류(`link_url_invalid`·`link_domain_blocked`)는 입력란에, 한도(409)는 n·m을 넣은 문장으로,
 * 서버·연결 실패는 오류 줄과 `다시 시도`로 보입니다(입력 유지). 회수(403)면 상태를 다시 읽고 처음 패널로 돌아갑니다.
 * 수정은 바뀐 필드만 보내고(이미지를 바꾸면 정지 이미지도 함께), 삭제는 확인을 거칩니다. 끝나면 상태를 다시 읽고 `onDone`을 부릅니다.
 */
export function BannerForm({
  banner,
  variant,
  action,
  onDone,
  onCancel,
}: {
  /** 고칠 배너. null이면 새 배너. */
  banner: CreatorBannerView | null;
  variant: 'panel' | 'sheet';
  /** 감싸는 쪽(시트)이 저장 중 여부를 함께 보도록 밖에서 받습니다. */
  action: ActionState;
  /** 결과 안내(바뀐 것이 없어 저장하지 않았으면 null). */
  onDone: (result: string | null) => void;
  onCancel: () => void;
}) {
  const baseId = useId();
  const manager = useManager();
  const { bannerDrafts, editBannerDraft, reload } = manager;
  const key = draftKey(banner?.id ?? null);
  const { pending, error, run, setError } = action;
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [retry, setRetry] = useState<'save' | 'remove' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const draft = bannerDrafts.get(key);
  if (!draft) return null;
  const update = (patch: Partial<BannerDraft>, field: keyof FieldErrors) => {
    editBannerDraft(key, patch);
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  /** 요청을 보내고 실패를 나눕니다: 주소 오류는 입력란, 나머지는 오류 줄(서버·연결 실패면 `다시 시도`). */
  async function send(kind: 'save' | 'remove', task: () => Promise<void>): Promise<boolean> {
    const failures: unknown[] = [];
    setRetry(null);
    const done = await run(async () => {
      try {
        await task();
      } catch (caught) {
        failures.push(caught);
        await rethrowBannerError(caught, manager);
      }
    });
    if (done) return true;
    const failure = failures[0];
    if (failure instanceof BrowserApiError && URL_ERROR_CODES.has(failure.code)) {
      setError(null);
      setFieldErrors((current) => ({ ...current, url: errorMessage(failure.code, null, failure.status) }));
      urlRef.current?.focus();
    } else if (failures.length > 0 && isRetryable(failure)) {
      setRetry(kind);
    }
    return false;
  }

  async function save() {
    if (!draft) return;
    const alt = draft.alt.trim();
    const url = draft.url.trim();
    const errors: FieldErrors = {
      image: draft.image ? undefined : '배너 이미지를 올려 주세요.',
      alt: alt ? undefined : '대체 문구를 적어 주세요.',
      url: !url || isHttpUrl(url) ? undefined : errorMessage('link_url_invalid', null, 400),
    };
    setFieldErrors(errors);
    if (errors.image || errors.alt || errors.url || !draft.image) {
      setError(null);
      setRetry(null);
      // 첫 오류 칸으로 초점을 옮깁니다(이미지 칸은 파일 입력).
      if (errors.image) formRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.focus();
      else if (errors.alt) altRef.current?.focus();
      else urlRef.current?.focus();
      return;
    }
    const image = draft.image;
    const stillImageFileId = draft.stillImage?.fileId ?? null;
    if (!banner) {
      const payload: CreateBannerRequest = { imageFileId: image.fileId, stillImageFileId, alt, url: url || null };
      const saved = await send('save', async () => {
        await browserApi<CreatorBannerView>(CRELINK_API_PATHS.meBanners, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        await reload();
      });
      if (saved) onDone(`'${alt}' 배너를 추가했어요.`);
      return;
    }
    const payload: UpdateBannerRequest = {};
    if (image.fileId !== banner.image.fileId || stillImageFileId !== (banner.stillImage?.fileId ?? null)) {
      payload.imageFileId = image.fileId;
      payload.stillImageFileId = stillImageFileId;
    }
    if (alt !== banner.alt) payload.alt = alt;
    if ((url || null) !== banner.url) payload.url = url || null;
    if (Object.keys(payload).length === 0) {
      onDone(null);
      return;
    }
    const saved = await send('save', async () => {
      await browserApi<CreatorBannerView>(CRELINK_API_PATHS.meBanner(banner.id), {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await reload();
    });
    if (saved) onDone(`'${alt}' 배너를 고쳤어요.`);
  }

  async function remove(confirmed: boolean) {
    if (!banner) return;
    if (!confirmed && !window.confirm('이 배너를 지울까요? 지운 배너는 되돌릴 수 없어요.')) return;
    const removed = await send('remove', async () => {
      await browserApi<void>(CRELINK_API_PATHS.meBanner(banner.id), { method: 'DELETE' });
      await reload();
    });
    if (removed) onDone(`'${banner.alt}' 배너를 지웠어요.`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save();
  }

  const altLength = draft.alt.length;
  return (
    <form
      ref={formRef}
      className="form-stack edit-form banner-form"
      onSubmit={submit}
      noValidate
      aria-label={banner ? `${banner.alt} 배너 수정` : '새 배너'}
      onKeyDown={(event) => {
        if (variant === 'panel' && event.key === 'Escape' && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="banner-form-image">
        <ImageField
          banner
          label="이미지 (필수)"
          value={draft.image ? { image: draft.image, stillImage: draft.stillImage } : null}
          onChange={(value) => update({ image: value?.image ?? null, stillImage: value?.stillImage ?? null }, 'image')}
          disabled={pending}
        />
        {fieldErrors.image ? (
          <p className="form-error-inline" role="alert">
            {fieldErrors.image}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-alt`}>대체 문구 (필수)</label>
        <input
          ref={altRef}
          id={`${baseId}-alt`}
          className="input"
          data-autofocus
          required
          value={draft.alt}
          onChange={(event) => update({ alt: event.target.value }, 'alt')}
          maxLength={CRELINK_LIMITS.bannerAltMax}
          aria-invalid={fieldErrors.alt ? true : undefined}
          aria-describedby={`${baseId}-alt-help${fieldErrors.alt ? ` ${baseId}-alt-error` : ''}`}
          disabled={pending}
        />
        <p className="field-help" id={`${baseId}-alt-help`}>
          <span className="banner-alt-count">
            {altLength}/{CRELINK_LIMITS.bannerAltMax}
          </span>{' '}
          배너에 적힌 글자를 그대로 적어 주세요. 화면을 읽어 주는 프로그램이 이 문장을 읽어요.
        </p>
        {fieldErrors.alt ? (
          <p className="form-error-inline" id={`${baseId}-alt-error`} role="alert">
            {fieldErrors.alt}
          </p>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor={`${baseId}-url`}>연결 URL</label>
        <input
          ref={urlRef}
          id={`${baseId}-url`}
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={draft.url}
          onChange={(event) => update({ url: event.target.value }, 'url')}
          maxLength={CRELINK_LIMITS.urlMax}
          aria-invalid={fieldErrors.url ? true : undefined}
          aria-describedby={`${baseId}-url-help${fieldErrors.url ? ` ${baseId}-url-error` : ''}`}
          disabled={pending}
        />
        <p className="field-help" id={`${baseId}-url-help`}>
          비워 두면 누를 수 없는 배너가 돼요.
        </p>
        {fieldErrors.url ? (
          <p className="form-error-inline" id={`${baseId}-url-error`} role="alert">
            {fieldErrors.url}
          </p>
        ) : null}
      </div>
      <div className="action-status" aria-live="polite">
        {error ? (
          <div className="form-error banner-form-error" role="alert">
            <p>{retry ? `${retry === 'remove' ? '지우지' : '저장하지'} 못했어요. ${error}` : error}</p>
            {retry ? (
              <button
                type="button"
                className="secondary"
                onClick={() => (retry === 'remove' ? void remove(true) : void save())}
                disabled={pending}
              >
                다시 시도
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="form-actions edit-form-actions">
        <button type="submit" className="primary" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={pending}>
          취소
        </button>
        {banner ? (
          <button type="button" className="secondary danger" onClick={() => void remove(false)} disabled={pending}>
            삭제
          </button>
        ) : null}
      </div>
    </form>
  );
}
