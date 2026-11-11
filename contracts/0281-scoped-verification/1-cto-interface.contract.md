# 0281 부분 검증·결과 재사용·외부 mock CTO 계약

- 작업: 0281 / task-c7739bc25e264e1db6cc7d8d9dfe2f37
- 입력: crelink7ca849b / settings-sync contract-policy-2026-11-11-r2/u3 및 D-94
- 작성: CTO, 원문 대조·저장: Coordinator. 요구 결정권자: 사용자.
- 현재 기준 문서: docs/development/verification.md. 이번 변경 리비전 scoped-verification-2026-11-11-r1. 제품 기능·운영값 변경 제외.

## R1 CTO 승인 원문

**결론:** 범위 목록(registry) 하나를 기존 `scripts/lib/ci-local.mjs` 안에 두는 안을 골랐습니다. 영수증(receipt)과 Instagram offline fixture를 더해도 새 서비스·패키지는 없습니다.

**계약** — Coordinator가 `contracts/0281-scoped-verification/1-cto-interface.contract.md`에 저장
- 정책 `contract-policy-2026-11-11-r2/u3`, HEAD `7ca849b`
- SSoT는 `docs/development/verification.md#로컬-ci`(blob `0c82ac8`, 커밋 `770862f`)
- 항목: V1 범위, V2 영수증, V3 실패 분류, V4 fixture, V5 범위 고정
- 티켓 0281 파일이 `docs/work`에 없습니다. `work:scope`를 통과하려면 DEV가 먼저 만들어야 합니다.

**CLI**
- `pnpm ci:local [--profile config|hotfix|auth|full] [--select api:<경로>,web,shared] [--qa <EGO_SUITES 이름>]`
  - 기본값 full이고 지금 동작(`ci-local.mjs:430-447`) 그대로입니다.
  - 실행 전에 범위를 출력해 고정합니다. 명령은 registry에 있는 것만 실행하고, 임의 명령은 받지 않습니다.
- `api:` 지정 → 해당 jest. 테스트 0건이면 실패하고, `test/*.e2e-spec`이 들어 있을 때만 `make infra-up`을 띄웁니다.
- `web` → 해당 패키지 typecheck와 바뀐 파일 lint.
- `shared` → build·test에 더해 api·web typecheck.
- `--qa` → 지정한 ego 시험만 돌리고 증거를 기록합니다. hotfix는 ego 4종과 이미지 빌드를 하지 않습니다.
- 다음 경우는 거부(exit 2)합니다. 실행기·lockfile·`package.json`·`.github`·`infra`·Dockerfile이 바뀌었으면 full만 허용합니다.
  - 바뀐 파일 중 지정 범위에 안 들어가는 파일이 있음
  - 필수 검사가 비어 있음
  - 모르는 selector
- 성공하면 `.local/ci/receipts/<sha>.json`을 씁니다: sha, base sha, clean 여부, profile·selectors, 명령, Node·플랫폼, lockfile 해시, 실행기 지문(`ci-local`·`verify`·`package.json`·`.nvmrc` 해시), 결과.
- `--report`는 테스트를 다시 돌리지 않고 영수증과 대조만 합니다. 아래 중 하나면 기존 `reportBlockers`에 이유를 더해 exit 1로 끝냅니다.
  - 위 값 중 하나라도 다름
  - 실패·중단 기록이 있음
  - 영수증이 없음 → 안내만 출력. 몰래 full을 돌리지 않습니다.
- 실패 분류
  - 필수 단계 실패는 block입니다.
  - nonblocking은 registry에 미리 그렇게 선언된 `INSTAGRAM_LIVE=1` live 검사만입니다. FAIL로 표시하고 PASS로 바꾸지 않습니다.
  - 범위와 무관한 검사는 처음부터 돌리지 않습니다. 범위를 자동으로 넓히지 않습니다.

**fixture**
- `apps/api/src/instagram/graph.fixtures.ts`에 가짜 id·token만 넣습니다.
  - token 200 `{access_token, token_type}`
  - `/me` → `{}`
  - `debug_token` → `{app_id, type: 'SYSTEM_USER', is_valid: true, user_id}`
  - assigned → `[{id, username}]`
- `graph.spec.ts`는 `FetchInstagramGraph`(`graph.ts:181`)에 fetch stub를 넣어 세 경우를 봅니다.
  - 정상
  - 네트워크 불가 → `connect_failed`
  - 계약 불일치(app_id·type·is_valid·`user_id` 숫자·배열 아님·2개) → `rejected`
- fetch 주입 방식은 DEV가 확인해야 합니다. 저는 확인하지 못했습니다.

