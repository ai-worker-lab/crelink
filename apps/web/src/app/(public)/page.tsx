import {
  COOKIE_NAMES,
  CRELINK_API_PATHS,
  CRELINK_WEB_PATHS,
  type MeResponse,
  type PublicSlotEventResponse,
  type SlotEventView,
} from '@crelink/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { HomeSlotEvent } from '../../components/HomeSlotEvent';
import { LogoutButton } from '../../components/LogoutButton';
import { serverApi, ServerApiError } from '../../lib/api/server';
import { crelinkOpenGraph, SITE_DESCRIPTION } from '../../lib/site';

// 로그인 상태는 요청마다 확인합니다.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { openGraph: { ...crelinkOpenGraph('크리링', SITE_DESCRIPTION), url: '/' } };

type SessionState =
  { kind: 'signed-out' } | { kind: 'signed-in'; user: MeResponse } | { kind: 'error'; message: string };

async function readSession(): Promise<SessionState> {
  // 세션 쿠키가 없으면 API를 부르지 않고 바로 로그인 전 화면입니다.
  if (!(await cookies()).has(COOKIE_NAMES.session)) return { kind: 'signed-out' };
  try {
    return { kind: 'signed-in', user: await serverApi<MeResponse>(CRELINK_API_PATHS.me, { session: true }) };
  } catch (error) {
    if (!(error instanceof ServerApiError)) throw error;
    if (error.status === 401) return { kind: 'signed-out' };
    return { kind: 'error', message: error.message };
  }
}

/**
 * 진행 중인 링크 슬롯 이벤트(R24 ④). 없음·시작 전·끝남이면 null이고, 조회가 실패해도 홈에 오류를 보이지 않고 안내만 뺍니다
 * (설계 docs/specs/crelink-slot-event.md `구성과 흐름`).
 */
async function readOpenSlotEvent(): Promise<SlotEventView | null> {
  try {
    const { event } = await serverApi<PublicSlotEventResponse>(CRELINK_API_PATHS.publicSlotEvent);
    return event?.status === 'open' ? event : null;
  } catch (error) {
    if (!(error instanceof ServerApiError)) throw error;
    return null;
  }
}

export default async function HomePage() {
  const [session, slotEvent] = await Promise.all([readSession(), readOpenSlotEvent()]);
  return (
    <main className="public-page">
      <section className="landing" aria-labelledby="home-title">
        <p className="brand-mark">크리링</p>
        <h1 id="home-title">인스타그램 프로필 링크 하나로 나를 소개하세요.</h1>
        <p>크리링은 SNS 채널·포트폴리오·외부 링크를 한 페이지에 모아 짧은 주소로 전하는 크리에이터 랜딩페이지예요.</p>
        {/* 로그인 확인 오류는 로그인 전 카드(C1)와 같게 그립니다. */}
        {slotEvent ? <HomeSlotEvent event={slotEvent} signedIn={session.kind === 'signed-in'} /> : null}
        {session.kind === 'signed-in' ? (
          <div className="home-actions">
            <p className="home-account">{session.user.email}으로 로그인했어요.</p>
            <div className="button-row">
              {/* `/me`는 내 랜딩 관리 화면(페이지 편집)으로 보냅니다. */}
              <Link className="primary" href="/me">
                내 크리링 편집
              </Link>
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
