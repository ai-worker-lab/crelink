'use client';

import type { BannerSlotKind } from '@crelink/shared';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId } from 'react';
import { SLOT_ROW_ID, slotRowName } from '../../lib/slot-order';

/**
 * 외부 링크 패널 정렬 목록 안의 광고 블록·배너 슬롯 행(디자인 design/ad-banner-block/handoff.md `관리 화면 페이지 편집`).
 * 링크 행과 같은 손잡이로 끌어 옮기고, 숨기기 스위치·삭제는 없습니다. 광고 행은 `광고` 배지·`크리링 광고 블록`·`지울 수 없고 위치만 바꿀 수 있어요`,
 * 배너 슬롯 행은 `배너 슬롯`·`보이는 배너 n장`·`수정`(배너 슬롯 패널)입니다.
 * 링크가 0개면 옮길 자리가 없으므로 손잡이는 `aria-disabled`이고 보조 줄은 `링크를 추가하면 그 사이로 옮길 수 있어요`입니다.
 * 손잡이에는 `data-slot-handle`이 있어 광고 블록 패널의 `외부 링크 목록에서 끌어 옮기기`가 초점을 옮깁니다(`autoFocus`면 시트가 처음 초점을 둠).
 */
export function SlotOrderRow({
  kind,
  visibleBanners,
  busy,
  alone,
  autoFocus,
  onEdit,
}: {
  kind: BannerSlotKind;
  /** 배너 슬롯의 보이는 배너 수(숨김·차단 제외). */
  visibleBanners: number;
  /** 저장 요청(순서·숨기기)이 진행 중이면 끌기를 막습니다. */
  busy: boolean;
  /** 링크가 0개라 옮길 자리가 없음. */
  alone: boolean;
  /** 하단 시트를 열 때 이 손잡이에 처음 초점을 둡니다(`EditSheet`의 `data-autofocus`). */
  autoFocus: boolean;
  /** 배너 슬롯 행 `수정`: 배너 슬롯 패널로 갑니다. */
  onEdit: () => void;
}) {
  const helpId = useId();
  const name = slotRowName(kind);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: SLOT_ROW_ID,
    disabled: busy || alone,
    attributes: { roleDescription: `순서를 바꿀 수 있는 ${name}` },
  });
  const help = alone
    ? '링크를 추가하면 그 사이로 옮길 수 있어요'
    : kind === 'ad'
      ? '지울 수 없고 위치만 바꿀 수 있어요'
      : `보이는 배너 ${visibleBanners}장`;
  return (
    <li
      ref={setNodeRef}
      className={`link-edit-item slot-edit-item${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="link-edit-row">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="drag-handle"
          data-slot-handle=""
          data-autofocus={autoFocus ? '' : undefined}
          {...attributes}
          {...listeners}
          aria-label={`${name} 순서 바꾸기`}
          aria-describedby={`${attributes['aria-describedby']} ${helpId}`}
        >
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M7 4h2v2H7zm4 0h2v2h-2zM7 9h2v2H7zm4 0h2v2h-2zm-4 5h2v2H7zm4 0h2v2h-2z" fill="currentColor" />
          </svg>
        </button>
        <div className="link-card link-edit-card slot-edit-card">
          <span className="link-text">
            <span className="link-title">
              {kind === 'ad' ? <span className="banner-ad-badge">광고</span> : null}
              <span>{name}</span>
            </span>
            <span id={helpId} className="link-description">
              {help}
            </span>
          </span>
        </div>
        {kind === 'creator' ? (
          <div className="link-edit-controls">
            <button type="button" className="secondary link-edit-button" aria-label="배너 슬롯 수정" onClick={onEdit}>
              수정
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
