/**
 * 관리 화면 `페이지 편집`에서 미리보기·구역 목록으로 고르는 대상(디자인 design/preview-direct-edit/handoff.md `고르기`).
 * `id: null`은 새 항목(`+ 링크 추가`·`+ 포트폴리오 추가`)입니다. 프로필 머리와 SNS 줄은 둘 다 `profile`(프로필 메뉴 안내)입니다.
 */
export type LandingEditTarget =
  | { kind: 'links' }
  | { kind: 'link'; id: string | null }
  | { kind: 'portfolio' }
  | { kind: 'portfolio-item'; id: string | null }
  | { kind: 'guestbook' }
  | { kind: 'profile' };

/** 같은 대상인지 비교할 때 쓰는 문자열(`link:<id>`, 새 항목은 `link:new`). */
export function targetKey(target: LandingEditTarget): string {
  if (target.kind === 'link' || target.kind === 'portfolio-item') return `${target.kind}:${target.id ?? 'new'}`;
  return target.kind;
}
