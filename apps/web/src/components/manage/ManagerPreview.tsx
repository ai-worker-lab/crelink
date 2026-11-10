'use client';

import { CRELINK_LIMITS } from '@crelink/shared';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { targetKey, type LandingEditTarget } from '../../lib/landing-edit';
import { DRAFT_ITEM_ID, previewBannerSlot, toLandingPreview, type LandingDrafts } from '../../lib/landing-preview';
import { useCopyResult } from '../../lib/use-copy-result';
import { CopyButton } from '../CopyButton';
import { Landing } from '../landing/Landing';
import type { LandingEditControl } from '../landing/LandingEdit';
import type { LandingTab } from '../landing/LandingTabs';
import { AddressBar } from './AddressBar';
import { CopyResultLine, lockIcon, openIcon, pencilIcon } from './AddressParts';
import { useManager } from './ManagerContext';
import { linkLimitNotice } from './limits';
import { managerHref } from './menu';
import { SlugSheet } from './SlugSheet';

/** 미리보기 쓰임: `edit` 페이지 편집(고르기 층), `profile` 프로필 메뉴(머리·SNS만 강조), `plain` 방문자 모습. */
export type PreviewMode = 'edit' | 'profile' | 'plain';

/** 저장하지 않은 입력이 하나라도 있는지(주소 막대의 `저장하지 않은 변경 포함`). */
function useHasDraft(): boolean {
  const { dirty } = useManager();
  return Object.values(dirty).some(Boolean);
}

/**
 * 1024px 이상 가운데 무대(디자인 design/preview-direct-edit/handoff.md, 주소 막대는 design/manager-address-bar/handoff.md): 주소 막대(`AddressBar`)와
 * `저장하지 않은 변경 포함` 아래 휴대폰 프레임 미리보기. 무대는 sticky이고 프레임 안만 스크롤합니다.
 */
export function ManagerStage({ mode }: { mode: PreviewMode }) {
  const hasDraft = useHasDraft();
  return (
    <section className="manager-stage" aria-label="미리보기">
      <AddressBar />
      <div className="preview-device">
        {hasDraft ? <span className="badge dirty-chip device-chip">저장하지 않은 변경 포함</span> : null}
        <PreviewLanding mode={mode} framed />
      </div>
    </section>
  );
}

/**
 * 1023px 이하 탭 아래 sticky 줄: 단축 주소·복사·주소 변경(잠겼으면 다음 변경 가능일)·공개 페이지 열기(아이콘)와 `편집 | 미리보기` 전환.
 * 주소를 바꿀 입력란을 둘 폭이 없고 고정 막대의 입력은 모바일 키보드와 부딪혀 주소 변경은 하단 시트로 엽니다.
 * `미리보기`면 편집 칩·폼 대신 방문자 모습을 보여 줍니다(0053의 떠 있는 `미리보기` 버튼을 대신함).
 */
