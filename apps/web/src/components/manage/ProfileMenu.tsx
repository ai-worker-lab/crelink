'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { useLogout } from '../../lib/use-logout';
import { DefaultAvatar } from '../DefaultAvatar';
import { RemoteImage } from '../RemoteImage';

/**
 * 관리 화면 머리글의 프로필 메뉴(design/manager-address-bar/handoff.md `프로필 메뉴`): 사진 버튼을 누르면 이메일·(운영자만) `운영자 화면`·`로그아웃`.
 * 이메일 글자가 메뉴 항목이 아니라 `menu` 역할 대신 공개/숨김(disclosure)입니다. 열어도 초점은 버튼에 두고 다음 Tab이 패널로 갑니다.
 * Esc는 닫고 버튼으로 초점, 바깥 누름은 닫기만, Tab으로 패널을 벗어나면 닫습니다. 로그아웃하는 동안에는 닫지 않습니다.
 * 머리글이 `ManagerProvider` 밖에 그려지는 오류 화면에서도 쓰므로 `useManager`를 쓰지 않고 props만 받습니다.
 */
export function ProfileMenu({
  email,
  isOperator,
  avatarUrl,
}: {
  email: string | null;
  isOperator: boolean;
  avatarUrl: string | null;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { pending, error, logout } = useLogout();

  const pathname = usePathname();
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open || pending) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, pending]);

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (!pending && next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
  }

  return (
    <div ref={rootRef} className="profile-menu" onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="profile-trigger"
        aria-label="계정 메뉴"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {avatarUrl ? (
          <RemoteImage className="profile-avatar" src={avatarUrl} alt="" width={36} height={36} />
        ) : (
          <DefaultAvatar className="profile-avatar" />
        )}
      </button>
      <div id={panelId} className="profile-panel" hidden={!open}>
        {email ? <p className="profile-email">{email}</p> : null}
        {isOperator ? (
          <Link className="profile-item" href="/admin">
            운영자 화면
          </Link>
        ) : null}
        <button type="button" className="profile-item" aria-disabled={pending || undefined} onClick={logout}>
          {pending ? '로그아웃 중…' : '로그아웃'}
        </button>
        {error ? (
          <p className="form-error-inline profile-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
