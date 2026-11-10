'use client';

import { useEffect, useRef, useState, type Ref } from 'react';
import { COPY_RESULT_MS, type CopyResult } from '../lib/use-copy-result';

const iconProps = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

const copyIcon = (
  <svg {...iconProps}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);

const copiedIcon = (
  <svg {...iconProps} className="copy-icon-done">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/**
 * 글자를 클립보드에 복사하고 2초 동안 `복사됨`을 보여 줍니다. 복사가 성공하면 `onCopied`를 부릅니다(시작 안내 카드 ② 기록).
 * `label`이 없으면 버튼 글자(`idleText`)가 이름입니다. `primary`면 주요 버튼 모양입니다.
 * `icon`이면 글자 대신 복사 아이콘을 그리고 성공하면 4초 동안 체크로 바꿉니다. `onResult`를 넘기면 결과 문장과 유지 시간은
 * 부모가 맡으므로 `.copy-feedback`을 그리지 않습니다(두 번 낭독되지 않게. design/manager-address-bar/handoff.md).
 */
export function CopyButton({
  text,
  label,
  idleText = '복사',
  primary = false,
  icon = false,
  onCopied,
  onResult,
  buttonRef,
}: {
  text: string;
  label?: string;
  idleText?: string;
  primary?: boolean;
  icon?: boolean;
  onCopied?: () => void;
  onResult?: (result: CopyResult) => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const [state, setState] = useState<'idle' | CopyResult>('idle');
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
    timer.current = window.setTimeout(() => setState('idle'), icon ? COPY_RESULT_MS : 2000);
    if (copied) onCopied?.();
    onResult?.(copied ? 'copied' : 'failed');
  }

  const buttonClass = icon ? 'secondary icon-only' : primary ? 'primary' : 'secondary';
  return (
    <span className="copy-control">
      <button
        ref={buttonRef}
        type="button"
        className={buttonClass}
        onClick={copy}
        aria-label={label}
        title={icon ? label : undefined}
      >
        {icon ? (state === 'copied' ? copiedIcon : copyIcon) : state === 'copied' ? '복사됨' : idleText}
      </button>
      {onResult ? null : (
        <span className="copy-feedback" role="status" aria-live="polite">
          {state === 'copied'
            ? '복사했어요.'
            : state === 'failed'
              ? '복사하지 못했어요. 주소를 직접 선택해 복사해 주세요.'
              : ''}
        </span>
      )}
    </span>
  );
}
