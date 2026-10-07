import {
  COOKIE_NAMES,
  CRELINK_API_PATHS,
  CRELINK_WEB_PATHS,
  type CreatorLandingState,
  type MeResponse,
} from '@crelink/shared';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { LogoutButton } from '../../components/LogoutButton';
import { serverApi, ServerApiError } from '../../lib/api/server';

// 로그인 상태는 요청마다 확인합니다.
export const dynamic = 'force-dynamic';

type SessionState =
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: MeResponse; landingPublicId: string | null }
  | { kind: 'error'; message: string };

async function readSession(): Promise<SessionState> {
  // 세션 쿠키가 없으면 API를 부르지 않고 바로 로그인 전 화면입니다.
  if (!(await cookies()).has(COOKIE_NAMES.session)) return { kind: 'signed-out' };
  // 랜딩 관리 화면 주소에 쓸 공개 ID. 못 읽어도 홈은 그대로 보여 주고 관리 화면 링크만 뺍니다.
  const landing = serverApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding, { session: true }).then(
    (state) => state.landing.publicId,
    () => null,
  );
  try {
    const user = await serverApi<MeResponse>(CRELINK_API_PATHS.me, { session: true });
    return { kind: 'signed-in', user, landingPublicId: await landing };
  } catch (error) {
    if (!(error instanceof ServerApiError)) throw error;
    if (error.status === 401) return { kind: 'signed-out' };
    return { kind: 'error', message: error.message };
  }
}

export default async function HomePage() {
  const session = await readSession();
  return (
    <main className="public-page">
      <section className="landing" aria-labelledby="home-title">
        <p className="brand-mark">크리링</p>
        <h1 id="home-title">인스타그램 프로필 링크 하나로 나를 소개하세요.</h1>
        <p>크리링은 SNS 채널·포트폴리오·외부 링크를 한 페이지에 모아 짧은 주소로 전하는 크리에이터 랜딩페이지예요.</p>
        {session.kind === 'signed-in' ? (
          <div className="home-actions">
            <p className="home-account">{session.user.email}으로 로그인했어요.</p>
            <div className="button-row">
              <Link className="primary" href="/me">
                내 크리링 편집
              </Link>
              {session.landingPublicId ? (
                <Link className="secondary" href={`/me/landings/${encodeURIComponent(session.landingPublicId)}`}>
                  링크 관리
                </Link>
              ) : null}
              {session.user.role === 'operator' ? (
                <Link className="secondary" href="/admin">
                  운영자 화면
                </Link>
              ) : null}
              <LogoutButton />
            </div>
          </div>
        ) : (
          <div className="home-actions">
            {session.kind === 'error' ? (
              <p className="form-error" role="alert">
                로그인 상태를 확인하지 못했어요. {session.message}
              </p>
            ) : null}
            <div className="button-row">
              {/* route handler로 가는 전체 이동이라 next/link 대신 a를 씁니다. */}
              <a className="primary" href="/auth/google">
                구글로 시작하기
              </a>
            </div>
          </div>
        )}
      </section>
      <footer className="site-footer">
        <Link href={CRELINK_WEB_PATHS.docs}>문서</Link>
        <Link href={CRELINK_WEB_PATHS.privacy}>개인정보 처리방침</Link>
      </footer>
    </main>
  );
}
