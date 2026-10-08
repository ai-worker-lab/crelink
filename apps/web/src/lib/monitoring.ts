import type { Breadcrumb, ErrorEvent, Log, NodeOptions } from '@sentry/nextjs';

/**
 * 웹(서버·브라우저) Sentry 공통 설정. 결정: docs/adr/0012-error-monitoring-sentry.md, docs/adr/0014-sentry-free-plan-features.md,
 * 설명: apps/web/README.md#오류-모니터링
 *
 * `NEXT_PUBLIC_SENTRY_DSN`은 빌드 시점에 번들에 들어갑니다(운영 이미지 빌드 인자). 비어 있으면 서버·브라우저 모두 Sentry를 초기화하지 않습니다
 * (로컬·시험·PR CI). DSN은 이벤트 전송만 허용하는 공개 값이라 브라우저 번들에 들어가도 됩니다.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

export const SENTRY_ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'production' : 'development';

/** 성능 추적 비율(요청·화면 이동의 10%). 사용자 결정. */
export const TRACES_SAMPLE_RATE = 0.1;

/** Sentry Logs로 보내는 콘솔 수준(서버·브라우저 공통). `console.log`·`info`·`debug`는 보내지 않습니다. */
export const CONSOLE_LOG_LEVELS: ('warn' | 'error')[] = ['warn', 'error'];

/** 이벤트·span에서 지우는 요청·응답 헤더(소문자). 세션 쿠키 `cl_session`, 인증 정보, API로 보내는 내부 토큰입니다. */
const SCRUBBED_HEADERS = ['cookie', 'set-cookie', 'authorization', 'proxy-authorization', 'x-crelink-internal'];

const SCRUBBED_SPAN_ATTRIBUTE = new RegExp(`^http\\.(request|response)\\.header\\.(${SCRUBBED_HEADERS.join('|')})$`);

/**
 * 서버(Node·Edge) 수집 범위. SDK 11은 `sendDefaultPii` 대신 `dataCollection`으로 정합니다.
 * - `userInfo: false`: 웹 서버는 신뢰할 프록시 판정 기준이 없어 SDK가 `X-Forwarded-For` 등 헤더로 IP를 추론하지 않게 합니다.
 *   방문자 IP는 브라우저 이벤트(Sentry가 접속 주소로 기록)와 API 이벤트(`clientIp`)에 남습니다. 로그인 사용자 ID는 관리 화면 레이아웃(`app/me/landings/[publicId]/layout.tsx`)이 직접 넣습니다.
 * - 쿠키·요청 본문은 보내지 않고, 인증 헤더와 로그인 `code`·`state`·통과 표시 `pass` 값은 지웁니다.
 */
export const SERVER_DATA_COLLECTION: NodeOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { deny: SCRUBBED_HEADERS }, response: { deny: SCRUBBED_HEADERS } },
  httpBodies: [],
  urlQueryParams: { deny: ['code', 'state', 'pass'] },
};

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

/** span 속성에서 쿠키·인증 헤더(`http.request.header.cookie` 등)를 지웁니다. BFF가 API로 보내는 요청 span도 포함합니다. */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  for (const key of Object.keys(span.attributes)) {
    if (SCRUBBED_SPAN_ATTRIBUTE.test(key)) delete span.attributes[key];
  }
  return span;
}

/**
 * 로그 속성·breadcrumb `data`에서 통째로 지우는 키: 쿠키·인증 헤더·토큰·비밀값·비밀번호·이메일·내부 토큰 헤더(`x-crelink-internal`)가 들어간 키와
 * SDK가 스코프 사용자에서 붙이는 `user.email`·`user.name`.
 */
const SCRUBBED_KEY = /cookie|authorization|token|secret|password|email|x-crelink-internal|^user\.name$/i;
const EMAIL_LIKE = /[^\s@<>"'`()[\]{},;:]+@[^\s@<>"'`()[\]{},;:]+\.[^\s@<>"'`()[\]{},;:]+/g;

/** 이메일 모양 글자를 `[email]`로 바꿉니다(로그 본문·breadcrumb 문구·문자열 값이 같은 기준을 쓰도록 한 곳에 둠). */
function scrubText(text: string): string {
  return text.replace(EMAIL_LIKE, '[email]');
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') return scrubRecord(value as Record<string, unknown>);
  return value;
}

function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SCRUBBED_KEY.test(key)) continue;
    scrubbed[key] = scrubValue(value);
  }
  return scrubbed;
}

/**
 * Sentry Logs(`beforeSendLog`, 콘솔 warn·error)에서 개인정보를 지웁니다. 속성(중첩 객체 포함)의 쿠키·인증 헤더·토큰·비밀값·이메일 키와
 * `user.email`·`user.name`을 지우고, 본문과 문자열 값의 이메일 모양 글자는 `[email]`로 바꿉니다. 내부 사용자 ID(`user.id`)는 오류 이벤트와 같이 남깁니다.
 */
export function scrubLog(log: Log): Log {
  return {
    ...log,
    message: scrubText(String(log.message)),
    attributes: log.attributes ? scrubRecord(log.attributes) : log.attributes,
  };
}

/**
 * breadcrumb(`beforeBreadcrumb`)에서 `scrubLog`와 같은 기준으로 개인정보를 지웁니다. 콘솔 breadcrumb(`category: 'console'`)의 `message`와
 * `data.arguments`가 오류 이벤트의 breadcrumbs와 리플레이 기록에 그대로 들어가지 않게 합니다(SDK는 이 결과를 리플레이에 넘김).
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    message: breadcrumb.message === undefined ? undefined : scrubText(breadcrumb.message),
    data: breadcrumb.data ? scrubRecord(breadcrumb.data) : breadcrumb.data,
  };
}
