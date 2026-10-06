import { CRELINK_API_PATHS, CRELINK_WEB_PATHS, type PublicLandingResponse } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { Landing } from '../../../../components/landing/Landing';
import { serverApi, ServerApiError, type ServerApiResult } from '../../../../lib/api/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ publicId: string }> };

/** 메타데이터와 화면이 같은 요청 안에서 한 번만 조회하도록 묶습니다. */
const loadLanding = cache(async (publicId: string): Promise<ServerApiResult<PublicLandingResponse>> => {
  try {
    return { ok: true, data: await serverApi<PublicLandingResponse>(CRELINK_API_PATHS.publicLanding(publicId)) };
  } catch (error) {
    if (error instanceof ServerApiError) return { ok: false, error };
    throw error;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const result = await loadLanding((await params).publicId);
  if (!result.ok) return { title: { absolute: '크리링' }, robots: { index: false } };
  return {
    title: { absolute: result.data.displayName ?? '크리링' },
    description: result.data.bio ?? undefined,
  };
}

export default async function PublicLandingPage({ params }: Params) {
  const result = await loadLanding((await params).publicId);
  return (
    <div className="profile-page">
      <main className="profile-main">
        {result.ok ? <Landing landing={result.data} /> : <LandingError error={result.error} />}
      </main>
      <footer className="profile-footer">
        <Link className="brand" href="/">
          크리링
        </Link>
        <span aria-hidden="true">·</span>
        <Link href={CRELINK_WEB_PATHS.privacy}>개인정보 처리방침</Link>
      </footer>
    </div>
  );
}

function LandingError({ error }: { error: ServerApiError }) {
  const [title, body] =
    error.status === 404
      ? ['없는 페이지예요.', '주소가 바뀌었거나 사라진 크리링 페이지예요.']
      : error.status === 410
        ? ['운영이 중지된 페이지예요.', '이 크리에이터의 크리링 페이지는 지금 볼 수 없어요.']
        : ['페이지를 불러오지 못했어요.', `${error.message} 잠시 후 다시 시도해 주세요.`];
  return (
    <div className="empty-state" role="status">
      <h1>{title}</h1>
      <p>{body}</p>
      <Link className="primary" href="/">
        크리링 홈으로
      </Link>
    </div>
  );
}
