import { ConsoleLogger, LogLevel } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { inspect } from 'node:util';

/** Nest 로그 수준 → Sentry Logs 수준. `debug`·`verbose`는 보내지 않습니다. */
const SENTRY_LOG_LEVELS: Partial<Record<LogLevel, 'info' | 'warn' | 'error' | 'fatal'>> = {
  log: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
};

/**
 * Nest 기본 콘솔 로그를 그대로 찍고, `log`·`warn`·`error`·`fatal`은 Sentry Logs로도 보냅니다(속성 `nest.context`, 오류 스택은 `nest.stack`).
 * `main.ts`가 `NestFactory.create`의 `logger`로 넘겨 프레임워크 로그와 모든 `new Logger(...)`가 이것을 씁니다. 시험(`test/test-app.ts`)은
 * `main.ts`를 거치지 않아 영향이 없습니다. `SENTRY_DSN`이 비면(Sentry client 없음) `Sentry.logger`는 아무것도 보내지 않습니다.
 * 보내기 직전 `scrubLog`(`src/monitoring/sentry.ts`)가 쿠키·토큰·이메일을 지웁니다.
 */
export class SentryConsoleLogger extends ConsoleLogger {
  protected printMessages(
    messages: unknown[],
    context = '',
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
    params?: Record<string, unknown>,
  ): void {
    super.printMessages(messages, context, logLevel, writeStreamType, errorStack, params);
    const level = SENTRY_LOG_LEVELS[logLevel];
    if (!level) return;
    const attributes: Record<string, string> = {};
    if (context) attributes['nest.context'] = context;
    if (typeof errorStack === 'string') attributes['nest.stack'] = errorStack;
    for (const message of messages) {
      const resolved = this.resolveMessage(message);
      Sentry.logger[level](typeof resolved === 'string' ? resolved : inspect(resolved), attributes);
    }
  }
}
