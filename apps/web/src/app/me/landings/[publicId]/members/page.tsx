import type { Metadata } from 'next';
import { PageMembers } from '../../../../../components/manage/PageMembers';
import { managerMenuLabel } from '../../../../../components/manage/menu';

export const metadata: Metadata = { title: managerMenuLabel('members'), robots: { index: false } };

export default function MembersPage() {
  return <PageMembers />;
}
