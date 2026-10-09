'use client';

import { CRELINK_LIMITS } from '@crelink/shared';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sectionOfKey, targetKey, type LandingEditTarget } from '../../lib/landing-edit';
import { draftKey } from '../../lib/landing-preview';
import { slotPositionLabel } from '../../lib/slot-order';
import { useAction } from '../../lib/use-action';
import { useWideLayout } from '../../lib/use-wide-layout';
import { ActionStatus } from '../ActionStatus';
import { DefaultAvatar } from '../DefaultAvatar';
import { RemoteImage } from '../RemoteImage';
import { PortfolioForm, PortfolioSection } from '../me/PortfolioSection';
import { BannerForm } from './BannerForm';
import { BannerSlotNotice, BannerSlotSection } from './BannerSlotSection';
import { EditSheet } from './EditSheet';
import { GuestbookSwitch } from './GuestbookSwitch';
import { LinkForm } from './LinkForm';
import { LinksSection } from './LinksSection';
import { useManager } from './ManagerContext';
import { SlotEventBand } from './SlotEventOffer';
import { managerHref, managerMenuLabel } from './menu';

/**
 * `페이지 편집` 메뉴(디자인 design/preview-direct-edit/handoff.md `페이지 편집 상호작용`, design/ad-banner-block/handoff.md). 미리보기(`ManagerPreview`)나
 * 구역 목록에서 고른 대상(`selection`)에 따라 편집 패널이 구역 목록 → 외부 링크·링크 폼·광고 블록·배너 슬롯·포트폴리오·항목 폼·방명록·
 * 프로필 안내로 바뀝니다. 1024px 이상은 오른쪽 패널(머리 `← 전체`), 1023px 이하는 하단 시트입니다. 고르면 초점은 패널 제목(시트는 첫 입력)으로,
 * 처음 패널로 돌아오면 처음 고른 요소로 돌아갑니다. 예외로 광고 블록 패널의 `외부 링크 목록에서 끌어 옮기기`는 외부 링크 패널을 열고
 * 초점을 광고 행 손잡이로 옮깁니다. 배너 슬롯이 회수되어(편집 상태의 `slot.kind`가 'ad') 배너 패널·폼이 사라지면 처음 패널로 돌아가
 * 회수 안내(`BannerSlotNotice`)에 초점을 둡니다.
 */
