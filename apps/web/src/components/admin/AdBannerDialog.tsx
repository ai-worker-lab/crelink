'use client';

import {
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type AdBannerRequest,
  type AdBannerView,
  type UpdateAdBannerRequest,
} from '@crelink/shared';
import { useId, useState, type FormEvent } from 'react';
import { browserApi, BrowserApiError } from '../../lib/api/browser';
import { errorMessage } from '../../lib/api/errors';
import type { BannerImage } from '../../lib/banner-image';
import { fromSeoulInput, nowSeoulInput, toSeoulInput } from '../../lib/seoul-time';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { BannerCarousel, BannerPicture } from '../landing/BannerCarousel';
import { EditSheet } from '../manage/EditSheet';
import { ImageField } from '../me/ImageField';

interface Draft {
  image: BannerImage | null;
  alt: string;
  url: string;
  /** `datetime-local` 값(한국 시간). */
  start: string;
  end: string;
}

/** 입력을 고쳐야 하는 오류 코드. 이 밖의 실패(연결·서버 오류)는 저장 버튼을 `다시 시도`로 바꿉니다. */
const INPUT_ERROR_CODES: Record<string, true> = {
  validation_failed: true,
  link_url_invalid: true,
  link_domain_blocked: true,
  banner_period_invalid: true,
  file_not_found: true,
};

/**
 * 운영자 광고 배너 등록·수정 대화상자(디자인 design/ad-banner-block/handoff.md `광고 배너`, 설계 docs/specs/crelink-ad-banner.md
 * `화면 상태와 API 대응`). 넓은 화면은 가운데 최대 560, 700px 이하는 하단 시트입니다(`EditSheet`).
 * 이미지(움직이면 정지 이미지 쌍)·대체 문구·연결 URL·게시 시작은 필수이고 게시 끝은 선택입니다. 게시 기간은 한국 시간
 * `datetime-local`로 받아 `+09:00` ISO로 보냅니다. `방문자에게 이렇게 보여요`는 공개 랜딩과 같은 `BannerCarousel`(광고 블록 틀)입니다.
 * 등록은 `POST`, 수정은 바뀐 필드만 `PATCH`합니다. 저장하면 `onSaved`가 목록을 다시 읽습니다.
 */
