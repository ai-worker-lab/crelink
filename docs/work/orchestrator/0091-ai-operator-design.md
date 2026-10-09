# 0091 AI 운영자 ADR·기술 설계·티켓 분해와 통합

- 단계: 티켓
- 역할: orchestrator
- 상위: 0088
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

에픽 0088의 ADR, 기술 설계(`docs/specs/crelink-ai-operator.md`), 역할별 티켓 분해(번호 0100~0119), 구현 통합을 맡습니다.

## 수용 기준

- [x] ADR 0015(AI 운영자 권한 위임·전용 계정·행동 기록)가 `승인`이고, `AGENTS.md`·`docs/development/repository-policy.md`가 반영합니다.
- [x] 기술 설계가 `승인`이고(사용자 위임에 따른 AI 승인, 근거 기록), 티켓이 분해되어 있습니다.
- [x] 통합 브랜치에서 `pnpm verify`·`pnpm smoke`·관련 E2E가 통과하고 PR이 열려 있습니다.

## 범위

- 포함: 에픽 0088 수용 기준 전부의 설계·구현·통합.
- 제외: main 머지와 운영 토큰 발급·Orca 자동화 설정(부모 세션이 함).

## 위험·복구

에픽 0088 `위험·복구`를 따릅니다.

## 연결

