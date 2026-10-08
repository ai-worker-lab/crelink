// Edge 런타임 Sentry 초기화(공식 파일 구성). 지금은 Edge 런타임 코드(proxy·edge route)가 없어 불리지 않습니다. 공통 설정: src/lib/monitoring.ts
import * as Sentry from '@sentry/nextjs';
import {
  CONSOLE_LOG_LEVELS,
  scrubBreadcrumb,
  scrubEvent,
  scrubLog,
  scrubSpan,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  SERVER_DATA_COLLECTION,
  TRACES_SAMPLE_RATE,
} from './lib/monitoring';

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    dataCollection: SERVER_DATA_COLLECTION,
    integrations: [Sentry.consoleLoggingIntegration({ levels: CONSOLE_LOG_LEVELS })],
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeSendLog: scrubLog,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