export function AdBannerDialog({
  banner,
  onDismiss,
  onSaved,
}: {
  /** null이면 새 배너. */
  banner: AdBannerView | null;
  onDismiss: () => void;
  onSaved: (saved: AdBannerView) => void;
}) {
  const baseId = useId();
  const { pending, error, run, setError } = useAction();
  const [failedCode, setFailedCode] = useState<string | null>(null);
  const [initial] = useState<Draft>(() =>
    banner
      ? {
          image: { image: banner.image, stillImage: banner.stillImage },
          alt: banner.alt,
          url: banner.url,
          start: toSeoulInput(banner.startsAt),
          end: banner.endsAt ? toSeoulInput(banner.endsAt) : '',
        }
      : { image: null, alt: '', url: '', start: nowSeoulInput(), end: '' },
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const periodInvalid = failedCode === 'banner_period_invalid';
  const urlInvalid = failedCode === 'link_url_invalid' || failedCode === 'link_domain_blocked';
  const retry = !!error && !!failedCode && !Object.hasOwn(INPUT_ERROR_CODES, failedCode);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailedCode(null);
    const startsAt = fromSeoulInput(draft.start);
    const endsAt = draft.end ? fromSeoulInput(draft.end) : null;
    if (!draft.image) {
      setError('배너 이미지를 골라 주세요.');
      return;
    }
    if (!startsAt || (draft.end && !endsAt)) {
      setError('게시 기간의 날짜와 시각을 확인해 주세요.');
      return;
    }
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      setFailedCode('banner_period_invalid');
      setError(errorMessage('banner_period_invalid', null, 400));
      return;
    }
    const image = draft.image;
    const full: AdBannerRequest = {
      imageFileId: image.image.fileId,
      stillImageFileId: image.stillImage?.fileId ?? null,
      alt: draft.alt.trim(),
      url: draft.url.trim(),
      startsAt,
      endsAt,
    };
    let payload: AdBannerRequest | UpdateAdBannerRequest = full;
    if (banner) {
      // 바뀐 필드만 보냅니다. 기간은 입력값(분 단위)으로 비교해 초가 있는 저장값을 건드리지 않습니다.
      const changes: UpdateAdBannerRequest = {};
      if (image.image.fileId !== banner.image.fileId) {
        changes.imageFileId = full.imageFileId;
        changes.stillImageFileId = full.stillImageFileId;
      }
      if (full.alt !== banner.alt) changes.alt = full.alt;
      if (full.url !== banner.url) changes.url = full.url;
      if (draft.start !== initial.start) changes.startsAt = startsAt;
      if (draft.end !== initial.end) changes.endsAt = endsAt;
      payload = changes;
    }
    await run(async () => {
      try {
        const saved = await browserApi<AdBannerView>(
          banner ? CRELINK_API_PATHS.adminAdBanner(banner.id) : CRELINK_API_PATHS.adminAdBanners,
          { method: banner ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
        );
        onSaved(saved);
      } catch (caught) {
        setFailedCode(caught instanceof BrowserApiError ? caught.code : 'unknown');
        throw caught;
      }
    });
  }

  const preview = draft.image;
  return (
    <EditSheet
      title={banner ? '배너 수정' : '배너 등록'}
      pending={pending}
      onDismiss={onDismiss}
      className="ad-banner-dialog"
    >
      <form
        className="form-stack edit-form"
        onSubmit={submit}
        aria-label={banner ? `${banner.alt} 배너 수정` : '배너 등록'}
      >
        <ImageField
          banner
          label="이미지 (필수)"
          value={draft.image}
          onChange={(image) => update({ image })}
          disabled={pending}
        />
        <div className="field">
          <label htmlFor={`${baseId}-alt`}>대체 문구 (필수)</label>
          <input
            id={`${baseId}-alt`}
            className="input"
            data-autofocus
            required
            value={draft.alt}
            onChange={(event) => update({ alt: event.target.value })}
            maxLength={CRELINK_LIMITS.bannerAltMax}
            aria-describedby={`${baseId}-alt-help`}
            disabled={pending}
          />
          <p className="field-help" id={`${baseId}-alt-help`}>
            배너 그림의 글자를 그대로 적어 주세요. 화면 낭독기가 읽어요. {draft.alt.length}/
            {CRELINK_LIMITS.bannerAltMax}자
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${baseId}-url`}>연결 URL (필수)</label>
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
            aria-invalid={urlInvalid || undefined}
            aria-describedby={`${baseId}-url-help`}
            disabled={pending}
          />
          <p className="field-help" id={`${baseId}-url-help`}>
            http:// 또는 https://로 시작하는 주소만 저장할 수 있고, 차단 목록의 도메인은 쓸 수 없어요.
          </p>
        </div>
        <div className="ad-banner-period">
          <div className="field">
            <label htmlFor={`${baseId}-start`}>게시 시작 (필수)</label>
            <input
              id={`${baseId}-start`}
              className="input"
              type="datetime-local"
              required
              value={draft.start}
              onChange={(event) => update({ start: event.target.value })}
              aria-invalid={periodInvalid || undefined}
              aria-describedby={`${baseId}-start-help`}
              disabled={pending}
            />
            <p className="field-help" id={`${baseId}-start-help`}>
              한국 시간 기준이에요.
            </p>
          </div>
          <div className="field">
            <label htmlFor={`${baseId}-end`}>게시 끝</label>
            <input
              id={`${baseId}-end`}
              className="input"
              type="datetime-local"
              value={draft.end}
              onChange={(event) => update({ end: event.target.value })}
              aria-invalid={periodInvalid || undefined}
              aria-describedby={`${baseId}-end-help`}
              disabled={pending}
            />
            <p className="field-help" id={`${baseId}-end-help`}>
              비워 두면 내릴 때까지 게시해요.
            </p>
          </div>
        </div>
        <section className="ad-banner-preview" aria-labelledby={`${baseId}-preview`}>
          <h3 id={`${baseId}-preview`}>방문자에게 이렇게 보여요</h3>
          {preview ? (
            <BannerCarousel
              key={preview.image.fileId}
              label="크리링 광고 미리보기"
              ad
              animated={[preview.stillImage !== null]}
            >
              <div className="banner-frame">
                <BannerPicture
                  src={preview.image.url}
                  still={preview.stillImage?.url ?? null}
                  alt={draft.alt.trim() || '대체 문구 없음'}
                  eager
                />
              </div>
            </BannerCarousel>
          ) : (
            <p className="ad-banner-preview-empty">이미지를 고르면 광고 블록 모양으로 보여요.</p>
          )}
        </section>
        <ActionStatus error={error} />
        <div className="form-actions edit-form-actions">
          <button type="submit" className="primary" disabled={pending}>
            {pending ? '저장 중…' : retry ? '다시 시도' : '저장'}
          </button>
          <button type="button" className="secondary" onClick={onDismiss} disabled={pending}>
            취소
          </button>
        </div>
      </form>
    </EditSheet>
  );
}
