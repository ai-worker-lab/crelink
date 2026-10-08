import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageEditor } from '../../../../components/manage/PageEditor';
import { managerHref, managerMenuLabel } from '../../../../components/manage/menu';

export const metadata: Metadata = { title: managerMenuLabel(''), robots: { index: false } };

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** `페이지 편집` 메뉴(기본). 옛 보기 모드 주소(`?mode=view`)는 실시간 미리보기가 대신하므로 쿼리 없는 이 주소로 보냅니다. */
export default async function PageEditPage({ params, searchParams }: Props) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  if (query.mode !== undefined) redirect(managerHref(publicId, ''));
  return <PageEditor />;
}
