import { CRELINK_API_PATHS, CRELINK_WEB_PATHS, LANDING_PASS_PARAM, type PublicLandingResponse } from '@crelink/shared';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { Landing } from '../../../../components/landing/Landing';
import { PassCleanup } from '../../../../components/landing/PassCleanup';
import { serverApi, ServerApiError, type ServerApiResult } from '../../../../lib/api/server';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 메타데이터와 화면이 같은 요청 안에서 한 번만 조회하도록 묶습니다. 통과 표시 검증 결과가 달라지므로 `pass`도 키에 넣습니다. */
const loadLanding = cache(
  async (publicId: string, pass: string | undefined): Promise<ServerApiResult<PublicLandingResponse>> => {
    try {
      return {
        ok: true,
        data: await serverApi<PublicLandingResponse>(CRELINK_API_PATHS.publicLanding(publicId, pass)),
      };
    } catch (error) {
      if (error instanceof ServerApiError) return { ok: false, error };
      throw error;
    }
  },
);

/**
 * 외부에서 들어온 방문은 단축 주소(`GET {SHORT}/{slug}`)에서만 기록되므로(PRD R7) 다음 중 하나일 때만 그대로 그립니다.
 * - `Sec-Fetch-Site: same-origin`: 우리 서비스 화면에서 연 경우(관리 화면 미리보기·공개 페이지 열기, 운영자 화면, Next 클라이언트 이동).
 * - 단축 주소 리디렉트가 붙인 통과 표시(`?pass=`)를 API가 받아들인 경우(`passAccepted`).
 * 그 밖(외부 링크, 주소창 직접 입력, 메신저 미리보기 봇, Sec-Fetch 헤더를 보내지 않는 클라이언트)은 현재 단축 주소로 보내
 * 방문을 기록하게 합니다. 무효·만료 표시도 단축 주소에서 새 표시를 받아 돌아오므로 반복되지 않습니다.
 * 랜딩 오류(404·410·API 오류)는 보낼 곳이 없거나 모르므로 리디렉트하지 않고 오류 화면을 그립니다.
 * 이 화면 위에 `loading.tsx`(Suspense 경계)를 두면 응답이 먼저 나가 리디렉트가 HTTP 307이 아닌 200 + meta refresh가 되므로 두지 않습니다.
 */
async function loadForRequest({ params, searchParams }: Props) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  const value = query[LANDING_PASS_PARAM];
  const pass = typeof value === 'string' ? value : undefined;
  const result = await loadLanding(publicId, pass);
  if (result.ok && !result.data.passAccepted && (await headers()).get('sec-fetch-site') !== 'same-origin') {
    redirect(result.data.shortUrl);
  }
  return { result, hasPass: value !== undefined };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { result } = await loadForRequest(props);
  if (!result.ok) return { title: { absolute: '크리링' }, robots: { index: false } };
  return {
    title: { absolute: result.data.displayName ?? '크리링' },
    description: result.data.bio ?? undefined,
  };
}

export default async function PublicLandingPage(props: Props) {
  const { result, hasPass } = await loadForRequest(props);
  return (
    <div className="profile-page">
      {hasPass ? <PassCleanup /> : null}
      <main className="profile-main">
        {result.ok ? <Landing landing={result.data} /> : <LandingError error={result.error} />}
      </main>
      <footer className="profile-footer">
        {result.ok ? (
          // 정상 랜딩만 가입 유도 문구. 유입 경로 쿼리는 0087 결정 전이라 붙이지 않는다(design/landing-footer-cta/handoff.md).
          <Link className="footer-cta" href="/">
            <span>
              나도 <strong className="brand">크리링</strong> 만들기
            </span>
          </Link>
        ) : (
          <Link className="brand" href="/">
            크리링
          </Link>
        )}
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
