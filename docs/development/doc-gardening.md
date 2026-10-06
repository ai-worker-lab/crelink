# 문서 정리 (doc-gardening)

문서가 현재 코드·설정과 어긋나지 않게 주기적으로 점검하는 절차입니다. 실행기(`pnpm work:run`)는 `WORKFLOW.md`의 `schedules.doc-gardening` 간격마다 이 파일을 그대로 에이전트 프롬프트로 씁니다([작업 실행기](agent-runner.md#주기-작업)). 사람이 같은 점검을 할 때도 이 절차를 따릅니다.

## 목표

루트 [AGENTS.md](../../AGENTS.md)의 "기준 정보와 최신성"·"진입점과 유지" 정책에 맞게, 깨진 링크·연결되지 않은 문서·코드와 다른 서술·목적이 끝난 문서가 없는 상태로 만듭니다. 판단이 필요한 문제는 고치지 않고 사람이 분류할 수 있게 등록합니다.

## 실행 환경

- 실행기가 만든 worktree에서 브랜치 `work/doc-gardening-YYYYMMDD`로 실행됩니다. 환경변수 `WORK_BRANCH`, `WORK_ROLE`(`orchestrator`), `WORK_SCHEDULE`(`doc-gardening`)을 받습니다.
- 사람의 확인 없이 실행됩니다. 배포, 데이터 파괴, 외부 공개, `git push --force`, `main` 직접 수정·병합을 하지 않습니다.

## 절차

1. 루트 `AGENTS.md`, [문서 색인](../README.md), [작업 관리](../work/README.md)를 읽습니다.
2. `pnpm docs:check`를 실행해 링크·anchor·진입점 연결·ADR 형식과 work item 링크·변경 기록 순서·`AGENTS.md` 크기·조사 문서 확인일과 출처 오류를 확인합니다.
3. 문서의 서술을 실행 가능한 원본과 대조합니다. 명령은 `package.json` scripts와 `Makefile`, 포트·환경변수는 각 `.env.example`과 `infra/local/`, 실행기 설정은 `WORKFLOW.md`, 역할 소유 경로는 `.omp/agents/*.md`의 `owns`, CI는 `.github/workflows/`가 기준입니다. 근거를 찾을 수 없는 서술은 문제로 봅니다.
4. 판단이 필요 없는 수정(깨진 링크, 바뀐 명령·경로·포트, 삭제된 기능의 안내, 색인 누락)은 직접 고칩니다. 수정은 work item과 함께 합니다. `docs/work/TEMPLATE.md` 형식으로 모든 폴더를 통틀어 다음 빈 번호에 `역할: orchestrator`, `종류: 유지보수`, `우선순위: P3 (AI 제안)` 티켓을 `docs/work/orchestrator/`에 만들고, 고친 내용과 근거를 `진행 기록`에 적고, 마칠 때 상태를 `검증`으로 둡니다. 이 브랜치 이름에는 번호가 없으므로 범위 검사는 `pnpm work:scope <번호>`로 실행합니다.
5. 판단이 필요한 문제(정책 사이의 모순, 제품 서술, 결정이 필요한 문서 삭제, 대체 여부가 불분명한 ADR)는 고치지 않고 문제마다 `상태: 분류 대기`, 우선순위 뒤 `(AI 제안)`인 work item으로 등록합니다. 근거 파일과 위치, 선택지를 적습니다.
6. 변경 기록 규칙에 따라 `CHANGELOGS.md`에 무엇을 고쳤는지 적습니다.
7. `pnpm verify --fast`를 실행해 통과를 확인하고 커밋합니다. 커밋 메시지에 만든 work item 경로를 적습니다. 원격 push와 PR은 `WORKFLOW.md`의 `workspace.push`가 `true`일 때만 `gh pr create`로 만듭니다.

## 완료 조건

- `pnpm docs:check`와 `pnpm verify --fast`가 통과합니다.
- 직접 고친 내용은 정리 티켓의 `진행 기록`에, 판단이 필요한 문제는 각각의 `분류 대기` work item에 있습니다.
- 고칠 것도 등록할 것도 없으면 커밋하지 않고 끝냅니다. 실행기는 결과를 `.local/runner/events.jsonl`의 `schedule_done` 이벤트로 남깁니다.
