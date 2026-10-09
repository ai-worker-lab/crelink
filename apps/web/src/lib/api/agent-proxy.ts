import { AGENT_RUN_HEADER } from '@crelink/shared';
import type { ProxyErrorCode } from './proxy';

/**
 * AI 운영자 토큰 경로(`/api/agent/[...path]`)의 판정. route handler가 쓰고 `agent-proxy.spec.ts`가 규칙마다 시험합니다.
 * `next`·`server-only`를 부르지 않습니다. 근거: docs/specs/crelink-ai-operator.md `웹 토큰 경로`.
 *
 * - 허용 경로(메서드와 함께, 조각 경계 고정): `AGENT_ROUTES`. 그 밖은 404 `route_not_allowed`. AI 운영자 업무(헌장)에 쓰는 것만 엽니다:
 *   운영자 API 전체(`api/admin/…`), 계정 확인 `GET api/me`, 크리링 배너 이미지 올리기 `POST api/me/files`와 보기 `GET api/files/{id}`,
 *   연결 확인 `GET api/health`. 크리에이터 편집(`api/me/…` 그 밖)은 AI 계정의 공개 페이지를 바꾸고 행동 기록에 남지 않으므로 막습니다.
 * - 빈 조각·`.`·`..`(디코드 뒤)는 404. 대상 URL을 만든 뒤 `pathname`을 같은 규칙으로 다시 검사합니다(점 조각 우회 방지).
 * - `Authorization`이 `Bearer ` 스킴이 아니면 401(API로 보내지 않음), `Origin` 헤더가 있으면(브라우저) 403.
 * - API로는 `Authorization`·`X-Crelink-Agent-Run`만 넘기고 쿠키는 넘기지 않습니다.
 */
export const AGENT_ROUTES: ReadonlyArray<{ methods: readonly string[]; pattern: RegExp }> = [
  { methods: ['GET', 'HEAD'], pattern: /^\/api\/health$/ },
  { methods: ['GET', 'HEAD'], pattern: /^\/api\/me$/ },
  { methods: ['POST'], pattern: /^\/api\/me\/files$/ },
  { methods: ['GET', 'HEAD'], pattern: /^\/api\/files\/[^/]+$/ },
  { methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], pattern: /^\/api\/admin\/.+/ },
];

/** 메서드와 API 경로(`/api/…`)가 허용 목록에 있는지. */
export function agentRouteAllowed(method: string, pathname: string): boolean {
  return AGENT_ROUTES.some((route) => route.methods.includes(method) && route.pattern.test(pathname));
}

/** 디코드된 경로 조각을 검사해 API 상대 경로(`api/…`, 조각마다 인코딩)를 만듭니다. 허용되지 않으면 null. */
export function agentProxyPath(method: string, segments: readonly string[]): string | null {
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null;
  const path = segments.map(encodeURIComponent).join('/');
  return agentRouteAllowed(method, `/${path}`) ? path : null;
}

/** API 대상 URL. 만든 URL의 `pathname`이 허용 목록을 벗어나면(점 조각 정규화 등) null입니다. 쿼리는 그대로 붙입니다. */
export function agentTargetUrl(apiOrigin: string, method: string, path: string, search: URLSearchParams): URL | null {
  const target = new URL(`${apiOrigin}/${path}`);
  if (!agentRouteAllowed(method, target.pathname)) return null;
  search.forEach((value, key) => target.searchParams.append(key, value));
  return target;
}

/** 경로를 통과한 요청의 인증·출처 판정. 통과하면 null, 거절이면 오류 코드(401 `unauthenticated`·403 `forbidden`). */
export function agentRequestRejection(
  headers: Headers,
): Extract<ProxyErrorCode, 'unauthenticated' | 'forbidden'> | null {
  const authorization = headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.length === 'Bearer '.length) return 'unauthenticated';
  if (headers.has('origin')) return 'forbidden';
  return null;
}

/** `base`(`apiRequestHeaders({ Accept })`로 새로 만든 헤더)에 `Authorization`·실행 헤더만 복사합니다. 쿠키 등 그 밖은 버립니다. */
export function agentForwardHeaders(incoming: Headers, base: Headers): Headers {
  for (const name of ['authorization', AGENT_RUN_HEADER]) {
    const value = incoming.get(name);
    if (value) base.set(name, value);
  }
  return base;
}
