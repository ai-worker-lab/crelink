'use client';

import type { LinkView } from '@crelink/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId } from 'react';
import { LinkCardContent } from '../landing/Landing';

/**
 * 편집 모드의 링크 카드 한 개: 끌기 손잡이(마우스·터치·키보드), 카드 누르기(수정 시트), 숨기기 스위치,
 * 숨김·차단 표시. 숨긴 링크는 흐리게, 차단된 링크는 배지와 사유를 보여 줍니다.
 */
export function EditableLinkCard({
  link,
  busy,
  onOpen,
  onToggleHidden,
}: {
  link: LinkView;
  /** 저장 요청(순서·숨기기)이 진행 중이면 끌기와 스위치를 막습니다. */
  busy: boolean;
  onOpen: (link: LinkView, opener: HTMLElement) => void;
  onToggleHidden: (link: LinkView, hidden: boolean) => void;
}) {
  const descriptionId = useId();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: link.id,
    disabled: busy,
    attributes: { roleDescription: '순서를 바꿀 수 있는 링크' },
  });
  const className = [
    'link-edit-item',
    link.hidden ? 'is-hidden' : '',
    link.blocked ? 'is-blocked' : '',
    isDragging ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li ref={setNodeRef} className={className} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <div className="link-edit-row">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`${link.title} 순서 바꾸기`}
        >
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M7 4h2v2H7zm4 0h2v2h-2zM7 9h2v2H7zm4 0h2v2h-2zm-4 5h2v2H7zm4 0h2v2h-2z" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="link-card link-edit-card"
          aria-label={`${link.title} 수정`}
          aria-describedby={link.description ? descriptionId : undefined}
          onClick={(event) => onOpen(link, event.currentTarget)}
        >
          <LinkCardContent
            title={link.title}
            description={link.description}
            thumbnailUrl={link.thumbnail?.url ?? null}
            faviconUrl={link.faviconUrl}
            descriptionId={descriptionId}
          />
        </button>
        <button
          type="button"
          role="switch"
          className="hide-switch"
          aria-checked={link.hidden}
          aria-label={`${link.title} 숨기기`}
          aria-disabled={busy || undefined}
          onClick={() => {
            // disabled로 막으면 누른 스위치에서 포커스가 빠지므로 aria-disabled로 알리고 누르기만 무시합니다.
            if (!busy) onToggleHidden(link, !link.hidden);
          }}
        >
          <span className="hide-switch-track" aria-hidden="true">
            <span className="hide-switch-thumb" />
          </span>
          <span className="hide-switch-text" aria-hidden="true">
            숨김
          </span>
        </button>
      </div>
      {link.hidden || link.blocked ? (
        <p className="badges link-edit-status">
          {link.hidden ? <span className="badge">숨김</span> : null}
          {link.blocked ? <span className="badge badge-danger">차단됨</span> : null}
        </p>
      ) : null}
      {link.blocked ? (
        <p className="blocked-reason">
          크리링이 이 링크를 차단해 방문자에게 보이지 않아요.
          {link.blockedReason ? ` 사유: ${link.blockedReason}` : ''}
        </p>
      ) : null}
    </li>
  );
}
