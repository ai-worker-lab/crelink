import type { Metadata } from 'next';
import { ReturnRedirect } from '../../../components/ReturnRedirect';
import { AUTH_RETURN_CONTINUE_PATH } from '../../../lib/api/auth-redirect';

export const metadata: Metadata = { title: '돌아가는 중', robots: { index: false } };

/**
 * 로그인 콜백이 랜딩으로 돌아갈 때 거치는 화면(PRD R19). 이 문서가 `/auth/return/go`로 새 이동을 시작해 랜딩 요청이
 * `Sec-Fetch-Site: same-origin`이 되게 합니다. 돌아갈 주소는 `/auth/return/go`가 `cl_return_to` 쿠키에서 읽습니다
 * (설명: `lib/api/auth-redirect.ts` `AUTH_RETURN_PATH`).
 */
export default function AuthReturnPage() {
  return (
    <main className="public-page">
      <div className="loading-indicator" role="status" aria-live="polite">
        <p>
          보던 페이지로 돌아가는 중… <a href={AUTH_RETURN_CONTINUE_PATH}>바로 가기</a>
        </p>
      </div>
      <ReturnRedirect to={AUTH_RETURN_CONTINUE_PATH} />
    </main>
  );
}
