'use client';

import Link from 'next/link';
import { useId } from 'react';
import { ActionStatus } from '../ActionStatus';
import { PortfolioSection } from '../me/PortfolioSection';
import { ProfileSection } from '../me/ProfileSection';
import { SocialsSection } from '../me/SocialsSection';
import { GuestbookSwitch } from './GuestbookSwitch';
import { LinksSection } from './LinksSection';
import { useManager } from './ManagerContext';
import { managerHref, managerMenuLabel } from './menu';

/**
 * `페이지 편집` 메뉴: 공개 랜딩에 보이는 순서대로 프로필 → SNS 채널 → 외부 링크 → 포트폴리오 → 방명록 켜기 카드.
 * 카드 순서는 고정이고, 끌어 정렬하는 것은 외부 링크뿐입니다(포트폴리오는 위로·아래로).
 */
export function PageEditor() {
  return (
    <>
      <h1 className="visually-hidden">{managerMenuLabel('')}</h1>
      <ProfileSection />
      <SocialsSection />
      <LinksSection />
      <PortfolioSection />
      <GuestbookSettingCard />
    </>
  );
}

function GuestbookSettingCard() {
  const headingId = useId();
  const { state, guestbookAction } = useManager();
  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <h2 id={headingId}>방명록</h2>
        <GuestbookSwitch />
      </div>
      <p className="section-help">
        켜면 랜딩페이지에 링크·방명록 탭이 생기고 로그인한 회원이 글을 남길 수 있어요. 꺼도 남은 글은 지우지 않아요.
      </p>
      <Link href={managerHref(state.landing.publicId, 'guestbook')}>방명록 글 관리</Link>
      <ActionStatus error={guestbookAction.error} notice={guestbookAction.notice} />
    </section>
  );
}
