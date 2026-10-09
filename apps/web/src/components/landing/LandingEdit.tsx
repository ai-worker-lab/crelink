'use client';

import type { BannerSlotKind } from '@crelink/shared';
import { useId, type MouseEvent, type ReactNode } from 'react';
import { targetKey, type LandingEditTarget } from '../../lib/landing-edit';

/**
 * 관리 화면 `페이지 편집` 미리보기의 고르기 층(디자인 design/preview-direct-edit/handoff.md `고르기`). `Landing`에 `edit`를 주면
 * 구역을 `EditRegion`으로 감싸고 링크·포트폴리오를 고르기 버튼으로 그립니다. 방문자 화면과 모양은 같고, 원래 링크(`<a>`)는 그리지 않습니다.
 */
export interface LandingEditControl {
  /** 고른 대상의 `targetKey`. */
  selectedKey: string | null;
  onSelect: (target: LandingEditTarget, trigger: HTMLElement) => void;
  /** 저장하지 않은 초안이 있는 대상의 `targetKey`(이름표에 `저장 안 함`). */
  dirtyKeys: ReadonlySet<string>;
  /** null이면 `+ 링크 추가` 자리, 문장이면 한도 안내로 바꿉니다. */
  linkAddNotice: string | null;
  canAddPortfolio: boolean;
  /**
   * 방문자에게 숨는 광고 블록·배너 슬롯(`resolveBannerSlot`의 `'no_banners'`)의 점선 자리. 링크 목록에서 보이는 링크 `afterLinkCount`개 다음에 둡니다.
   * 그리지 않으면 null(보이는 슬롯이거나 `'no_content'`).
   */
  slotPlaceholder: { kind: BannerSlotKind; afterLinkCount: number } | null;
}

/**
 * 고를 수 있는 구역: 테두리와 이름표 버튼(`<구역> · <꼬리>`, 꼬리 기본 `편집`). 이름표가 키보드·스크린리더의 고르기 버튼이고(`buttonLabel`),
 * 구역의 빈 곳을 누르는 것은 마우스·터치용 지름길입니다. 안쪽 항목 버튼과 안쪽 구역은 자기 대상을 고릅니다. 안쪽 버튼(캐러셀 이전·다음)은 자기 동작을 합니다.
 * 같은 대상을 가리키는 구역이 둘이면(프로필 머리·SNS 줄) 하나만 `primary`로 두어 현재 항목 표시가 겹치지 않게 합니다.
 * `narrowTail`을 주면 1023px 이하(편집 칩)에서 꼬리를 그 말로 줄입니다(광고 블록 `위치 이동` → `위치`).
 */
export function EditRegion({
  edit,
  target,
  label,
  buttonLabel,
  tail = '편집',
  narrowTail,
  className,
  primary = true,
  children,
}: {
  edit: LandingEditControl;
  target: LandingEditTarget;
  label: string;
  buttonLabel: string;
  tail?: string;
  narrowTail?: string;
  className?: string;
  primary?: boolean;
  children: ReactNode;
}) {
  const key = targetKey(target);
  const selected = edit.selectedKey === key;
  const dirty = edit.dirtyKeys.has(key);
  const dirtyId = useId();
  return (
    <div
      className={['edit-region', selected ? 'is-selected' : '', className ?? ''].filter(Boolean).join(' ')}
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        const clicked = event.target as HTMLElement;
        // 안쪽 구역(방명록 안의 외부 링크 등)을 누른 것은 그 구역이 맡습니다. 버튼·탭은 자기 동작을 합니다.
        if (clicked.closest('.edit-region') !== event.currentTarget) return;
        if (clicked.closest('button, [role="tab"]')) return;
        const tag = event.currentTarget.querySelector<HTMLButtonElement>(':scope > .edit-tag');
        if (tag) edit.onSelect(target, tag);
      }}
    >
      <button
        type="button"
        className="edit-tag"
        data-target={key}
        aria-label={buttonLabel}
        aria-current={(selected && primary) || undefined}
        aria-describedby={dirty ? dirtyId : undefined}
        onClick={(event) => edit.onSelect(target, event.currentTarget)}
      >
        {label} ·{' '}
        {narrowTail ? (
          <>
            <span className="edit-tag-wide">{tail}</span>
            <span className="edit-tag-narrow">{narrowTail}</span>
          </>
        ) : (
          tail
        )}
        {dirty ? ' · 저장 안 함' : ''}
      </button>
      {dirty ? (
        <span id={dirtyId} className="visually-hidden">
          저장 안 함
        </span>
      ) : null}
      {children}
    </div>
  );
}

