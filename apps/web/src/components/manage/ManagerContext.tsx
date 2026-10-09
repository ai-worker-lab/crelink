'use client';

import {
  CRELINK_API_PATHS,
  type CreatorLandingState,
  type CreatorSlotEventState,
  type UpdateLandingRequest,
} from '@crelink/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { browserApi, BrowserApiError } from '../../lib/api/browser';
import { targetKey, type LandingEditTarget } from '../../lib/landing-edit';
import {
  bannerDraftOf,
  draftKey,
  isBannerDraftDirty,
  isLinkDraftDirty,
  isPortfolioDraftDirty,
  isProfileDirty,
  isSocialsDirty,
  linkDraftOf,
  portfolioDraftOf,
  profileDraftOf,
  socialRowsOf,
  type BannerDraft,
  type LinkDraft,
  type PortfolioDraft,
  type ProfileDraft,
  type SocialDraftRow,
} from '../../lib/landing-preview';
import { useAction, type ActionState } from '../../lib/use-action';

/** 편집 중 배너 슬롯이 회수됐을 때의 안내(handoff `슬롯 회수됨(편집 중)`, 오류 코드 `banner_slot_not_granted`). */
export const BANNER_SLOT_REVOKED_NOTICE = '배너 슬롯이 회수되어 이 자리에 다시 크리링 광고 블록이 나와요.';

/** 신청 404(`slot_event_not_found`)의 관리 화면 문구(handoff `문구 원문` `404 slot_event_not_found(신청)`). 409는 `errors.ts` 고정 문구. */
const SLOT_EVENT_NOT_FOUND_APPLY = '진행 중인 이벤트가 없어 신청하지 못했어요.';

/** 링크 슬롯 이벤트 신청 결과 줄: 완료(`ok`) 또는 신청 기간 아님·이벤트 없음(409·404). 네트워크·그 밖 오류는 `slotEventAction.error`. */
export interface SlotEventResult {
  ok: boolean;
  text: string;
}

