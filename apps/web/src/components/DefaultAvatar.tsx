/**
 * 프로필 사진이 없을 때 보여 주는 기본 프로필(PRD R17). 색은 CSS(`.default-avatar`)의 디자인 토큰을 currentColor로 받습니다.
 * 장식용이라 보조기술에서는 숨깁니다. 크기·테두리는 사용하는 곳의 className이 정합니다.
 */
export function DefaultAvatar({ className }: { className?: string }) {
  return (
    <span className={className ? `default-avatar ${className}` : 'default-avatar'} aria-hidden="true">
      <svg viewBox="0 0 96 96" focusable="false">
        <circle cx="48" cy="38" r="17" fill="currentColor" />
        <path d="M16 90c2-19 15-31 32-31s30 12 32 31z" fill="currentColor" />
      </svg>
    </span>
  );
}
