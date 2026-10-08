import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ServerApiError } from '../../lib/api/server';
import { ErrorPanel } from '../ErrorPanel';
import { FeedbackButton } from '../FeedbackButton';
import { LogoutButton } from '../LogoutButton';
import { SiteHeader } from '../SiteHeader';

/** 운영자 화면 틀. 조회가 403이면 권한 없음 안내, 그 밖의 오류는 오류 안내를 그립니다. */
export function AdminShell({ error, children }: { error?: ServerApiError | null; children: ReactNode }) {
  return (
    <div className="app-page">
      <SiteHeader label="운영자 메뉴">
        <Link href="/admin">크리에이터</Link>
        <Link href="/admin/blocked-domains">차단 도메인</Link>
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
              title="운영자 화면을 불러오지 못했어요."
              message={error.message}
              action={{ href: '/admin', label: '크리에이터 목록으로' }}
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
