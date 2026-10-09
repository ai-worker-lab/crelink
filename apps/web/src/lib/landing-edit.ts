/**
 * 관리 화면 `페이지 편집`에서 미리보기·구역 목록으로 고르는 대상(디자인 design/preview-direct-edit/handoff.md `고르기`,
 * design/ad-banner-block/handoff.md `관리 화면 페이지 편집`).
 * `id: null`은 새 항목(`+ 링크 추가`·`+ 포트폴리오 추가`·새 배너)입니다. 프로필 머리와 SNS 줄은 둘 다 `profile`(프로필 메뉴 안내)입니다.
 * `ad-slot`은 크리링 광고 블록(위치 안내), `banner-slot`은 크리에이터 배너 슬롯, `banner`는 배너 슬롯 안 배너 한 장입니다.
 */
export type LandingEditTarget =
  | { kind: 'links' }
  | { kind: 'link'; id: string | null }
  | { kind: 'portfolio' }
  | { kind: 'portfolio-item'; id: string | null }
  | { kind: 'guestbook' }
  | { kind: 'profile' }
  | { kind: 'ad-slot' }
  | { kind: 'banner-slot' }
  | { kind: 'banner'; id: string | null };

/** 같은 대상인지 비교할 때 쓰는 문자열(`link:<id>`, 새 항목은 `link:new`, 배너는 `banner:<id|new>`). */
export function targetKey(target: LandingEditTarget): string {
  if (target.kind === 'link' || target.kind === 'portfolio-item' || target.kind === 'banner') {
    return `${target.kind}:${target.id ?? 'new'}`;
  }
  return target.kind;
}

/**
 * 대상 열쇠(`targetKey`)가 속한 구역(`links`·`portfolio`·`banner-slot`·`ad-slot`·`guestbook`·`profile`).
 * 처음 패널로 돌아올 때 초점 받을 구역 목록 버튼·이름표를 찾는 데 씁니다.
 */
export function sectionOfKey(key: string): string {
  const kind = key.split(':')[0];
  if (kind === 'link') return 'links';
  if (kind === 'portfolio-item') return 'portfolio';
  if (kind === 'banner') return 'banner-slot';
  return kind;
}
