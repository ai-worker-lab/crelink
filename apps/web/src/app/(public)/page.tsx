import {
  COOKIE_NAMES,
  CRELINK_API_PATHS,
  CRELINK_LIMITS,
  CRELINK_WEB_PATHS,
  type MeResponse,
  type PublicSlotEventResponse,
  type SlotEventView,
} from '@crelink/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { HomeExampleLanding } from '../../components/HomeExampleLanding';
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

const HOME_TITLE = '인스타그램 프로필 링크 하나로 나를 소개하세요.';
const HOME_LEAD =
  '크리링은 SNS 채널·포트폴리오·외부 링크를 한 페이지에 모아 짧은 주소로 전하는 크리에이터 랜딩페이지예요.';

/** route handler로 가는 전체 이동이라 next/link 대신 a를 씁니다. 유입 경로 쿼리는 0087 결정 전이라 붙이지 않습니다. */
function GoogleStart() {
  return (
    <a className="primary" href="/auth/google">
      구글로 시작하기
    </a>
  );
}

/** 로그인한 홈: 관리 화면으로 가는 입구(design/home-intro/handoff.md `로그인한 홈`, 바꾸지 않음). */
function SignedInHome({ user, slotEvent }: { user: MeResponse; slotEvent: SlotEventView | null }) {
  return (
    <section className="landing" aria-labelledby="home-title">
      <p className="brand-mark">크리링</p>
      <h1 id="home-title">{HOME_TITLE}</h1>
      <p>{HOME_LEAD}</p>
      {slotEvent ? <HomeSlotEvent event={slotEvent} signedIn /> : null}
      <div className="home-actions">
        <p className="home-account">{user.email}으로 로그인했어요.</p>
        <div className="button-row">
          {/* `/me`는 내 랜딩 관리 화면(페이지 편집)으로 보냅니다. */}
          <Link className="primary" href="/me">
            내 크리링 편집
          </Link>
          {user.role === 'operator' ? (
            <Link className="secondary" href="/admin">
              운영자 화면
            </Link>
          ) : null}
          <LogoutButton />
        </div>
      </div>
    </section>
  );
}

/**
 * 로그인 전·로그인 확인 오류 홈 소개(design/home-intro/handoff.md 상태 A·B·E). 숫자는 `CRELINK_LIMITS`에서 읽고,
 * 이벤트 카드는 설명 아래·첫 버튼 위 한 곳에만 둡니다(로그인 확인 오류도 로그인 전 카드 C1과 같게).
 */
function HomeIntro({ errorMessage, slotEvent }: { errorMessage: string | null; slotEvent: SlotEventView | null }) {
  const { freeVisibleLinks, slugChangeIntervalDays, retiredSlugGraceDays } = CRELINK_LIMITS;
  return (
    <div className="home-intro">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-text">
          <p className="brand-mark">크리링</p>
          <h1 id="home-title">{HOME_TITLE}</h1>
          <p className="home-hero-lead">{HOME_LEAD}</p>
          {slotEvent ? <HomeSlotEvent event={slotEvent} signedIn={false} /> : null}
          <div className="home-actions">
            {errorMessage !== null ? (
              <p className="form-error" role="alert">
                로그인 상태를 확인하지 못했어요. {errorMessage}
              </p>
            ) : null}
            <div className="button-row">
              <GoogleStart />
            </div>
          </div>
        </div>
        <HomeExampleLanding />
      </section>
      <section className="home-section" aria-labelledby="home-steps-title">
        <h2 id="home-steps-title">이렇게 시작해요</h2>
        {/* 목록 표시를 없애도 Safari가 목록 의미를 지우지 않게 role="list"를 둡니다. */}
        <ol className="home-cards" role="list">
          <li className="home-card home-step">
            <span className="home-step-num" aria-hidden="true">
              1
            </span>
            <h3>구글로 가입하기</h3>
            <p>구글 계정으로 가입하면 내 페이지와 짧은 크리링 링크가 바로 만들어져요.</p>
          </li>
          <li className="home-card home-step">
            <span className="home-step-num" aria-hidden="true">
              2
            </span>
            <h3>링크 추가하기</h3>
            <p>페이지 편집에서 표시 이름과 주소를 넣어 링크를 추가해요. 포트폴리오도 넣을 수 있어요.</p>
          </li>
          <li className="home-card home-step">
            <span className="home-step-num" aria-hidden="true">
              3
            </span>
            <h3>인스타그램 프로필에 넣기</h3>
            <p>내 크리링 링크를 복사해 인스타그램 앱의 프로필 편집 &gt; 링크에 붙여 넣어요.</p>
          </li>
        </ol>
        <Link className="home-more" href={CRELINK_WEB_PATHS.docsGuide}>
          사용 안내 자세히 보기
        </Link>
      </section>
      <section className="home-section" aria-labelledby="home-free-title">
        <h2 id="home-free-title">무료로 쓸 수 있어요</h2>
        <ul className="home-cards" role="list">
          <li className="home-card">
            <h3>단축 주소 1개</h3>
            <p>인스타그램 프로필에 넣을 짧은 주소예요. 가입하면 자동으로 만들어져요.</p>
          </li>
          <li className="home-card">
            <h3>주소 바꾸기</h3>
            <p>
              주소를 내 이름에 맞게 바꿀 수 있어요. 처음 한 번은 바로, 그 뒤로는 {slugChangeIntervalDays}일에 한
              번이에요. 옛 주소는 {retiredSlugGraceDays}일 동안 새 주소로 연결돼요.
            </p>
          </li>
          <li className="home-card">
            <h3>외부 링크 {freeVisibleLinks}개</h3>
            <p>
              방문자에게 보이는 외부 링크를 {freeVisibleLinks}개까지 둘 수 있어요. 숨긴 링크는 이 수에 들어가지 않아요.
            </p>
          </li>
        </ul>
        <p className="home-free-note">무료 랜딩에는 링크 사이에 크리링 광고가 한 칸 보일 수 있어요.</p>
      </section>
      <section className="home-final" aria-labelledby="home-final-title">
        <h2 id="home-final-title">내 크리링을 만들어 보세요</h2>
        <p>구글 계정으로 가입해요.</p>
        <GoogleStart />
      </section>
    </div>
  );
}

export default async function HomePage() {
  const [session, slotEvent] = await Promise.all([readSession(), readOpenSlotEvent()]);
  return (
    <main className="public-page">
      {session.kind === 'signed-in' ? (
        <SignedInHome user={session.user} slotEvent={slotEvent} />
      ) : (
        <HomeIntro errorMessage={session.kind === 'error' ? session.message : null} slotEvent={slotEvent} />
      )}
      <footer className="site-footer">
        <Link href={CRELINK_WEB_PATHS.docs}>문서</Link>
        <Link href={CRELINK_WEB_PATHS.privacy}>개인정보 처리방침</Link>
      </footer>
    </main>
  );
}
