import type { Metadata } from 'next';
import { ProfileEditor } from '../../../../../components/manage/ProfileEditor';
import { managerMenuLabel } from '../../../../../components/manage/menu';

export const metadata: Metadata = { title: managerMenuLabel('profile'), robots: { index: false } };

/** `프로필` 메뉴(PRD R12·R17·R18): 프로필 사진·이름·소개와 SNS 채널. */
export default function ProfilePage() {
  return <ProfileEditor />;
}
