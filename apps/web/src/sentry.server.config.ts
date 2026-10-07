// Node 서버(SSR·route handler·BFF) Sentry 초기화. src/instrumentation.ts의 register가 불러옵니다. 공통 설정: src/lib/monitoring.ts
import * as Sentry from '@sentry/nextjs';
import {
  scrubEvent,
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
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
  });
}
