import type { CSSProperties } from 'react';
import type { SocialPlatform } from '@crelink/shared';
import { SOCIAL_PLATFORM_LABELS } from '../lib/format';

/**
 * SNS 플랫폼 아이콘. `public/icons/sns/{platform}.svg`를 CSS mask로 그려 글자색(currentColor)을 따릅니다.
 * 출처·상표 기준은 apps/web/docs/sns-icons.md. 장식용이라 보조기술에서는 숨기고, 이름은 감싸는 요소가 제공합니다.
 */
export function SocialIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const style = { '--social-icon': `url(${SOCIAL_PLATFORM_LABELS[platform].icon})` } as CSSProperties;
  return <span className={className ? `social-icon ${className}` : 'social-icon'} style={style} aria-hidden="true" />;
}
