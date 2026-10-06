# Next.js 웹 구조와 구현 기준

**상태: 구현 기준.** 이 문서는 crelink 웹의 Next.js App Router 구조, SSR, API 경계를 정의한다. Next.js는 웹 presentation 계층이고 도메인 API는 NestJS다.

## 권장 소스 구조

```text
apps/web/src/
  app/
    layout.tsx                     # root shell, metadata
    (public)/
      page.tsx                     # 시작 화면
    api/backend/[...path]/route.ts # 좁은 same-origin Nest BFF
    loading.tsx, error.tsx, not-found.tsx
  features/                        # 기능별 화면·유스케이스 (제품 범위 확정 후 추가)
  components/                      # 공용 accessible UI
  lib/api/
    server.ts                      # SSR -> Nest direct calls
    browser.ts                     # browser -> same-origin BFF
```

`app`은 URL, layouts, route boundaries를 담당한다. 화면·유스케이스는 feature 폴더에 둔다. route group은 URL에 이름을 노출하지 않고 레이아웃을 나누며, 새 group은 실제로 다른 레이아웃이 필요할 때 추가한다.

## Server/Client Component 경계

App Router의 page/layout은 Server Component를 기본값으로 사용한다. 페이지의 HTML, metadata와 본문은 서버에서 Nest API를 호출해 렌더링한다. 브라우저 상태와 이벤트가 필요한 최소 조각만 Client Component로 둔다. 앱 전체를 `'use client'`로 묶는 SPA 방식은 사용하지 않는다.

여러 사용자가 같은 결과를 보는 응답이라도 변경이 즉시 반영되어야 하면 `cache: 'no-store'`로 읽는다. 사용자별 응답은 request-scoped로 읽고 shared cache에 넣지 않는다. 느린 uncached 읽기는 route loading boundary 또는 Suspense fallback으로 스트리밍한다.

## Nest API BFF

- 서버 렌더링은 server-only `API_INTERNAL_URL`로 Nest API를 직접 호출한다(`lib/api/server.ts`). 브라우저는 same-origin BFF(`/api/backend/...`)만 호출한다(`lib/api/browser.ts`).
- `api/backend/[...path]/route.ts`는 허용된 Nest path/method만 전달하고 status/body를 반환하는 transport proxy다. 권한 규칙, database logic, validation policy를 복제하지 않는다. 필요한 경로만 정확히 allowlist하고, 절대 URL 전달과 임의 header forwarding은 허용하지 않는다.
- `NEXT_PUBLIC_*`에는 API secret이나 credential을 넣지 않는다.

## UI와 상태

재사용 가능한 버튼·폼·카드·dialog·empty/error/loading 상태는 `components`에 둔다. 검색·정렬·필터가 생기면 URL search parameters와 동기화해 SSR 링크 공유와 새로고침을 지원한다. 색·간격·글자 크기는 `@crelink/design-tokens`의 CSS 변수만 사용한다([사용법](../../packages/design-tokens/docs/usage.md)).

사용자별 페이지의 title/metadata에는 private data를 노출하지 않는다.

## 조사 근거

- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure): App Router `app`, route groups, route-local loading/error boundaries와 colocation을 설명한다.
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components): Server Component 기본값과 상호작용을 위한 최소 Client Component 경계를 설명한다.
- [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) 및 [Caching](https://nextjs.org/docs/app/getting-started/caching): server fetch, uncached request-time data, Suspense streaming을 설명한다.

## 현재 저장소 상태

`apps/web/src/app`은 초기 골격이다. root `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`와 `(public)/page.tsx` 시작 화면이 있다. 시작 화면은 서버에서 `GET /api/health/ready`를 호출해 제품 이름·컨셉과 API·DB 준비 상태만 표시한다. BFF allowlist에는 `GET api/health`만 있다. `features/`, `components/`는 아직 없으며 제품 기능은 구현되지 않았다. 웹 개발 서버는 `next dev --port <WEB_PORT>`로 실행한다. `WEB_PORT`가 없으면 `pnpm instance --get WEB_PORT`로 이 checkout 인스턴스 포트를 읽고, `make web-up`은 인스턴스 포트를 환경으로 넘긴다([로컬 개발 환경](../development/local-environment.md#인스턴스와-포트)).
