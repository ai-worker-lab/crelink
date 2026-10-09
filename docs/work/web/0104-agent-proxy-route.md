# 0104 웹 토큰 전용 경로 `/api/agent`와 BFF 허용 목록

- 단계: 티켓
- 역할: web
- 상위: 0088
- 선행: 0100
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

비공개 운영 API에 AI 운영자 토큰 요청이 닿게 하되, 쿠키·브라우저 요청과 섞이지 않게 합니다. 요구는 R23 ①입니다.

## 수용 기준

- [x] `apps/web/src/app/api/agent/[...path]/route.ts`가 설계 `웹 토큰 경로` 규칙(허용 경로, 점 조각 거부와 `target.pathname` 재검사, Bearer 스킴, Origin 거절, 넘길 헤더, 본문 원본, `Set-Cookie` 미전달)을 따릅니다. 판정은 순수 모듈 `src/lib/api/agent-proxy.ts`이고 `agent-proxy.spec.ts`가 각 규칙을 시험합니다.
- [x] 기존 BFF와 오류 응답·헤더 고르기·upstream fetch를 공용 모듈로 나눠 씁니다. BFF 허용 목록에 멈춤·토큰 폐기·지표 제외 쓰기가 있습니다. 확인: 웹 단위 테스트, 로컬에서 토큰으로 `/api/agent/api/admin/ai-operator` 200.

## 범위

- 포함: 위 수용 기준.
- 제외: 화면(0105, 0106).

## 위험·복구

새 공개 경로입니다. 권한은 API가 확인하고 이 경로는 쿠키를 다루지 않습니다. 문제가 생기면 이 route 파일을 지우는 배포로 막힙니다.

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `웹 토큰 경로`, `티켓 분해` 0104
- 요구: [PRD](../../product/crelink.md#요구사항) R23 ①

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해).
- 2026-10-10: 구현(web 담당, 통합 브랜치 `work/0091-ai-operator-design`, 커밋 없음).
  - `src/lib/api/proxy.ts`(next·server-only 없음): `proxyErrorResponse`(`route_not_allowed` 404·`unauthenticated` 401·`forbidden` 403·`api_not_configured` 503·`upstream_unavailable` 502, `{ code, message }`), `pickResponseHeaders`(`content-type`·`cache-control`·`etag`·`last-modified`, `Set-Cookie`는 `setCookie`일 때만), `forwardToApi`(`cache: 'no-store'`, `redirect: 'manual'`, 204·304 본문 없음). BFF route가 이것으로 바뀌었고 동작은 같음(BFF만 `Set-Cookie` 전달).
  - `src/lib/api/agent-proxy.ts`: `agentProxyPath`(빈 조각·`.`·`..` 거부, 조각마다 `encodeURIComponent`, 정규식 `^/api/(health|me)$|^/api/(me|files|admin)/`), `agentTargetUrl`(만든 URL `pathname` 재검사, 쿼리 그대로), `agentRequestRejection`(`Bearer ` + 값이 아니면 `unauthenticated`, `Origin` 있으면 `forbidden`), `agentForwardHeaders`(`Authorization`·`AGENT_RUN_HEADER`만 복사). route는 경로 → 인증·출처 → API 주소 → 대상 URL 순으로 거르고, 상태 변경 본문은 `arrayBuffer()`와 원래 `Content-Type`, `setCookie: false`.
  - BFF 허용 목록: `PUT api/admin/ai-operator/pause`, `PUT api/admin/ai-operator/tokens/{ID}/revoke`, 크리에이터 쓰기 정규식에 `metrics-exclusion`.
  - 실행한 검사(Node 24.20.0): `pnpm --filter @crelink/shared build` 통과, `pnpm --filter @crelink/web typecheck` 통과, `pnpm --filter @crelink/web test` 59건 통과(`agent-proxy.spec.ts` 14건: 허용 경로·조각 경계, 빈·점 조각, 인코딩, 퍼센트 인코딩 점 조각 `pathname` 재검사, Bearer 스킴 6가지, Origin, 넘길 헤더(쿠키·`X-Crelink-Internal` 위조 버림), 오류 형식, 응답 헤더 고르기, 실제 HTTP 서버로 본문 바이트·multipart Content-Type 전달과 `Set-Cookie` 미전달, 연결 실패 502), `eslint apps/web`·`prettier --check apps/web` 통과, `pnpm --filter @crelink/web build` 통과(`ƒ /api/agent/[...path]`).
  - 빌드 산출물을 `next start`(포트 5797)로 띄우고 저장소 밖 임시 가짜 API(`Set-Cookie`를 일부러 붙임)에 연결해 curl로 확인: 토큰 없음·`Basic` 401, Bearer `api/health` 200, `Origin` 있으면 403, `api/auth/logout`·`api/admin/%2e%2e/auth/logout` 404 `route_not_allowed`, Bearer `PUT api/admin/ai-operator/pause?x=1`은 200이고 응답에 `Set-Cookie` 없음·가짜 API가 받은 요청에 `Authorization`·`X-Crelink-Agent-Run` 있고 쿠키 없음. BFF `PUT …/metrics-exclusion`·`PUT …/tokens/t1/revoke` 200, `GET api/admin/ai-operator`는 404(허용 목록 밖). 실제 API·토큰 확인은 통합(0091)에서 합니다.
- 2026-10-10: 통합 확인(orchestrator, 0091 진행 기록). 실제 API로 `/api/agent/api/admin/ai-operator` 토큰 없음 401·토큰 200, 로컬 `precheck`·`start`·`api`·`finish`가 이 경로를 지남. E2E `tests/e2e/ai-operator.spec.ts`·`pnpm verify` 통과. 상태 `완료`.
- 2026-10-10: 보안 검토 F5 반영(orchestrator, 0091 진행 기록). 허용을 메서드별 `AGENT_ROUTES`로 좁힘: 운영자 API 전체, `GET api/me`, `POST api/me/files`, `GET api/files/{id}`, `GET api/health`. `agent-proxy.spec.ts` 갱신(웹 64건 통과), 로컬에서 토큰으로 `POST api/me/links` 404.
