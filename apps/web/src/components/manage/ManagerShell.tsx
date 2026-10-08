'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { CopyButton } from '../CopyButton';
import { DefaultAvatar } from '../DefaultAvatar';
import { RemoteImage } from '../RemoteImage';
import { useManager } from './ManagerContext';
import { ManagerPreview } from './ManagerPreview';
import { MANAGER_MENU, managerHref } from './menu';

/**
 * 랜딩 관리 화면 틀(디자인 design/desktop-landing-manager/handoff.md): 관리 메뉴 · 관리 패널(머리 카드 + 메뉴 내용) · 미리보기.
 * 1200px 이상은 세 열, 1024~1199px은 메뉴가 위쪽 가로 탭이고 패널·미리보기 두 열, 1023px 이하는 한 열에 떠 있는 `미리보기` 버튼입니다
 * (배치는 `styles.css`의 `.manager*`).
 */
export function ManagerShell({ children }: { children: ReactNode }) {
  return (
    <div className="manager">
      <ManagerMenu />
      <main className="manager-panel">
        <ManagerSummary />
        {children}
      </main>
      <ManagerPreview />
    </div>
  );
}

/** 관리 메뉴. 메뉴는 주소가 바뀌는 이동이라 탭 위젯이 아니라 링크 목록이고, 지금 메뉴에 `aria-current="page"`를 둡니다. */
function ManagerMenu() {
  const pathname = usePathname();
  const { publicId } = useManager().state.landing;
  return (
    <nav className="manager-menu" aria-label="관리 메뉴">
      <ul>
        {MANAGER_MENU.map((item) => {
          const href = managerHref(publicId, item.segment);
          return (
            <li key={item.segment}>
              <Link href={href} aria-current={pathname === href ? 'page' : undefined}>
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 모든 메뉴 위의 내 페이지 머리 카드: 프로필 사진(없으면 기본 프로필)·표시 이름·단축 주소와 복사·`주소 변경`. 방문 수는 두지 않습니다(R10). */
function ManagerSummary() {
  const { state, requestSlugFocus } = useManager();
  const { landing, shortLink } = state;
  return (
    <section className="card manager-summary" aria-label="내 페이지">
      {landing.avatar ? (
        <RemoteImage className="summary-avatar" src={landing.avatar.url} alt="" width={56} height={56} />
      ) : (
        <DefaultAvatar className="summary-avatar" />
      )}
      <div className="summary-text">
        <p className={landing.displayName ? 'summary-name' : 'summary-name is-empty'}>
          {landing.displayName ?? '이름 없음'}
        </p>
        <div className="summary-url">
          <code className="url-text">{shortLink.url.replace(/^https?:\/\//, '')}</code>
          <CopyButton text={shortLink.url} label="내 크리링 링크 복사" />
        </div>
      </div>
      <Link
        className="secondary summary-change"
        href={managerHref(landing.publicId, 'settings')}
        onClick={requestSlugFocus}
      >
        주소 변경
      </Link>
      <p className="summary-help">인스타그램 프로필 편집 &gt; 링크에 이 주소를 붙여 넣으세요.</p>
    </section>
  );
}
