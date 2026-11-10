import { redirect } from 'next/navigation';
import { managerHref } from '../../../../../components/manage/menu';

type Props = { params: Promise<{ publicId: string }> };

/** 옛 `주소 설정` 주소. 주소 복사·변경은 `페이지 편집`의 주소 막대로 옮겼으므로 그 화면으로 보냅니다(0234). */
export default async function SettingsPage({ params }: Props) {
  const { publicId } = await params;
  redirect(managerHref(publicId, ''));
}
