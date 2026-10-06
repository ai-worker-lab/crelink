'use client';

import {
  CRELINK_API_PATHS,
  type CreatorLandingState,
  type LinkView,
  type ReorderRequest,
  type UpdateLinkRequest,
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { browserApi } from '../../lib/api/browser';
import { toLandingPreview } from '../../lib/landing-preview';
import { useAction } from '../../lib/use-action';
import { ActionStatus } from '../ActionStatus';
import { Landing } from '../landing/Landing';
import { EditableLinkCard } from './EditableLinkCard';
import { LinkSheet } from './LinkSheet';

/** 끄는 동안 카드가 세로로만 움직이게 합니다(리스트형 구역). */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    '순서를 바꾸려면 스페이스 키나 엔터 키로 링크를 든 뒤 위·아래 화살표 키로 옮기고, 스페이스 키나 엔터 키로 내려놓으세요. Esc 키를 누르면 취소돼요.',
};

type SheetState = { link: LinkView | null; opener: HTMLElement | null };

/**
 * 관리 화면 편집 모드. 공개 랜딩과 같은 배치(`Landing`)에서 리스트형 링크 구역만 편집할 수 있습니다.
 * 링크 추가·수정·삭제는 하단 시트, 순서는 끌어 놓기(`PUT /api/me/links/order`), 숨기기는 스위치(`PATCH hidden`).
 * 저장 뒤에는 편집 상태(`GET /api/me/landing`)를 다시 읽어 한도·순서를 서버 값과 맞춥니다.
 */
export function LandingEditor({ initial }: { initial: CreatorLandingState }) {
  const [state, setState] = useState(initial);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const { pending, error, notice, run, setError, setNotice } = useAction();
  const dndId = useId();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** 이번 끌기에서 한 번이라도 다른 자리로 옮겼는지(스크린리더 안내용). */
  const movedSinceStart = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { links, limits } = state;
  const visibleFull = limits.visibleUsed >= limits.visibleMax;
  const totalFull = limits.totalUsed >= limits.totalMax;

  async function reload() {
    setState(await browserApi<CreatorLandingState>(CRELINK_API_PATHS.meLanding));
  }

  function replaceLinks(next: LinkView[]) {
    setState((current) => ({ ...current, links: next }));
  }

  function openSheet(link: LinkView | null, opener: HTMLElement) {
    setError(null);
    setNotice(null);
    setSheet({ link, opener });
  }

  function closeSheet(result: string | null) {
    const opener = sheet?.opener ?? null;
    setSheet(null);
    if (result) setNotice(result);
    // 연 요소가 남아 있으면(수정·추가 버튼) 그리로, 지워졌으면 링크 구역 제목으로 포커스를 돌려줍니다.
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      else headingRef.current?.focus();
    });
  }

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
    const before = links;
    const from = before.findIndex((link) => link.id === active.id);
    const to = before.findIndex((link) => link.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(before, from, to);
    replaceLinks(next);
    const payload: ReorderRequest = { ids: next.map((link) => link.id) };
    const saved = await run(async () => {
      replaceLinks(
        await browserApi<LinkView[]>(CRELINK_API_PATHS.meLinksOrder, { method: 'PUT', body: JSON.stringify(payload) }),
      );
    }, '순서를 바꿨어요.');
    if (!saved) replaceLinks(before);
  }

  const titleOf = (id: UniqueIdentifier) => links.find((link) => link.id === id)?.title ?? '링크';
  const positionOf = (id: UniqueIdentifier) => links.findIndex((link) => link.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      movedSinceStart.current = false;
      return `${titleOf(active.id)} 링크를 들었어요. 지금 ${positionOf(active.id)}번째, 전체 ${links.length}개예요.`;
    },
    onDragOver: ({ active, over }) => {
      // 든 직후 제자리 위에 있다는 안내가 '들었어요' 안내를 덮지 않게 건너뜁니다.
      if (over?.id === active.id && !movedSinceStart.current) return undefined;
      movedSinceStart.current = true;
      return over
        ? `${titleOf(active.id)} 링크를 ${positionOf(over.id)}번째 자리로 옮기고 있어요.`
        : `${titleOf(active.id)} 링크가 목록 밖에 있어요.`;
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} 링크를 ${positionOf(over.id)}번째 자리에 놓았어요.`
        : `${titleOf(active.id)} 링크를 제자리에 놓았어요.`,
    onDragCancel: ({ active }) => `${titleOf(active.id)} 링크 옮기기를 취소했어요. 원래 자리로 돌아갔어요.`,
  };

  const linkZone = (
    <section className="link-zone" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          외부 링크
        </h2>
        <p className={`limit-badge${visibleFull ? ' limit-full' : ''}`}>
          보이는 링크 {limits.visibleUsed}/{limits.visibleMax}
        </p>
      </div>
      <p className="section-help">
        카드를 누르면 고칠 수 있고, 손잡이를 끌면 순서가 바뀌어요. 숨긴 링크와 차단된 링크는 방문자에게 보이지 않고
        한도에도 들어가지 않아요. 숨긴 링크 포함 전체 {limits.totalUsed}/{limits.totalMax}개.
      </p>
      <ActionStatus error={error} notice={notice} />
      {links.length === 0 ? <p className="empty-text">아직 추가한 링크가 없어요.</p> : null}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        onDragEnd={onDragEnd}
        accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
      >
        <SortableContext items={links.map((link) => link.id)} strategy={verticalListSortingStrategy}>
          <ul className="link-list link-edit-list">
            {links.map((link) => (
              <EditableLinkCard
                key={link.id}
                link={link}
                busy={pending}
                onOpen={openSheet}
                onToggleHidden={toggleHidden}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {totalFull ? (
        <p className="notice-box">
          숨긴 링크를 포함해 링크는 최대 {limits.totalMax}개까지 둘 수 있어요. 쓰지 않는 링크를 지운 뒤 추가해 주세요.
        </p>
      ) : visibleFull ? (
        <p className="notice-box">
          보이는 링크 한도({limits.visibleMax}개)에 도달했어요. 다른 링크를 숨기거나 지우면 새 링크를 추가할 수 있어요.
          한도를 늘리려면 크리링 운영자에게 문의해 주세요.
        </p>
      ) : (
        <button
          type="button"
          className="secondary link-add"
          onClick={(event) => openSheet(null, event.currentTarget)}
          disabled={pending}
        >
          링크 추가
        </button>
      )}
    </section>
  );

  return (
    <>
      <p className="section-help">
        프로필·SNS·포트폴리오는 <Link href="/me">내 크리링</Link>에서 고칠 수 있어요.
      </p>
      <div className="landing-preview">
        <Landing landing={toLandingPreview(state)} headingLevel={2} links={linkZone} />
      </div>
      {sheet ? <LinkSheet link={sheet.link} onChanged={reload} onClose={closeSheet} /> : null}
    </>
  );
}
