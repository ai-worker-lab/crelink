import { CRELINK_API_PATHS, inAppKindOfUserAgent, type InstagramIntegrationView } from '@crelink/shared';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ErrorPanel } from '../../../../../components/ErrorPanel';
import { InstagramSettings } from '../../../../../components/manage/instagram/InstagramSettings';
import { currentTimeMs, readConnectFailure } from '../../../../../components/manage/instagram/state';
import { managerHref, managerMenuLabel } from '../../../../../components/manage/menu';
import { loadSignedIn } from '../../../../../lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: managerMenuLabel('instagram'), robots: { index: false } };

/**
 * `인스타그램 DM` 메뉴(docs/specs/instagram-comment-dm.md): 연결과 댓글 자동 DM 규칙. 소유자 전용이라 편집자(403)에게는 안내만 보입니다.
 * `?instagram_error=<코드>`는 OAuth 콜백 route가 실패한 연결을 돌려보낼 때 붙이는 값이고, 알려진 코드만 안내합니다.
 * 인앱 브라우저 판정은 가입 안내와 같은 `inAppKindOfUserAgent`입니다(UA를 알 수 없으면 막지 않음).
 */
export default async function InstagramPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ instagram_error?: string | string[] }>;
}) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  const result = await loadSignedIn<InstagramIntegrationView>(CRELINK_API_PATHS.meInstagram, publicId);
  if (!result.ok && result.error.status === 403) {
    return (
      <ErrorPanel
        title="소유자만 쓸 수 있어요."
        message="인스타그램 자동 DM은 페이지 소유자만 연결하고 설정할 수 있어요."
        action={{ href: managerHref(publicId, ''), label: '페이지 편집으로' }}
      />
    );
  }
  if (!result.ok && result.error.code === 'instagram_not_configured') {
    return (
      <ErrorPanel
        title="아직 사용할 수 없어요."
        message="인스타그램 자동 DM은 준비 중이에요. 열리면 이 메뉴에서 연결할 수 있어요."
        action={{ href: managerHref(publicId, ''), label: '페이지 편집으로' }}
      />
    );
  }
  if (!result.ok) {
    return (
      <ErrorPanel
        title="인스타그램 연결 정보를 불러오지 못했어요."
        message={result.error.message}
        action={{ href: managerHref(publicId, 'instagram'), label: '다시 시도', reload: true }}
      />
    );
  }
  const kind = inAppKindOfUserAgent((await headers()).get('user-agent'));
  return (
    <InstagramSettings
      initial={result.data}
      inApp={kind !== 'none' && kind !== 'unknown'}
      failure={readConnectFailure(query.instagram_error)}
      now={currentTimeMs()}
    />
  );
}
