'use client';

import {
  ALLOWED_IMAGE_TYPES,
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  type ImageRef,
  type UploadFileResponse,
} from '@crelink/shared';
import { type ReactNode, useId, useState } from 'react';
import { browserApi } from '../../lib/api/browser';
import { errorMessage } from '../../lib/api/errors';
import { useAction } from '../../lib/use-action';
import { RemoteImage } from '../RemoteImage';

/** 이미지 하나를 올리고(`POST /api/me/files`) 미리 보여 줍니다. 저장은 부모 폼이 fileId로 합니다. */
export function ImageField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: ImageRef | null;
  onChange: (image: ImageRef | null) => void;
  disabled?: boolean;
  /** 이미지가 없을 때 미리보기 자리에 보여 줄 내용. 없으면 '없음'. */
  placeholder?: ReactNode;
}) {
  const inputId = useId();
  const helpId = useId();
  const { pending, error, run, setError } = useAction();
  const [inputKey, setInputKey] = useState(0);

  async function upload(file: File) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError(errorMessage('file_type_unsupported', null, 400));
      return;
    }
    if (file.size > CRELINK_LIMITS.imageMaxBytes) {
      setError(errorMessage('file_too_large', null, 400));
      return;
    }
    const body = new FormData();
    body.append('file', file);
    await run(async () => {
      onChange(await browserApi<UploadFileResponse>(CRELINK_API_PATHS.meFiles, { method: 'POST', body }));
    });
    setInputKey((key) => key + 1);
  }

  return (
    <div className="field image-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="image-field-body">
        {value ? (
          <RemoteImage className="image-preview" src={value.url} alt={`${label} 미리보기`} width={72} height={72} />
        ) : (
          (placeholder ?? (
            <span className="image-preview image-empty" aria-hidden="true">
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
          {value ? (
            <button type="button" className="secondary" onClick={() => onChange(null)} disabled={disabled || pending}>
              이미지 빼기
            </button>
          ) : null}
        </div>
      </div>
      <p id={helpId} className="field-help">
        {pending ? '올리는 중…' : 'JPG·PNG·WebP·GIF, 5MB 이하. 저장해야 반영돼요.'}
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
