// 브라우저 Sentry 초기화. Next.js가 화면 코드보다 먼저 실행합니다. 공통 설정: src/lib/monitoring.ts
import * as Sentry from '@sentry/nextjs';
import { scrubEvent, SENTRY_DSN, SENTRY_ENVIRONMENT, TRACES_SAMPLE_RATE } from './lib/monitoring';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    // 분산 추적 헤더는 같은 출처의 BFF(/api/backend)로 가는 요청에만 붙입니다(외부 링크·이미지 등 다른 출처에는 보내지 않음).
    tracePropagationTargets: [/^\/api\/backend\//],
    // 사용자 결정은 오류와 성능 추적만입니다. 페이지를 열 때마다 보내는 세션(Release Health)은 끕니다. 리플레이·프로파일링은 넣지 않습니다.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'BrowserSession'),
    beforeSend: scrubEvent,
  });
}

// 화면 이동(navigation) 성능 측정. Sentry가 꺼져 있으면 아무것도 하지 않습니다.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