/** 영역별 `저장 안 함` 여부. 하나라도 참이면 주소 막대에 `저장하지 않은 변경 포함`을 붙입니다. 링크·포트폴리오·배너는 초안 중 하나라도 바뀌었으면 참입니다. */
export interface ManagerDirty {
  profile: boolean;
  socials: boolean;
  link: boolean;
  portfolio: boolean;
  banner: boolean;
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
  /** 항목별 링크 초안(열쇠 `draftKey(id)`). 다른 항목을 고르거나 메뉴를 옮겨도 남고, `취소`·저장 성공만 지웁니다. */
  linkDrafts: ReadonlyMap<string, LinkDraft>;
  editLinkDraft: (key: string, patch: Partial<LinkDraft>) => void;
  discardLinkDraft: (key: string) => void;
  isLinkDirty: (key: string) => boolean;
  /** 항목별 포트폴리오 초안. 규칙은 링크와 같습니다. */
  portfolioDrafts: ReadonlyMap<string, PortfolioDraft>;
  editPortfolioDraft: (key: string, patch: Partial<PortfolioDraft>) => void;
  discardPortfolioDraft: (key: string) => void;
  isPortfolioDirty: (key: string) => boolean;
  /** 항목별 배너 초안(설계 `배너 초안 규칙`). 규칙은 링크와 같고, 배너 슬롯이 회수되면(`slot.kind`가 'ad'로 바뀜) 모두 버립니다. */
  bannerDrafts: ReadonlyMap<string, BannerDraft>;
  editBannerDraft: (key: string, patch: Partial<BannerDraft>) => void;
  discardBannerDraft: (key: string) => void;
  isBannerDirty: (key: string) => boolean;
  /**
   * 배너 요청이 `banner_slot_not_granted`(403)로 실패했을 때 부릅니다. 편집 상태를 다시 읽고, 회수가 확인되면(`slot.kind = 'ad'`)
   * 배너 초안을 버리고 안내(`slotNotice`)를 띄웁니다. `페이지 편집`은 배너 패널이 사라진 것으로 보고 처음 패널로 돌아갑니다.
   * 다시 읽은 상태가 아직 배너 슬롯이면 false를 돌려줍니다(부르는 쪽이 오류 줄을 보임).
   */
  bannerSlotRevoked: () => Promise<boolean>;
  /** 배너 슬롯 회수 안내. 다른 대상을 고르면 지웁니다. */
  slotNotice: string | null;
  /** `페이지 편집`에서 고른 대상. null이면 처음 패널(구역 목록)입니다. */
  selection: LandingEditTarget | null;
  /**
   * 대상을 고릅니다. 링크·포트폴리오 항목·배너면 초안이 없을 때 저장값으로 만들고, 바뀌지 않은 초안은 떠날 때 지웁니다. 대상을 고르면 회수 안내(`slotNotice`)를 지웁니다.
   * 처음 패널에서 고를 때 넘긴 `trigger`는 처음 패널로 돌아올 때 초점을 돌려줄 곳입니다(`takeEntryTrigger`).
   */
  select: (target: LandingEditTarget | null, trigger?: HTMLElement | null) => void;
  takeEntryTrigger: () => HTMLElement | null;
  /** 고른 대상을 지웁니다(초점은 옮기지 않음). `페이지 편집` 메뉴를 떠날 때 씁니다. */
  resetSelection: () => void;
  /** 페이지 편집 폼을 저장·삭제하는 중인지. 그동안 미리보기에서 다른 대상을 고르지 않습니다(저장 결과가 새 선택을 덮지 않게). */
  formPending: boolean;
  setFormPending: (pending: boolean) => void;
  dirty: ManagerDirty;
  /** 방명록 켜기 스위치(즉시 저장, 실패하면 되돌림). 저장 중에는 방명록 목록을 부르지 않습니다(꺼진 랜딩은 404). */
  guestbookAction: ActionState;
  toggleGuestbook: (enabled: boolean) => Promise<void>;
  /** 방명록 관리 목록에서 글을 숨기거나 풀면 늘어, 미리보기 방명록이 다시 불러옵니다. */
  guestbookVersion: number;
  guestbookChanged: () => void;
  /** 주소 막대 `주소 변경`이 `주소 설정` 메뉴의 새 주소 입력에 초점을 요청합니다. */
  slugFocusRequest: number;
  requestSlugFocus: () => void;
  /** 초점 요청이 남아 있으면 true를 돌려주고 지웁니다(메뉴를 다시 열 때 또 옮기지 않도록). */
  takeSlugFocus: () => boolean;
  /**
   * 링크 슬롯 이벤트 신청(design/slot-event/handoff.md). `페이지 편집` 띠와 외부 링크 패널 신청 카드가 같은 요청·진행 상태를 씁니다.
   * `pending`이면 두 `신청하기`가 함께 잠기고, 네트워크·그 밖 오류는 `error`로 카드 안에 보이며 버튼이 `다시 시도`가 됩니다.
   */
  slotEventAction: ActionState;
  /** 신청 결과 줄. 띠·카드가 사라져도(`reload()` 뒤 조건이 풀림) 남고, `페이지 편집`을 떠나면 `resetSlotEvent`가 지웁니다. */
  slotEventResult: SlotEventResult | null;
  /**
   * `POST /api/me/slot-event/entry` 뒤 `reload()`. 201·200은 완료 줄, 409·404는 고정 문구 + `reload()`(다시 시도 없음).
   * 남긴 결과 줄을 돌려줍니다(네트워크·그 밖 오류면 null). 누른 쪽이 초점을 옮길 때 씁니다.
   */
  applySlotEvent: () => Promise<SlotEventResult | null>;
  resetSlotEvent: () => void;
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
  const [linkDrafts, setLinkDrafts] = useState<ReadonlyMap<string, LinkDraft>>(() => new Map());
  const [portfolioDrafts, setPortfolioDrafts] = useState<ReadonlyMap<string, PortfolioDraft>>(() => new Map());
  const [bannerDrafts, setBannerDrafts] = useState<ReadonlyMap<string, BannerDraft>>(() => new Map());
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  // 배너 슬롯이 회수되어(다시 읽은 상태가 광고 블록) 종류가 바뀌면 배너 초안을 모두 버리고 안내합니다(설계 `편집 중 회수`).
  const [seenSlotKind, setSeenSlotKind] = useState(initial.slot.kind);
  if (seenSlotKind !== state.slot.kind) {
    setSeenSlotKind(state.slot.kind);
    if (state.slot.kind === 'ad') {
      setBannerDrafts(new Map());
      setSlotNotice(BANNER_SLOT_REVOKED_NOTICE);
    }
  }
  const [selection, setSelection] = useState<LandingEditTarget | null>(null);
  const [formPending, setFormPending] = useState(false);
  const entryTrigger = useRef<HTMLElement | null>(null);
  const [guestbookVersion, setGuestbookVersion] = useState(0);
  const [slugFocusRequest, setSlugFocusRequest] = useState(0);
  const slugFocusPending = useRef(false);
  const guestbookAction = useAction();
  const slotEventAction = useAction();
  const [slotEventResult, setSlotEventResult] = useState<SlotEventResult | null>(null);
  const { setError: setSlotEventError } = slotEventAction;