export function NarrowBar({
  view,
  onViewChange,
}: {
  view: 'edit' | 'preview';
  onViewChange: (view: 'edit' | 'preview') => void;
}) {
  const { state, firstRunGuide } = useManager();
  const { landing, shortLink } = state;
  const copy = useCopyResult();
  const copyRef = useRef<HTMLButtonElement>(null);
  const sheetButtonRef = useRef<HTMLButtonElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetClosed, setSheetClosed] = useState(0);
  const [messageClosed, setMessageClosed] = useState(0);
  const locked = shortLink.nextChangeAvailableAt !== null;

  // 시트가 사라진 뒤에야 초점을 옮길 수 있습니다(`EditSheet` 규칙대로 연 쪽이 맡음).
  useEffect(() => {
    if (sheetClosed > 0) sheetButtonRef.current?.focus();
  }, [sheetClosed]);
  useEffect(() => {
    if (messageClosed > 0) copyRef.current?.focus();
  }, [messageClosed]);

  // 이 줄은 메뉴를 옮겨도 마운트가 유지되므로 메뉴 이동을 직접 보고 복사 결과를 닫습니다.
  const pathname = usePathname();
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    copy.clear();
  }

  const failed = copy.result === 'failed';
  const messageClass = ['address-message', copy.result ? '' : 'is-empty', failed ? '' : 'is-passive']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="narrow-bar">
      <code className="url-text">{shortLink.url.replace(/^https?:\/\//, '')}</code>
      <CopyButton
        icon
        text={shortLink.url}
        label="내 크리링 링크 복사"
        onCopied={firstRunGuide.recordCopy}
        onResult={copy.report}
        buttonRef={copyRef}
      />
      {/* 연필과 자물쇠는 같은 버튼이어야 저장 뒤 시트를 닫을 때 초점이 돌아갈 곳이 남습니다. */}
      <button
        ref={sheetButtonRef}
        type="button"
        className="secondary icon-only"
        aria-label={locked ? '주소 변경 잠김, 다음 변경 가능일 보기' : '주소 변경'}
        onClick={() => setSheetOpen(true)}
      >
        {locked ? lockIcon : pencilIcon}
      </button>
      <a
        className="secondary icon-only"
        href={landing.url}
        target="_blank"
        rel="noopener"
        aria-label="공개 페이지 열기 (새 창)"
      >
        {openIcon}
      </a>
      <div className="view-toggle" role="group" aria-label="미리보기 모드">
        <button type="button" aria-pressed={view === 'edit'} onClick={() => onViewChange('edit')}>
          편집
        </button>
        <button type="button" aria-pressed={view === 'preview'} onClick={() => onViewChange('preview')}>
          미리보기
        </button>
      </div>
      <div className={messageClass}>
        <CopyResultLine result={copy.result} url={shortLink.url} />
        {failed ? (
          <div className="address-message-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                copy.clear();
                setMessageClosed((count) => count + 1);
              }}
            >
              닫기
            </button>
          </div>
        ) : null}
      </div>
      {sheetOpen ? (
        <SlugSheet
          onClose={() => {
            setSheetOpen(false);
            setSheetClosed((count) => count + 1);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * 미리보기 랜딩(PRD R18). 공개 랜딩과 같은 `Landing`으로, 저장 상태(`toLandingPreview`: 숨긴·차단 링크 제외)에 저장하지 않은 입력을
 * 항목별로 덮어 그립니다. `framed`면 휴대폰 프레임 안(안만 스크롤), 아니면 1023px 이하 전체 폭입니다.
 * 탭은 관리 화면 주소의 해시를 바꾸지 않는 제어형이고, `방명록` 메뉴나 방명록을 고르면 방명록 탭을, 링크·포트폴리오를 고르면 링크 탭을 엽니다.
 * 안의 링크·SNS·포트폴리오는 이동하지 않습니다(`edit`면 고르기 버튼, 아니면 누름 무시).
 */
export function PreviewLanding({ mode, framed }: { mode: PreviewMode; framed: boolean }) {
  const pathname = usePathname();
  const {
    state,
    profile,
    socials,
    linkDrafts,
    portfolioDrafts,
    bannerDrafts,
    guestbookAction,
    guestbookVersion,
    selection,
    select,
    isLinkDirty,
    isPortfolioDirty,
    isBannerDirty,
    dirty,
    formPending,
  } = useManager();
  const screenRef = useRef<HTMLDivElement>(null);
  const onGuestbookMenu = pathname === managerHref(state.landing.publicId, 'guestbook');
  const wantedTab: LandingTab = onGuestbookMenu || selection?.kind === 'guestbook' ? 'guestbook' : 'links';
  const [tab, setTab] = useState<LandingTab>(wantedTab);
  const [seenWanted, setSeenWanted] = useState(wantedTab);
  if (seenWanted !== wantedTab) {
    setSeenWanted(wantedTab);
    setTab(wantedTab);
  }

  // 프로필 메뉴는 프로필 머리·SNS 줄이 보이도록 맨 위에서 시작합니다.
  useEffect(() => {
    if (mode === 'profile') screenRef.current?.scrollTo({ top: 0 });
  }, [mode]);

  const drafts: LandingDrafts = {
    profile,
    socials,
    links: [...linkDrafts.values()],
    portfolio: [...portfolioDrafts.values()],
    banners: [...bannerDrafts.values()],
  };
  const drafted = toLandingPreview(state, drafts);
  // 방명록 켜기를 저장하는 동안은 탭을 그리지 않습니다(저장 전에 목록을 부르면 꺼진 랜딩의 404를 받음).
  const landing = guestbookAction.pending ? { ...drafted, guestbookEnabled: false } : drafted;

  let edit: LandingEditControl | undefined;
  if (mode === 'edit') {
    const dirtyKeys = new Set<string>();
    for (const key of linkDrafts.keys()) {
      if (isLinkDirty(key)) dirtyKeys.add(targetKey({ kind: 'link', id: key === DRAFT_ITEM_ID ? null : key }));
    }
    for (const key of portfolioDrafts.keys()) {
      if (isPortfolioDirty(key)) {
        dirtyKeys.add(targetKey({ kind: 'portfolio-item', id: key === DRAFT_ITEM_ID ? null : key }));
      }
    }
    for (const key of bannerDrafts.keys()) {
      if (isBannerDirty(key)) dirtyKeys.add(targetKey({ kind: 'banner', id: key === DRAFT_ITEM_ID ? null : key }));
    }
    if (dirty.link) dirtyKeys.add('links');
    if (dirty.portfolio) dirtyKeys.add('portfolio');
    if (dirty.banner) dirtyKeys.add('banner-slot');
    if (dirty.profile || dirty.socials) dirtyKeys.add('profile');
    const slot = previewBannerSlot(state, drafts);
    edit = {
      selectedKey: selection ? targetKey(selection) : null,
      onSelect: (target: LandingEditTarget, trigger: HTMLElement) => {
        if (!formPending) select(target, trigger);
      },
      dirtyKeys,
      linkAddNotice: linkLimitNotice(state.limits),
      canAddPortfolio: state.portfolio.length < CRELINK_LIMITS.portfolioItems,
      slotPlaceholder: slot.hidden === 'no_banners' ? { kind: slot.kind, afterLinkCount: slot.afterLinkCount } : null,
    };
  }

  return (
    <div
      ref={screenRef}
      className={['preview-screen', framed ? '' : 'is-bare', mode === 'profile' ? 'is-profile-focus' : '']
        .filter(Boolean)
        .join(' ')}
      onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest('a')) event.preventDefault();
      }}
    >
      <div className="preview-main">
        <Landing
          landing={landing}
          headingLevel={2}
          edit={edit}
          // 탭을 바꾸는 것만으로는 고르지 않습니다(키보드로 탭을 오갈 때 초점을 빼앗지 않도록). 방명록은 `방명록 탭 편집`으로 고릅니다.
          preview={{ tab, onTabChange: setTab, guestbookVersion }}
        />
      </div>
      <p className="profile-footer">
        <span className="footer-cta">
          <span>
            나도 <span className="brand">크리링</span> 만들고 첫 링크 추가하기
          </span>
        </span>
        <span aria-hidden="true">·</span>
        <span className="footer-link">개인정보 처리방침</span>
      </p>
    </div>
  );
}
