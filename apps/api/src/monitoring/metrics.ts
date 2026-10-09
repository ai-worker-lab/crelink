import * as Sentry from '@sentry/nestjs';

/**
 * Sentry Metrics로 보내는 업무 지표(counter) 이름. 새 지표는 여기 더하고 apps/api/docs/README.md#오류-모니터링 목록도 고칩니다.
 * - `crelink.auth.login`: 구글 로그인 콜백 1회(`result`: `success`·`failure`)
 * - `crelink.short_link.visit`: 단축 주소 방문이 랜딩으로 302 된 1회(방문 기록 시작)
 * - `crelink.link.click`: 외부 링크 클릭이 저장된 URL로 302 된 1회(클릭 기록 시작)
 * - `crelink.ad_banner.impression`·`crelink.ad_banner.click`: 크리링 배너 노출·클릭 카운터 기록 시작 1회(`TrackingService.recordAdStat`)
 * - `crelink.creator_banner.click`: 크리에이터 배너 클릭이 저장된 URL로 302 된 1회(클릭 기록 시작)
 */
export type BusinessMetric =
  | 'crelink.auth.login'
  | 'crelink.short_link.visit'
  | 'crelink.link.click'
  | 'crelink.ad_banner.impression'
  | 'crelink.ad_banner.click'
  | 'crelink.creator_banner.click';

/**
 * 업무 지표를 1 올립니다. 속성은 낮은 카디널리티 열거값만 넘깁니다(단축 주소·링크 ID·사용자·IP 금지). 스코프 user가 붙여도
 * `scrubMetric`(`src/monitoring/sentry.ts`)이 지웁니다. `SENTRY_DSN`이 비면(Sentry client 없음) 아무것도 보내지 않습니다.
 */
export function countBusinessMetric(name: BusinessMetric, attributes?: Record<string, string>): void {
  Sentry.metrics.count(name, 1, { attributes });
}