export function PageEditor() {
  const wide = useWideLayout();
  const {
    state,
    selection,
    select,
    takeEntryTrigger,
    discardLinkDraft,
    discardPortfolioDraft,
    discardBannerDraft,
    isLinkDirty,
    isPortfolioDirty,
    isBannerDirty,
    resetSelection,
    resetSlotEvent,
    setFormPending,
  } = useManager();
  const formAction = useAction();
  /** 폼 저장·삭제 결과 안내. 결과가 나온 구역 패널(열쇠가 같을 때)에서만 보여 줍니다. */
  const [doneNotice, setDoneNotice] = useState<{ key: string; text: string } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const overviewRef = useRef<HTMLHeadingElement>(null);
  const key = selection ? targetKey(selection) : null;
  const [seenKey, setSeenKey] = useState(key);
  /** `외부 링크 목록에서 끌어 옮기기`로 외부 링크 패널을 열었는지(초점을 패널 제목 대신 슬롯 행 손잡이로). */
  const [slotHandleFocus, setSlotHandleFocus] = useState(false);
  if (seenKey !== key) {
    setSeenKey(key);
    formAction.setError(null);
    if (key !== 'links') setSlotHandleFocus(false);
  }
  // 다른 메뉴로 옮기면 고른 대상을 지웁니다(초안은 남음). 돌아오면 처음 패널부터.
  useEffect(() => resetSelection, [resetSelection]);
  // 링크 슬롯 이벤트 결과 줄은 `페이지 편집`을 떠날 때까지만 남습니다(design/slot-event/handoff.md `관리 화면 페이지 편집 띠`).
  useEffect(() => resetSlotEvent, [resetSlotEvent]);
  // 폼 저장 중에는 미리보기 고르기를 막습니다(ManagerPreview가 봄).
  useEffect(() => setFormPending(formAction.pending), [formAction.pending, setFormPending]);
  // 저장이 끝났을 때 그 폼이 아직 고른 대상인지(메뉴를 떠났거나 다른 대상을 골랐으면 패널을 바꾸지 않음).
  const currentKey = useRef(key);
  const mounted = useRef(false);
  useEffect(() => {
    currentKey.current = key;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 고른 대상이 바뀔 때만 초점을 옮깁니다(처음 그릴 때는 옮기지 않음).
  const shownKey = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = shownKey.current;
    shownKey.current = key;
    if (!wide || previous === undefined || previous === key) return;
    if (key) {
      const handle =
        key === 'links' && slotHandleFocus ? document.querySelector<HTMLElement>('[data-slot-handle]') : null;
      (handle ?? titleRef.current)?.focus({ preventScroll: !handle });
      return;
    }
    // 회수 안내가 있으면 거기로, 아니면 처음 고른 요소로 돌려줍니다. 처음 패널의 구역 목록 버튼은 다시 그려져 끊겨 있으므로 같은 구역 버튼을 찾습니다.
    const revokedNotice = document.querySelector<HTMLElement>('.page-overview [data-slot-notice]');
    const trigger = takeEntryTrigger();
    const section = previous ? sectionOfKey(previous) : null;
    const sectionButton = section
      ? document.querySelector<HTMLElement>(`.section-picker [data-section="${section}"]`)
      : null;
    if (revokedNotice) revokedNotice.focus();
    else if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    else if (sectionButton) sectionButton.focus({ preventScroll: true });
    else overviewRef.current?.focus({ preventScroll: true });
  }, [key, wide, takeEntryTrigger, slotHandleFocus]);

  // 고치던 항목이 사라졌으면(다른 곳에서 지움) 처음 패널로 돌아갑니다.
  const link = selection?.kind === 'link' && selection.id ? state.links.find((item) => item.id === selection.id) : null;
  const item =
    selection?.kind === 'portfolio-item' && selection.id
      ? state.portfolio.find((entry) => entry.id === selection.id)
      : null;
  const banner =
    selection?.kind === 'banner' && selection.id ? state.banners.find((entry) => entry.id === selection.id) : null;
  const creatorSlot = state.slot.kind === 'creator';
  // 슬롯이 부여·회수되어 종류가 바뀌었으면 그 패널도 사라진 것으로 봅니다.
  const missing =
    (selection?.kind === 'link' && selection.id !== null && !link) ||
    (selection?.kind === 'portfolio-item' && selection.id !== null && !item) ||
    (selection?.kind === 'ad-slot' && creatorSlot) ||
    ((selection?.kind === 'banner-slot' || selection?.kind === 'banner') && !creatorSlot) ||
    (selection?.kind === 'banner' && selection.id !== null && !banner);
  useEffect(() => {
    if (missing) select(null);
  }, [missing, select]);

  function go(target: LandingEditTarget | null, notice: string | null = null) {
    setDoneNotice(notice && target ? { key: targetKey(target), text: notice } : null);
    select(target);
  }
  /** 폼(`fromKey`)이 끝났을 때만 `go`합니다. 그 사이 고른 대상이 바뀌었거나 메뉴를 떠났으면 아무것도 하지 않습니다. */
  function finish(fromKey: string, target: LandingEditTarget, notice: string | null = null) {
    if (mounted.current && currentKey.current === fromKey) go(target, notice);
  }

  function closeSheet() {
    const trigger = takeEntryTrigger();
    const section = key ? sectionOfKey(key) : null;
    select(null);
    requestAnimationFrame(() => {
      // 연 요소가 사라졌으면(지운 링크 등) 같은 구역의 이름표, 그것도 없으면 첫 이름표로 돌려줍니다.
      const fallback =
        document.querySelector<HTMLElement>(`.edit-tag[data-target="${section}"]`) ??
        document.querySelector<HTMLElement>('.edit-tag');
      (trigger?.isConnected ? trigger : fallback)?.focus();
    });
  }

  if (!selection || missing) {
    return wide ? (
      <PageOverview headingRef={overviewRef} />
    ) : (
      <h1 className="visually-hidden">{managerMenuLabel('')}</h1>
    );
  }

  const variant = wide ? 'panel' : 'sheet';
  const formKey = targetKey(selection);
  let title: string;
  let help: string | null = null;
  let dirty = false;
  let body: ReactNode;
  switch (selection.kind) {
    case 'links':
      title = '외부 링크';
      body = (
        <LinksSection notice={doneNotice?.key === formKey ? doneNotice.text : null} focusSlotHandle={slotHandleFocus} />
      );
      break;
    case 'ad-slot':
      title = '광고 블록';
      help = '크리링 광고가 나오는 자리예요. 지우거나 숨길 수 없고, 링크 사이 원하는 위치로 옮길 수 있어요.';
      body = (
        <AdSlotPanel
          onMove={() => {
            setSlotHandleFocus(true);
            go({ kind: 'links' });
          }}
        />
      );
      break;
    case 'banner-slot':
      title = '배너 슬롯';
      help = '링크 사이에 넣는 내 배너예요. 여러 장이면 방문자가 넘겨 봐요.';
      body = <BannerSlotSection notice={doneNotice?.key === formKey ? doneNotice.text : null} />;
      break;
    case 'banner':
      title = banner ? `배너 · ${banner.alt}` : '새 배너';
      help = banner ? '방문자에게 보이는 배너를 고쳐요.' : '이미지를 올리면 미리보기에 바로 보여요.';
      dirty = isBannerDirty(draftKey(selection.id));
      body = (
        <BannerForm
          key={key}
          banner={banner ?? null}
          variant={variant}
          action={formAction}
          onDone={(result) => {
            discardBannerDraft(draftKey(selection.id));
            finish(formKey, { kind: 'banner-slot' }, result);
          }}
          onCancel={() => {
            discardBannerDraft(draftKey(selection.id));
            finish(formKey, { kind: 'banner-slot' });
          }}
        />
      );
      break;
    case 'link':
      title = link ? `링크 · ${link.title}` : '새 링크';
      help = link ? '방문자에게 보이는 링크 정보를 고쳐요.' : '표시 이름을 넣으면 미리보기에 바로 보여요.';
      dirty = isLinkDirty(draftKey(selection.id));
      body = (
        <LinkForm
          key={key}
          link={link ?? null}
          variant={variant}
          action={formAction}
          onDone={(result) => {
            discardLinkDraft(draftKey(selection.id));
            finish(formKey, { kind: 'links' }, result);
          }}
          onCancel={() => {
            discardLinkDraft(draftKey(selection.id));
            finish(formKey, { kind: 'links' });
          }}
        />
      );
      break;
    case 'portfolio':
      title = '포트폴리오';
      body = <PortfolioSection notice={doneNotice?.key === formKey ? doneNotice.text : null} />;
      break;
    case 'portfolio-item':
      title = item ? `포트폴리오 · ${item.title}` : '새 포트폴리오';
      help = item ? '방문자에게 보이는 포트폴리오 정보를 고쳐요.' : '제목을 넣으면 미리보기에 바로 보여요.';
      dirty = isPortfolioDirty(draftKey(selection.id));
      body = (
        <PortfolioForm
          key={key}
          item={item ?? null}
          variant={variant}
          action={formAction}
          onDone={(result) => {
            discardPortfolioDraft(draftKey(selection.id));
            finish(formKey, { kind: 'portfolio' }, result);
          }}
          onCancel={() => {
            discardPortfolioDraft(draftKey(selection.id));
            finish(formKey, { kind: 'portfolio' });
          }}
        />
      );
      break;
    case 'guestbook':
      title = '방명록';
      body = <GuestbookSettings />;
      break;
    case 'profile':
      title = '프로필';
      body = <ProfileNotice />;
      break;
  }

  if (!wide) {
    return (
      <>
        <h1 className="visually-hidden">{managerMenuLabel('')}</h1>
        <EditSheet key={key} title={title} pending={formAction.pending} onDismiss={closeSheet}>
          {dirty ? (
            <p className="badges">
              <span className="badge dirty-chip">저장 안 함</span>
            </p>
          ) : null}
          {help ? <p className="section-help">{help}</p> : null}
          {body}
        </EditSheet>
      </>
    );
  }
  return (
    <section className="panel-section" aria-labelledby="panel-title">
      <h1 className="visually-hidden">{managerMenuLabel('')}</h1>
      <div className="panel-head">
        <button type="button" className="back-button" onClick={() => go(null)} disabled={formAction.pending}>
          <span aria-hidden="true">←</span> 전체
        </button>
        <div className="panel-title-row">
          <h2 id="panel-title" ref={titleRef} tabIndex={-1} className="panel-title">
            {title}
          </h2>
          {dirty ? <span className="badge dirty-chip">저장 안 함</span> : null}
        </div>
        {help ? <p className="panel-help">{help}</p> : null}
      </div>
      {body}
    </section>
  );
}

