'use client';

import { CRELINK_API_PATHS, type CreatorLandingState, type UpdateLandingRequest } from '@crelink/shared';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { browserApi } from '../../lib/api/browser';
import {
  isLinkDraftDirty,
  isPortfolioDraftDirty,
  isProfileDirty,
  isSocialsDirty,
  profileDraftOf,
  socialRowsOf,
  type LinkDraft,
  type PortfolioDraft,
  type ProfileDraft,
  type SocialDraftRow,
} from '../../lib/landing-preview';
import { useAction, type ActionState } from '../../lib/use-action';

/** 카드별 `저장 안 함` 여부. 하나라도 참이면 미리보기에 `저장하지 않은 변경 포함`을 붙입니다. */
export interface ManagerDirty {
  profile: boolean;
  socials: boolean;
  link: boolean;
  portfolio: boolean;
}

export interface ManagerContextValue {
  /** 저장된 편집 상태(`GET /api/me/landing`). 즉시 저장(숨기기·순서·방명록 켜기)은 바로 여기에 반영됩니다. */
  state: CreatorLandingState;
  setState: Dispatch<SetStateAction<CreatorLandingState>>;
  /** 편집 상태를 다시 읽어 바꾸고 그 값을 돌려줍니다(저장 뒤 한도·순서를 서버 값과 맞출 때). */
  reload: () => Promise<CreatorLandingState>;
  /** 계정 이메일(`GET /api/me`). 못 읽었으면 null. */
  email: string | null;
  /** 메뉴를 옮겨도 남는 저장하지 않은 입력(초안). 미리보기가 저장 상태 위에 덮어 그립니다. */
  profile: ProfileDraft;
  setProfile: Dispatch<SetStateAction<ProfileDraft>>;
  socials: SocialDraftRow[];
  setSocials: Dispatch<SetStateAction<SocialDraftRow[]>>;
  /** 열린 링크 추가·수정 폼. 한 번에 하나만 열립니다. */
  linkDraft: LinkDraft | null;
  setLinkDraft: Dispatch<SetStateAction<LinkDraft | null>>;
  /** 열린 포트폴리오 추가·수정 폼. */
  portfolioDraft: PortfolioDraft | null;
  setPortfolioDraft: Dispatch<SetStateAction<PortfolioDraft | null>>;
  dirty: ManagerDirty;
  /** 방명록 켜기 스위치(즉시 저장, 실패하면 되돌림). 저장 중에는 방명록 목록을 부르지 않습니다(꺼진 랜딩은 404). */
  guestbookAction: ActionState;
  toggleGuestbook: (enabled: boolean) => Promise<void>;
  /** 방명록 관리 목록에서 글을 숨기거나 풀면 늘어, 미리보기 방명록이 다시 불러옵니다. */
  guestbookVersion: number;
  guestbookChanged: () => void;
  /** 머리 카드 `주소 변경`이 `주소 설정` 메뉴의 새 주소 입력에 초점을 요청합니다. */
  slugFocusRequest: number;
  requestSlugFocus: () => void;
  /** 초점 요청이 남아 있으면 true를 돌려주고 지웁니다(메뉴를 다시 열 때 또 옮기지 않도록). */
  takeSlugFocus: () => boolean;
}

const ManagerContext = createContext<ManagerContextValue | null>(null);

export function useManager(): ManagerContextValue {
  const value = useContext(ManagerContext);
  if (!value) throw new Error('useManager는 ManagerProvider 안에서만 쓸 수 있어요.');
  return value;
}

/**
 * 랜딩 관리 화면(`/me/landings/{publicId}/…`) 전체가 함께 쓰는 브라우저 상태. 레이아웃에 두므로 메뉴를 옮겨도 저장 상태와
 * 저장하지 않은 입력이 남습니다(페이지를 떠날 때 경고는 두지 않음).
 */
export function ManagerProvider({
  initial,
  email,
  children,
}: {
  initial: CreatorLandingState;
  email: string | null;
  children: ReactNode;
}) {
  const [state, setState] = useState(initial);
  const [profile, setProfile] = useState(() => profileDraftOf(initial.landing));
  const [socials, setSocials] = useState(() => socialRowsOf(initial.socials));
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [portfolioDraft, setPortfolioDraft] = useState<PortfolioDraft | null>(null);
  const [guestbookVersion, setGuestbookVersion] = useState(0);
  const [slugFocusRequest, setSlugFocusRequest] = useState(0);
  const slugFocusPending = useRef(false);
  const guestbookAction = useAction();

  async function reload() {
    const next = await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding);
    setState(next);
    return next;
  }

  async function toggleGuestbook(guestbookEnabled: boolean) {
    const payload: UpdateLandingRequest = { guestbookEnabled };
    const setEnabled = (value: boolean) =>
      setState((current) => ({ ...current, landing: { ...current.landing, guestbookEnabled: value } }));
    // 링크 숨기기 스위치와 같이 바로 바꾸고, 실패하면 원래대로 돌립니다.
    setEnabled(guestbookEnabled);
    const saved = await guestbookAction.run(
      async () => {
        setState(
          await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }),
        );
      },
      guestbookEnabled
        ? '방명록을 켰어요. 방문자에게 방명록 탭이 보여요.'
        : '방명록을 껐어요. 남은 글은 지우지 않고 보관해요.',
    );
    if (!saved) setEnabled(!guestbookEnabled);
  }

  const guestbookChanged = useCallback(() => setGuestbookVersion((version) => version + 1), []);
  const requestSlugFocus = useCallback(() => {
    slugFocusPending.current = true;
    setSlugFocusRequest((count) => count + 1);
  }, []);
  const takeSlugFocus = useCallback(() => {
    const pending = slugFocusPending.current;
    slugFocusPending.current = false;
    return pending;
  }, []);

  const value: ManagerContextValue = {
    state,
    setState,
    reload,
    email,
    profile,
    setProfile,
    socials,
    setSocials,
    linkDraft,
    setLinkDraft,
    portfolioDraft,
    setPortfolioDraft,
    dirty: {
      profile: isProfileDirty(state.landing, profile),
      socials: isSocialsDirty(state.socials, socials),
      link: linkDraft !== null && isLinkDraftDirty(state.links, linkDraft),
      portfolio: portfolioDraft !== null && isPortfolioDraftDirty(state.portfolio, portfolioDraft),
    },
    guestbookAction,
    toggleGuestbook,
    guestbookVersion,
    guestbookChanged,
    slugFocusRequest,
    requestSlugFocus,
    takeSlugFocus,
  };
  return <ManagerContext value={value}>{children}</ManagerContext>;
}
