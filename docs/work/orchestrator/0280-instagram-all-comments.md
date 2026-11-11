# 0280 Instagram 모든 댓글 DM·최초 1회

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-11

## 목적

특정 키워드 외에 모든 댓글에도 DM을 보내는 체크박스를 추가한다. 사용자가 같은 사람·같은 게시물에서 최초 한 번만 발송하는 범위를 확정했다. 기존 키워드 규칙의 기본 동작을 보존한다.

## 수용 기준

- [ ] [CTO 계약](../../../contracts/0280-instagram-all-comments/1-cto-interface.contract.md)의 T1~T12와 R2 확정 범위를 구현·검증한다.
- [ ] 로컬 체크박스 브라우저·필수 CI·최종 양측 검수 complete를 확인한다.

## 범위

- 포함: additive migration 0019, instagram rules·webhook·deliveries·삭제, lock-order, shared, web RuleEditor·RulesPanel·state, 처리방침 문구와 SSoT r4.
- 제외: infra·인증·worker 구조·디자인 재설계·실제 Meta DM 시험·운영 규칙 자동 활성화.

## 위험·복구

외부 발송 대상이 넓어지므로 기존 규칙과 생성 기본값은 키워드 방식이다. 중복 식별표는 원문 없이 계정·게시물·HMAC만 유지하며 90일 발송 내역과 분리한다. rollback은 앱 PR revert이며 추가 표·열을 삭제하지 않는다.

## 진행 기록

- Coordinator 필수 검사 보완: 중복 식별 기록의 보관·삭제가 바뀌므로 `docs/development/verification.md`의 개인정보 변경 시 수동 `CI` 실행 규칙을 적용한다. CTO가 제외한 임의 전체 회귀와 구분해 저장소 필수 workflow만 최종 SHA에 1회 실행한다. 추가 설계·QA 호출은 하지 않는다.

- 2026-11-11: task-a23249ec642343519524c546759d8d20 CTO 판단 완료. 사용자 범위 확정 후 계약 원문을 Coordinator가 저장하고 R2에 답변을 반영했다. 최소 flow는 단일 DEV→관련 시험/로컬 checkbox→필수 CI·양측 각1회/complete→PR/Deploy다. 구현·검증 이력은 아래에 실제 결과만 기록한다.

- 2026-11-11 DEV 구현: 계약 원문+Coordinator 확정 R2, SSoT r3를 읽고 기능 R30-2·3·4·6만 `r4-all-comments-2026-11-11/u1`로 동기화했다. 사용자 범위는 확정이며 pending scope가 아니다. canonical `ig_media_id`만 scope_key로 사용한다. 인증 r3·과거 계약·미실측 S 항목은 변경하지 않았다. PRD R30, API 안내, 루트/API/web CHANGELOGS와 처리방침도 함께 정정했다.
- 2026-11-11 DEV 구현: additive 0019(기존 규칙 false, true keyword 0~30·false 1~30, pending·sending·sent·unknown 백필), FK 없는 recipients 마커, 자격/version/24h/opt-out→earliest canonical→INSERT RETURNING→delivery CTE, Meta 삭제 동시 파기, API/shared/목록/내역/웹 checkbox·키워드 보존을 반영했다. worker·인증·env 동작은 유지했다. 티켓 초안의 검사 불가 메타데이터(착수·설명 포함 우선순위)는 도구 허용값 진행·P1로 정정했다.

### DEV 실제 검증 (2026-11-11, 미커밋 작업 트리)

