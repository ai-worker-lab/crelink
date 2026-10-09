'use client';

import { CRELINK_API_PATHS, type LinkOrderRequest, type LinkView, type UpdateLinkRequest } from '@crelink/shared';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useId, useRef } from 'react';
import { browserApi } from '../../lib/api/browser';
import { mixedOrder, SLOT_ROW_ID, slotRowName, splitOrder, withParticle } from '../../lib/slot-order';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { EditableLinkCard } from './EditableLinkCard';
import { useManager } from './ManagerContext';
import { SlotEventPanelRow } from './SlotEventOffer';
import { SlotOrderRow } from './SlotOrderRow';
import { linkLimitNotice } from './limits';

/** 끄는 동안 카드가 세로로만 움직이게 합니다(리스트형 구역). */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * `페이지 편집` 외부 링크 구역 패널(PRD R18·R20 ②): 숨긴·차단 링크를 포함한 전체 목록, 한도 배지, `링크 추가`.
 * 링크 행 사이에 광고 블록(또는 배너 슬롯) 행이 섞여 같은 손잡이로 끌어 정렬합니다(디자인 design/ad-banner-block/handoff.md).
 * 행의 `수정`·카드 누르기와 `링크 추가`는 그 링크를 골라 패널을 폼으로 바꿉니다. 순서는 끌어 놓기로 바로 저장하고 실패하면 되돌립니다.
 * 링크를 옮기든 슬롯 행을 옮기든 늘 `PUT /api/me/links/order { ids, slotIndex }`를 보내 화면 순서와 저장 순서를 맞추고, 보낸 `slotIndex`
 * (링크 수 이상이면 null)를 편집 상태에 그대로 둡니다(설계 docs/specs/crelink-ad-banner.md `위치 모델`).
 * 숨기기는 스위치(`PATCH hidden`)로 바로 저장하고 실패하면 되돌립니다. 저장 뒤에는 편집 상태를 다시 읽어 한도·순서를 서버 값과 맞춥니다.
 * 한도 배지는 슬롯 행을 세지 않습니다(R20 ⑦). 배지 바로 아래에는 링크 슬롯 이벤트 줄(신청 카드·`신청함` 줄, design/slot-event/handoff.md)이 옵니다.
 * `notice`는 폼에서 돌아올 때 보여 줄 결과 안내이고,
 * `focusSlotHandle`이면 하단 시트가 슬롯 행 손잡이에 처음 초점을 둡니다(광고 블록 패널의 `외부 링크 목록에서 끌어 옮기기`).
 */
