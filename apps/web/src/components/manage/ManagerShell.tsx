'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useWideLayout } from '../../lib/use-wide-layout';
import { BannerSlotNotice } from './BannerSlotSection';
import { useManager } from './ManagerContext';
import { ManagerStage, NarrowBar, PreviewLanding, type PreviewMode } from './ManagerPreview';
import { MANAGER_MENU, managerHref, managerMenuLabel, type ManagerMenuSegment } from './menu';

/**
 * 랜딩 관리 화면 틀(디자인 design/preview-direct-edit/handoff.md).
 * 1024px 이상: 관리 메뉴 · 가운데 무대(주소 막대 + 휴대폰 미리보기) · 오른쪽 편집 패널(메뉴 내용).
 * 1023px 이하: 가로 탭 메뉴 · sticky 줄(주소, `편집 | 미리보기`) · 한 열. `페이지 편집`의 편집 화면은 고르기 칩이 있는 전체 폭 랜딩이고
 * (고른 내용은 패널이 하단 시트로 엶), 다른 메뉴의 편집 화면은 패널 내용입니다. `미리보기`는 방문자 모습입니다.
 * 배치는 `styles.css`의 `.manager*`, 폭 경계는 `use-wide-layout.ts`입니다.
 */
export function ManagerShell({ children }: { children: ReactNode }) {
  const wide = useWideLayout();
  const segment = useMenuSegment();
  const mode: PreviewMode = segment === '' ? 'edit' : segment === 'profile' ? 'profile' : 'plain';
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [viewSegment, setViewSegment] = useState(segment);
  // 메뉴를 옮기면 편집 화면으로 돌아갑니다.
  if (viewSegment !== segment) {
    setViewSegment(segment);
    setView('edit');
  }

  // 자식 자리를 폭과 관계없이 고정합니다(없는 자리는 null). 그래야 1024px 경계를 넘거나 좁은 기기에서 하이드레이션할 때
  // 메뉴 내용(children)이 다시 마운트되지 않아 고른 대상·입력 중인 값·불러온 목록이 남습니다.
  const narrowPreview = !wide && view === 'preview';
  return (
    <div className="manager">
      <ManagerMenu />
      {wide ? <ManagerStage mode={mode} /> : null}
      <main className="manager-panel">
        {wide ? null : <NarrowBar view={view} onViewChange={setView} />}
        {narrowPreview ? <h1 className="visually-hidden">{managerMenuLabel(segment)} 미리보기</h1> : null}
        {/* 배너 슬롯 회수 안내(좁은 화면 `페이지 편집`): 닫힌 시트 대신 초점을 받도록 미리보기 위에 둡니다. */}
        {!wide && !narrowPreview && mode === 'edit' ? <BannerSlotNotice autoFocus /> : null}
        {wide ? null : narrowPreview ? (
          <PreviewLanding key="plain" mode="plain" framed={false} />
        ) : mode === 'edit' ? (
          <PreviewLanding key="edit" mode="edit" framed={false} />
        ) : null}
        <div className="manager-content" hidden={narrowPreview}>
          {children}
        </div>
      </main>
    </div>
  );
}

/** 지금 주소의 메뉴. 메뉴 주소가 아니면 기본 메뉴(페이지 편집)로 봅니다. */
function useMenuSegment(): ManagerMenuSegment {
  const pathname = usePathname();
  const { publicId } = useManager().state.landing;
  return MANAGER_MENU.find((item) => managerHref(publicId, item.segment) === pathname)?.segment ?? '';
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