/** 광고 블록 패널: 지금 위치, `외부 링크 목록에서 끌어 옮기기`, 한도 안내, 게시 0장 안내(디자인 design/ad-banner-block/handoff.md). */
function AdSlotPanel({ onMove }: { onMove: () => void }) {
  const { state } = useManager();
  return (
    <>
      <p className="slot-position">
        지금 위치 <strong>{slotPositionLabel(state.slot.slotIndex, state.links.length)}</strong>
      </p>
      <button type="button" className="secondary" onClick={onMove}>
        외부 링크 목록에서 끌어 옮기기
      </button>
      <p className="section-help">광고 블록은 보이는 링크 한도({state.limits.visibleMax}개)에 들지 않아요.</p>
      {state.adBanners.length === 0 ? (
        <p className="notice-box">지금은 게시 중인 크리링 광고가 없어 방문자에게 보이지 않아요.</p>
      ) : null}
    </>
  );
}

/**
 * 처음 패널: 구역 목록(키보드·스크린리더로 구역을 고르는 길)과 프로필 메뉴 안내. 1023px 이하에서는 쓰지 않고, 서버가 넓은 배치로
 * 그린 첫 화면에서도 CSS(`.page-overview`)로 숨겨 하이드레이션 전에 눌리지 않는 목록이 보이지 않게 합니다.
 */
