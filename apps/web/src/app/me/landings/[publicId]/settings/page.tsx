import type { Metadata } from 'next';
import { AddressSettings } from '../../../../../components/manage/AddressSettings';
import { managerMenuLabel } from '../../../../../components/manage/menu';

export const metadata: Metadata = { title: managerMenuLabel('settings'), robots: { index: false } };

/** `주소 설정` 메뉴(PRD R8): 내 크리링 링크·주소 바꾸기·계정. */
export default function SettingsPage() {
  return <AddressSettings />;
}
