import type { ReactNode } from 'react';

export interface ManagerMenuItem {
  /** `/me/landings/{publicId}` 아래 경로 조각. 빈 문자열은 기본 메뉴(페이지 편집)입니다. */
  segment: string;
  /** 메뉴 이름이자 그 화면의 제목(h1)과 문서 제목입니다. */
  label: string;
  icon: ReactNode;
}

const iconProps = {
  viewBox: '0 0 24 24',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/**
 * 랜딩 관리 화면 메뉴(설계: design/desktop-landing-manager/handoff.md `확장 지점`). 메뉴 한 개 = 랜딩 아래 경로 한 개이고,
 * 새 기능은 이 배열에 한 줄을 더하고 `app/me/landings/[publicId]/<segment>/page.tsx`를 두어 붙입니다.
 * 순서는 자주 쓰는 순이고 설정류는 늘 맨 끝입니다.
 */
export const MANAGER_MENU = [
  {
    segment: '',
    label: '페이지 편집',
    icon: (
      <svg {...iconProps}>
        <path d="M4 20h4L19 9a2 2 0 0 0-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
    ),
  },
  {
    segment: 'guestbook',
    label: '방명록',
    icon: (
      <svg {...iconProps}>
        <path d="M5 5h14v10H9l-4 4V5Z" />
        <path d="M9 9h6M9 12h4" />
      </svg>
    ),
  },
  {
    segment: 'settings',
    label: '주소 설정',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    ),
  },
] as const satisfies ReadonlyArray<ManagerMenuItem>;

export type ManagerMenuSegment = (typeof MANAGER_MENU)[number]['segment'];

export function managerMenuLabel(segment: ManagerMenuSegment): string {
  return MANAGER_MENU.find((item) => item.segment === segment)?.label ?? '';
}

export function managerHref(publicId: string, segment: ManagerMenuSegment): string {
  const base = `/me/landings/${encodeURIComponent(publicId)}`;
  return segment ? `${base}/${segment}` : base;
}
