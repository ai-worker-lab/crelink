import type { CSSProperties } from 'react';
import type { SocialPlatform } from '@crelink/shared';
import { SOCIAL_PLATFORM_LABELS } from '../lib/format';

/**
 * SNS 플랫폼 아이콘. 각 서비스의 공식 아이콘 파일(`public/icons/sns/`)을 원본 색 그대로 `<img>`로 보여 줍니다.
 * 브랜드 가이드라인 고정값입니다. 디자인 토큰·글자색·테마를 적용하지 않고(filter·mask·currentColor 금지),
 * 크기·타일 배경도 `.social-icon--{platform}`의 고정값을 씁니다. 출처·규칙은 apps/web/docs/sns-icons.md.
 * 예외로 `other`(크리링 자체 링크 아이콘)만 글자색(디자인 시스템)을 따르는 mask로 그립니다.
 * 장식용이라 보조기술에서는 숨기고, 이름은 감싸는 요소가 제공합니다.
 */
export function SocialIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const icon = SOCIAL_PLATFORM_LABELS[platform].icon;
  const classes = ['social-icon', `social-icon--${platform}`, className].filter(Boolean).join(' ');
  if (platform === 'other') {
    const style = { '--social-icon': `url(${icon})` } as CSSProperties;
    return <span className={classes} style={style} aria-hidden="true" />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- 공식 원본 파일을 변형 없이 그대로 보여 줘야 해 next/image 최적화를 쓰지 않습니다.
  return <img className={classes} src={icon} alt="" aria-hidden="true" decoding="async" />;
}
