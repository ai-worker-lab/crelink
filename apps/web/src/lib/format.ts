import type { SocialPlatform } from '@crelink/shared';

/** 화면에 보이는 날짜는 한국 시간 기준입니다(서버·브라우저 렌더 결과가 같게 시간대를 고정). */
const TIME_ZONE = 'Asia/Seoul';
const dateFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: TIME_ZONE, dateStyle: 'long' });
const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});
const isoDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const numberFormat = new Intl.NumberFormat('ko-KR');

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** 오늘(한국 시간)로 끝나는 `days`일 기간. 값은 `YYYY-MM-DD`이며 양 끝을 포함합니다. */
export function recentRange(days: number): { from: string; to: string } {
  const now = Date.now();
  return {
    from: isoDayFormat.format(new Date(now - (days - 1) * 24 * 60 * 60 * 1000)),
    to: isoDayFormat.format(new Date(now)),
  };
}

/** SNS 플랫폼 이름과 아이콘 자산(`public/icons/sns/`, 출처는 apps/web/docs/sns-icons.md). */
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, { name: string; icon: string }> = {
  instagram: { name: '인스타그램', icon: '/icons/sns/instagram.svg' },
  youtube: { name: '유튜브', icon: '/icons/sns/youtube.svg' },
  tiktok: { name: '틱톡', icon: '/icons/sns/tiktok.svg' },
  naver_blog: { name: '네이버 블로그', icon: '/icons/sns/naver_blog.svg' },
  x: { name: 'X', icon: '/icons/sns/x.svg' },
  threads: { name: '스레드', icon: '/icons/sns/threads.svg' },
  facebook: { name: '페이스북', icon: '/icons/sns/facebook.svg' },
  other: { name: '기타', icon: '/icons/sns/other.svg' },
};
