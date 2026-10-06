# 0005 work next와 WORKFLOW.md 기반 실행기

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

저장소 work item을 에이전트 작업의 제어 평면으로 씁니다([Symphony](https://github.com/openai/symphony)의 방식). 착수 가능한 티켓을 계산하고, 티켓마다 격리 worktree와 코딩 에이전트를 띄워 `검증` 상태까지 진행시키며, 주기적인 문서 정리 작업을 실행합니다. 에이전트 런타임은 설정한 명령으로 바꿀 수 있습니다.

## 수용 기준

- [x] `pnpm work:next [--json] [--all]`이 착수 가능한 work item을 우선순위·번호 순으로 출력한다. 조건: 에픽이 아니고, 하위 항목이 없고, `상태: 준비`이며, 자신과 모든 상위의 `선행`이 `완료`이고, `work/NNNN-*` 브랜치(로컬 또는 원격)로 점유되지 않음. `--all`은 제외 사유와 함께 모두 보여 준다.
- [x] 루트 `WORKFLOW.md`가 YAML front matter(추적 대상·인계 상태·작업공간·훅·에이전트 명령·동시 실행 수·제한 시간·재시도·주기 작업)와 에이전트 프롬프트 본문을 가진다. 프롬프트는 고정 절차 대신 목표·완료 조건·사용할 명령을 준다.
- [x] `pnpm work:run`이 주기적으로 착수 가능한 티켓을 골라 `work/NNNN-<slug>` 브랜치 worktree를 만들고, 생성 훅을 실행하고, 프롬프트를 렌더링해 `agent.command`를 해당 worktree에서 실행한다. 에이전트가 끝나면 worktree의 work item 상태를 읽어 `준비`·`진행`이면 지수 backoff로 재시도하고 그 밖의 상태면 인계로 끝낸다. 기준 checkout에서 `보류/종료`가 되면 실행 중 에이전트를 멈춘다. 재시작 시 점유 브랜치와 worktree로 진행 중 작업을 이어 간다.
- [x] `--once`, `--dry-run`, `--workflow <path>`를 지원하고, 실행 이벤트를 `.local/runner/events.jsonl`, 에이전트 출력을 `.local/runner/logs/`에 남긴다.
- [x] 주기 작업 설정으로 문서 정리(doc-gardening) 에이전트를 정해진 간격마다 실행하며, 절차는 `docs/development/doc-gardening.md`가 기준이다.
- [x] 에이전트가 범위 밖 개선점이나 빠진 하네스 능력을 발견하면 `분류 대기`·`(AI 제안)` 우선순위 work item으로 등록하는 규칙이 `docs/work/README.md`와 프롬프트에 있다.
- [x] 실행기 사용법·설정 키·런타임 예시(OMP, Codex, Claude Code) 문서와 ADR 0007이 있다.

## 범위

- 포함: `scripts/work.mjs`(`--next`), `scripts/runner.mjs`, `WORKFLOW.md`, `docs/work/README.md`, 실행기·문서 정리 문서, ADR 0007.
- 제외: 외부 이슈 트래커 연동([ADR 0002](../../adr/0002-work-items-in-repository.md) 유지), 웹 대시보드.

## 위험·복구

실행기는 설정한 에이전트 명령을 사람 확인 없이 실행합니다. 기본 설정은 동시 실행 1개이고, 배포·데이터 파괴·외부 공개는 프롬프트에서 금지하며, 원격 push는 설정으로 켭니다. 중단은 실행기 종료(`Ctrl+C`)이며 worktree와 브랜치는 남습니다.

## 연결

- [작업 관리](../README.md), [작업 실행기](../../development/agent-runner.md), [문서 정리](../../development/doc-gardening.md), [ADR 0002](../../adr/0002-work-items-in-repository.md), [ADR 0007](../../adr/0007-repository-work-item-runner.md), [Symphony SPEC](https://github.com/openai/symphony)

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: 구현. `scripts/work.mjs --next`, `scripts/lib/work-items.mjs`(`readClaims`·`branchItemId`·`rankWorkItems`), `scripts/runner.mjs`, `scripts/lib/runner-workflow.mjs`, 루트 `WORKFLOW.md`, `docs/work/README.md`(명령·착수와 점유·AI 제안 등록·번호 충돌), `docs/development/agent-runner.md`, `docs/development/doc-gardening.md`, ADR 0007. 상태 `검증`.
- 2026-10-01: 검증. `/tmp` 임시 clone(별도 bare origin, 시험용 work item 11개, `--workflow`로 `workspace.root`·`after_create: echo … && true`·가짜 에이전트 셸 스크립트 지정)에서 실행한 결과입니다. 끝난 뒤 임시 clone·worktree·origin을 모두 지웠고 남은 프로세스가 없음을 확인했습니다.
  - `pnpm work:next`: P0 (AI 제안) → P2 → P3 순으로 5개. `--all`: 에픽, 상태 `진행`, 선행 미완료, 하위 항목 있음, 상위의 선행 미완료, 로컬 브랜치 `work/0008-…`·원격 `remotes/origin/work/0013-…` 점유 사유 출력. `--json`: `eligible`·`reasons` 포함.
  - `pnpm work:run --dry-run`(저장소 `WORKFLOW.md`, 시험 workflow 둘 다): 결정만 출력. 전후 `git worktree list`·`git branch -a`·`.local/runner` 파일 목록 동일, `events.jsonl` 0바이트.
  - 착수→인계: `dispatch` → `after_create` 실행 → `agent_start` → 상태 `검증` 커밋 → `handoff`. 에이전트 환경에서 `DATABASE_URL`(실행기에 설정)·`npm_*`가 빠지고 `WORK_*` 변수가 전달됨을 로그로 확인.
  - 재시도→실패: 상태를 바꾸지 않는 에이전트, `max_attempts: 2`, `backoff_seconds: 1` → `retry`(1초) → 같은 worktree에서 2번째 시도(`after_create` 재실행 없음) → `failed`.
  - 중단: 실행 중 기준 checkout에서 `보류/종료`로 바꾸자 `stop` → `stopped`, 에이전트 프로세스 그룹 소멸. 같은 실행 중 두 번째 실행기는 거부(종료 코드 1), WORKFLOW 파일을 깨뜨리면 `workflow_error` 후 마지막 정상 설정으로 계속.
  - 재시작 복구: SIGINT → `shutdown`·`interrupted`(종료 코드 130, 남은 프로세스 없음) → 다시 시작하면 `resume`(worktree 상태 `진행`) → `handoff`. SIGKILL로 실행기만 죽이면 다음 시작이 남은 그룹의 `kill -TERM -<pid>` 안내와 함께 거부되고, 그룹을 멈춘 뒤 재개됨.
  - 제한 시간: `timeout_minutes: 1` → 60초 뒤 `timeout`(exit SIGTERM) → `failed`.
  - 주기 작업: `interval_hours: 1` → `schedule` → 브랜치 `work/doc-gardening-20261001` worktree에서 `docs/development/doc-gardening.md` 프롬프트로 실행 → `schedule_done`, `.local/runner/schedules.json` 기록. 곧바로 다시 실행하면 주기 작업 없이 끝남.
  - 설정 검증: 잘못된 정수, 없는 `prompt_file`·역할, 잘못된 주기 작업 이름, 없는 프롬프트 변수를 한 번에 보고하고 종료 코드 1. 알 수 없는 인자는 사용법과 함께 종료 코드 2.
  - 기본 `agent.command` 형식(`omp -p --approval-mode yolo --no-session --max-time "${WORK_TIMEOUT_MINUTES}m" "@$WORK_PROMPT_FILE"`)을 짧은 프롬프트 파일로 실제 실행해 응답과 종료 코드 0 확인. Codex·Claude Code 예시는 `--help`로 플래그만 확인.
  - 브랜치 삭제로 점유가 풀리는 것: worktree 제거와 `git branch -D` 뒤 `work:next`에 다시 나타남.
  - 이 checkout에서 `pnpm work:check` 통과, 변경한 `.mjs`의 `eslint`·`prettier --check` 통과.
- 2026-10-01: 통합 후 변경과 실제 종단 실행. `workspace.branch_prefix` 설정을 없애고 `WORK_BRANCH_PREFIX`(`work/`) 상수로 고정(`scripts/lib/work-items.mjs`; `work:next`·`work:scope`·실행기가 같은 값 사용). 주기 작업은 기록이 없으면 기준 시각만 남기고 간격 뒤 처음 실행.
  - 주 저장소에서 `pnpm work:run --dry-run`이 착수 없이 끝나고 `.local/runner`를 만들지 않음.
  - 저장소 clone(`/tmp`, origin 제거)에 web 역할 시험 티켓 0006(문서 변경)을 `준비`로 커밋하고, 저장소 기본 `WORKFLOW.md` 그대로 `pnpm work:run --once` 실행: 실제 `after_create`(`pnpm install … && pnpm instance`) → OMP 에이전트(`omp -p …`) 실행 → 2분 후 `handoff state=검증 exit=0`. 에이전트가 `진행` 커밋 → `apps/web/README.md`·`apps/web/CHANGELOGS.md` 수정 → `pnpm work:scope 0006`·`pnpm verify --fast`·`make infra-up` 후 `pnpm verify` 통과를 진행 기록에 남기고 `검증` 커밋. 이후 `work:next --all`이 0006을 `점유 브랜치 work/0006-web-readme-verify`로 제외. worktree 인스턴스 `make instance-destroy CONFIRM=1`과 clone 삭제로 정리.
- 2026-10-01: 완료. 실제 OMP 에이전트 종단 실행까지 확인했고 `main`에 통합. Codex·Claude Code 런타임 예시는 실행하지 않음.
