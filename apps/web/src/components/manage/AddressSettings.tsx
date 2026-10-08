'use client';

import { useId } from 'react';
import { ShortLinkSection, SlugSection } from '../me/ShortLinkSection';
import { useManager } from './ManagerContext';
import { PanelHead } from './PanelHead';

/** `주소 설정` 메뉴: 내 크리링 링크(복사), 주소 바꾸기(PRD R8), 계정(구글 이메일). */
export function AddressSettings() {
  const accountId = useId();
  const { email } = useManager();
  return (
    <>
      <PanelHead segment="settings" help="내 크리링 링크를 확인하고 주소를 바꿀 수 있어요." />
      <ShortLinkSection />
      <SlugSection />
      {email ? (
        <section className="card" aria-labelledby={accountId}>
          <h2 id={accountId}>계정</h2>
          <p className="account-email">{email}</p>
        </section>
      ) : null}
    </>
  );
}