| 실행 | 실제 결과·근거 |
| --- | --- |
| `pnpm --filter @crelink/shared build`·`typecheck`·`test` | 통과, shared 135/135. `/tmp/crelink-0280-shared.log`, `/tmp/crelink-0280-shared-typecheck.log` |
| `pnpm --filter @crelink/api typecheck` | 통과. `/tmp/crelink-0280-api-typecheck.log` |
| `pnpm --filter @crelink/web typecheck` | 통과(next typegen 포함). `/tmp/crelink-0280-web-typecheck.log` |
| `pnpm --filter @crelink/api test --runInBand --testPathPatterns='src/instagram/.*spec.ts'` | 4 suites·111/111 통과. `/tmp/crelink-0280-api-unit.log` |
| `pnpm --filter @crelink/web exec node --test src/components/manage/instagram/state.spec.ts src/components/manage/instagram-deliveries/state.spec.ts` | 12/12 통과. `/tmp/crelink-0280-web-related.log` |
| `pnpm --filter @crelink/web test` | 166건 중 164 통과·2 실패. 기존 agent-proxy의 실제 HTTP listen 두 시험이 `listen EPERM 127.0.0.1`로 실행 차단됐다. 전체 웹 통과로 보지 않는다. `/tmp/crelink-0280-web.log` |
| `make infra-up` | 실패: 이 세션 sandbox에서 Docker socket 접근 `permission denied`. 컨테이너 생성·볼륨 삭제 없음 |
| API4종(webhook/rules/deliveries/admin)+health+0019 migration 시험 | 6 suites·171건 모두 초기 DB 접속 `connect EPERM 127.0.0.1:5452`로 실행 차단. PostgreSQL 동작·저장 통합·원자성·경합은 미검증이다. `/tmp/crelink-0280-api-db.log`. 앞선 rules 19건 단독 시도도 같은 원인(`/tmp/crelink-0280-db-probe.log`) |
| 변경 코드 `pnpm exec eslint <변경 TS/TSX/MJS>`·`pnpm exec prettier --check <변경 파일>` | 최종 통과(exit 0). 초기 fixture의 미사용 global fetch lint 1건은 제거했다. `/tmp/crelink-0280-eslint.log`, `/tmp/crelink-0280-prettier.log` |
| `pnpm docs:check`·`pnpm work:check`·`pnpm work:scope 0280`·`git diff --check` | 최종 통과. 문서 374개, work item 232개, 변경 32개 모두 orchestrator 소유 범위. 최초 work:check의 티켓 메타데이터 2건은 위 기록대로 정정했다. `/tmp/crelink-0280-docs.log`, `/tmp/crelink-0280-work-check.log`, `/tmp/crelink-0280-scope.log` |
| `node tests/e2e/ego/instagram-all-comments.fixture.mjs --check` | 통과: 기존 API test-app/DB/provider TS 로더 확인만. 실제 기동 증거가 아니다. `/tmp/crelink-0280-fixture-check.log` |
| `node tests/e2e/ego/instagram-all-comments.fixture.mjs` | 기동 시 `listen EPERM 127.0.0.1`로 차단. API/격리 DB 생성 이전 실패이고 남긴 서버/DB 자원 없음. `/tmp/crelink-0280-fixture-start.log` |

### 계약 시험 대응과 남은 검증

| 계약 | 구현/시험 위치 | 현재 근거 |
| --- | --- | --- |
| T1 기존 키워드 | 기존 webhook·rules, keyword 단위 | 단위 통과, DB 미검증 |
| T2 모든 댓글 저장 | rules 생성/목록/PATCH + webhook 모든 댓글·빈 text | DB 미검증 |
| T3·T4·T5 같은 사람/다른 사람/다른 게시물 | webhook 0280: canonical 부모/자식 동일 키, 사람·게시물 각1건, 실패·취소 뒤 새 delivery 차단 | DB 미검증 |
| T6 동시성 | 기존 동시 20회·반대 배치·1000건 + earliest timestamp/id 선택 | DB 미검증 |
| T7 편집·보관·재생성 | webhook 0280: 실제 PATCH/DELETE 후 새 규칙 | DB 미검증 |
| T8 옛 version | webhook 0280: 읽기/저장 경합 뒤 마커 0→새 version 재전송 1 | DB 미검증 |
| T9 90일·Meta 삭제 | webhook 실제 RetentionService, 기존 삭제/일반 해제 뒤 소유표/실패 rollback 보강, admin 마커 400일 보존 | DB 미검증 |
| T10 재연결 | webhook 실제 해제→새 연결/규칙, admin 기존 mock Graph OAuth 재연결에서 마커 유지 | DB 미검증 |
| T11 API/shared/0019 | rules 모드 입력 타입·0/30/31·토글·version, deliveries 공개 필드, health 표/버전 목록, 새 migration 백필 시험 | shared 단위 통과, DB 미검증 |
| T12 web state | keyword 최종 모드·NUL·코드 포인트 경계, 빈 키워드 토글 재검증 | 관련 unit 12/12 통과, 실제 UI 미검증 |

실제 Meta 연결·식별자 일치·발송과 기존 S1~S11 미실측 항목은 검증하지 않았다. 운영·외부 Meta·실발송·secret 조회/변경을 하지 않았다. 사용자 지정에 따라 브라우저 조작·전체 CI·commit·push·PR·review는 실행하지 않았다. DB 시험·fixture 기동·390/1280 UI·콘솔 및 Coordinator CI/양측 검수가 남아 있으므로 수용 기준을 완료로 체크하지 않는다.

### Coordinator 인계

