# 0281 부분 검증·결과 재사용·외부 mock

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-11-11

## 목적

사용자가 승인한 다섯 흐름 개선을 실제 CI 실행기와 운영 규칙에 적용한다. 작업 범위를 제한하고 관련 검사·부분 QA만 실행하며 동일 대상의 성공 검증은 report에서 재실행하지 않는다. 외부 실측 응답 구조는 synthetic mock으로 내부 계약 검증에 재사용하고 별도 live 장애와 내부 실패를 구분한다.

## 수용 기준

- [x] [CTO 계약](../../../contracts/0281-scoped-verification/1-cto-interface.contract.md) V1~V5·R2 구현과 의미있는 CLI/receipt/fixture 경계 검증
- [ ] 최종 clean SHA의 full1회 및 report 실행기 재사용(테스트0), 양측 최종 검수 complete, PR 반영/Deploy 결과 확인

## 범위

- 포함: scripts/ci-local.mjs·lib/ci-local.mjs·관련 test, test-only Instagram fixture/contract, AGENTS·verification·ADR0016 및 변경 기록.
- 제외: 제품 Instagram 동작/DB/운영값·새키·새서비스·의존성 업그레이드·별도 QA팀·원격 전수 E2E. settings-sync의 공통 문서/역할/스킬 동기화는 Coordinator 담당.

## 위험·복구

검사 축소·보고 재사용이므로 빈 필수 검사·커버리지 누락·영수증 불일치는 닫힌 상태로 거부하고 full 안내한다. 기존 full 실행 경로와 D93/PR/배포 보호를 유지한다. rollback은 이번 실행기 변경 revert다.

## 진행 기록

- 2026-11-11: CTO가 최소 registry·receipt·offline fixture로 확정했다. task-c7739bc25e264e1db6cc7d8d9dfe2f37. 전체 실행기 변경은 full1회로 확인하고 report에서 재검증하지 않는다. 최종 증거 /tmp/crelink-0281-ci.log·/tmp/crelink-0281-report.log와 selector/fixture 시험 로그는 Coordinator가 실제 결과를 기록한다.

- 2026-11-11 DEV 구현: 기존 `scripts/lib/ci-local.mjs`에 config/hotfix/auth/full registry·API/web/shared·지정 QA 계획을 두고 `scripts/ci-local.mjs`는 고정 argv만 실행하도록 연결했다. API/web import 준비용 shared build, 관련 API/web unit·typecheck, shared 선택 시 API/web/app 소비자 typecheck를 포함한다. runner·lock·manifest·공통 infra는 full이고 미등록 소스·누락 범위·빈 선택은 거부한다. 기존 full 문서/코드·ego 4종·정리·이미지 경로는 유지했다.
- 2026-11-11 DEV receipt: clean 성공만 `.local/ci/receipts/<sha>.json`에 원자 저장하며 SHA/base/clean/profile/select/QA·파일·명령과 실제 argv·환경 digest·Node/platform·lock/runner·결과 완전성을 대조한다. 필수 `results`와 외부 `observations`를 분리했다. report는 receipt 검증·status 등록 경로만 실행하며 fallback 검증은 없다. 누락·중복·분류 이동·필수 실패 비차단 조작·PASS에 남은 내부 FAIL·dirty·중단·구 receipt 재사용을 차단한다. 외부 관측 FAIL은 실패 상태와 실패 집계 그대로 남는다.
- 2026-11-11 DEV fixture: `test/fixtures/instagram-graph.fixtures.ts`는 0279의 2026-11-11 Coordinator 관측 shape만 새 가짜 값으로 옮겼다. `FetchInstagramGraph` fetch mock에서 token/principal/assigned 정상·timeout·연결 실패·계약 형식 불일치·복수 계정 반환/서비스 409를 확인했다. R2에 따라 실제 기존 `malformed()`의 `indeterminate`를 보존했다(R1의 추정 `rejected`로 제품 코드를 바꾸지 않음). 기존 Graph 시험도 미등록 fetch를 throw하여 실제 Meta로 새지 않게 했다. live는 별도 `INSTAGRAM_LIVE=1` 공개 호스트 도달 관측이며 실제 로그인 성공의 증거가 아니다.
- 2026-11-11 DEV 문서: AGENTS·검증 루프·ADR 0016의 push/merge 실행을 profile/receipt와 일치시켰다. 원격 CI는 실제 미포함 영향으로 판단하도록 고쳤으며 관리 화면의 단순 옵션을 무조건 트리거로 두지 않는다. 루트/API 변경 기록과 API fixture 안내를 동기화했다. 제품 런타임·운영값·DB/영구 보관 스키마·의존성은 변경하지 않았다.

### DEV 실행 근거

