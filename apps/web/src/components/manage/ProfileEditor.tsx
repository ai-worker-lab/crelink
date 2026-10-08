'use client';

import { ProfileSection } from '../me/ProfileSection';
import { SocialsSection } from '../me/SocialsSection';
import { PanelHead } from './PanelHead';

/** `프로필` 메뉴(디자인 design/preview-direct-edit/handoff.md `프로필 메뉴`): 프로필(사진·이름·소개)과 SNS 채널. */
export function ProfileEditor() {
  return (
    <>
      <PanelHead segment="profile" help="방문자가 처음 만나는 소개와 SNS 채널을 관리해요." />
      <ProfileSection />
      <SocialsSection />
    </>
  );
}