- fixture: `tests/e2e/ego/instagram-all-comments.fixture.mjs`. [실행·확인·정리 절차](../../../tests/e2e/README.md#0280-모든-댓글-local-fixture-coordinator)를 따른다. `make infra-up`→shared build→fixture 실행이며 실제 Nest/BFF/PostgreSQL을 쓰고 Graph만 대체한다. 새 env나 제품용 fixture route는 추가하지 않았다.
- 이 세션은 listen/DB/Docker가 차단되어 실행 중 fixture URL·합성 세션을 만들 수 없었다. 권한 있는 Coordinator 세션에서 fixture를 시작하면 `/tmp/crelink-0280-ui/config.json`과 pid가 생성된다. 기존 ego `setSessionCookie`로 합성 로그인 후 checkbox 생성·편집·저장·복귀·빈 키워드 검증을 390/1280에서 확인하고 PNG/콘솔 결과를 같은 폴더에 남긴다.
- 별도 저장 통합: README의 API4종+health+0019 명령을 기존 격리 DB 경로로 다시 실행한다. 성공 여부를 실제 결과로 기록한다. `make infra-up` 외에 PostgreSQL 직접 기동·새 컨테이너·볼륨 삭제는 하지 않는다. fixture 종료는 Ctrl-C/SIGTERM이며 이 실행의 서버·일회용 DB·합성 데이터만 정리한다.
- 전체 CI·CI report·commit·push·PR·양측 검수·머지·Deploy는 Coordinator가 수행한다. 현재 기준 HEAD는 `ac4a586`이며 구현은 작업 트리에 있다. `/tmp/crelink-0280-ci.log`·`/tmp/crelink-0280-ci-report.log`·UI 증거는 Coordinator가 최종 커밋에 연결한다.

- 2026-11-11 DEV 인계 증거: `/tmp/crelink-0280-ui/dev`에 실행 로그 복사본·작업 트리 변경 목록/sha256 manifest·handoff.txt를 저장했다. 실행 중 fixture·UI PNG·콘솔 통과 증거는 없으며 Coordinator가 생성해야 한다.

### Coordinator 실제 DB 결과와 시험 순서 후속 수정 (2026-11-11)

- Coordinator 실제 DB 실행은 6 suites·171시험 중 170통과·1실패다. 근거: `/tmp/crelink-0280-api-db-coordinator.log`. 유일한 실패는 `apps/api/test/instagram-rules.e2e-spec.ts:160`에서 GET 목록을 먼저 읽고 비교용 빈 PATCH를 호출하여 `updatedAt`이 `.342Z`에서 `.346Z`로 4ms 바뀐 시험 순서 오류다.
- 같은 task·`work/0280-instagram-all-comments` 브랜치에서 해당 시험의 빈 PATCH 응답을 먼저 받은 다음 GET 목록 전체 응답과 비교하도록 순서만 수정했다. `updatedAt`을 포함한 `toEqual` 전체 비교를 유지했다. 동작 코드·스펙·실행 중 Coordinator fixture 파일은 변경하지 않았다.
- 사용자 지정에 따라 수정 후 시험·lint·문서 전체 검사·CI·브라우저·commit·push·PR·review는 실행하지 않았고, DB·서버·Docker도 재시도하지 않았다. 수정 후 DB 재검증 결과는 아직 없으며 Coordinator에 인계한다.

### Coordinator 실제 검증과 최종 계약 수정 (2026-11-11)

- 최초 DB 실행은 6 suites·171시험 중 170통과·1실패였으며, 위 시험 순서 수정 후 rules 21시험이 통과했다.
- 실제 UI는 `/tmp/crelink-0280-ui/result.json` 기준 13 checks, 390/1280 overflow 0, CDP 801 events·console 0이다. TaskSpace 607 finish는 1회였고 합성 세션 삭제·fixture SIGTERM·일회용 DB 정리를 마쳤다. 빈 썸네일 fixture 수정과 devbadge 자동화 interception 복구는 같은 space에서 기존 touch 헬퍼로 수행했으며 제품 코드 변경이나 오류 필터 제외는 없었다.
- `c6330dd`의 첫 전체 CI는 11단계 통과·1단계 실패, API 49 suites 중 1실패·821시험 중 820통과였다. 유일한 실패는 `/tmp/crelink-0280-ci.log:637`의 공개 필드 계약 누락이다. `apps/api/test/instagram-contract.e2e-spec.ts`의 `RULE_KEYS`에 공개 boolean `matchAllComments`만 추가했고 기존 exact keys 비교와 `PRIVATE_RESPONSE_KEYS` 비노출 검사는 보존했다.
- 최종 CI는 Coordinator가 이번 수정 커밋에서 다시 실행한다. 현재 통과 여부는 미확정이며 티켓은 `검증` 상태로 인계한다. 이번 수정에서는 DB·서버 재시도, 브라우저·fixture·lint·CI·commit·push·review를 실행하지 않는다.