환경: Node `26.13.0`, pnpm `10.10.0`. `.nvmrc` 기준 Node 24의 실제 full/report 검증은 Coordinator가 수행한다.

| 실행 명령 | 실제 결과·로그 |
| --- | --- |
| `node --test scripts/lib/ci-local.test.mjs` | 27건 통과. `/tmp/crelink-0281-unit.log`. 실제 임시 Git 저장소·fake 명령 카운터로 full 기존 순서, 신규 fixture 범위, base/환경 변경, report 검사 0회·fake status만 호출, dirty·필수 결과 조작·구 receipt·SIGTERM 거부, 외부 FAIL 보존을 검증했다. 이 full/report는 hermetic 시험이며 실제 CI/GitHub 실행이 아니다. |
| `pnpm --filter @crelink/api test --runInBand --runTestsByPath src/instagram/graph.spec.ts src/instagram/instagram-crypto.spec.ts` | 2 suites·78건 통과. `/tmp/crelink-0281-fixture.log`. 실제 Meta 호출 0회. |
| `pnpm --filter @crelink/api typecheck` | 통과. `/tmp/crelink-0281-typecheck.log`. |
| `pnpm exec eslint scripts/ci-local.mjs scripts/lib/ci-local.mjs scripts/lib/ci-local.test.mjs apps/api/src/instagram/graph.spec.ts apps/api/src/instagram/instagram-crypto.spec.ts apps/api/test/fixtures/instagram-graph.fixtures.ts` | 통과. `/tmp/crelink-0281-lint.log`. |
| `pnpm exec prettier --check scripts/ci-local.mjs scripts/lib/ci-local.mjs scripts/lib/ci-local.test.mjs apps/api/src/instagram/graph.spec.ts apps/api/src/instagram/instagram-crypto.spec.ts apps/api/test/fixtures/instagram-graph.fixtures.ts` | 통과. `/tmp/crelink-0281-format.log`. |
| `pnpm docs:check` | 통과. `/tmp/crelink-0281-docs.log`. AGENTS 크기 초과는 같은 회차에 축약해 해결했다. |
| `pnpm work:check` | 233개 통과. `/tmp/crelink-0281-work.log`. 티켓 종류를 기존 허용값 `유지보수`로 맞췄다. |
| `pnpm work:scope 0281` | 통과. `/tmp/crelink-0281-scope.log`. |
| `git diff --check` | 통과. |

### Coordinator 인계

실제 DB/Docker/network/listen 검증을 시도하거나 재시도하지 않았다. unit의 DB/스택/ego/이미지/GitHub는 전부 fake 명령·fetch/socket 대역이며 임시 Git 저장소의 시험용 commit 외 프로젝트 commit/push/PR은 실행하지 않았다. settings-sync 공통 규칙·스킬·개인 기록·기존 dispatch-watch는 수정하지 않았다.

이번 변경은 runner를 바꾸므로 최종 clean SHA에서 full이 필요하다. Coordinator는 기준 Node/환경을 고정하고 `pnpm ci:local > /tmp/crelink-0281-ci.log 2>&1`을 1회 성공시킨 뒤 push하고, 같은 SHA/base·환경에서 `pnpm ci:local --report > /tmp/crelink-0281-report.log 2>&1`의 receipt 재사용·`tests 0`·실제 status 등록을 확인한다. 기본 profile은 두 명령 모두 full이다. 이 두 로그는 DEV가 작성하거나 실제 성공으로 보고하지 않았다. 최종 양측 검수·GitHub/실제 report·PR/Deploy 확인은 Coordinator 담당이며, 검수 뒤 코드/테스트/문서·환경·base/SHA가 바뀌면 receipt를 재사용하지 않고 다시 해당 검증을 실행해야 한다. 실 Meta·브라우저·secret 작업도 DEV에서 실행하지 않았다.

### Coordinator 1차 diff 보정

