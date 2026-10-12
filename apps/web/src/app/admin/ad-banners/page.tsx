import { CRELINK_API_PATHS, type AdBannerListResponse, type AdBlockSettingView } from '@crelink/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdBanners } from '../../../components/admin/AdBanners';
import { AdBlockSetting } from '../../../components/admin/AdBlockSetting';
import { AdminShell } from '../../../components/admin/AdminShell';
import { loadSignedIn } from '../../../lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '광고 배너 · 운영자', robots: { index: false } };

/**
 * 운영자 크리링 광고 배너(R20 ④⑧⑨)와 플랫폼 광고 블록 스위치(R20 ⑩). 전체 목록과 스위치 상태를 서버에서 함께 읽고,
 * 걸러보기·정렬·등록은 `AdBanners`, 스위치는 `AdBlockSetting`이 맡습니다. 스위치 상태만 못 읽으면 그 카드 자리에 오류와 `다시 시도`를 둡니다.
 */
export default async function AdBannersPage() {
  const [result, adBlock] = await Promise.all([
    loadSignedIn<AdBannerListResponse>(CRELINK_API_PATHS.adminAdBanners),
    loadSignedIn<AdBlockSettingView>(CRELINK_API_PATHS.adminAdBlock),
  ]);
  return (
    <AdminShell
      error={result.ok ? null : result.error}
      errorTitle="광고 배너를 불러오지 못했어요."
      retryHref="/admin/ad-banners"
    >
      {result.ok ? (
        <AdBanners
          list={result.data}
          adBlock={
            adBlock.ok ? (
              <AdBlockSetting setting={adBlock.data} />
            ) : (
              <section className="card" aria-labelledby="ad-block-error-title">
                <h2 id="ad-block-error-title">광고 블록</h2>
                <p className="form-error" role="alert">
                  광고 블록 설정을 불러오지 못했어요. {adBlock.error.message}
                </p>
                <Link className="secondary" href="/admin/ad-banners">
                  다시 시도
                </Link>
              </section>
            )
          }
        />
      ) : null}
    </AdminShell>
  );
}
