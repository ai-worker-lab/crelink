import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent, Log, Metric, NodeOptions } from '@sentry/nestjs';

/**
 * Sentry 설정과 이벤트·로그·지표 정리. `src/instrument.ts`가 다른 모듈보다 먼저 불러오므로 `@sentry/nestjs` 말고는 아무것도 불러오지 않습니다.
 * 결정: docs/adr/0012-error-monitoring-sentry.md, docs/adr/0014-sentry-free-plan-features.md, 설명: apps/api/docs/README.md#오류-모니터링
 */

/** `SENTRY_TRACES_SAMPLE_RATE`가 비었을 때 성능 추적 비율(요청의 10%). */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

/** 이벤트·span에서 지우는 요청·응답 헤더(소문자). 세션 쿠키 `cl_session`, 인증 정보, 웹이 붙이는 내부 토큰입니다. */
export const SCRUBBED_HEADERS = ['cookie', 'set-cookie', 'authorization', 'proxy-authorization', 'x-crelink-internal'];

/** URL 쿼리에서 값을 `[Filtered]`로 바꾸는 이름: 구글 로그인 `code`·`state`, 랜딩 통과 표시 `pass`. */
const SCRUBBED_QUERY_PARAMS = ['code', 'state', 'pass'];

const SCRUBBED_SPAN_ATTRIBUTE = new RegExp(`^http\\.(request|response)\\.header\\.(${SCRUBBED_HEADERS.join('|')})$`);

/**
 * Sentry Logs 속성에서 지우는 이름: 쿠키·인증 헤더·토큰·비밀값·비밀번호·이메일. 스코프 user에서 SDK가 더하는 `user.email`·`user.name`도
 * 지웁니다. `user.id`(내부 UUID)는 오류 이벤트와 같이 남깁니다.
 */
const SCRUBBED_LOG_ATTRIBUTE = /cookie|authorization|token|secret|password|email/i;
const SCRUBBED_LOG_USER_ATTRIBUTES = ['user.email', 'user.name'];

/** Sentry Metrics 속성에서 지우는 이름: 스코프 user(`user.id`·`user.email`·`user.name` 등)와 이메일·IP 속성. */
const SCRUBBED_METRIC_ATTRIBUTE = /^user\.|email|(^|[._-])ip([._-]|$)|ip_?address|client\.address|remote_?addr/i;

/** 로그 본문·문자열 속성에서 가리는 값: 이메일 주소와 JWT(라이브러리 오류 문구에 섞여 들어오는 경우의 마지막 방어). */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}/g;
const JWT_PATTERN = /eyJ[\w-]{10,}(?:\.[\w-]+){0,2}/g;

/** `SENTRY_TRACES_SAMPLE_RATE`: 비면 0.1, 0~1 사이 수가 아니면 오류(기동 거부). */
export function parseTracesSampleRate(value: string | undefined): number {
  const text = value?.trim();
  if (!text) return DEFAULT_TRACES_SAMPLE_RATE;
  const rate = Number(text);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`SENTRY_TRACES_SAMPLE_RATE는 0~1 사이 수여야 합니다(기본 ${DEFAULT_TRACES_SAMPLE_RATE}).`);
  }
  return rate;
}

/**
 * `SENTRY_DSN`이 비면 null(Sentry를 켜지 않음: 로컬·시험·PR CI). 값이 있으면 `Sentry.init` 옵션입니다.
 *
 * 수집 범위(사용자 결정: IP와 내부 사용자 ID 포함, 이메일·이름 제외). SDK 11은 `sendDefaultPii` 대신 `dataCollection`으로 정합니다.
 * - `userInfo: false`: SDK가 요청 헤더(`X-Forwarded-For` 첫 값, 클라이언트가 위조 가능)로 IP를 추론하지 않게 합니다. IP와 ID는
 *   요청마다 `setRequestUser`(신뢰 프록시 기준 `clientIp`)·`setUserId`(세션 가드)가 요청 격리 스코프의 user에 직접 넣습니다.
 * - 쿠키·요청 본문·DB 쿼리 파라미터는 보내지 않고, 인증 헤더와 로그인 `code`·`state`·통과 표시 `pass` 값은 지웁니다.
 * - Logs(`src/monitoring/sentry-logger.ts`)는 `scrubLog`, 업무 지표(`src/monitoring/metrics.ts`)는 `scrubMetric`이 보내기 직전에 정리합니다.
 */
export function sentryOptions(env: NodeJS.ProcessEnv): NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || (env.NODE_ENV === 'production' ? 'production' : 'development'),
    release: env.SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: parseTracesSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: SCRUBBED_HEADERS }, response: { deny: SCRUBBED_HEADERS } },
      httpBodies: [],
      urlQueryParams: { deny: SCRUBBED_QUERY_PARAMS },
      databaseQueryData: false,
    },
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeSendLog: scrubLog,
    beforeSendMetric: scrubMetric,
  };
}

/** 오류 이벤트의 요청 정보에서 쿠키와 인증 헤더를 지웁니다(`dataCollection` 설정이 바뀌어도 남지 않게 하는 마지막 단계). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (request) {
    delete request.cookies;
    if (request.headers) {
      for (const name of Object.keys(request.headers)) {
        if (SCRUBBED_HEADERS.includes(name.toLowerCase())) delete request.headers[name];
      }
    }
  }
  return event;
}

type StreamedSpan = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];

/** span 속성에서 쿠키·인증 헤더(`http.request.header.cookie` 등)를 지웁니다. */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  for (const key of Object.keys(span.attributes)) {
    if (SCRUBBED_SPAN_ATTRIBUTE.test(key)) delete span.attributes[key];
  }
  return span;
}

/**
 * 로그에서 쿠키·인증·토큰·비밀값·이메일 속성과 `user.email`·`user.name`을 지우고, 본문과 남은 문자열 속성의 이메일 주소를 `[email]`,
 * JWT를 `[token]`으로 가립니다. `user.id`(내부 UUID)와 `nest.context` 같은 나머지 속성은 남깁니다.
 */
export function scrubLog(log: Log): Log {
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(log.attributes ?? {})) {
    if (SCRUBBED_LOG_ATTRIBUTE.test(key) || SCRUBBED_LOG_USER_ATTRIBUTES.includes(key)) continue;
    attributes[key] =
      typeof value === 'string' ? value.replace(EMAIL_PATTERN, '[email]').replace(JWT_PATTERN, '[token]') : value;
  }
  const message = String(log.message).replace(EMAIL_PATTERN, '[email]').replace(JWT_PATTERN, '[token]');
  return { ...log, message, attributes };
}

/** 지표 속성에서 스코프 user(`user.id`·`user.email`·`user.name` 등)와 이메일·IP 속성을 지웁니다. 지표 속성은 낮은 카디널리티 값만 둡니다. */
export function scrubMetric(metric: Metric): Metric {
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metric.attributes ?? {})) {
    if (!SCRUBBED_METRIC_ATTRIBUTE.test(key)) attributes[key] = value;
  }
  return { ...metric, attributes };
}

/** 요청 격리 스코프의 user를 IP로 시작합니다. 요청마다 처음 한 번 부릅니다(`src/monitoring/request-user.ts`). */
export function setRequestUser(ip: string | null): void {
  Sentry.setUser(ip ? { ip_address: ip } : null);
}

/** 로그인 사용자의 내부 ID(UUID)를 요청 user에 더합니다. 이메일·이름은 넣지 않습니다. */
export function setUserId(id: string): void {
  Sentry.setUser({ ...Sentry.getIsolationScope().getUser(), id });
}
