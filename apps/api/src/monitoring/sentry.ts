import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent, NodeOptions } from '@sentry/nestjs';

/**
 * Sentry 설정과 이벤트 정리. `src/instrument.ts`가 다른 모듈보다 먼저 불러오므로 `@sentry/nestjs` 말고는 아무것도 불러오지 않습니다.
 * 결정: docs/adr/0012-error-monitoring-sentry.md, 설명: apps/api/docs/README.md#오류-모니터링
 */

/** `SENTRY_TRACES_SAMPLE_RATE`가 비었을 때 성능 추적 비율(요청의 10%). */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

/** 이벤트·span에서 지우는 요청·응답 헤더(소문자). 세션 쿠키 `cl_session`, 인증 정보, 웹이 붙이는 내부 토큰입니다. */
export const SCRUBBED_HEADERS = ['cookie', 'set-cookie', 'authorization', 'proxy-authorization', 'x-crelink-internal'];

/** URL 쿼리에서 값을 `[Filtered]`로 바꾸는 이름: 구글 로그인 `code`·`state`, 랜딩 통과 표시 `pass`. */
const SCRUBBED_QUERY_PARAMS = ['code', 'state', 'pass'];

const SCRUBBED_SPAN_ATTRIBUTE = new RegExp(`^http\\.(request|response)\\.header\\.(${SCRUBBED_HEADERS.join('|')})$`);

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

/** 요청 격리 스코프의 user를 IP로 시작합니다. 요청마다 처음 한 번 부릅니다(`src/monitoring/request-user.ts`). */
export function setRequestUser(ip: string | null): void {
  Sentry.setUser(ip ? { ip_address: ip } : null);
}

/** 로그인 사용자의 내부 ID(UUID)를 요청 user에 더합니다. 이메일·이름은 넣지 않습니다. */
export function setUserId(id: string): void {
  Sentry.setUser({ ...Sentry.getIsolationScope().getUser(), id });
}
