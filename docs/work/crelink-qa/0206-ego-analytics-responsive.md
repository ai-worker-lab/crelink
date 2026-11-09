# 0206 분석 반응형 검사의 ego-lite 시범 전환

- 단계: 티켓
- 역할: crelink-qa
- 상태: 검증
- 종류: 유지보수
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-09

## 목적

사용자 지시로 크리링의 Playwright 테스트를 ego-lite(`ego-browser`)로 옮기기로 했다. 전체 전환 전에 `tests/e2e/analytics-responsive.spec.ts`의 chromium 검사 하나로 가능성과 비용을 시험하고, 같은 검사의 날짜 입력 경계 결함(`fits`가 `from.left`와 `to.right`만 비교)을 고친다.

## 수용 기준

- [x] `node tests/e2e/ego/analytics-responsive.mjs`가 종료 코드 0으로 끝나고 기존 chromium 검사에 대응하는 각 뷰포트·페이지 결과를 출력한다.
- [x] `from`만 카드 오른쪽을 넘고 문서 넘침은 없는 CSS를 주입하면 종료 코드 1과 경계 검사 실패를 보고한다.
- [x] 두 입력의 좌우 네 변을 모두 카드와 비교한다.
- [x] `apps/web`, 기존 spec·config, `.github`, `package.json`을 바꾸지 않는다.
- [x] 옮기지 못한 검사와 이유를 이 문서에 적는다.

## 범위

- 포함: `tests/e2e/ego/**`, 이 문서, 루트 변경 기록.
- 제외: 기존 Playwright spec·config·CI, `apps/web`, 의존성, push·PR·배포. 나머지 12개 spec의 전환은 이 시범의 판단 뒤 별도로 정한다.

## 옮기지 못한 검사

| 대상 | 이유 |
| --- | --- |
| `webkit`·`firefox` 프로젝트(원본 12개 테스트 중 8개) | ego-lite는 Chromium이다. iOS 조건 WebKit의 스크롤 분기(원본 90행)와 `Desktop Firefox` 터치 조합은 검증하지 못한다. |
| 사용자별 독립 브라우저 컨텍스트 | TaskSpace는 프로필 쿠키 저장소를 공유한다. 익명 방문 → 세션 쿠키 설정 → 데스크톱 전환을 한 탭에서 순서대로 수행해 대체했다. 동시에 여러 세션을 띄우는 검사는 아니므로 이 spec의 결과는 유지되지만 병렬 실행은 할 수 없다. |
| `context.route` 외부 요청 가짜 응답 | ego Page API에 route가 없다. 이 spec에는 외부 요청이 없어 대신 `Network.requestWillBeSent`로 로컬 밖 요청이 0건인지 검사한다. |
| `trace`·HTML report·`testInfo.attach('environment')` | Playwright 러너 기능이다. 실패 시 캡처와 `.local/e2e/ego/analytics-responsive/result.json`만 남기며, 브라우저 버전·기기 정보 첨부는 없다. |
| `caret: 'initial'` 캡처 옵션 | ego `screenshot`에 없는 옵션이다. 검사 조건이 아니라 캡처 안정화 옵션이다. |

`page.request`는 Node `fetch`에 세션 쿠키를 넣어, `tap()`은 `Input.dispatchTouchEvent`로, 뷰포트·터치는 CDP `Emulation`으로 옮겼으며 이는 이식 완료다.

## 위험·복구

합성 사용자는 fixture와 같은 `@e2e.crelink.test` 지표 제외 계정이며 실행 끝에 지운다. 대상은 `scripts/lib/e2e-local.mjs`로 루프백만 허용한다. 쿠키는 `Network.getCookies`의 대상 URL 범위로만 지우며 프로필 전체를 지우는 CDP는 쓰지 않는다. `lib/data.mjs`는 `fixtures.ts`의 SQL을 옮긴 사본이라 가입 행 구조가 바뀌면 함께 고쳐야 한다.

## 연결

- 원본: `tests/e2e/analytics-responsive.spec.ts`, `tests/e2e/fixtures.ts`
- 구현: `tests/e2e/ego/analytics-responsive.mjs`, `tests/e2e/ego/analytics-responsive.browser.mjs`, `tests/e2e/ego/lib/`
- 관련 검사 작성: `docs/work/orchestrator/0196-analytics-responsive-compatibility.md`

## 진행 기록

- 2026-11-09: 생성·착수. 환경은 ego-browser 0.6.2.9(chromium 156.0.8078.74), node 24.22.2, main `31a2f14`, `make up` 로컬 스택.
- 2026-11-09: 1회차 시나리오가 뷰포트·세션·키보드 스크롤까지 통과. `text="이전 23일 데이터 보기"`는 React가 숫자를 별도 텍스트 노드로 렌더링해 ego의 exact text에 일치하지 않아 `summary:has-text(...)`로 바꿨다.
- 2026-11-09: 2회차에 같은 코드의 키보드 스크롤이 `scrollLeft=0`으로 실패. 시험 결과 ego 탭의 rAF가 2초에 3~4회(약 1.4fps)로 떨어져 있었고 `Page.bringToFront`와 `prefers-reduced-motion`은 효과가 없었다. `Page.startScreencast`를 켜면 2초에 253프레임이 나오고 키 입력 뒤 100ms 안에 스크롤이 진행됐다. 프레임 펌프를 넣고 시나리오마다 프레임 생산을 먼저 검사한다.
- 2026-11-09: 3회차부터 4개 시나리오 통과. 반복 8회 중 3회(반복 1회차, 변이 A·B)가 `waitForLoadState(networkidle)` 30초 초과로 실패. 메시지의 잔여 요청은 `chrome://new-tab-page/lazy_load.js`로, 새 TaskSpace 첫 탭의 NTP 요청이 ego의 추적에 남은 것이다. 재시도·타임아웃 완화 대신 `task.newPage()` 빈 탭에서 시작하도록 고쳤고 이후 새 TaskSpace로 7회 연속 통과했다(각 18~20초).
- 2026-11-09: 콘솔 감시 양성 대조에서 `console.error`, 페이지 예외, 동일 출처 404를 모두 잡았다. 로컬 밖 요청 검사 추가 뒤 전체 실행 139개 통과, 실패 0, 19.2초.
- 2026-11-09: 변이 A(`from` 폭 +25px, 700px 이하)는 16개 뷰포트 결과 전부 `overflow=0 fits=false legacyFits=true`로 실패하고 종료 코드 1, 701px 이상은 통과. 변이 B(`to` 왼쪽 -25px, creator/metrics)도 4개 뷰포트 실패·종료 코드 1. `legacyFits=true`로 원본 조건이 두 변이를 놓치는 것을 확인했다.
- 2026-11-09: Playwright 기준 시간은 측정하지 못했다. `pnpm e2e -c tests/e2e/analytics-responsive.config.ts --project chromium`이 브라우저 미설치(`chromium_headless_shell-1248` 없음)로 실행 전에 종료했고 `playwright install`은 이번 작업에서 금지다.
- 2026-11-09: 최종 코드 기준 `node tests/e2e/ego/analytics-responsive.mjs` 종료 코드 0(통과 139, 실패 0, 약 19초, 뷰포트 결과 36줄)과 변이 A 종료 코드 1(`fits=false legacyFits=true overflow=0` 16건, 다른 실패 0)을 재확인했다. `pnpm verify` 통과(8단계, 34.3초).
