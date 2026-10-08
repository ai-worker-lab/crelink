import { CRELINK_API_PATHS, type CreatorLandingState } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorPanel } from '../../../../components/ErrorPanel';
import { FeedbackButton } from '../../../../components/FeedbackButton';
import { Landing } from '../../../../components/landing/Landing';
import { LogoutButton } from '../../../../components/LogoutButton';
import { LandingEditor } from '../../../../components/manage/LandingEditor';
import { SiteHeader } from '../../../../components/SiteHeader';
import { loadSignedIn } from '../../../../lib/api/server';
import { toLandingPreview } from '../../../../lib/landing-preview';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '링크 관리', robots: { index: false } };

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

/**
 * 랜딩페이지 관리 화면(PRD R18). 기본은 편집 모드, `?mode=view`는 보기 모드입니다.
 * 보기 모드는 편집 상태를 공개 랜딩 형태로 바꿔(`toLandingPreview`) 공개 랜딩과 같은 `Landing`으로 그립니다.
 */
export default async function ManageLandingPage({ params, searchParams }: Props) {
  const [{ publicId }, { mode }] = await Promise.all([params, searchParams]);
  const viewMode = mode === 'view';
  const result = await loadSignedIn<CreatorLandingState>(CRELINK_API_PATHS.meLanding);
  const own = result.ok && result.data.landing.publicId === publicId ? result.data : null;
  const basePath = `/me/landings/${encodeURIComponent(publicId)}`;
  return (
    <div className="app-page">
      <SiteHeader>
        <Link href="/me">내 크리링</Link>
        <FeedbackButton />
        <LogoutButton />
      </SiteHeader>
      <main className="app-main">
        {!result.ok ? (
          <ErrorPanel title="관리 화면을 불러오지 못했어요." message={result.error.message} />
        ) : !own ? (
          <ErrorPanel
            title="랜딩페이지를 찾을 수 없어요."
            message="주소가 바뀌었거나 내 랜딩페이지가 아니에요. 내 크리링에서 관리 화면으로 다시 들어와 주세요."
            action={{ href: '/me', label: '내 크리링으로' }}
          />
        ) : (
          <>
            <p className="breadcrumb">
              <Link href="/me">← 내 크리링으로 돌아가기</Link>
            </p>
            <h1 className="page-title">링크 관리</h1>
            <p className="page-subtitle">
              공개 주소 <span className="url-text">{own.shortLink.url}</span>
            </p>
            <div className="manage-toolbar">
              <nav className="mode-switch" aria-label="화면 모드">
                <Link className="secondary" href={basePath} aria-current={viewMode ? undefined : 'page'}>
                  편집
                </Link>
                <Link className="secondary" href={`${basePath}?mode=view`} aria-current={viewMode ? 'page' : undefined}>
                  보기
                </Link>
              </nav>
              <a className="secondary" href={own.landing.url} target="_blank" rel="noopener">
                공개 페이지 열기<span className="visually-hidden"> (새 창)</span>
              </a>
            </div>
            {viewMode ? (
              <>
                <p className="section-help">
                  방문자에게 보이는 모습이에요(숨긴 링크·차단된 링크 제외). 여기서 누른 링크는 방문·클릭 기록 없이
                  저장된 주소로 바로 열려요.
                </p>
                <div className="landing-preview">
                  <Landing landing={toLandingPreview(own)} headingLevel={2} />
                </div>
              </>
            ) : (
              <LandingEditor initial={own} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
