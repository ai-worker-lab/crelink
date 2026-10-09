import { CRELINK_API_PATHS, type AdBannerListResponse } from '@crelink/shared';
import type { Metadata } from 'next';
import { AdBanners } from '../../../components/admin/AdBanners';
import { AdminShell } from '../../../components/admin/AdminShell';
import { loadSignedIn } from '../../../lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '광고 배너 · 운영자', robots: { index: false } };

/** 운영자 크리링 광고 배너(R20 ④⑧⑨). 전체 목록을 서버에서 읽고 걸러보기·정렬·등록은 `AdBanners`가 맡습니다. */
export default async function AdBannersPage() {
  const result = await loadSignedIn<AdBannerListResponse>(CRELINK_API_PATHS.adminAdBanners);
  return (
    <AdminShell
      error={result.ok ? null : result.error}
      errorTitle="광고 배너를 불러오지 못했어요."
      retryHref="/admin/ad-banners"
    >
      {result.ok ? <AdBanners list={result.data} /> : null}
    </AdminShell>
  );
}
