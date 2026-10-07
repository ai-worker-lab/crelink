'use client';

import { CRELINK_API_PATHS } from '@crelink/shared';
import { browserApi } from '../lib/api/browser';
import { useAction } from '../lib/use-action';

/** BFF로 로그아웃(세션 쿠키 삭제)한 뒤 홈으로 갑니다. */
export function LogoutButton() {
  const { pending, error, run } = useAction();

  async function logout() {
    const ok = await run(() => browserApi<void>(CRELINK_API_PATHS.authLogout, { method: 'POST' }));
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 로그아웃한 세션의 화면이 클라이언트 라우터 캐시에 남지 않도록 문서를 새로 불러옵니다.
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
