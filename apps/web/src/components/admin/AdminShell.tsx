import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ServerApiError } from '../../lib/api/server';
import { ErrorPanel } from '../ErrorPanel';
import { FeedbackButton } from '../FeedbackButton';
import { LogoutButton } from '../LogoutButton';
import { SiteHeader } from '../SiteHeader';

/**
 * 운영자 화면 틀. 조회가 403이면 권한 없음 안내, 그 밖의 오류는 오류 안내를 그립니다.
 * 화면마다 오류 제목(`errorTitle`)과 `다시 시도`로 다시 읽을 주소(`retryHref`, 문서를 새로 불러옴)를 줄 수 있고, 없으면 크리에이터 목록으로 안내합니다.
 */
export function AdminShell({
  error,
  errorTitle = '운영자 화면을 불러오지 못했어요.',
  retryHref,
  children,
}: {
  error?: ServerApiError | null;
  errorTitle?: string;
  retryHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="app-page">
      <SiteHeader label="운영자 메뉴">
        <Link href="/admin">크리에이터</Link>
        <Link href="/admin/blocked-domains">차단 도메인</Link>
        <Link href="/admin/ad-banners">광고 배너</Link>
        <Link href="/admin/slot-event">이벤트</Link>
        <Link href="/me">내 크리링</Link>
        <LogoutButton />
      </SiteHeader>
      <main className="app-main wide">
        {error ? (
          error.status === 403 ? (
            <ErrorPanel
              title="권한이 없어요."
              message="운영자만 볼 수 있는 화면이에요. 운영자 구글 계정으로 로그인해 주세요."
              action={{ href: '/me', label: '내 크리링으로' }}
            />
          ) : (
            <ErrorPanel
              title={errorTitle}
              message={error.message}
              action={
                retryHref
                  ? { href: retryHref, label: '다시 시도', reload: true }
                  : { href: '/admin', label: '크리에이터 목록으로' }
              }
            />
          )
        ) : (
          children
        )}
      </main>
      <FeedbackButton />
    </div>
  );
}
