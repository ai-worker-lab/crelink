import type { ErrorEvent, NodeOptions } from '@sentry/nextjs';

/**
 * 웹(서버·브라우저) Sentry 공통 설정. 결정: docs/adr/0012-error-monitoring-sentry.md, 설명: apps/web/README.md#오류-모니터링
 *
 * `NEXT_PUBLIC_SENTRY_DSN`은 빌드 시점에 번들에 들어갑니다(운영 이미지 빌드 인자). 비어 있으면 서버·브라우저 모두 Sentry를 초기화하지 않습니다
 * (로컬·시험·PR CI). DSN은 이벤트 전송만 허용하는 공개 값이라 브라우저 번들에 들어가도 됩니다.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

export const SENTRY_ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'production' : 'development';

/** 성능 추적 비율(요청·화면 이동의 10%). 사용자 결정. */
export const TRACES_SAMPLE_RATE = 0.1;

/** 이벤트·span에서 지우는 요청·응답 헤더(소문자). 세션 쿠키 `cl_session`, 인증 정보, API로 보내는 내부 토큰입니다. */
const SCRUBBED_HEADERS = ['cookie', 'set-cookie', 'authorization', 'proxy-authorization', 'x-crelink-internal'];

const SCRUBBED_SPAN_ATTRIBUTE = new RegExp(`^http\\.(request|response)\\.header\\.(${SCRUBBED_HEADERS.join('|')})$`);

/**
 * 서버(Node·Edge) 수집 범위. SDK 11은 `sendDefaultPii` 대신 `dataCollection`으로 정합니다.
 * - `userInfo: false`: 웹 서버는 신뢰할 프록시 판정 기준이 없어 SDK가 `X-Forwarded-For` 등 헤더로 IP를 추론하지 않게 합니다.
 *   방문자 IP는 브라우저 이벤트(Sentry가 접속 주소로 기록)와 API 이벤트(`clientIp`)에 남습니다. 로그인 사용자 ID는 `/me`가 직접 넣습니다.
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
