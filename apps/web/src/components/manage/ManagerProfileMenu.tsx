'use client';

import { useManager } from './ManagerContext';
import { ProfileMenu } from './ProfileMenu';

/** 관리 화면 머리글의 프로필 메뉴. 프로필을 저장하면 새로고침 없이 사진이 바뀌도록 저장 상태(`state.landing.avatar`, 초안 아님)를 읽어 넘깁니다. */
export function ManagerProfileMenu({ email, isOperator }: { email: string | null; isOperator: boolean }) {
  const { state } = useManager();
  return <ProfileMenu email={email} isOperator={isOperator} avatarUrl={state.landing.avatar?.url ?? null} />;
}
