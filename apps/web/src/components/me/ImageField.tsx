'use client';

import {
  ALLOWED_IMAGE_TYPES,
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type ImageRef,
  type UploadFileResponse,
} from '@crelink/shared';
import { type ReactNode, useId, useState } from 'react';
import { BrowserApiError, browserApi } from '../../lib/api/browser';
import { errorMessage, IMAGE_MAX_LABEL } from '../../lib/api/errors';
import { StillImageError, uploadBannerImage, type BannerImage } from '../../lib/banner-image';
import { makeStillImage } from '../../lib/still-image';
import { useAction } from '../../lib/use-action';
import { RemoteImage } from '../RemoteImage';

/** 배너 이미지 도움말(handoff `design/ad-banner-block/handoff.md` 배너 폼). */
export const BANNER_IMAGE_HELP = `가로 1200 × 세로 400px(3:1)을 권장해요. JPG·PNG·WebP·GIF, ${IMAGE_MAX_LABEL}까지. 비율이 다르면 가운데를 기준으로 잘려요.`;

interface CommonProps {
  label: string;
  disabled?: boolean;
  /** 이미지가 없을 때 미리보기 자리에 보여 줄 내용. 없으면 '없음'. */
  placeholder?: ReactNode;
  /** 입력 아래 안내 문구. 없으면 기본 문구(배너 모드는 `BANNER_IMAGE_HELP`). 올리는 중에는 `올리는 중…`으로 바뀝니다. */
  help?: string;
}

interface SingleImageProps extends CommonProps {
  banner?: false;
  value: ImageRef | null;
  onChange: (image: ImageRef | null) => void;
}

/** 배너 모드: 3:1 미리보기, 움직이는 이미지면 정지 이미지를 만들어 한 쌍(`BannerImage`)으로 올립니다. */
interface BannerImageProps extends CommonProps {
  banner: true;
  value: BannerImage | null;
  onChange: (image: BannerImage | null) => void;
}

function uploadFile(file: File): Promise<UploadFileResponse> {
  const body = new FormData();
  body.append('file', file);
  return browserApi<UploadFileResponse>(CRELINK_API_PATHS.meFiles, { method: 'POST', body });
}

/** 이미지 하나를 올리고(`POST /api/me/files`) 미리 보여 줍니다. 저장은 부모 폼이 fileId로 합니다. */
export function ImageField(props: SingleImageProps | BannerImageProps) {
  const { label, disabled, placeholder } = props;
  const inputId = useId();
  const helpId = useId();
  const { pending, error, run, setError } = useAction();
  const [inputKey, setInputKey] = useState(0);
  const preview = props.banner ? (props.value?.image ?? null) : props.value;

  async function upload(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError(errorMessage('file_type_unsupported', null, 400));
      return;
    }
    if (file.size > CRELINK_LIMITS.imageMaxBytes) {
      setError(errorMessage('file_too_large', null, 400));
      return;
    }
    await run(async () => {
      if (!props.banner) {
        props.onChange(await uploadFile(file));
        return;
      }
      try {
        props.onChange(await uploadBannerImage(file, { upload: uploadFile, makeStill: makeStillImage }));
      } catch (caught) {
        if (caught instanceof StillImageError) {
          throw new BrowserApiError('still_image_failed', errorMessage('still_image_failed', null, 0), 0);
        }
        throw caught;
      }
    });
    setInputKey((key) => key + 1);
  }

  const defaultHelp = props.banner
    ? BANNER_IMAGE_HELP
    : `JPG·PNG·WebP·GIF, ${IMAGE_MAX_LABEL} 이하. 저장해야 반영돼요.`;
  const animatedNote =
    props.banner && props.value?.stillImage ? ' 움직이는 이미지라 첫 장면 정지 이미지를 함께 올렸어요.' : '';

  return (
    <div className="field image-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="image-field-body">
        {preview ? (
          props.banner ? (
            <RemoteImage
              className="image-preview image-preview-banner"
              src={preview.url}
              alt={`${label} 미리보기`}
              width={240}
              height={80}
            />
          ) : (
            <RemoteImage className="image-preview" src={preview.url} alt={`${label} 미리보기`} width={72} height={72} />
          )
        ) : (
          (placeholder ?? (
            <span
              className={`image-preview image-empty${props.banner ? ' image-preview-banner' : ''}`}
              aria-hidden="true"
            >
              없음
            </span>
          ))
        )}
        <div className="image-field-actions">
          <input
            key={inputKey}
            id={inputId}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            aria-describedby={helpId}
            disabled={disabled || pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {preview ? (
            <button
              type="button"
              className="secondary"
              onClick={() => props.onChange(null)}
              disabled={disabled || pending}
            >
              {props.banner ? '지우기' : '이미지 빼기'}
            </button>
          ) : null}
        </div>
      </div>
      <p id={helpId} className="field-help">
        {pending ? '올리는 중…' : `${props.help ?? defaultHelp}${animatedNote}`}
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
