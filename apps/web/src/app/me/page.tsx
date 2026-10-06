import { CRELINK_API_PATHS, type CreatorLandingState, type MeResponse } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorPanel } from '../../components/ErrorPanel';
import { LogoutButton } from '../../components/LogoutButton';
import { SiteHeader } from '../../components/SiteHeader';
import { CreatorEditor } from '../../components/me/CreatorEditor';
import { loadSignedIn } from '../../lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '내 크리링', robots: { index: false } };

export default async function MePage() {
  const [landing, me] = await Promise.all([
    loadSignedIn<CreatorLandingState>(CRELINK_API_PATHS.meLanding),
    loadSignedIn<MeResponse>(CRELINK_API_PATHS.me),
  ]);
  return (
    <div className="app-page">
      <SiteHeader>
        {me.ok && me.data.role === 'operator' ? <Link href="/admin">운영자 화면</Link> : null}
        <LogoutButton />
      </SiteHeader>
      <main className="app-main">
        {landing.ok ? (
          <>
            <h1 className="page-title">내 크리링</h1>
            {me.ok ? <p className="page-subtitle">{me.data.email}</p> : null}
            <CreatorEditor initial={landing.data} />
          </>
        ) : (
          <ErrorPanel title="편집 화면을 불러오지 못했어요." message={landing.error.message} />
        )}
      </main>
    </div>
  );
}