**흐름**
1. DEV 구현(문서 AGENTS·verification·ADR0016 결정5 보강)
2. `ci-local.test.mjs` 케이스: 덜 덮인 범위 / 실행기·lock 변경 / 빈 검사 / 영수증 필드별 불일치 / 영수증 없음 → `node --test scripts/lib/ci-local.test.mjs`, `jest graph` 통과
3. clean HEAD에서 `pnpm ci:local` full 1회로 영수증 생성
4. push
5. `pnpm ci:local --report`가 재사용되고 `tests 0` 출력 확인
6. 양측 최종 검수 각 1회. 여기서 코드가 바뀌면 3번부터 다시
7. merge → Deploy 결과 확인(plan만일 수 있음)

**검증에서 뺀 것:** 전체 E2E, live 외부 호출, 운영 확인. 이유는 제품 동작이 바뀌지 않기 때문입니다.

**위험:** registry가 덮지 못하는 의존성은 거부로 처리합니다. 쓰기 권한자가 status를 위조할 수 있는 한계는 ADR 0016에 적힌 그대로 남습니다.

**판단**
- registry를 골랐고 계획 파일은 버렸습니다. 계획 파일은 작업마다 산출물이 늘고, 임의 명령이 들어올 수 있습니다.
- nonblocking은 미리 선언된 항목만 허용했습니다. 사후에 "무관"으로 분류하는 안은 위조와 구분할 수 없어서 버렸습니다.
- 영수증이 없을 때 `--report`가 full을 자동으로 돌리던 동작은 없앴습니다. 결과 등록 단계가 검증을 다시 돌리지 않게 하라는 회고 제안 3을 따랐습니다.


## R2 Coordinator 구체화·기존 계약 보존

- 사용자가 다섯 개선 전체와 외부 실측 후 mock 기본화를 승인했다. 추가 정책 승인 대기는 없다. 범용 새 서비스/의존성 그래프/임의 명령 계획파일은 만들지 않고 기존 실행기 내 작은 registry를 쓴다.
- selector는 문서에 concrete 예를 확정하고 검증한다. API는 실제 module/test 경로와 관련 검사, web은 typecheck만으로 성공시키지 않고 관련 state/contract 단위검사도 포함한다. shared 변경은 shared build/test와 API/web 소비자 타입검사를 포함한다. Instagram을 실제 hotfix/auth 예제로 지원하며 등록 안 된 범위·새 공통 코드·소스 불명은 거부/full 안내한다. QA는 지정한 기존 실행 경로만 사용하고 검증 환경 자체 개발을 자동 추가하지 않는다.
- config는 기존 암호화 값 주입만 허용하고 파서/권한/시크릿 수신자/배포동작 변경은 포함하지 않는다. 암호문만 확인한 결과를 실제 복호화 값 형식·운영 정상 증거로 표시하지 않는다. receipt/log에 비밀값을 저장하지 않는다.
- Graph 정상 복수계정은 FetchInstagramGraph가 목록으로 반환하고 기존 서비스가409로 거부하는 계약이다. fixture에 맞추려고 제품 동작을 바꾸지 않는다. 네트워크 실패 종류도 실제 기존 graph.ts 오류 계약을 검사하며 새 taxonomy를 추정해 제품코드에 넣지 않는다. 가짜 식별자·opaque token만 쓰며 이전 실측 날짜/출처·관찰 shape와 synthetic example을 구분한다. 인증정보/실제 code/state/user id/token은 금지한다.
- mock fixture는 제품 번들용 모듈이 아니라 test fixture로 둔다. live 확인은 기본 꺼짐·별도 명시적 opt-in이며 외부 live 불가와 내부 계약 통과를 각각 기록한다. 필수 내부/계약 검사 실패를 외부 장애라고 재분류하지 않는다. 사전에 registry에 nonblocking으로 선언된 외부 관측만 비차단이다.
- 영수증은 required 결과와 관측 결과를 분리한다. report는 현재 registry의 required 여부·전체 계획/결과 누락/중복·SHA/base/clean·Node/platform·lock·runner·명령/select/환경 지문까지 대조한다. 실패/중단/불일치/누락은 거부한다. 옵션/환경으로 결과를 숨기거나 빈 검사로 성공하지 않는다. source·테스트·registry 변경이 있으면 해당 receipt는 재사용하지 않는다.
- DEV는 실행기/fixture 경계의 hermetic unit·integration만 수행한다. DB/Docker/loopback sandbox 실패를 재시도하지 않는다. Coordinator가 최종 clean SHA의 full1회와 report 테스트0 재사용을 실측하고 같은 코드를 최종양측각1회/complete→PR/Deploy로 반영한다. 원격 앱 전수회귀·수동 운영확인은 추가하지 않는다.
