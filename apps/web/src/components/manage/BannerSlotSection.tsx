'use client';

import {
  CRELINK_API_PATHS,
  type CreatorBannerView,
  type ReorderRequest,
  type UpdateBannerRequest,
} from '@crelink/shared';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useId, useRef } from 'react';
import { BrowserApiError, browserApi } from '../../lib/api/browser';
import { withParticle } from '../../lib/slot-order';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { RemoteImage } from '../RemoteImage';
import { useManager, type ManagerContextValue } from './ManagerContext';
import { bannerAddNotice, bannerLimitError } from './limits';

/** 끄는 동안 행이 세로로만 움직이게 합니다. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * 배너 요청 실패를 화면 문구로 바꿔 다시 던집니다(설계 docs/specs/crelink-ad-banner.md `상수·경로·오류 코드`). `useAction`은 코드를 버리므로
 * task 안에서 부릅니다. 한도 코드(409)는 편집 상태를 다시 읽어(배지·한도를 서버 값과 맞춤) 그 `bannerLimits`의 n·m을 넣은 문장으로,
 * 회수(403 `banner_slot_not_granted`)는 회수 흐름(`bannerSlotRevoked`)을 태운 뒤 그 코드의 고정 문구로 던집니다.
 */
export async function rethrowBannerError(
  caught: unknown,
  manager: Pick<ManagerContextValue, 'reload' | 'bannerSlotRevoked'>,
): Promise<never> {
  if (caught instanceof BrowserApiError) {
    if (caught.code === 'banner_slot_not_granted') await manager.bannerSlotRevoked();
    if (caught.code === 'banner_limit_reached' || caught.code === 'banner_total_limit_reached') {
      const fresh = await manager.reload().catch(() => null);
      const limitText = fresh ? bannerLimitError(caught.code, fresh.bannerLimits) : null;
      if (limitText) throw new BrowserApiError(caught.code, limitText, caught.status);
    }
  }
  throw caught;
}

/**
 * 배너 슬롯 회수 안내(`slotNotice`, handoff `슬롯 회수됨(편집 중)`). 넓은 화면은 처음 패널 머리 아래(초점은 `PageEditor`가 옮김),
 * 좁은 화면은 관리 화면 sticky 줄 아래에 두고 `autoFocus`로 닫힌 시트 대신 이 안내에 초점을 둡니다. 안내가 없으면 그리지 않습니다.
 */
export function BannerSlotNotice({ autoFocus = false }: { autoFocus?: boolean }) {
  const { slotNotice } = useManager();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (autoFocus && slotNotice) ref.current?.focus();
  }, [autoFocus, slotNotice]);
  if (!slotNotice) return null;
  return (
    <p ref={ref} className="notice-box banner-slot-notice" role="status" tabIndex={-1} data-slot-notice="">
      {slotNotice}
    </p>
  );
}

