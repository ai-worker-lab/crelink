'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { toLandingPreview } from '../../lib/landing-preview';
import { useWideLayout } from '../../lib/use-wide-layout';
import { Landing } from '../landing/Landing';
import type { LandingTab } from '../landing/LandingTabs';
import { useManager } from './ManagerContext';
import { managerHref } from './menu';

/**
 * 실시간 미리보기(PRD R18). 공개 랜딩과 같은 `Landing`으로, 저장 상태(`toLandingPreview`: 숨긴·차단 링크 제외)에 저장하지 않은 입력을
 * 덮어 그립니다. 넓은 화면은 오른쪽(또는 1024~1199px의 둘째) 열의 휴대폰 프레임, 1023px 이하는 떠 있는 `미리보기` 버튼과 전체 화면 대화상자입니다.
 * 탭은 관리 화면 주소의 해시를 바꾸지 않는 제어형이고, `방명록` 메뉴에 들어가면 방명록 탭을, 다른 메뉴로 가면 링크 탭을 엽니다.
 */
export function ManagerPreview() {
  const wide = useWideLayout();
  const pathname = usePathname();
  const { state } = useManager();
  const onGuestbookMenu = pathname === managerHref(state.landing.publicId, 'guestbook');
  const [tab, setTab] = useState<LandingTab>(onGuestbookMenu ? 'guestbook' : 'links');
  const [menuSeen, setMenuSeen] = useState(onGuestbookMenu);
  if (menuSeen !== onGuestbookMenu) {
    setMenuSeen(onGuestbookMenu);
    setTab(onGuestbookMenu ? 'guestbook' : 'links');
  }
  return wide ? <PreviewColumn tab={tab} onTabChange={setTab} /> : <PreviewDialog tab={tab} onTabChange={setTab} />;
}

interface PreviewProps {
  tab: LandingTab;
  onTabChange: (tab: LandingTab) => void;
}

function PreviewColumn(props: PreviewProps) {
  const headingId = useId();
  const { dirty } = useManager();
  const hasDraft = Object.values(dirty).some(Boolean);
  return (
    <aside className="manager-preview" aria-labelledby={headingId}>
      <div className="preview-head">
        <h2 id={headingId}>미리보기</h2>
        {hasDraft ? <span className="badge dirty-chip">저장하지 않은 변경 포함</span> : null}
      </div>
      <p className="preview-help">방문자에게 보이는 모습이에요. 숨긴 링크·차단된 링크는 빠져요.</p>
      <div className="preview-device">
        <PreviewScreen {...props} />
      </div>
    </aside>
  );
}

function PreviewDialog(props: PreviewProps) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { dirty } = useManager();
  const hasDraft = Object.values(dirty).some(Boolean);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className="preview-fab"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path
            d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        미리보기
      </button>
      {open ? (
        <dialog
          ref={dialogRef}
          className="preview-dialog"
          aria-labelledby={headingId}
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => buttonRef.current?.focus());
          }}
        >
          <div className="preview-dialog-head">
            <h2 id={headingId}>미리보기</h2>
            {hasDraft ? <span className="badge dirty-chip">저장하지 않은 변경 포함</span> : null}
            <button type="button" className="secondary" onClick={() => dialogRef.current?.close()}>
              닫기
            </button>
          </div>
          <PreviewScreen {...props} />
        </dialog>
      ) : null}
    </>
  );
}

/** 휴대폰 화면 안쪽: 공개 랜딩과 같은 `Landing`과 바닥글. 안의 링크·SNS·포트폴리오는 이동하지 않습니다(누름 무시). */
function PreviewScreen({ tab, onTabChange }: PreviewProps) {
  const { state, profile, socials, linkDraft, portfolioDraft, guestbookAction, guestbookVersion } = useManager();
  const drafted = toLandingPreview(state, { profile, socials, link: linkDraft, portfolio: portfolioDraft });
  // 방명록 켜기를 저장하는 동안은 탭을 그리지 않습니다(저장 전에 목록을 부르면 꺼진 랜딩의 404를 받음).
  const landing = guestbookAction.pending ? { ...drafted, guestbookEnabled: false } : drafted;
  return (
    <div
      className="preview-screen"
      onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest('a')) event.preventDefault();
      }}
    >
      <div className="preview-main">
        <Landing landing={landing} headingLevel={2} preview={{ tab, onTabChange, guestbookVersion }} />
      </div>
      <p className="profile-footer">
        <span className="brand">크리링</span>
        <span aria-hidden="true">·</span>
        <span>개인정보 처리방침</span>
      </p>
    </div>
  );
}
