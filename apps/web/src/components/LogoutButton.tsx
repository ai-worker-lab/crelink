'use client';

import { useLogout } from '../lib/use-logout';

/** BFF로 로그아웃(세션 쿠키 삭제)한 뒤 홈으로 갑니다. */
export function LogoutButton() {
  const { pending, error, logout } = useLogout();

  return (
    <span className="logout-control">
      <button type="button" className="secondary" onClick={logout} disabled={pending}>
        {pending ? '로그아웃 중…' : '로그아웃'}
      </button>
      {error ? (
        <span className="form-error-inline" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
