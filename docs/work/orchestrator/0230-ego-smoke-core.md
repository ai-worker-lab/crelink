# 0230 smoke·visitor 시험의 ego-lite 전환

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-10

## 목적

사용자 지시로 크리링의 Playwright 시험을 ego-lite(`ego-browser`)로 옮기는 작업의 두 번째 묶음입니다([ADR 0016](../../adr/0016-devoffice-takeover.md), 시범 [0206](../crelink-qa/0206-ego-analytics-responsive.md)). `tests/smoke/smoke.spec.ts`와 `tests/e2e/visitor.spec.ts`의 검사를 옮기고, 이 시험들을 `pnpm ci:local`에 넣습니다. 기존 Playwright spec과 `ci.yml`은 그대로 둡니다.

## 수용 기준

- [x] `node tests/e2e/ego/smoke.mjs`, `node tests/e2e/ego/visitor.mjs`를 각각 3회 실행해 모두 종료 코드 0입니다.
- [x] CSS 주입과 대상 요소 제거 훅으로 깨뜨리면 종료 코드 1과 해당 검사 실패가 나옵니다.
- [x] 요소를 못 찾으면 실패로 기록되고, 시나리오별 최소 검사 수를 단언합니다.
- [x] 지우는 쿠키는 `cl_session`뿐입니다.
- [x] `scripts/ci-local.mjs`의 `EGO_SUITES`에 두 시험을 더하고 `NOT_LOCAL`에서 뺍니다.
- [x] `pnpm ci:local`, `pnpm verify`, `pnpm work:scope 0230`, `pnpm work:check`가 통과합니다.

## 범위

- 포함: `tests/e2e/ego/**`, `scripts/ci-local.mjs`의 목록, 이 문서, `CHANGELOGS.md`.
- 제외: 기존 Playwright spec·config, `ci.yml`, 앱 코드, 의존성, `tests/e2e/README.md`(소유 경로 밖), 나머지 spec 전환. `analytics-responsive`는 공통 틀(`lib/suite.mjs`)로 옮기지 않고 그대로 둡니다.

## 옮기지 못한 검사와 바뀐 검사

| 원본 | 지금 | 이유 |
| --- | --- | --- |
| `data.session()`의 시험별 새 브라우저 컨텍스트 | 같은 프로필의 한 탭에서 순서대로 진행. `cl_session`만 심고 지웁니다 | `Target.createBrowserContext`는 되지만 그 안에 탭을 만드는 `Target.createTarget`을 ego가 `is not allowed`로 거부합니다. 앱이 심은 `cl_vid`는 실행 사이에 남습니다. |
| 다른 브라우저는 다른 `visitor_id` | 단축 주소의 호스트만 바꿔(`127.0.0.1` ↔ `localhost`) 실제 브라우저로 방문해 서로 다른 값 2개를 확인합니다. 쿠키 없는 첫 방문은 Node 요청으로 `Set-Cookie: cl_vid`와 새 값을 확인합니다 | `cl_vid`를 지우지 않으면서 다른 쿠키 저장소를 쓰는 방법입니다. 호스트 단위 저장이라 `localhost` 쪽에 `cl_vid` 1개가 남습니다. 브라우저로 "처음 방문자" 상태를 만드는 재현은 프로필 쿠키를 지워야 해서 옮기지 못했습니다. |
| `context.route` 외부 요청 가짜 응답 | `Network.setBlockedURLs`로 `*.e2e.test`를 차단하고, 그 밖의 외부 요청은 실패로 기록합니다 | 이 두 spec의 검사는 가짜 응답 본문을 읽지 않고 네트워크로 나가지 않게 하는 용도입니다. 아래 `Fetch` 시험 결과 참고. |
| `/c/{id}` 도착지 | 원본처럼 도착 문서는 열지 않고 302와 다음 문서 요청만 확인합니다 | 원본은 DNS 실패, 여기서는 차단으로 끝납니다. |
| `page.goto(url, { referer })` | CDP `Page.navigate`에 `referrerPolicy: 'unsafeUrl'`로 호출 | ego `goto`의 `referer`는 https Referer가 http 대상(로컬)에서 빠집니다. `referrer_host`가 `null`로 기록되는 것을 실측했습니다. |
| `page.waitForLoadState('networkidle')` | CDP 이벤트로 현재 문서의 요청만 세는 `watch.waitForNetworkQuiet()` | 아래 진행 기록의 Ping 잔여 문제입니다. `Ping`·`EventSource`는 세지 않습니다. |
| 시험별 새 `cl_vid`의 예산 | 실행 시작에 로컬 DB의 `landing_event_limits`를 비웁니다 | 반복 실행이 같은 방문자 예산(120건/분)을 나눠 써 429로 실패합니다. |
| `not.toBeEmpty()` (smoke 첫 화면) | `checkVisibility`와 `innerText` 길이 | 원본은 숨긴 글자도 통과합니다. 메시지 의도(보이는 내용)에 맞췄습니다. |
| `trace`·HTML report | 실패 캡처와 `.local/e2e/ego/<시험>/result.json` | Playwright 러너 기능입니다. |

`request.get`은 Node `fetch`, `context.cookies`는 `Network.getCookies`(읽기 전용), `redirectedFrom`은 `Network.requestWillBeSent`의 `redirectResponse`, `getByText`는 script·style을 뺀 글자 노드 순회로 옮겼습니다.

## Fetch 도메인 시험 결과

