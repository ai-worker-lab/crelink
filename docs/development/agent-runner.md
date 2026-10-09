# 작업 실행기 (work:run)

`pnpm work:run`은 착수 가능한 work item마다 격리된 git worktree를 만들고 코딩 에이전트를 실행해 `검증` 상태까지 진행시키는 실행기입니다. 결정과 트레이드오프는 [ADR 0007](../adr/0007-repository-work-item-runner.md), work item 규칙은 [작업 관리](../work/README.md)가 기준입니다. 구현은 [scripts/runner.mjs](../../scripts/runner.mjs)와 [scripts/lib/runner-workflow.mjs](../../scripts/lib/runner-workflow.mjs), 설정과 프롬프트는 루트 [WORKFLOW.md](../../WORKFLOW.md)입니다.

## 개념

[OpenAI Symphony](https://github.com/openai/symphony)의 SPEC을 저장소 work item에 맞게 줄인 구현입니다.

| Symphony | 이 저장소 |
| --- | --- |
| 이슈 트래커 | `docs/work/epics/*.md`·`docs/work/<역할>/*.md` (기준 checkout의 작업 트리에서 읽음) |
| 착수 후보·정렬 | `pnpm work:next`와 같은 계산: 우선순위(`(AI 제안)` 무시) → 번호 |
| claim | `work/NNNN-<slug>` 브랜치의 존재(로컬 또는 원격) |
| 이슈별 workspace | `workspace.root/NNNN-<slug>` git worktree, 브랜치 `work/NNNN-<slug>` |
| `WORKFLOW.md` front matter·본문 | 같은 이름. 본문은 work item 프롬프트 템플릿 |
| active·terminal 상태 | `tracker.active_states`(재시도), `tracker.stop_states`(중단). 그 밖은 인계 |
| codex app-server | 셸 명령 `agent.command` (런타임 중립) |
| 재시도 backoff | `agent.backoff_seconds × 2^(시도-1)`, 최대 `agent.max_attempts`회 |
| 재시작 복구 | 점유 브랜치의 worktree 안 상태가 active인 항목을 재개 |
| 구조화 로그 | `.local/runner/events.jsonl` |

[AI 운영자](../ops/ai-operator.md)는 이 실행기와 별개입니다. 실행기는 착수 가능한 work item을 하나씩 에이전트에게 맡기는 도구이고, AI 운영자는 30분마다(Orca 자동화) 지표·실행 기록·work item을 읽고 무엇을 할지 고르는 주기 실행입니다. AI 운영자는 work item 규칙과 브랜치 점유를 똑같이 따르므로 두 쪽이 같은 티켓을 동시에 잡지 않습니다.

## 명령

```sh
pnpm work:next [--json] [--all]                       # 착수 가능한 work item. --all은 제외 사유 포함
pnpm work:run                                         # 계속 실행. Ctrl+C로 중단
pnpm work:run --once                                  # 한 번 판단하고, 그때 시작한 작업과 재시도가 끝나면 종료
pnpm work:run --dry-run                               # 재개·착수·주기 작업 결정만 출력. 파일·브랜치·worktree를 만들지 않음
pnpm work:run --print-prompt [NNNN]                   # 에이전트를 실행하지 않고 렌더링한 프롬프트만 stdout으로 출력
pnpm work:run --workflow <path>                       # 다른 WORKFLOW 파일 사용(시험·런타임 전환)
pnpm work:run --help                                  # 사용법
```

`--dry-run`은 무엇을 시작할지(결정)를, `--print-prompt`는 에이전트가 무엇을 받을지(프롬프트)를 보여 줍니다. 둘 다 훅·에이전트를 실행하지 않고 브랜치·worktree·`.local/runner/`를 만들지 않으며, `--print-prompt`는 `--once`·`--dry-run`과 함께 쓰지 않습니다(`--workflow`와는 함께 씀). `--print-prompt`의 렌더링 규칙은 실제 실행과 같습니다.

- `NNNN`을 생략하면 새 착수와 같은 조건(아래 [동작](#동작) 4)으로 고른 첫 항목을 렌더링하고 그 번호를 stderr에 알립니다. 착수할 항목이 없거나 work item 규칙 위반이 있으면 이유를 stderr에 출력하고 종료 코드 1로 끝납니다.
- `NNNN`을 주면 착수 조건과 관계없이 렌더링하고, 지금 착수 대상이 아니면 그 사유를 stderr에 적습니다.
- 값은 실행 때와 같게 채웁니다: `attempt`는 1(새 착수와 재개 모두 1번째 시도부터), `branch`·`workspace`는 그 번호의 worktree가 있으면 그 브랜치·경로(재개), 없으면 만들 예정인 `work/NNNN-<slug>`와 `<workspace.root>/NNNN-<slug>`, `base`·`push`는 `WORKFLOW.md` 값입니다. 프롬프트 본문만 stdout에 나오므로 `pnpm -s work:run --print-prompt 0012 > prompt.md`로 저장할 수 있습니다.

## 동작

실행기는 시작할 때 재개 후보를 찾고, `polling.interval_seconds`마다(작업이 끝나면 바로) 다음 순서로 tick을 실행합니다.

1. `WORKFLOW.md`를 다시 읽습니다. 해석·검증에 실패하면 `workflow_error` 이벤트를 남기고 마지막 정상 설정을 계속 씁니다. 시작할 때 실패하면 오류를 출력하고 종료합니다.
2. reconciliation: 기준 checkout의 work item이 `tracker.stop_states`(기본 `보류/종료`)가 되거나 삭제되면 해당 에이전트의 프로세스 그룹을 멈추고(`stop` → `stopped`) 재시도 대기열에서도 뺍니다.
3. 재시도 대기열에서 때가 된 항목을 빈 슬롯만큼 실행합니다.
4. 새 착수: `pnpm work:next`와 같은 조건으로 착수 가능한 항목을 슬롯(`agent.max_concurrent`)만큼 고릅니다. work item 규칙 위반이 있으면 착수를 보류합니다(`work_items_invalid`). worktree는 `workspace.base`에서 만들므로 work item이 그 브랜치에 커밋되어 있어야 합니다(아니면 `skip`).
5. 주기 작업: 마지막 실행 시각(`.local/runner/schedules.json`)에서 간격이 지났고 슬롯이 남으면 실행합니다.

착수한 항목은 다음 순서로 진행합니다.

1. `git worktree add -b work/NNNN-<slug> <workspace.root>/NNNN-<slug> <workspace.base>`. 브랜치·worktree가 이미 있으면 그대로 씁니다.
2. worktree를 새로 만든 경우에만 `hooks.after_create`, 매 시도 전에 `hooks.before_run`을 실행합니다. 실패하면 그 시도는 `failed`입니다.
3. 프롬프트를 `.local/runner/prompts/<NNNN>-<시도>.md`에 렌더링하고, `sh -c "<agent.command>"`를 worktree에서 별도 프로세스 그룹으로 실행합니다. 훅과 에이전트 출력은 `.local/runner/logs/<NNNN>.log`에 이어 씁니다. `agent.timeout_minutes`를 넘기면 그룹을 멈춥니다(`timeout`).
4. 끝나면 `hooks.after_run`을 실행하고(실패는 `hook_failed`로만 기록), **worktree 안** work item의 상태를 읽습니다(에이전트가 역할·단계를 바꿔 `pnpm work:place`로 옮겼으면 번호로 찾음). `tracker.active_states`(기본 `준비`·`진행`)면 `backoff_seconds × 2^(시도-1)`초 뒤 재시도(`retry`)하고, `max_attempts`회를 넘으면 `failed`입니다. 그 밖의 상태(`검증`, `분류 대기` 등)면 `handoff`로 끝냅니다. 에이전트의 종료 코드는 기록만 하고 판단에 쓰지 않습니다.

재시작 복구: 시작할 때 `work/NNNN-*` 브랜치의 worktree가 있고 그 안의 상태가 active이며 기준 checkout에서 멈춤 상태가 아닌 항목을 재개 후보(`resume`)로 대기열에 넣습니다. 재시도 횟수는 메모리에만 있으므로 재개는 1번째 시도부터 셉니다. 따라서 `failed`로 끝나 active 상태로 남은 항목도 다시 시작하면 재개됩니다.

## 설정 키

`WORKFLOW.md`의 YAML front matter입니다. 생략한 키는 아래 기본값을 씁니다(기준: [scripts/lib/runner-workflow.mjs](../../scripts/lib/runner-workflow.mjs)). 상대 경로는 실행기를 띄운 checkout 루트 기준입니다.

| 키 | 기본값 | 설명 |
| --- | --- | --- |
| `tracker.dir` | `docs/work` | work item 폴더. 하위의 `epics/`와 역할 폴더까지 읽음([작업 관리](../work/README.md#파일과-필드)) |
| `tracker.active_states` | `[준비, 진행]` | 에이전트 종료 후 이 상태면 재시도, 재시작 시 재개 |
| `tracker.stop_states` | `[보류/종료]` | 기준 checkout에서 이 상태가 되면 실행 중 에이전트를 멈춤 |
| `polling.interval_seconds` | `60` | tick 간격 |
| `workspace.root` | `../<저장소 디렉터리 이름>-worktrees` | worktree를 만들 디렉터리 |
| `workspace.base` | `main` | 새 작업 브랜치의 시작점. `pnpm work:scope`의 기본 비교 기준이기도 함([작업 관리](../work/README.md#명령)) |
| `workspace.push` | `false` | 프롬프트의 `{{ push }}`. `true`면 에이전트가 push 후 `gh pr create` |
| `hooks.after_create` | 없음 | worktree를 새로 만든 뒤 한 번 실행. 저장소 설정은 `pnpm install --frozen-lockfile --prefer-offline && pnpm instance` |
| `hooks.before_run` | 없음 | 매 시도 전에 실행. 실패하면 그 시도는 실패 |
| `hooks.after_run` | 없음 | 매 시도 뒤에 실행. 실패는 기록만 함 |
| `hooks.timeout_seconds` | `1800` | 훅 하나의 제한 시간 |
| `agent.command` | (필수) | worktree에서 `sh -c`로 실행할 셸 명령 |
| `agent.max_concurrent` | `1` | 동시에 실행할 에이전트(주기 작업 포함) 수 |
| `agent.timeout_minutes` | `60` | 한 시도의 제한 시간 |
| `agent.max_attempts` | `3` | 한 항목의 최대 시도 횟수 |
| `agent.backoff_seconds` | `60` | 재시도 대기의 기준값 |
| `schedules.<name>.interval_hours` | (필수) | 주기 작업 간격. `<name>`은 소문자·숫자·하이픈 |
| `schedules.<name>.prompt_file` | (필수) | 프롬프트로 쓸 파일 |
| `schedules.<name>.role` | `orchestrator` | `WORK_ROLE`로 넘길 역할 |

### 프롬프트와 환경변수

본문은 `{{ 변수 }}`만 치환하는 템플릿이며 조건문은 없습니다. 쓸 수 있는 변수는 `item.id`, `item.title`, `item.path`, `item.role`, `item.state`, `item.priority`, `item.kind`, `item.level`, `attempt`, `branch`, `base`, `workspace`, `push`입니다. 다른 변수를 쓰면 설정 오류입니다. 주기 작업의 `prompt_file`도 같은 방식으로 렌더링하며 `schedule.name`, `schedule.role`, `attempt`, `branch`, `base`, `workspace`를 쓸 수 있습니다.

`agent.command`와 훅은 다음 환경변수를 받습니다.

| 변수 | 값 |
| --- | --- |
| `WORK_ITEM_ID`, `WORK_ITEM_FILE` | work item 번호와 저장소 기준 경로. 주기 작업이면 빈 값 |
| `WORK_ROLE` | work item의 `역할` 또는 주기 작업의 `role` |
| `WORK_SCHEDULE` | 주기 작업 이름. work item이면 빈 값 |
| `WORK_PROMPT_FILE` | 렌더링한 프롬프트 파일의 절대 경로 |
| `WORK_ATTEMPT` | 1부터 시작하는 시도 번호 |
| `WORK_BRANCH` | 작업 브랜치 |
| `WORK_TIMEOUT_MINUTES` | `agent.timeout_minutes` |

실행기를 띄운 checkout의 인스턴스 값(`.local/instance.env`의 키: `DATABASE_URL`, `API_URL` 등)과 pnpm이 넣은 `npm_*` 변수, 기준 checkout의 `node_modules/.bin` 경로는 넘기지 않습니다. 각 worktree는 `after_create`의 `pnpm instance`로 자기 인스턴스 설정을 만듭니다.

## 런타임 예시

`agent.command`만 바꾸면 런타임을 바꿀 수 있습니다. 아래 플래그는 각 CLI의 `--help`로 확인했습니다(OMP v18.4.6, codex-cli 0.159.3, Claude Code 2.1.286). 실행기는 프로세스 종료와 worktree의 work item 상태만 보므로, 런타임이 비대화형으로 끝까지 실행되고 도구 승인을 묻지 않아야 합니다.

```yaml
# OMP (저장소 기본값). --max-time은 OMP 자체 제한, 실행기 제한은 agent.timeout_minutes
command: omp -p --approval-mode yolo --no-session --max-time "${WORK_TIMEOUT_MINUTES}m" "@$WORK_PROMPT_FILE"

# Codex: 프롬프트를 stdin(-)으로 받음. worktree의 git 메타데이터는 기준 저장소 .git 아래에 있으므로 쓰기 디렉터리로 추가
command: codex exec --sandbox workspace-write --add-dir "$(git rev-parse --git-common-dir)" --ephemeral - < "$WORK_PROMPT_FILE"

# Claude Code
command: claude -p --permission-mode bypassPermissions --no-session-persistence "$(cat "$WORK_PROMPT_FILE")"
```

OMP 명령은 실제로 실행해 응답을 확인했습니다. Codex와 Claude Code 예시는 플래그 존재만 확인했으므로 처음 쓸 때 `pnpm work:run --once`로 한 항목을 시험합니다.

## 운영

- **시작**: 기준 checkout(보통 `main`)에서 `pnpm work:run --dry-run`으로 결정을, 필요하면 `pnpm work:run --print-prompt`로 첫 항목이 받을 프롬프트를 확인한 뒤 `pnpm work:run`을 실행합니다. 한 checkout에서는 실행기를 하나만 띄울 수 있습니다(`.local/runner/runner.json`).
- **중단**: `Ctrl+C`(SIGINT) 또는 SIGTERM이면 실행 중인 에이전트 프로세스 그룹을 멈추고(`interrupted`) 종료합니다. worktree와 브랜치는 남고 다음 시작 때 재개됩니다. 실행기가 강제 종료되어 에이전트가 남아 있으면 다음 시작이 거부되며, 출력된 `kill -TERM -<pid>`로 멈춘 뒤 다시 시작합니다.
- **한 항목만 멈춤**: 기준 checkout에서 그 work item을 `보류/종료`로 바꿉니다(커밋하지 않아도 다음 tick에 반영).
- **관찰**: 콘솔에 이벤트가 한 줄씩 나오고, 같은 내용이 `.local/runner/events.jsonl`(`ts`, `event`, `item`, `attempt`, `detail`)에 쌓입니다. 에이전트 출력은 `.local/runner/logs/<NNNN>.log`, 실제로 넘긴 프롬프트는 `.local/runner/prompts/`에 있습니다. 진행 중 브랜치는 `pnpm work:next --all`의 점유 사유로 보입니다.
- **인계 이후**: `handoff`된 브랜치를 검토하고 병합합니다. 상태를 `완료`로 바꾸는 것은 [작업 관리](../work/README.md#진행과-연결) 규칙을 따릅니다.
- **실패 처리**: `failed`의 `reason`과 로그를 확인합니다. 다시 맡기려면 원인을 고치고 실행기를 다시 시작하면(재개) 되고, 사람이 맡으려면 worktree에서 상태를 `분류 대기`로 바꿔 커밋하거나 기준 checkout에서 `보류/종료`로 바꿉니다. 훅이 실패한 worktree는 아래 절차로 지우고 브랜치를 삭제하면 다시 착수 대상이 됩니다.
- **worktree 정리**: 병합했거나 버릴 작업은 worktree 안에서 `make instance-destroy CONFIRM=1`로 그 인스턴스의 컨테이너·볼륨·PM2를 지운 뒤, 기준 checkout에서 `git worktree remove <workspace.root>/NNNN-<slug>`와 `git branch -d work/NNNN-<slug>`(병합하지 않고 버리는 작업이면 `-D`)를 실행합니다. 브랜치를 지우면 점유가 풀립니다.

## 주기 작업

`schedules`의 각 항목은 `interval_hours`마다 브랜치 `work/<name>-YYYYMMDD`의 worktree에서 `prompt_file`을 프롬프트로 실행됩니다. 기록이 없으면(처음 실행기를 띄우면) 그 시각을 `.local/runner/schedules.json`에 기준으로만 남기고 간격이 지난 뒤 처음 실행하며, 이후 실행마다 시작 시각을 갱신합니다. 바로 한 번 돌리려면 그 파일의 해당 시각을 간격보다 이전으로 고칩니다. 주기 작업은 work item 상태를 보지 않으므로 재시도하지 않고 `schedule_done`으로 끝납니다. 슬롯은 work item과 같이 쓰며 work item 착수가 먼저입니다. 저장소 기본값은 7일(168시간)마다 [문서 정리](doc-gardening.md)를 실행합니다. 작업 브랜치 접두 `work/`는 고정값입니다(`WORK_BRANCH_PREFIX`, [scripts/lib/work-items.mjs](../../scripts/lib/work-items.mjs)).

## 안전 경계

- 실행기는 `agent.command`와 훅을 사람 확인 없이 실행합니다. 신뢰하는 저장소와 런타임에서만 실행하고, 실행 환경의 자격 증명과 네트워크 권한을 필요한 만큼으로 제한합니다.
- 에이전트는 자기 worktree에서만 실행되며, 배포·데이터 파괴·외부 공개·force push·기준 브랜치 직접 수정은 프롬프트에서 금지합니다. 원격 push는 `workspace.push: true`일 때만 지시합니다.
- 실행기 자신은 브랜치·worktree를 만들기만 하고 지우거나 push하지 않습니다. 실행기 상태는 실행기를 띄운 checkout의 `.local/runner/`에만 씁니다.
