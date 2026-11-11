import { CRELINK_API_PATHS, type ChannelLinkView } from '@crelink/shared';
import type { Metadata } from 'next';
import { ChannelLinks } from '../../../../../components/manage/ChannelLinks';
import { managerHref, managerMenuLabel } from '../../../../../components/manage/menu';
import { ErrorPanel } from '../../../../../components/ErrorPanel';
import { loadSignedIn } from '../../../../../lib/api/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: managerMenuLabel('channels'), robots: { index: false } };

/** `채널 주소` 메뉴(docs/specs/channel-links.md): 채널별 짧은 주소 만들기·복사·보관. 401은 홈으로, 그 밖의 오류는 다시 시도 안내입니다. */
export default async function ChannelsPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const result = await loadSignedIn<ChannelLinkView[]>(CRELINK_API_PATHS.meChannelLinks, publicId);
  if (!result.ok && result.error.status === 403) {
    return (
      <ErrorPanel
        title="소유자만 쓸 수 있어요."
        message="채널 주소는 페이지 소유자만 만들고 보관할 수 있어요."
        action={{ href: managerHref(publicId, ''), label: '페이지 편집으로' }}
      />
    );
  }
  if (!result.ok) {
    return (
      <ErrorPanel
        title="채널 주소를 불러오지 못했어요."
        message={result.error.message}
        action={{ href: managerHref(publicId, 'channels'), label: '다시 시도', reload: true }}
      />
    );
  }
  return <ChannelLinks initial={result.data} />;
}
