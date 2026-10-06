'use client';

import { CRELINK_API_PATHS } from '@crelink/shared';
import { browserApi } from '../lib/api/browser';
import { useAction } from '../lib/use-action';

/** BFF로 로그아웃(세션 쿠키 삭제)한 뒤 홈으로 갑니다. */
export function LogoutButton() {
  const { pending, error, run } = useAction();

  async function logout() {
    const ok = await run(() => browserApi<void>(CRELINK_API_PATHS.authLogout, { method: 'POST' }));
    if (ok) window.location.assign('/');
  }

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