- `Fetch.enable`·`Fetch.requestPaused`(`page.events()` 폴링)·`Fetch.fulfillRequest`는 하위 자원과 `Document` 모두 동작했습니다.
- `page.goto`가 `load`를 기다리는 동안 멈춘 파비콘 요청에 응답하지 못해 90초 타임아웃으로 실패했습니다(`readyState="interactive"`). `page.evaluate`가 페이지 안 Promise를 기다리는 동안 그 Promise가 기다리는 요청을 풀어 주려 할 때도 15초 타임아웃이었습니다. 긴 호출이 진행 중이면 `page.cdp` 응답이 지연되는 것으로 보입니다(ego 내부 구현은 확인하지 못했습니다).
- 긴 호출과 겹치지 않을 때만 쓸 수 있어 이 두 시험에는 넣지 않았습니다. 가짜 응답 본문이 정말 필요한 spec(`personas`의 503, `list-density`·`link-layout`의 저장 지연 등)은 `waitUntil: 'commit'` + 폴링 대기로 긴 호출을 없앤 뒤 다시 시험해야 합니다.

## 위험·복구

합성 사용자는 fixture와 같은 `@e2e.crelink.test` 계정이고 실행 끝에 지웁니다. 대상은 `scripts/lib/e2e-local.mjs`로 루프백만 허용합니다. 쿠키는 `cl_session`만 지우고, 시험이 남기는 흔적은 앱이 심은 `cl_vid`(`127.0.0.1`과 `localhost` 각 1개)뿐입니다. `landing_event_limits`는 사용자 데이터가 아닌 분당 카운터이며 로컬 DB에서만 비웁니다. `lib/data.mjs`는 `fixtures.ts`의 사본이라 가입 행 구조가 바뀌면 함께 고칩니다. 앱 동작을 보장하는 Playwright spec은 CI에 그대로 있습니다.

## 연결

- 원본: `tests/smoke/smoke.spec.ts`, `tests/e2e/visitor.spec.ts`, `tests/e2e/fixtures.ts`
- 구현: `tests/e2e/ego/smoke.mjs`, `tests/e2e/ego/smoke.browser.mjs`, `tests/e2e/ego/visitor.mjs`, `tests/e2e/ego/visitor.browser.mjs`, `tests/e2e/ego/lib/`
- 시범과 규칙: [0206](../crelink-qa/0206-ego-analytics-responsive.md), [0210](0210-local-ci.md)

## 진행 기록

- 2026-11-10: 생성·착수. origin/main `a223f69`, ego-browser 2.2.0 안내, node 24, `make up` 로컬 스택.
- 2026-11-10: 탐침으로 `Fetch` 가로채기 동작, `Target.createTarget` 거부, ego 런타임의 `pg` 불러오기 가능을 확인했습니다.
- 2026-11-10: 1차 `visitor`는 `Fetch` 파비콘 응답 교착으로 90초 타임아웃, `referrer_host`가 `null`이었습니다. `setBlockedURLs`와 `Page.navigate` + `unsafeUrl`로 바꿨습니다.
- 2026-11-10: 반복 실행 3회 중 1회가 `page.waitForLoadState(networkidle) timed out after 30000ms (1 requests still in flight: Ping …/events)`로 실패하고 같은 탭의 다음 시나리오까지 실패했습니다. 문서 전환 때 나간 beacon으로 추정합니다. 타임아웃 완화 대신 `waitForNetworkQuiet()`로 바꿨습니다.
- 2026-11-10: 그 뒤 6회 중 5·6회가 방문자 버킷 초과(`used` 143 > 120)로 `/events` 429 콘솔 오류, 직접 진입 시나리오는 같은 상태에서 `/events` 요청 1건이 30초 안에 끝나지 않아 실패했습니다. 이 상태에서만 관찰했고 원인은 확정하지 못했습니다. 실행 시작에 `landing_event_limits`를 비우도록 고친 뒤 8회 연속 종료 코드 0(통과 64, 실패 0, 각 약 4초)입니다.
- 2026-11-10: 변이: `body{min-width:2000px}`는 `문서 폭 2000px <= 화면 폭` 2건, `body{display:none}`는 처음에 종료 코드 0으로 빠져나가 `innerText`의 비렌더링 동작을 찾아 `checkVisibility`를 넣었습니다. `.profile-main{min-width:900px}`는 390px 넘침 1건, `EGO_TEST_FAULT=empty-body`·`missing-link`·`missing-open-link`·`outside-scenario`와 잘못된 `EGO_TEST_ONLY`는 모두 종료 코드 1입니다. `SIGTERM` 종료 코드 143, 합성 사용자 0건, 시험 TaskSpace 없음을 확인했습니다.
- 2026-11-10: `2da4b4e`, 깨끗한 트리에서 `pnpm ci:local` 종료 코드 0(통과 10, 실패 0, 건너뜀 1, 59.6초). `ego smoke` 1.6초, `ego analytics-responsive` 19.9초, `ego visitor` 4.2초입니다. 최종 코드 기준 `node tests/e2e/ego/smoke.mjs`·`visitor.mjs` 각 3회 종료 코드 0(통과 22·64, 실패 0), `pnpm verify`·`pnpm work:scope 0230`·`pnpm work:check` 통과. 스택은 이 작업이 띄운 것을 내렸습니다.
- 2026-11-10: 모든 수용 기준을 충족해 `검증`으로 올립니다. PR CI 결과는 PR에서 확인합니다.
