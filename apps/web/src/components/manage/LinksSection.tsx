'use client';

import { CRELINK_API_PATHS, type LinkView, type ReorderRequest, type UpdateLinkRequest } from '@crelink/shared';
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
import { useId, useRef, useState } from 'react';
import { browserApi } from '../../lib/api/browser';
import { linkDraftOf } from '../../lib/landing-preview';
import { useAction } from '../../lib/use-action';
import { useWideLayout } from '../../lib/use-wide-layout';
import { ActionStatus } from '../ActionStatus';
import { EditableLinkCard } from './EditableLinkCard';
import { EditSheet } from './EditSheet';
import { LinkForm } from './LinkForm';
import { useManager } from './ManagerContext';

/** 끄는 동안 카드가 세로로만 움직이게 합니다(리스트형 구역). */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    '순서를 바꾸려면 스페이스 키나 엔터 키로 링크를 든 뒤 위·아래 화살표 키로 옮기고, 스페이스 키나 엔터 키로 내려놓으세요. Esc 키를 누르면 취소돼요.',
};

/**
 * `페이지 편집`의 외부 링크 카드(PRD R18). 추가·수정·삭제는 넓은 화면에서 패널 안 펼침 폼, 좁은 화면에서 하단 시트(같은 `LinkForm`).
 * 폼은 한 번에 하나만 열리고 열린 동안 끌기를 막습니다. 순서는 끌어 놓기(`PUT /api/me/links/order`), 숨기기는 스위치(`PATCH hidden`)로
 * 바로 저장하고 실패하면 되돌립니다. 저장 뒤에는 편집 상태(`GET /api/me/landing`)를 다시 읽어 한도·순서를 서버 값과 맞춥니다.
 */
export function LinksSection() {
  const { state, setState, reload, linkDraft, setLinkDraft, dirty } = useManager();
  const wide = useWideLayout();
  const { pending, error, notice, run, setError, setNotice } = useAction();
  const formAction = useAction();
  /** 폼을 열 때마다 늘어나는 번호. 폼 구성 요소의 key라서 한 번 연 폼은 한 인스턴스이고, 닫힌 폼의 늦은 업로드 결과는 버려집니다. */
  const [formSession, setFormSession] = useState(0);
  const dndId = useId();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  /** 폼을 연 요소. 닫힌 뒤 초점을 돌려줍니다. */
  const openerRef = useRef<HTMLElement | null>(null);
  /** 이번 끌기에서 한 번이라도 다른 자리로 옮겼는지(스크린리더 안내용). */
  const movedSinceStart = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { links, limits } = state;
  const visibleFull = limits.visibleUsed >= limits.visibleMax;
  const totalFull = limits.totalUsed >= limits.totalMax;
  const formLink = linkDraft?.id ? (links.find((link) => link.id === linkDraft.id) ?? null) : null;
  // 고치던 링크가 사라졌으면(다른 곳에서 지움) 폼을 그리지 않습니다.
  const formOpen = linkDraft !== null && (linkDraft.id === null || formLink !== null);
  const newFormOpen = formOpen && linkDraft?.id === null;

  function replaceLinks(next: LinkView[]) {
    setState((current) => ({ ...current, links: next }));
  }

  function openForm(link: LinkView | null, opener: HTMLElement) {
    if (link && linkDraft?.id === link.id) {
      closeForm(null);
      return;
    }
    setError(null);
    setNotice(null);
    formAction.setError(null);
    openerRef.current = opener;
    setFormSession((session) => session + 1);
    setLinkDraft(linkDraftOf(link));
  }

  function closeForm(result: string | null) {
    const opener = openerRef.current;
    const wasNew = linkDraft?.id === null;
    openerRef.current = null;
    setLinkDraft(null);
    if (result) setNotice(result);
    // 연 요소가 남아 있으면(수정·링크 추가 버튼) 그리로, 지워졌으면 링크 구역 제목으로 초점을 돌려줍니다.
    requestAnimationFrame(() => {
      const target = wasNew ? addButtonRef.current : opener;
      if (target?.isConnected) target.focus();
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

  const form = (variant: 'inline' | 'sheet') => (
    <LinkForm
      key={formSession}
      link={formLink}
      variant={variant}
      action={formAction}
      onDone={closeForm}
      onCancel={() => closeForm(null)}
    />
  );

  return (
    <section className="card" aria-labelledby={headingId}>
      <div className="card-head">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          외부 링크
        </h2>
        <div className="card-head-badges">
          {dirty.link ? <span className="badge dirty-chip">저장 안 함</span> : null}
          <p className={`limit-badge${visibleFull ? ' limit-full' : ''}`}>
            보이는 링크 {limits.visibleUsed}/{limits.visibleMax}
          </p>
        </div>
      </div>
      <p className="section-help">
        카드를 누르면 고칠 수 있고, 손잡이를 끌면 순서가 바뀌어요. 숨긴 링크와 차단된 링크는 방문자에게 보이지 않고
        한도에도 들어가지 않아요. 숨긴 링크 포함 전체 {limits.totalUsed}/{limits.totalMax}개.
      </p>
      <ActionStatus error={error} notice={notice} />
      {links.length === 0 && !newFormOpen ? (
        <p className="empty-text">아직 추가한 링크가 없어요. 링크를 추가하면 미리보기에 바로 보여요.</p>
      ) : null}
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
            {links.map((link) => {
              const expanded = wide && formOpen && linkDraft?.id === link.id;
              return (
                <EditableLinkCard
                  key={link.id}
                  link={link}
                  busy={pending}
                  dragLocked={formOpen}
                  inline={wide}
                  expanded={expanded}
                  onEdit={openForm}
                  onToggleHidden={toggleHidden}
                >
                  {expanded ? form('inline') : null}
                </EditableLinkCard>
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {wide && newFormOpen ? (
        <div className="item-card link-new-form">{form('inline')}</div>
      ) : totalFull ? (
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
          ref={addButtonRef}
          className="secondary link-add"
          onClick={(event) => openForm(null, event.currentTarget)}
          disabled={pending}
          aria-haspopup={wide ? undefined : 'dialog'}
        >
          링크 추가
        </button>
      )}
      {!wide && formOpen ? (
        <EditSheet
          title={formLink ? '링크 수정' : '새 링크'}
          pending={formAction.pending}
          onDismiss={() => closeForm(null)}
        >
          {form('sheet')}
        </EditSheet>
      ) : null}
    </section>
  );
}
