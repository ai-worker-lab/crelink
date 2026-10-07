'use client';

import { CRELINK_WEB_PATHS } from '@crelink/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PUBLIC_DOCS } from '../../lib/docs';

/** 공개 문서 사이 이동. 지금 보는 문서에 aria-current를 붙입니다. */
export function DocsNav() {
  const pathname = usePathname();
  const items = [{ href: CRELINK_WEB_PATHS.docs, title: '문서 목록' }, ...PUBLIC_DOCS];
  return (
    <nav className="docs-nav" aria-label="문서">
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
