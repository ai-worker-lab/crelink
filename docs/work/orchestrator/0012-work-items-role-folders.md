# 0012 work item 역할별 폴더

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-02

## 목적

work item이 모두 `docs/work/` 한 폴더에 있어 어느 역할의 일인지 파일 목록으로 구분하기 어렵습니다(2026-10-02 사용자 결정: 선택지 중 "역할별 폴더"). 에픽은 `docs/work/epics/`, 티켓·하위 티켓은 `docs/work/<역할>/`에 두고, 검사·옮기기 도구와 문서를 맞춥니다. 에픽·티켓·하위 티켓 3단계와 에픽 없는 독립 티켓은 그대로입니다. 이 도구는 템플릿이 원본이고 who-when이 이식해 쓰므로 템플릿에서 먼저 바꾸고 이식 절차를 남깁니다.

## 수용 기준

- [x] `scripts/lib/work-items.mjs`가 `docs/work/epics/`와 `docs/work/<역할>/`을 읽고, 에픽이 `epics/` 밖에 있거나 티켓·하위 티켓이 `역할`과 다른 폴더에 있거나, 루트에 남은 work item, 알 수 없는 폴더, 한 단계를 넘는 폴더를 옮길 위치와 고치는 명령을 담은 오류로 보고한다. 번호 중복은 폴더를 넘어 검사한다.
- [x] `pnpm work:place [NNNN ...] [--dry-run]`이 work item을 단계·역할에 맞는 폴더로 `git mv`하고, 저장소 Markdown에서 그 파일을 가리키는 상대 링크와 옮긴 파일 안의 바깥 링크를 고친다. 링크 해석은 `pnpm docs:check`와 같은 규칙이며 코드 블록·인라인 코드 안의 경로는 건드리지 않는다.
- [x] 기존 0001~0011을 이 명령으로 `docs/work/orchestrator/`로 옮긴다.
- [x] 번호로 work item을 찾는 곳(`work-scope.mjs`, `runner.mjs`, `runner-workflow.mjs`의 `tracker.dir`, `verify.mjs`, `docs-check.mjs`, `design.mjs`)이 하위 폴더를 다룬다.
- [x] 새 work item을 만드는 안내(`docs/work/README.md`, `TEMPLATE.md`, `WORKFLOW.md`, `AGENTS.md`, 경로를 말하는 문서)가 새 배치를 따른다.
- [x] ADR 0003 결정 4의 폴더 부분을 대체하는 새 ADR과 색인, ADR 0003 상태 표시.
- [x] `docs/development/adopting-harness.md`에 이미 하네스를 쓰는 저장소가 이 변경을 들이는 절차(복사할 파일, 옮기는 명령, 확인 명령)가 있다.
- [x] 일부러 잘못 둔 파일(역할 폴더의 에픽, 다른 역할 폴더의 티켓, 루트의 work item)에 `pnpm work:check`가 각각 알아듣게 실패하고 `pnpm work:place`가 고친다. 역할을 바꾼 티켓을 옮길 때 다른 문서의 링크가 고쳐진다.
- [x] `pnpm work:check`, `pnpm work`, `pnpm work:next`, `pnpm work:scope 0012`, `pnpm docs:check`, `pnpm verify`가 통과한다.

## 범위

- 포함: `scripts/`(work item 도구·링크 해석 공용 모듈), `package.json` scripts, `WORKFLOW.md`, `docs/work/`, `docs/adr/`, `docs/README.md`, `docs/alm/workflow.md`, `docs/development/`, `docs/specs/TEMPLATE.md`, `docs/product/TEMPLATE.md`, `.github/pull_request_template.md`, `.omp/skills/technical-design/SKILL.md`, 루트 `AGENTS.md`·`README.md`·`CHANGELOGS.md`.
- 제외: 과거 work item 0001~0011의 내용(위치와 상대 링크만 바뀜), 변경 기록 본문의 옛 경로 근거, who-when 저장소.

## 위험·복구