- 에픽: [0088](../epics/0088-ai-operator.md)
- 절차: [기술 설계와 티켓 분해](../../specs/README.md), [위임과 반복 작업](../../development/parallel-work.md#위임과-반복-작업)

## 진행 기록

- 2026-10-10: 생성. migration 번호는 `0004_ai_operator.sql`로 미리 정했습니다(0089는 `0005_slot_event.sql`).
- 2026-10-10: 설계(orchestrator, 브랜치 `work/0091-ai-operator-design`). `docs/specs/crelink-ai-operator.md` 초안 → api·web·infra 검토(고칠것 27건·참고 23건, 설계 `검토 기록`) 반영 → 사용자 위임에 따른 AI 승인(`승인`). ADR 0015 `승인`. 티켓 0100~0108 분해(0100~0103 api, 0104~0106 web, 0107 infra, 0108 orchestrator), 0091이 통합 티켓. 계약 0100은 orchestrator가 먼저 썼고 api·web·infra 담당이 같은 worktree에서 병렬 구현(커밋은 통합 때 한 번).
- 2026-10-10: 정책·문서. 루트 `AGENTS.md` 예외 한 줄(3121자, 예산 3500자 안), `docs/development/repository-policy.md` `AI 운영자 위임` 절, `docs/development/verification.md` 운영 확인, `docs/development/agent-runner.md` 관계, `docs/README.md` 색인(ADR 0015·헌장·설계, GrowthPrd 요청의 제품 조사 문단과 0090의 초기 사용자 모집 조사 링크), 루트 `CHANGELOGS.md`. 사용자 위임에 따른 AI 승인 근거는 설계 `검토 기록`.
- 2026-10-10: 통합 검증(orchestrator, Node 24.20.0, `set -o pipefail`).
  - 인스턴스: 슬롯 2가 다른 checkout의 남은 컨테이너(`crelink-crelink-0042-*`)와 포트가 겹쳐 `PORT_SLOT=5 pnpm instance`(API 3520·웹 5693·Postgres 5952). `make up`은 PM2 소켓 경로(`.local/pm2/interactor.sock`, 108자)가 macOS 유닉스 소켓 한도를 넘어 실패해 `make up PM2_HOME=/tmp/c0091pm2`로 띄움(하네스 결함은 `분류 대기` 0109로 등록). migration `0001`~`0004_ai_operator` 적용.
  - E2E `tests/e2e/ai-operator.spec.ts`(새, 설계 검증 계획 1~4): 실행 호스트 도구 → 웹 `/api/agent` → API → DB를 실제로 지남. 처음 실행에서 토큰 폐기 버튼을 이름 없이 첫 번째로 눌러 다른(로컬) 토큰을 폐기한 시험 결함을 토큰 label로 고쳤고, AI 계정 fixture가 랜딩 없이 만들어져 운영자 상세가 404이던 것을 CLI와 같은 가입 행으로 고침. `tests/e2e/fixtures.ts` `aiAccount()`와 정리 순서(`operator_actions`·`agent_runs`), `tests/e2e/README.md`.
  - 화면: 실제 API로 `/admin/agent-runs`·`/admin/actions`를 1280px·390px로 찍어 확인(가로 넘침 없음, E2E도 390px 확인).
  - 검사 결과(모두 실제 실행): `pnpm verify` 8단계 모두 통과(tokens·work·docs·design·lint·typecheck·build·test; API 27 스위트 208건, 웹 59건, shared 55건), `pnpm smoke` 5/5, `pnpm e2e` 13/13(`main` 9 + `ad-banner` 4), `infra/prod/tests/caddy-routing.sh` 80/80(infra 담당), `git grep -E 'crl_ai_[A-Za-z0-9_-]{43}'` 결과 없음. 마지막 확인 사이 한 번의 `pnpm verify`와 `pnpm test` 반복 5회 중 1회에서 `test/health.e2e-spec.ts`가 `Connection terminated unexpectedly`로 실패했습니다. 시험이 DB를 `DROP … WITH (FORCE)`로 지울 때 기동 직후 보존 작업이 쥔 연결이 끊기는 기존 부하 의존 실패(0039 진행 기록과 같은 원인)로, 그 파일만 15회 반복은 모두 통과했고 바로 다음 `pnpm verify`는 8단계 모두 통과했습니다.
  - 운영 적용(머지 뒤 부모): 배포 결과 `운영 주소 검사` 11개(새 `/api/agent` 401 포함) → 런북 17 토큰 발급 → `node scripts/ai-operator.mjs precheck` 0 → `node scripts/ai-operator.mjs automation-command` 출력 실행 → `orca automations run`으로 1회 실행해 실행 기록 `succeeded` 확인. 그 전까지 에픽 0088의 "30분 트리거가 실행" 기준은 체크하지 않습니다.
- 2026-10-10: PR [#70](https://github.com/ai-worker-lab/crelink/pull/70)을 열었습니다(main 머지·운영 배포·토큰 발급·Orca 자동화 생성은 부모).
- 2026-10-10: PR #69(링크 슬롯 이벤트) 머지 뒤 통합과 보안 검토(`agent://AiOperatorSecReview`, 조건부 통과) 반영(orchestrator, 부모 요청).
  - origin/main `7950025`에 rebase(두 커밋을 하나로 합친 뒤): `packages/shared` 오류 코드·`errors.ts`·`app.module.ts`(두 모듈)·`creator.service.ts`(이벤트 보너스 + `VISIBLE_LINK_CONDITION`)·`ad-banners.service.ts` import·운영자 메뉴(`이벤트`·`AI 실행 기록`·`운영 기록`)·크리에이터 상세(`eventBonus` + `accountKind`)·health 시험 migration 목록(0004·0005)·migration 시험(0004·0005 describe 둘 다)·문서·변경 기록 충돌을 양쪽 내용으로 풂.
  - F3(0089가 남긴 기록 없는 쓰기): `PUT /api/admin/slot-event`가 `setPeriod(actor, body)`로 트랜잭션 안 `FOR UPDATE` 이전 값과 `recordOperatorAction`(`slot_event.period_update`, targetType `slot_event`)을 남김. 지표 `events`에 `slot_event_applications`. 재발 방지 시험 `apps/api/test/operator-audit-coverage.e2e-spec.ts`(Nest 라우트 탐색으로 `OperatorGuard` 아래 쓰기 16개 = 기록 대상 14 + 예외 2, 각 대상을 불러 행동 기록 1건 확인, `/api/admin` 아래 가드 누락 없음).
  - F4: AI 행위자의 운영자·AI 계정 소유 링크·배너 차단 403(`assertAiMayChange`), 시험 추가.
  - F5: 토큰 경로 허용을 메서드별로 좁힘(운영자 API 전체, `GET api/me`, `POST api/me/files`, `GET api/files/{id}`, `GET api/health`). 근거는 설계 `웹 토큰 경로`.
  - F2: `scripts/ai-operator.mjs guard`(멈춤이거나 이번 실행이 닫혔으면 1)와 헌장·프롬프트의 "머지·외부 공개·운영 쓰기 묶음 직전 `guard`" 규칙. 헌장·ADR·설계·웹 확인 문구의 멈춤 범위를 사실대로("API 쓰기만 즉시 거절, 머지·배포는 `guard`·자동화 끄기").
  - F1(위험 수용): ADR 0015 `결과와 트레이드오프`에 실행 호스트 자격 위험 수용, 헌장 지킬 규칙 10(실행 호스트 자격으로 토큰 발급·멈춤 해제·DB 직접 쓰기·사람 전용 통제 우회 금지), 사람 선행 조건(실행 계정 분리·CODEOWNERS)을 헌장 `실행 환경 설치` 6·7과 설계 `권한·보안`·`위험`에, 런북 17-1 주의.
  - `/admin/slot-event` 상태 배지를 공용 `badge-*`로(0106에서 `ad-status-*` 규칙을 공용으로 옮겼기 때문에 0089 화면 배지 색이 빠져 있었음), 중복된 `.badge-positive` 삭제.
  - 검사(모두 실제 실행, Node 24.20, 슬롯 5): `pnpm verify` 8단계 모두 통과(API 29 스위트 227건, 웹 64건, shared 55건; 첫 실행은 Prettier 1건으로 lint 실패 → 고친 뒤 통과). `make up PM2_HOME=/tmp/c0091pm2` 뒤 `pnpm smoke` 5/5, `pnpm e2e tests/e2e/ai-operator.spec.ts tests/e2e/slot-event.spec.ts` → 프로젝트 의존으로 전체 15/15(`main` 9 + `ad-banner` 4 + `slot-event` 2). 로컬 `guard`: 실행 없음 1, 실행 중 0, 멈춤 1, 닫은 뒤 1. 토큰 경로 `POST api/me/links` 404.
- 2026-10-10: PR #70을 squash 머지했습니다(main `f00353c`). Deploy run 37964001074의 plan·이미지 api/web·배포 home-server·배포 기록 태그가 모두 success였습니다. 이어서 런북 17-2로 운영 토큰을 발급했습니다(`~/.config/crelink/ai-operator.env`, 600). `precheck`은 종료 0이었습니다. 운영 적용은 에픽 0088 진행 기록에 있습니다. 상태를 `완료`로 바꿉니다.