/**
 * 고를 수 있는 항목(링크 카드·포트폴리오 카드·배너 한 장) 버튼. 고른 항목 위에는 `<종류> · <이름> · 편집` 이름표(`EditItemTag`)를 띄웁니다.
 * `tagOutside`면 이름표를 그리지 않습니다(가로 스크롤 트랙 안 배너는 캐러셀이 트랙 밖에 그림).
 */
export function EditItem({
  edit,
  target,
  kindLabel,
  title,
  className,
  tagOutside = false,
  children,
}: {
  edit: LandingEditControl;
  target: LandingEditTarget;
  kindLabel: string;
  title: string;
  className: string;
  tagOutside?: boolean;
  children: ReactNode;
}) {
  const key = targetKey(target);
  const selected = edit.selectedKey === key;
  const dirty = edit.dirtyKeys.has(key);
  const dirtyId = useId();
  return (
    <>
      {tagOutside ? null : <EditItemTag edit={edit} target={target} kindLabel={kindLabel} title={title} />}
      {dirty ? (
        <span id={dirtyId} className="visually-hidden">
          저장 안 함
        </span>
      ) : null}
      <button
        type="button"
        className={`${className} edit-item${selected ? ' is-selected' : ''}`}
        aria-label={`${title} ${kindLabel} 편집`}
        aria-current={selected || undefined}
        aria-describedby={dirty ? dirtyId : undefined}
        onClick={(event) => edit.onSelect(target, event.currentTarget)}
      >
        {children}
      </button>
    </>
  );
}

/** 고르거나 저장하지 않은 항목의 이름표(`<종류> · <이름> · 편집 · 저장 안 함`). 화면용이고 읽기는 항목 버튼이 맡습니다. */
export function EditItemTag({
  edit,
  target,
  kindLabel,
  title,
}: {
  edit: LandingEditControl;
  target: LandingEditTarget;
  kindLabel: string;
  title: string;
}) {
  const key = targetKey(target);
  const selected = edit.selectedKey === key;
  const dirty = edit.dirtyKeys.has(key);
  if (!selected && !dirty) return null;
  return (
    <span className={`edit-item-tag${selected ? ' is-selected' : ''}`} aria-hidden="true">
      {kindLabel} · {title}
      {selected ? ' · 편집' : ''}
      {dirty ? ' · 저장 안 함' : ''}
    </span>
  );
}

/** 목록 끝의 점선 추가 자리(`+ 링크 추가`). `notice`가 있으면 버튼 대신 안내 문장입니다(링크 한도). */
export function AddSlot({
  edit,
  target,
  label,
  notice,
}: {
  edit: LandingEditControl;
  target: LandingEditTarget;
  label: string;
  notice?: string | null;
}) {
  if (notice) return <p className="add-slot is-notice">{notice}</p>;
  const selected = edit.selectedKey === targetKey(target);
  // 같은 새 항목을 미리보기 카드(EditItem)도 가리킬 수 있어 현재 항목 표시는 카드에만 둡니다.
  return (
    <button
      type="button"
      className={`add-slot${selected ? ' is-selected' : ''}`}
      onClick={(event) => edit.onSelect(target, event.currentTarget)}
    >
      + {label}
    </button>
  );
}