work item 파일 경로가 바뀌므로 진행 중인 다른 `work/NNNN-*` 브랜치가 옛 경로의 파일을 고치면 병합 때 이름 변경을 따라가야 합니다. 지금 템플릿에는 그런 브랜치가 없습니다. 되돌리려면 이 커밋을 `git revert`합니다.

## 연결

- [작업 관리](../README.md), [ADR 0003](../../adr/0003-work-item-hierarchy.md), [ADR 0009](../../adr/0009-work-item-role-folders.md), [기존 저장소에 하네스 적용](../../development/adopting-harness.md#이미-하네스를-쓰는-저장소-역할별-work-item-폴더)

## 진행 기록

- 2026-10-02: 생성. 사용자 결정에 따라 배치를 `docs/work/epics/`, `docs/work/<역할>/`로 확정(에픽별 폴더·이름에 역할 넣기는 ADR 0009에서 탈락).
- 2026-10-02: 구현(커밋 `0a10cbc`). `scripts/lib/work-items.mjs`에 하위 폴더 탐색(`workItemFiles`·`findWorkItemFile`)과 폴더 배치 검사, 링크 해석을 `scripts/lib/markdown-links.mjs`로 빼 `docs:check`와 공유, `scripts/lib/work-place.mjs`와 `pnpm work:place [NNNN ...] [--dry-run]`. 실행기는 worktree에서 옮겨진 work item을 번호로 찾고, `design:check` 기준선·`work:scope` 안내·`verify` 안내가 하위 폴더를 따름. `pnpm work:place`로 0001~0011을 `docs/work/orchestrator/`로 옮김(파일 안 상대 링크 32곳 수정, 변경 기록의 코드 표기 옛 경로는 지난 기록이라 그대로). 스크립트 테스트 관례가 없어 영구 테스트는 추가하지 않고 아래 임시 clone으로 확인.
- 2026-10-02: 검증. (1) `/tmp` 임시 clone에 역할 폴더 `web/`의 에픽 0013, `api/` 폴더의 `역할: web` 티켓 0014, 루트의 0015, 알 수 없는 폴더 `foo/`의 0016, `web/sub/`의 0017, `app/`의 중복 번호 0001을 만들자 `pnpm work:check`가 6건을 각각 옮길 위치·`pnpm work:place NNNN`과 함께(중복은 두 경로와 함께) 실패. 중복을 지운 뒤 `--dry-run`이 5개 이동·링크 4곳을 보이고 바꾸지 않음, `pnpm work:place`가 옮기고(추적 안 된 파일은 이름 변경) 빈 `foo/`·`web/sub/`·`api/`를 지움, `work:check`·`docs:check` 통과. 인라인 코드와 코드 블록 안의 `../api/0014-wrong-role.md`는 그대로. (2) 새 clone에서 `docs/README.md`의 `work/orchestrator/0011-…md#진행-기록`, 루트 `README.md`의 루트 기준 `/docs/work/orchestrator/0011-…md`, 0012의 `./0011-…md` 링크를 커밋한 뒤 0011의 역할을 `web`으로 바꾸자 `work:check`가 실패, `pnpm work:place 0011`이 `git mv`(R 스테이징)와 세 링크(anchor·`./` 표기·루트 기준 유지)를 고치고, 다시 실행하면 "이미 맞는 폴더", `work:check`·`docs:check` 통과. 두 clone은 확인 뒤 삭제. (3) 이 브랜치에서 `pnpm work:check`(12개), `pnpm work`, `pnpm work:next`, `pnpm work:scope 0012`, `pnpm docs:check`, `pnpm work:run --dry-run`, `pnpm work:run --print-prompt 0012`(경로 `docs/work/orchestrator/0012-…md`), `make infra-up` 후 `pnpm verify` 전체 8단계 통과(확인 뒤 `make infra-down`). 실행기의 worktree 안 번호 찾기(옮긴 work item의 상태 읽기)는 실제 에이전트 실행으로는 확인하지 않음.
