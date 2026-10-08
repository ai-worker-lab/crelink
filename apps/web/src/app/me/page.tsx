import { CRELINK_API_PATHS, type CreatorLandingState } from '@crelink/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ErrorPanel } from '../../components/ErrorPanel';
import { FeedbackButton } from '../../components/FeedbackButton';
import { LogoutButton } from '../../components/LogoutButton';
import { managerHref } from '../../components/manage/menu';
import { SiteHeader } from '../../components/SiteHeader';
import { loadSignedIn } from '../../lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '내 크리링', robots: { index: false } };

/**
 * 로그인 뒤 도착지(`/auth/google/callback`·`/auth/return/go`)이자 홈의 `내 크리링 편집`. 내 랜딩(MVP는 1개)의 관리 화면 `페이지 편집`으로 보냅니다.
 * 401(로그아웃·정지로 끊긴 세션)은 홈으로 보내고, 그 밖의 API 오류는 안내를 그립니다.
 */
export default async function MePage() {
  const landing = await loadSignedIn<CreatorLandingState>(CRELINK_API_PATHS.meLanding);
  if (landing.ok) redirect(managerHref(landing.data.landing.publicId, ''));
  return (
    <div className="app-page">
      <SiteHeader>
        <LogoutButton />
      </SiteHeader>
      <main className="app-main">
        <ErrorPanel
          title="편집 화면을 불러오지 못했어요."
          message={landing.error.message}
          action={{ href: '/me', label: '다시 시도', reload: true }}
        />
      </main>
      <FeedbackButton />
    </div>
  );
}