export function LinksSection({
  notice: doneNotice,
  focusSlotHandle = false,
}: {
  notice?: string | null;
  focusSlotHandle?: boolean;
}) {
  const { state, setState, reload, select, isLinkDirty } = useManager();
  const { pending, error, notice, run, setNotice } = useAction();
  const dndId = useId();
  /** 이번 끌기에서 한 번이라도 다른 자리로 옮겼는지(스크린리더 안내용). */
  const movedSinceStart = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { links, limits, slot } = state;
  const visibleFull = limits.visibleUsed >= limits.visibleMax;
  const limitNotice = linkLimitNotice(limits, state.slotEvent);
  const slotName = slotRowName(slot.kind);
  const mixed = mixedOrder(
    links.map((link) => link.id),
    slot.slotIndex,
  );

  async function toggleHidden(link: LinkView, hidden: boolean) {
    const payload: UpdateLinkRequest = { hidden };
    // 스위치는 바로 바뀌고, 실패하면(예: 보이는 링크 한도 409) 원래대로 돌립니다.
    setState((current) => ({
      ...current,
      links: current.links.map((item) => (item.id === link.id ? { ...item, hidden } : item)),
    }));
    const saved = await run(
      async () => {
        await browserApi<LinkView>(CRELINK_API_PATHS.meLink(link.id), {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        await reload();
      },
      hidden ? `'${link.title}' 링크를 숨겼어요.` : `'${link.title}' 링크를 다시 보이게 했어요.`,
    );
    if (!saved) {
      setState((current) => ({
        ...current,
        links: current.links.map((item) => (item.id === link.id ? { ...item, hidden: link.hidden } : item)),
      }));
    }
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = mixed.indexOf(String(active.id));
    const to = mixed.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const before = { links, slotIndex: slot.slotIndex };
    const order = splitOrder(arrayMove(mixed, from, to));
    const byId = new Map(links.map((link) => [link.id, link]));
    const nextLinks = order.ids.flatMap((id) => byId.get(id) ?? []);
    const nextSlotIndex = order.slotIndex >= nextLinks.length ? null : order.slotIndex;
    setState((current) => ({
      ...current,
      links: nextLinks,
      slot: { ...current.slot, slotIndex: nextSlotIndex },
    }));
    const payload: LinkOrderRequest = { ids: order.ids, slotIndex: order.slotIndex };
    const saved = await run(async () => {
      const savedLinks = await browserApi<LinkView[]>(CRELINK_API_PATHS.meLinksOrder, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setState((current) => ({ ...current, links: savedLinks }));
    }, '순서를 바꿨어요.');
    if (!saved) {
      setState((current) => ({
        ...current,
        links: before.links,
        slot: { ...current.slot, slotIndex: before.slotIndex },
      }));
    }
  }

  /** 스크린리더 안내에 쓰는 행 이름: 링크는 `<표시 이름> 링크`, 슬롯 행은 `크리링 광고 블록`·`배너 슬롯`. */
  const nameOf = (id: UniqueIdentifier) =>
    id === SLOT_ROW_ID ? slotName : `${links.find((link) => link.id === id)?.title ?? ''} 링크`.trim();
  const positionOf = (id: UniqueIdentifier) => mixed.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      movedSinceStart.current = false;
      return `${withParticle(nameOf(active.id), '을', '를')} 들었어요. 지금 ${positionOf(active.id)}번째, 전체 ${mixed.length}개예요.`;
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
      <div className="panel-badges">
        <p className={`limit-badge${visibleFull ? ' limit-full' : ''}`}>
          보이는 링크 {limits.visibleUsed}/{limits.visibleMax}
        </p>
      </div>
      <SlotEventPanelRow onApplied={setNotice} />
      <p className="section-help">
        카드를 누르면 고칠 수 있고, 손잡이를 끌면 순서가 바뀌어요. {slotName} 행도 같은 손잡이로 옮겨요. 숨긴 링크와
        차단된 링크는 방문자에게 보이지 않고 한도에도 들어가지 않아요. 숨긴 링크 포함 전체 {limits.totalUsed}/
        {limits.totalMax}개.
      </p>
      <ActionStatus error={error} notice={notice ?? doneNotice ?? null} />
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable: `순서를 바꾸려면 스페이스 키나 엔터 키로 링크나 ${withParticle(slotName, '을', '를')} 든 뒤 위·아래 화살표 키로 옮기고, 스페이스 키나 엔터 키로 내려놓으세요. Esc 키를 누르면 취소돼요.`,
          },
        }}
      >
        <SortableContext items={mixed} strategy={verticalListSortingStrategy}>
          <ul className="link-list link-edit-list">
            {mixed.map((id) => {
              if (id === SLOT_ROW_ID) {
                return (
                  <SlotOrderRow
                    key={id}
                    kind={slot.kind}
                    visibleBanners={state.bannerLimits.visibleUsed}
                    busy={pending}
                    alone={links.length === 0}
                    autoFocus={focusSlotHandle}
                    onEdit={() => select({ kind: 'banner-slot' })}
                  />
                );
              }
              const link = links.find((item) => item.id === id);
              return link ? (
                <EditableLinkCard
                  key={id}
                  link={link}
                  busy={pending}
                  dirty={isLinkDirty(link.id)}
                  onEdit={(target) => select({ kind: 'link', id: target.id })}
                  onToggleHidden={toggleHidden}
                />
              ) : null;
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {links.length === 0 ? (
        <p className="empty-text">아직 추가한 링크가 없어요. 링크를 추가하면 미리보기에 바로 보여요.</p>
      ) : null}
      {limitNotice ? (
        <p className="notice-box">{limitNotice}</p>
      ) : (
        <button
          type="button"
          className="secondary link-add"
          onClick={() => select({ kind: 'link', id: null })}
          disabled={pending}
        >
          링크 추가
        </button>
      )}
    </>
  );
}
