import type { Metadata } from 'next';
import Link from 'next/link';
import { isNoticeReason, NOTICE_MESSAGES } from '../../../lib/api/errors';

export const metadata: Metadata = { title: '안내', robots: { index: false } };

const DEFAULT_NOTICE = {
  title: '페이지를 열 수 없어요.',
  body: '요청을 처리하지 못했어요. 주소를 확인하거나 잠시 후 다시 시도해 주세요.',
};

export default async function NoticePage({ searchParams }: { searchParams: Promise<{ reason?: string | string[] }> }) {
  const { reason } = await searchParams;
  const value = Array.isArray(reason) ? reason[0] : reason;
  const notice = isNoticeReason(value) ? NOTICE_MESSAGES[value] : DEFAULT_NOTICE;
  return (
    <main className="public-page narrow-page">
      <p className="brand-mark">
        <Link href="/">크리링</Link>
      </p>
      <div className="empty-state" role="status">
        <h1>{notice.title}</h1>
        <p>{notice.body}</p>
        <Link className="primary" href="/">
          크리링 홈으로
        </Link>
      </div>
    </main>
  );
}