/** 목록 행 보조 줄: 연결 주소의 도메인, 없으면 `연결 없음`. */
function bannerDomain(url: string | null): string {
  if (!url) return '연결 없음';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * `페이지 편집` 배너 슬롯 패널(디자인 design/ad-banner-block/handoff.md `배너 슬롯 패널`, PRD R21 ②③④⑤⑥): 한도 배지 2개, 배너 목록
 * (끌기·키보드 정렬, 숨기기 스위치, `수정`), `배너 추가`, 보이는 배너 0장 안내. 정렬(`PUT /api/me/banners/order`)과 숨기기
 * (`PATCH /api/me/banners/{id}`)는 바로 저장하고 실패하면 되돌립니다(링크와 같은 흐름). 숨긴 배너를 다시 보이게 할 때 한도(409)면 스위치를
 * 되돌리고 n을 넣은 안내를 보입니다. 차단 배너는 배지·사유를 보이고 스위치를 잠급니다(`수정`은 됨). 회수(403)면 상태를 다시 읽어
 * 처음 패널로 돌아갑니다(`PageEditor`). `notice`는 배너 폼에서 돌아올 때 보여 줄 결과 안내입니다.
 */
export function BannerSlotSection({ notice: doneNotice }: { notice?: string | null }) {
  const manager = useManager();
  const { state, setState, reload, select, isBannerDirty } = manager;
  const { pending, error, notice, run } = useAction();
  const dndId = useId();
  /** 이번 끌기에서 한 번이라도 다른 자리로 옮겼는지(스크린리더 안내용). */
  const movedSinceStart = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { banners, bannerLimits } = state;
  const ids = banners.map((banner) => banner.id);
  const addNotice = bannerAddNotice(bannerLimits);

  async function toggleHidden(banner: CreatorBannerView, hidden: boolean) {
    const payload: UpdateBannerRequest = { hidden };
    // 스위치는 바로 바뀌고, 실패하면(예: 보이는 배너 한도 409) 원래대로 돌립니다.
    setState((current) => ({
      ...current,
      banners: current.banners.map((item) => (item.id === banner.id ? { ...item, hidden } : item)),
    }));
    const saved = await run(
      async () => {
        try {
          await browserApi<CreatorBannerView>(CRELINK_API_PATHS.meBanner(banner.id), {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
        } catch (caught) {
          await rethrowBannerError(caught, manager);
        }
        await reload();
      },
      hidden ? `'${banner.alt}' 배너를 숨겼어요.` : `'${banner.alt}' 배너를 다시 보이게 했어요.`,
    );
    if (!saved) {
      setState((current) => ({
        ...current,
        banners: current.banners.map((item) => (item.id === banner.id ? { ...item, hidden: banner.hidden } : item)),
      }));
    }
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const before = banners;
    const next = arrayMove(banners, from, to);
    setState((current) => ({ ...current, banners: next }));
    const payload: ReorderRequest = { ids: next.map((banner) => banner.id) };
    const saved = await run(async () => {
      try {
        const savedBanners = await browserApi<CreatorBannerView[]>(CRELINK_API_PATHS.meBannersOrder, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setState((current) => ({ ...current, banners: savedBanners }));
      } catch (caught) {
        await rethrowBannerError(caught, manager);
      }
    }, '순서를 바꿨어요.');
    if (!saved) setState((current) => (current.banners === next ? { ...current, banners: before } : current));
  }

  /** 스크린리더 안내에 쓰는 행 이름: `<대체 문구> 배너`. */
  const nameOf = (id: UniqueIdentifier) => `${banners.find((banner) => banner.id === id)?.alt ?? ''} 배너`.trim();
  const positionOf = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      movedSinceStart.current = false;
      return `${withParticle(nameOf(active.id), '을', '를')} 들었어요. 지금 ${positionOf(active.id)}번째, 전체 ${ids.length}장이에요.`;
    },
    onDragOver: ({ active, over }) => {
      // 든 직후 제자리 위에 있다는 안내가 '들었어요' 안내를 덮지 않게 건너뜁니다.
      if (over?.id === active.id && !movedSinceStart.current) return undefined;
      movedSinceStart.current = true;
      return over
        ? `${withParticle(nameOf(active.id), '을', '를')} ${positionOf(over.id)}번째 자리로 옮기고 있어요.`
        : `${withParticle(nameOf(active.id), '이', '가')} 목록 밖에 있어요.`;
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `${withParticle(nameOf(active.id), '을', '를')} ${positionOf(over.id)}번째 자리에 놓았어요.`
        : `${withParticle(nameOf(active.id), '을', '를')} 제자리에 놓았어요.`,
    onDragCancel: ({ active }) => `${nameOf(active.id)} 옮기기를 취소했어요. 원래 자리로 돌아갔어요.`,
  };

  return (
    <>
      <div className="panel-badges banner-slot-badges">
        <p className={`limit-badge${bannerLimits.visibleUsed >= bannerLimits.visibleMax ? ' limit-full' : ''}`}>
          보이는 배너 {bannerLimits.visibleUsed}/{bannerLimits.visibleMax}장
        </p>
        <p className={`limit-badge${bannerLimits.totalUsed >= bannerLimits.totalMax ? ' limit-full' : ''}`}>
          숨긴 배너 포함 전체 {bannerLimits.totalUsed}/{bannerLimits.totalMax}장
        </p>
      </div>
      {banners.length > 0 ? (
        <p className="section-help">
          배너를 누르면 고칠 수 있고, 손잡이를 끌면 순서가 바뀌어요. 숨긴 배너와 차단된 배너는 방문자에게 보이지 않아요.
        </p>
      ) : null}
      <ActionStatus error={error} notice={notice ?? doneNotice ?? null} />
      {banners.length > 0 ? (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                '순서를 바꾸려면 스페이스 키나 엔터 키로 배너를 든 뒤 위·아래 화살표 키로 옮기고, 스페이스 키나 엔터 키로 내려놓으세요. Esc 키를 누르면 취소돼요.',
            },
          }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="link-list link-edit-list banner-edit-list">
              {banners.map((banner) => (
                <BannerRow
                  key={banner.id}
                  banner={banner}
                  busy={pending}
                  dirty={isBannerDirty(banner.id)}
                  onEdit={() => select({ kind: 'banner', id: banner.id })}
                  onToggleHidden={toggleHidden}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
      {addNotice ? (
        <p className="notice-box">{addNotice}</p>
      ) : (
        <button
          type="button"
          className="secondary link-add"
          onClick={() => select({ kind: 'banner', id: null })}
          disabled={pending}
        >
          배너 추가
        </button>
      )}
      {bannerLimits.visibleUsed === 0 ? (
        <p className="notice-box banner-empty-notice">보이는 배너가 없어 방문자 화면에서 배너 슬롯이 보이지 않아요.</p>
      ) : null}
    </>
  );
}

/**
 * 배너 슬롯 패널의 배너 행: 끌기 손잡이, 3:1 썸네일 96×32(움직이는 배너는 정지 이미지), 대체 문구(한 줄 말줄임), 도메인 또는 `연결 없음`,
 * 숨기기 스위치, `수정`. 숨긴 배너는 흐리게 `숨김`, 차단 배너는 `차단됨` 배지·사유와 잠긴 스위치(`aria-disabled`)입니다.
 */
function BannerRow({
  banner,
  busy,
  dirty,
  onEdit,
  onToggleHidden,
}: {
  banner: CreatorBannerView;
  busy: boolean;
  dirty: boolean;
  onEdit: () => void;
  onToggleHidden: (banner: CreatorBannerView, hidden: boolean) => void;
}) {
  const reasonId = useId();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: banner.id,
    disabled: busy,
    attributes: { roleDescription: '순서를 바꿀 수 있는 배너' },
  });
  const className = [
    'link-edit-item',
    'banner-edit-item',
    banner.hidden ? 'is-hidden' : '',
    banner.blocked ? 'is-blocked' : '',
    isDragging ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const switchLocked = busy || banner.blocked;
  return (
    <li ref={setNodeRef} className={className} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <div className="link-edit-row">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`${banner.alt} 순서 바꾸기`}
        >
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M7 4h2v2H7zm4 0h2v2h-2zM7 9h2v2H7zm4 0h2v2h-2zm-4 5h2v2H7zm4 0h2v2h-2z" fill="currentColor" />
          </svg>
        </button>
        {/* 카드 누르기는 마우스·터치용 지름길입니다. 키보드·스크린리더는 같은 동작의 `수정` 버튼을 씁니다. */}
        <div className="link-card link-edit-card banner-edit-card" onClick={onEdit}>
          <RemoteImage
            className="banner-edit-thumb"
            src={(banner.stillImage ?? banner.image).url}
            alt=""
            width={96}
            height={32}
            loading="lazy"
          />
          <span className="link-text">
            <span className="link-title banner-edit-alt">{banner.alt}</span>
            <span className="link-description banner-edit-domain">{bannerDomain(banner.url)}</span>
          </span>
        </div>
        <div className="link-edit-controls">
          <button
            type="button"
            role="switch"
            className="hide-switch"
            aria-checked={banner.hidden}
            aria-label={`${banner.alt} 숨기기`}
            aria-disabled={switchLocked || undefined}
            aria-describedby={banner.blocked ? reasonId : undefined}
            onClick={() => {
              // disabled로 막으면 누른 스위치에서 포커스가 빠지므로 aria-disabled로 알리고 누르기만 무시합니다.
              if (!switchLocked) onToggleHidden(banner, !banner.hidden);
            }}
          >
            <span className="hide-switch-track" aria-hidden="true">
              <span className="hide-switch-thumb" />
            </span>
            <span className="hide-switch-text" aria-hidden="true">
              숨김
            </span>
          </button>
          <button
            type="button"
            className="secondary link-edit-button"
            aria-label={`${banner.alt} 배너 수정`}
            onClick={onEdit}
          >
            수정
          </button>
        </div>
      </div>
      {banner.hidden || banner.blocked || dirty ? (
        <p className="badges link-edit-status">
          {banner.hidden ? <span className="badge">숨김</span> : null}
          {banner.blocked ? <span className="badge badge-danger">차단됨</span> : null}
          {dirty ? <span className="badge dirty-chip">저장 안 함</span> : null}
        </p>
      ) : null}
      {banner.blocked ? (
        <p className="blocked-reason" id={reasonId}>
          크리링이 이 배너를 차단해 방문자에게 보이지 않아요. 주소를 고쳐도 운영자가 풀 때까지 차단돼요.
          {banner.blockedReason ? ` 사유: ${banner.blockedReason}` : ''}
        </p>
      ) : null}
    </li>
  );
}
