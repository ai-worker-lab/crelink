'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 글자를 클립보드에 복사하고 2초 동안 `복사됨`을 보여 줍니다. 복사가 성공하면 `onCopied`를 부릅니다(시작 안내 카드 ② 기록).
 * `label`이 없으면 버튼 글자(`idleText`)가 이름입니다. `primary`면 주요 버튼 모양입니다.
 */
export function CopyButton({
  text,
  label,
  idleText = '복사',
  primary = false,
  onCopied,
}: {
  text: string;
  label?: string;
  idleText?: string;
  primary?: boolean;
  onCopied?: () => void;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // 클립보드 API를 못 쓰는 환경(비보안 출처 등)은 임시 입력란을 선택해 복사합니다.
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      copied = document.execCommand('copy');
      field.remove();
    }
    setState(copied ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
    if (copied) onCopied?.();
  }

  return (
    <span className="copy-control">
      <button type="button" className={primary ? 'primary' : 'secondary'} onClick={copy} aria-label={label}>
        {state === 'copied' ? '복사됨' : idleText}
      </button>
      <span className="copy-feedback" role="status" aria-live="polite">
        {state === 'copied'
          ? '복사했어요.'
          : state === 'failed'
            ? '복사하지 못했어요. 주소를 직접 선택해 복사해 주세요.'
            : ''}
      </span>
    </span>
  );
}
