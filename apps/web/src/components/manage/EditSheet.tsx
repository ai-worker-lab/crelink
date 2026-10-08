'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * 좁은 화면(1023px 이하) `페이지 편집`에서 고른 대상(외부 링크·링크·포트폴리오·항목·방명록·프로필)의 하단 시트. 네이티브 `<dialog>`를 `showModal()`로 열어 바깥을 비활성(inert)으로
 * 만들고 포커스를 가둡니다. 열면 폼의 `[data-autofocus]` 입력(표시 이름·제목)에 포커스를 둡니다.
 * Esc·배경 누르기·머리의 닫기 아이콘 버튼으로 `onDismiss`를 부르고, 저장 중에는 닫지 않습니다(결과 안내를 잃지 않도록).
 * 브라우저가 dialog를 직접 닫아도(`close` 이벤트) 같은 규칙으로 맞춥니다(저장 중이면 다시 엶).
 * 닫기는 여는 쪽이 이 구성 요소를 그리지 않는 것으로 하며, 닫힌 뒤 포커스 복귀도 여는 쪽이 맡습니다.
 * 같은 패널 내용을 넓은 화면에서는 오른쪽 편집 패널에 그립니다(디자인 인계 design/preview-direct-edit/handoff.md).
 */
export function EditSheet({
  title,
  pending,
  onDismiss,
  children,
}: {
  title: string;
  pending: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={headingId}
      onCancel={(event) => {
        // 닫기는 여는 쪽이 시트를 지우는 것으로 하므로 브라우저 기본 닫기는 막습니다.
        event.preventDefault();
        if (!pending) onDismiss();
      }}
      onClose={(event) => {
        // 브라우저가 막을 수 없는 cancel로 닫은 경우(예: 사용자 활성화 없이 Esc를 거듭 누름) 폼 상태를 맞춥니다.
        // 저장 중이면 결과 안내를 잃지 않도록 다시 열고, 아니면 여는 쪽에 닫기를 알립니다.
        if (pending) event.currentTarget.showModal();
        else onDismiss();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // 시트 바깥(배경)을 눌렀다 뗀 경우만 닫습니다. 입력 안에서 끌다가 바깥에서 뗀 경우는 닫지 않습니다.
        if (pressedBackdrop.current && event.target === event.currentTarget && !pending) onDismiss();
        pressedBackdrop.current = false;
      }}
    >
      <div className="sheet-head">
        <h2 id={headingId} className="sheet-title">
          {title}
        </h2>
        <button type="button" className="icon-button" aria-label="닫기" onClick={onDismiss} disabled={pending}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
