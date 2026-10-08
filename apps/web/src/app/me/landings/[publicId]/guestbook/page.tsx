import type { Metadata } from 'next';
import { GuestbookManager } from '../../../../../components/manage/GuestbookManager';
import { managerMenuLabel } from '../../../../../components/manage/menu';

export const metadata: Metadata = { title: managerMenuLabel('guestbook'), robots: { index: false } };

/** `방명록` 메뉴(PRD R19): 방명록 켜기와 글 관리(숨기기·숨김 해제). */
export default function GuestbookPage() {
  return <GuestbookManager />;
}
