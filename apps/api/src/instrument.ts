// Sentry는 다른 모듈(Nest·Express·pg)을 불러오기 전에 초기화해야 자동 계측이 붙습니다. main.ts가 가장 먼저 import합니다.
// SENTRY_DSN이 비면(로컬·시험·PR CI) 초기화하지 않아 Sentry는 아무 일도 하지 않습니다. 설명: apps/api/docs/README.md#오류-모니터링
import * as Sentry from '@sentry/nestjs';
import { loadLocalEnvironment } from './local-env';
import { sentryOptions } from './monitoring/sentry';

loadLocalEnvironment();
const options = sentryOptions(process.env);
if (options) Sentry.init(options);
