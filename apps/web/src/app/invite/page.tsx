import type { Metadata } from 'next';
import { InvitePage } from '../../components/InvitePage';

export const metadata: Metadata = { title: '공유 페이지 초대', robots: { index: false, follow: false } };
export default function Page() {
  return <InvitePage />;
}