- 2026-11-11: 같은 `work/0281-scoped-verification`에서 CI registry·관련 unit/docs만 보정했다. rules → rules/contract e2e, webhook → signed-request unit·webhook/contract e2e, Graph → 기존 Graph unit으로 좁게 매핑하고 각 변경 시험 파일도 덮었다. broad Instagram 선택은 해당 도메인의 unit 5개·e2e 9개를 모두 선택한다. semantic argv·DB 유무로 검사하며 루트 전체 시험으로 대체하지 않는다.
- API/web 소비자 전 shared build는 selector 없이도 선행한다. 새 checkout/오래된 dist 각각의 API/web synthetic 소비자로 실제 명령 순서를 고정했고, shared test·추가 소비자 typecheck는 기존 선택 조건을 유지한다. 상위 `node:test` 내부 환경변수로 하위 웹 시험이 생략되던 hermetic fixture도 고쳤다.
- config는 기존 `INSTAGRAM_REQUIRED_KEYS` 8개 전체 최초 암호문 등록만 추가 허용한다. 원본 export와 허용 이름을 TS 실행 없이 unit 대조하고 미등록 이름·삭제·부분 등록·평문·수신자·파서/배포 변경 거부를 검증했다. 복호화 값 형식 검증이 아니다. docs의 hotfix/auth 예시를 좁혔으며 무관한 visitor 예시를 제거하고 Instagram 폼 별도 부분 QA의 기존 fixture/동일 소스 증거 조건을 명시했다.
- 실제 검증: `node --test scripts/lib/ci-local.test.mjs` **32건 통과**(`/tmp/crelink-0281-correction-unit.log`), 대상 ESLint·Prettier, `pnpm docs:check`, `pnpm work:check`, `pnpm work:scope 0281`, `git diff --check` 통과. 보조 로그는 `/tmp/crelink-0281-correction-{lint,format,docs,work,scope}.log`다. 제품 코드·완료한 Graph fixture는 추가 변경하지 않았다. 설정 실데이터/복호화·서비스/외부 호출·실제 Docker/listen/브라우저·실제 full/report·프로젝트 commit/push/review는 실행하지 않고 Coordinator에 인계한다. unit 안의 Git commit·full/report·인프라 명령은 임시 저장소와 fake 대역이다.

- Coordinator 문서 대조: 완료 보고 표에도 등록 profile 우선과 같은 대상 성공 검증 재사용을 명시했다. 구현 코드 변경은 없으며 최종 full/report와 릴리스 증거는 settings-sync의 후속 적용 기록 및 PR에서 실제 결과로 연결한다.

### 호출 메타데이터 지문 보정

- 2026-11-11: HEAD `164dda8`의 실제 첫 full은 **122.7s, 12 통과·0 실패**로 성공 receipt를 저장했다(`/tmp/crelink-0281-ci-first.log`, `ci_exit=0`). 첫 report는 환경 지문 불일치로 fail-closed 거부했다(`/tmp/crelink-0281-report-first.log`, exit 1). 원인은 `exec_command`가 호출마다 다른 `CODEX_TOOL_CALL_ID`를 주입하는 것이며, 별도 호출에서 변수 이름과 값 변경을 확인했다.
- `scripts/ci-local.mjs`의 `identityFor`에서 이 한 항목만 기존 volatile metadata 제외 목록에 추가했다. 기존 hermetic 검증→report는 호출마다 다른 ID를 주입해 `tests 0`·fake status만 실행하는 재사용을 확인하고, 일반 실제 테스트 환경변수 `TEST_DATABASE_URL` 변경은 계속 거부한다. 기준 `scoped-verification-2026-11-11-r1`/R2와 수용 기준은 유지한다. 전체 rerun·최종 검수는 Coordinator 담당이다.
- 제한 검증(Node `26.13.0`): `node --test scripts/lib/ci-local.test.mjs` **32건 통과**, 변경 JS 2개의 ESLint와 변경 파일 5개의 Prettier 통과. 로그: `/tmp/crelink-0281-call-id-{unit,lint,format}.log`. 제품·Meta·DB·Docker·실제 전체 CI·push·프로젝트 commit·검수는 실행하지 않았다. hermetic 내부 full/report·Git commit은 임시 저장소·fake 대역이다.

### 최종검수 Graph source selector 보완

- 2026-11-11: 같은 task·브랜치, HEAD `bfe2167`에서 사용자 전달 Codex FAIL의 유효 결함을 보완했다. `graph.ts` source selector가 기존 `instagram-crypto.spec.ts`의 crypto/Graph 보안경계(form-secret 포함)와 새 `graph.spec.ts` fixture 검사를 함께 선택하고 두 시험 파일도 덮는다. fixture-only selector는 해당 fixture를 소비하는 `graph.spec.ts`만 유지한다. 기존 mapping unit에서 auth/hotfix의 두 모음·API typecheck 포함과 DB/스택/EGO/이미지 자동 미추가를 확인한다.
- 제한 검증(Node `26.13.0`): API 두 모음 **78건**, runner unit **32건**, 변경 JS 2개 ESLint·변경 파일 5개 Prettier, `pnpm work:scope 0281`, `git diff --check` 통과. 로그: `/tmp/crelink-0281-graph-selector-{api,unit,lint,format,scope}.log`.
- acceptance·SSoT `scoped-verification-2026-11-11-r1`/R2와 제품은 유지했다. 새 mutation 하네스·패키지, 실제 DB/스택/Meta/전체 CI·프로젝트 commit/push·추가 검수 없이 최종 source를 한 회차로 인계한다. runner unit 내부 실행은 기존 임시 저장소·fake 대역이다.