  async function reload() {
    const next = await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding);
    setState(next);
    return next;
  }

  async function bannerSlotRevoked() {
    try {
      return (await reload()).slot.kind === 'ad';
    } catch {
      return false;
    }
  }

  async function applySlotEvent(): Promise<SlotEventResult | null> {
    let result: SlotEventResult | null = null;
    setSlotEventResult(null);
    await slotEventAction.run(async () => {
      let applied: CreatorSlotEventState;
      try {
        applied = await browserApi<CreatorSlotEventState>(CRELINK_API_PATHS.meSlotEventEntry, { method: 'POST' });
      } catch (caught) {
        // 기간 아님·이벤트 없음: 다시 눌러도 같으므로 결과 줄을 남기고 상태를 다시 읽어 띠·카드를 거둡니다(설계 `디자인 검토 의견` 2).
        if (
          caught instanceof BrowserApiError &&
          (caught.code === 'slot_event_closed' || caught.code === 'slot_event_not_found')
        ) {
          result = {
            ok: false,
            text: caught.code === 'slot_event_closed' ? caught.message : SLOT_EVENT_NOT_FOUND_APPLY,
          };
          setSlotEventResult(result);
          await reload().catch(() => undefined);
          return;
        }
        throw caught;
      }
      // 201(새로)·200(이미)은 같은 결과입니다. 새 한도는 다시 읽은 `limits.visibleMax`, 다시 읽기가 실패하면 대체 문구(설계 `디자인 검토 의견` 4).
      let text: string;
      try {
        const next = await reload();
        text = `이벤트를 신청했어요. 이제 보이는 외부 링크를 ${next.limits.visibleMax}개까지 둘 수 있어요.`;
      } catch {
        setState((current) => ({ ...current, slotEvent: applied }));
        text = `이벤트를 신청했어요. 보이는 외부 링크가 ${applied.entry?.bonusLinks ?? applied.event?.bonusLinks ?? 0}개 늘었어요.`;
      }
      result = { ok: true, text };
      setSlotEventResult(result);
    });
    return result;
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

  // 저장본이 사라진 항목의 초안(다른 곳에서 지움)은 바뀐 것으로 보지 않고, 떠날 때 지웁니다.
  const isLinkDirty = (key: string) => {
    const draft = linkDrafts.get(key);
    if (!draft || (draft.id !== null && !state.links.some((link) => link.id === draft.id))) return false;
    return isLinkDraftDirty(state.links, draft);
  };
  const isPortfolioDirty = (key: string) => {
    const draft = portfolioDrafts.get(key);
    if (!draft || (draft.id !== null && !state.portfolio.some((item) => item.id === draft.id))) return false;
    return isPortfolioDraftDirty(state.portfolio, draft);
  };
  const isBannerDirty = (key: string) => {
    const draft = bannerDrafts.get(key);
    if (!draft || (draft.id !== null && !state.banners.some((banner) => banner.id === draft.id))) return false;
    return isBannerDraftDirty(state.banners, draft);
  };

  function editLinkDraft(key: string, patch: Partial<LinkDraft>) {
    setLinkDrafts((current) => {
      const draft = current.get(key);
      return draft ? new Map(current).set(key, { ...draft, ...patch }) : current;
    });
  }
  function discardLinkDraft(key: string) {
    setLinkDrafts((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }
  function editPortfolioDraft(key: string, patch: Partial<PortfolioDraft>) {
    setPortfolioDrafts((current) => {
      const draft = current.get(key);
      return draft ? new Map(current).set(key, { ...draft, ...patch }) : current;
    });
  }
  function discardPortfolioDraft(key: string) {
    setPortfolioDrafts((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }
  function editBannerDraft(key: string, patch: Partial<BannerDraft>) {
    setBannerDrafts((current) => {
      const draft = current.get(key);
      return draft ? new Map(current).set(key, { ...draft, ...patch }) : current;
    });
  }
  function discardBannerDraft(key: string) {
    setBannerDrafts((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }

  function select(target: LandingEditTarget | null, trigger?: HTMLElement | null) {
    if (selection === null && target !== null) entryTrigger.current = trigger ?? null;
    if (target !== null) setSlotNotice(null);
    // 떠나는 항목의 초안이 저장값과 같으면 지웁니다(다시 고르면 그때의 저장값으로 새로 만듦).
    if (selection && (!target || targetKey(selection) !== targetKey(target))) {
      if (selection.kind === 'link' && !isLinkDirty(draftKey(selection.id))) discardLinkDraft(draftKey(selection.id));
      if (selection.kind === 'portfolio-item' && !isPortfolioDirty(draftKey(selection.id))) {
        discardPortfolioDraft(draftKey(selection.id));
      }
      if (selection.kind === 'banner' && !isBannerDirty(draftKey(selection.id))) {
        discardBannerDraft(draftKey(selection.id));
      }
    }
    if (target?.kind === 'link') {
      const key = draftKey(target.id);
      const saved = target.id === null ? null : (state.links.find((link) => link.id === target.id) ?? null);
      setLinkDrafts((current) => (current.has(key) ? current : new Map(current).set(key, linkDraftOf(saved))));
    }
    if (target?.kind === 'portfolio-item') {
      const key = draftKey(target.id);
      const saved = target.id === null ? null : (state.portfolio.find((item) => item.id === target.id) ?? null);
      setPortfolioDrafts((current) =>
        current.has(key) ? current : new Map(current).set(key, portfolioDraftOf(saved)),
      );
    }
    if (target?.kind === 'banner') {
      const key = draftKey(target.id);
      const saved = target.id === null ? null : (state.banners.find((banner) => banner.id === target.id) ?? null);
      setBannerDrafts((current) => (current.has(key) ? current : new Map(current).set(key, bannerDraftOf(saved))));
    }
    setSelection(target);
  }

  // 메뉴를 떠날 때(PageEditor 언마운트) 부릅니다. 최신 select로 바뀌지 않은 초안도 함께 정리합니다.
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });
  const resetSelection = useCallback(() => {
    selectRef.current(null);
    entryTrigger.current = null;
  }, []);
  const takeEntryTrigger = useCallback(() => {
    const trigger = entryTrigger.current;
    entryTrigger.current = null;
    return trigger;
  }, []);
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
  const resetSlotEvent = useCallback(() => {
    setSlotEventResult(null);
    setSlotEventError(null);
  }, [setSlotEventError]);

  const value: ManagerContextValue = {
    state,
    setState,
    reload,
    email,
    profile,
    setProfile,
    socials,
    setSocials,
    linkDrafts,
    editLinkDraft,
    discardLinkDraft,
    isLinkDirty,
    portfolioDrafts,
    editPortfolioDraft,
    discardPortfolioDraft,
    isPortfolioDirty,
    bannerDrafts,
    editBannerDraft,
    discardBannerDraft,
    isBannerDirty,
    bannerSlotRevoked,
    slotNotice,
    selection,
    select,
    takeEntryTrigger,
    resetSelection,
    formPending,
    setFormPending,
    dirty: {
      profile: isProfileDirty(state.landing, profile),
      socials: isSocialsDirty(state.socials, socials),
      link: [...linkDrafts.keys()].some(isLinkDirty),
      portfolio: [...portfolioDrafts.keys()].some(isPortfolioDirty),
      banner: [...bannerDrafts.keys()].some(isBannerDirty),
    },
    guestbookAction,
    toggleGuestbook,
    guestbookVersion,
    guestbookChanged,
    slugFocusRequest,
    requestSlugFocus,
    takeSlugFocus,
    slotEventAction,
    slotEventResult,
    applySlotEvent,
    resetSlotEvent,
  };
  return <ManagerContext value={value}>{children}</ManagerContext>;
}
