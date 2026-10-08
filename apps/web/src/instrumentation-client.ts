// 브라우저 Sentry 초기화. Next.js가 화면 코드보다 먼저 실행합니다. 공통 설정: src/lib/monitoring.ts
// 의견 보내기(User Feedback)는 여기서 넣지 않고 관리 화면의 `FeedbackButton`이 처음 그려질 때 붙입니다(공개 화면 번들에 넣지 않음).
import * as Sentry from '@sentry/nextjs';
import {
  CONSOLE_LOG_LEVELS,
  scrubBreadcrumb,
  scrubEvent,
  scrubLog,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  TRACES_SAMPLE_RATE,
} from './lib/monitoring';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    // 분산 추적 헤더는 같은 출처의 BFF(/api/backend)로 가는 요청에만 붙입니다(외부 링크·이미지 등 다른 출처에는 보내지 않음).
    tracePropagationTargets: [/^\/api\/backend\//],
    // 기본 통합의 브라우저 세션(Release Health: 세션 시작·끝·오류 여부)은 켭니다.
    integrations: [
      // 리플레이: 일반 세션은 녹화하지 않고(0), 메모리에 최근 화면 변화만 두었다가 오류가 나면(1.0) 보냅니다.
      // 글자·입력·이미지·영상은 모두 가리고, 네트워크 요청·응답의 본문·헤더는 기본값(수집 안 함)을 그대로 둡니다.
      Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
      Sentry.consoleLoggingIntegration({ levels: CONSOLE_LOG_LEVELS }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend: scrubEvent,
    beforeSendLog: scrubLog,
    // 오류 이벤트의 breadcrumbs와 리플레이 기록에 들어가는 콘솔 문구·요청 주소에서도 이메일을 가립니다.
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

// 화면 이동(navigation) 성능 측정. Sentry가 꺼져 있으면 아무것도 하지 않습니다.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
