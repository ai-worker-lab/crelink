'use client';

import type { LinkView } from '@crelink/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId } from 'react';
import { LinkCardContent } from '../landing/Landing';

/**
 * 외부 링크 패널의 링크 행 한 개: 끌기 손잡이(마우스·터치·키보드), 링크 카드(누르면 수정), 숨기기 스위치, `수정` 버튼,
 * 숨김·차단·저장 안 함 표시. 숨긴 링크는 흐리게, 차단된 링크는 배지와 사유를 보여 주고 숨기기 스위치를 바꿀 수 없게 둡니다(수정·삭제는 가능).
 */
export function EditableLinkCard({
  link,
  busy,
  dirty,
  onEdit,
  onToggleHidden,
}: {
  link: LinkView;
  /** 저장 요청(순서·숨기기)이 진행 중이면 끌기와 스위치를 막습니다. */
  busy: boolean;
  /** 이 링크에 저장하지 않은 초안이 있는지. */
  dirty: boolean;
  /** `수정`·카드 누르기: 이 링크를 골라 패널을 폼으로 바꿉니다. */
  onEdit: (link: LinkView) => void;
  onToggleHidden: (link: LinkView, hidden: boolean) => void;
}) {
  const reasonId = useId();
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
  const switchLocked = busy || link.blocked;
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
        {/* 카드 누르기는 마우스·터치용 지름길입니다. 키보드·스크린리더는 같은 동작의 `수정` 버튼을 씁니다. */}
        <div className="link-card link-edit-card" onClick={() => onEdit(link)}>
          <LinkCardContent
            title={link.title}
            description={link.description}
            thumbnailUrl={link.thumbnail?.url ?? null}
            faviconUrl={link.faviconUrl}
          />
        </div>
        <div className="link-edit-controls">
          <button
            type="button"
            role="switch"
            className="hide-switch"
            aria-checked={link.hidden}
            aria-label={`${link.title} 숨기기`}
            aria-disabled={switchLocked || undefined}
            aria-describedby={link.blocked ? reasonId : undefined}
            onClick={() => {
              // disabled로 막으면 누른 스위치에서 포커스가 빠지므로 aria-disabled로 알리고 누르기만 무시합니다.
              if (!switchLocked) onToggleHidden(link, !link.hidden);
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
            aria-label={`${link.title} 수정`}
            onClick={() => onEdit(link)}
          >
            수정
          </button>
        </div>
      </div>
      {link.hidden || link.blocked || dirty ? (
        <p className="badges link-edit-status">
          {link.hidden ? <span className="badge">숨김</span> : null}
          {link.blocked ? <span className="badge badge-danger">차단됨</span> : null}
          {dirty ? <span className="badge dirty-chip">저장 안 함</span> : null}
        </p>
      ) : null}
      {link.blocked ? (
        <p className="blocked-reason" id={reasonId}>
          크리링이 이 링크를 차단해 방문자에게 보이지 않아요.
          {link.blockedReason ? ` 사유: ${link.blockedReason}` : ''}
        </p>
      ) : null}
    </li>
  );
}
