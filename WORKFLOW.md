---
# pnpm work:run(scripts/runner.mjs)의 설정입니다. 키 설명과 운영 방법: docs/development/agent-runner.md
tracker:
  # work item 폴더. 하위의 epics/와 역할 폴더(docs/work/<역할>/)까지 읽습니다.
  dir: docs/work
  # 에이전트가 끝난 뒤 worktree의 work item 상태가 여기에 있으면 재시도하고, 그 밖의 상태면 인계로 끝냅니다.
  active_states: [준비, 진행]
  # 기준 checkout에서 work item이 이 상태가 되거나 삭제되면 실행 중인 에이전트를 멈춥니다.
  stop_states: [보류/종료]
polling:
  interval_seconds: 60
workspace:
  # root를 생략하면 ../<저장소 디렉터리 이름>-worktrees 입니다.
  # base는 새 작업 브랜치의 시작점이며, pnpm work:scope가 --base 없이 비교할 기준 브랜치이기도 합니다.
  base: main
  push: false
hooks:
  after_create: pnpm install --frozen-lockfile --prefer-offline && pnpm instance
  timeout_seconds: 1800
agent:
  command: omp -p --approval-mode yolo --no-session --max-time "${WORK_TIMEOUT_MINUTES}m" "@$WORK_PROMPT_FILE"
  max_concurrent: 1
  timeout_minutes: 60
  max_attempts: 3
  backoff_seconds: 60
schedules:
  doc-gardening:
    interval_hours: 168
    prompt_file: docs/development/doc-gardening.md
    role: orchestrator
---

# work item {{ item.id }}: {{ item.title }}

이 저장소의 `{{ item.role }}` 역할 코딩 에이전트로서 work item `{{ item.path }}`({{ item.level }}, {{ item.kind }}, {{ item.priority }})를 진행합니다. 사람의 확인 없이 실행되므로 아래 경계 안에서 스스로 판단합니다.

- 작업공간: `{{ workspace }}` (브랜치 `{{ branch }}`, 기준 `{{ base }}`). 이 디렉터리 밖을 수정하지 않습니다.
- 시도: {{ attempt }}번째. 두 번째 이후라면 브랜치의 기존 커밋과 work item의 `진행 기록`을 먼저 읽고 이어서 진행합니다.

## 목표

work item의 수용 기준을 실제로 모두 충족하고, 실행한 검증의 근거를 남긴 뒤 상태를 `검증`으로 바꿔 사람에게 인계합니다. 끝났을 때 상태가 `준비`·`진행`으로 남아 있으면 실행기가 같은 브랜치에서 다시 시도합니다.

## 먼저 읽을 것

- 루트 `AGENTS.md`와 바꿀 영역의 `AGENTS.md`
- `{{ item.path }}`, 그 상위·선행 work item과 연결된 문서. `연결`에 설계 문서(`docs/specs/`)가 있으면 해당 절의 계약·화면 상태·검증 계획을 따르고, 설계와 다르게 해야 하면 `진행 기록`에 이유를 적어 인계합니다.
- work item 규칙: `docs/work/README.md`. 에픽은 `docs/work/epics/`, 티켓·하위 티켓은 `docs/work/<역할>/`에 있고, 번호는 폴더와 관계없이 하나입니다.

## 완료 조건

1. 착수하면 `{{ item.path }}`의 상태를 `진행`으로 바꿔 커밋합니다(이미 `진행`이면 그대로 둡니다).
2. 역할 `{{ item.role }}`의 소유 경로 안에서만 바꿉니다. `pnpm work:scope`가 통과합니다.
3. `pnpm verify`가 통과합니다. API·웹·앱 동작을 바꿨다면 `make up`으로 이 worktree의 인스턴스를 띄우고 `pnpm smoke`도 통과시킵니다. 서비스 로그는 `pnpm logs <api|web|app|infra>`로 봅니다.
4. 실제로 확인한 수용 기준만 체크하고, `진행 기록`에 날짜와 함께 실행한 명령과 관찰한 결과를 적습니다. 실행하지 않은 검증을 통과로 적지 않습니다.
5. 영향받는 문서와 변경 기록을 같은 변경에서 갱신합니다.
6. 상태를 `검증`으로 바꿔 커밋합니다. 커밋 메시지에 `{{ item.path }}`를 적습니다.
7. 원격 push 설정은 `{{ push }}`입니다. `true`면 `git push -u origin {{ branch }}` 후 `gh pr create`로 PR을 만들고 설명에 work item 경로를 적습니다. `false`면 push하지 않습니다.

## 막히거나 범위 밖일 때

- 수용 기준을 충족할 수 없거나 사용자 결정이 필요하면 `진행 기록`에 차단 사유와 시도한 내용을 적고, 상태를 `분류 대기`로 바꿔 커밋한 뒤 끝냅니다.
- 범위 밖 개선점이나 이 하네스에 빠진 능력(검사, 명령, 문서, 로그 등)을 발견하면 직접 고치지 말고 새 work item으로 등록합니다. `docs/work/TEMPLATE.md` 형식, 모든 폴더를 통틀어 다음 빈 번호, 맡을 역할의 폴더 `docs/work/<역할>/`, `상태: 분류 대기`, 우선순위 뒤에 `(AI 제안)`을 쓰고 `pnpm work:check`로 확인합니다.

## 금지

- 배포, 데이터 파괴(볼륨·DB 삭제, 다른 worktree·브랜치 정리), 외부 공개, `git push --force`, `{{ base }}` 직접 수정·병합.
- 새로 등록한 항목 외의 다른 work item 상태 변경, 수용 기준을 기록 없이 고쳐 쓰기.
- 실제 비밀값을 파일·커밋·로그에 남기기.