function PageOverview({ headingRef }: { headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const { state, select, dirty } = useManager();
  const { limits, slot, bannerLimits } = state;
  const rows: Array<{ target: LandingEditTarget; title: string; meta: string; dirty: boolean }> = [
    {
      target: { kind: 'links' },
      title: '외부 링크',
      meta: `보이는 링크 ${limits.visibleUsed}/${limits.visibleMax}`,
      dirty: dirty.link,
    },
    slot.kind === 'ad'
      ? {
          target: { kind: 'ad-slot' },
          title: '광고 블록',
          meta: slotPositionLabel(slot.slotIndex, state.links.length),
          dirty: false,
        }
      : {
          target: { kind: 'banner-slot' },
          title: '배너 슬롯',
          meta: `보이는 배너 ${bannerLimits.visibleUsed}/${bannerLimits.visibleMax}장 · 전체 ${bannerLimits.totalUsed}장`,
          dirty: dirty.banner,
        },
    {
      target: { kind: 'portfolio' },
      title: '포트폴리오',
      meta: `${state.portfolio.length}/${CRELINK_LIMITS.portfolioItems}`,
      dirty: dirty.portfolio,
    },
    {
      target: { kind: 'guestbook' },
      title: '방명록',
      meta: state.landing.guestbookEnabled ? '켜짐' : '꺼짐',
      dirty: false,
    },
  ];
  return (
    <section className="panel-section page-overview" aria-labelledby="page-overview-title">
      <div className="panel-head">
        <h1 id="page-overview-title" ref={headingRef} tabIndex={-1} className="panel-title">
          {managerMenuLabel('')}
        </h1>
        <p className="panel-help">방문자 화면에서 구역이나 항목을 선택해 편집해요.</p>
      </div>
      <BannerSlotNotice />
      <SlotEventBand />
      <h2 className="panel-subtitle">구역 선택</h2>
      <ul className="section-picker">
        {rows.map((row) => (
          <li key={row.title}>
            <button
              type="button"
              data-section={row.target.kind}
              onClick={(event) => select(row.target, event.currentTarget)}
            >
              <span className="section-picker-title">{row.title}</span>
              <span className="section-picker-meta">
                {row.meta}
                {row.dirty ? <span className="badge dirty-chip">저장 안 함</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="section-help">프로필 머리와 SNS 채널은 프로필 메뉴에서 수정할 수 있어요.</p>
      <Link className="secondary" href={managerHref(state.landing.publicId, 'profile')}>
        프로필에서 고치기
      </Link>
    </section>
  );
}

/** 방명록 패널: 켜기 스위치(즉시 저장)와 방명록 메뉴 안내. */
function GuestbookSettings() {
  const { state, guestbookAction } = useManager();
  return (
    <>
      <div className="panel-switch-row">
        <p className="section-help">
          켜면 랜딩페이지에 링크·방명록 탭이 생기고 로그인한 회원이 글을 남길 수 있어요. 꺼도 남은 글은 지우지 않아요.
        </p>
        <GuestbookSwitch />
      </div>
      <ActionStatus error={guestbookAction.error} notice={guestbookAction.notice} />
      <Link href={managerHref(state.landing.publicId, 'guestbook')}>방명록 글 관리</Link>
    </>
  );
}

/** 프로필 머리·SNS를 골랐을 때: 요약과 프로필 메뉴로 가는 링크(페이지 편집에서는 고치지 않음). */
function ProfileNotice() {
  const { state, profile } = useManager();
  const name = profile.displayName.trim();
  const bio = profile.bio.trim();
  return (
    <>
      <div className="profile-summary">
        {profile.avatar ? (
          <RemoteImage className="summary-avatar" src={profile.avatar.url} alt="" width={56} height={56} />
        ) : (
          <DefaultAvatar className="summary-avatar" />
        )}
        <div className="summary-text">
          <p className={name ? 'summary-name' : 'summary-name is-empty'}>{name || '이름 없음'}</p>
          {bio ? <p className="summary-bio">{bio}</p> : null}
        </div>
      </div>
      <p className="section-help">프로필 머리와 SNS 채널은 프로필 메뉴에서 수정할 수 있어요.</p>
      <Link className="primary" href={managerHref(state.landing.publicId, 'profile')}>
        프로필에서 고치기
      </Link>
    </>
  );
}
