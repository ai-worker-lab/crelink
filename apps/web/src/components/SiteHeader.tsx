import Link from 'next/link';
import type { ReactNode } from 'react';

/** 로그인 화면(편집·운영자) 공통 머리글: 크리링 표시와 화면별 메뉴. */
export function SiteHeader({ children, label = '주요 메뉴' }: { children?: ReactNode; label?: string }) {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        크리링
      </Link>
      {children ? (
        <nav className="site-nav" aria-label={label}>
          {children}
        </nav>
      ) : null}
    </header>
  );
}
