'use client';

import { useManager } from './ManagerContext';

/**
 * 방명록 켜기 스위치(PRD R19, `PATCH /api/me/landing { guestbookEnabled }`). 누르면 바로 바뀌고 저장하며 실패하면 되돌립니다.
 * `페이지 편집`의 방명록 카드와 `방명록` 메뉴가 같은 상태를 씁니다. 저장 중에는 `aria-disabled`로 누르기만 무시합니다(초점 유지).
 */
export function GuestbookSwitch() {
  const { state, guestbookAction, toggleGuestbook } = useManager();
  const enabled = state.landing.guestbookEnabled;
  return (
    <button
      type="button"
      role="switch"
      className="hide-switch"
      aria-checked={enabled}
      aria-label="방명록 켜기"
      aria-disabled={guestbookAction.pending || undefined}
      onClick={() => {
        if (!guestbookAction.pending) void toggleGuestbook(!enabled);
      }}
    >
      <span className="hide-switch-track" aria-hidden="true">
        <span className="hide-switch-thumb" />
      </span>
      <span className="hide-switch-text" aria-hidden="true">
        {enabled ? '켜짐' : '꺼짐'}
      </span>
    </button>
  );
}
