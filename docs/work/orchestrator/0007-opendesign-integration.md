# 0007 OpenDesign 연결 강화

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

디자인 역할이 로컬 OpenDesign을 저장소 기준(토큰·인계·검사)에 맞게 쓰도록, OpenDesign의 기능(MCP 도구, od CLI, 디자인 시스템 패키지, skill·template·plugin, lint·export)을 조사해 저장소와 에이전트 절차에 연결합니다.

## 수용 기준

- [x] `pnpm tokens:generate`가 `tokens.json`과 `opendesign.json`으로 OpenDesign 디자인 시스템 패키지(`design/system/tokens.css`·`manifest.json`)를 만들고, OpenDesign 공통 슬롯 누락·슬롯 색 리터럴을 거부한다.
- [x] `pnpm design:sync`가 패키지(`DESIGN.md` 포함)를 OpenDesign에 그대로 설치하고 프로젝트에 지정할 수 있는 `user:<id>`(Workspace 연결, published)로 확인한다.
- [x] `pnpm design:check`가 `design/` 산출물의 색 리터럴과 `handoff.md` 누락을 실패로 보고하고, OpenDesign이 실행 중이면 `od lint` P1 이상을 실패로 본다. `pnpm verify`에 포함되고 OpenDesign이 없으면 lint만 건너뛴다.
- [x] `pnpm od <명령>`이 macOS의 `/usr/bin/od`와 겹치지 않게 로컬 OpenDesign CLI를 실행한다.
- [x] `designer`가 `opendesign` 스킬(`.omp/skills/opendesign/SKILL.md`)을 자동으로 읽고, OpenDesign MCP 도구를 `xd://`로 호출할 수 있다.
- [x] 연결 계약 문서(`design/docs/opendesign.md`)와 디자인 ADR 0001이 있고 색인·지도·관련 문서가 일치한다.

## 범위

- 포함: `packages/design-tokens`(생성기·`opendesign.json`·경고 색 토큰), `design/system/`, `design/docs/`, `scripts/design.mjs`·`od.mjs`·`lib/opendesign.mjs`, `scripts/verify.mjs`, `.omp/agents/designer.md`, `.omp/skills/opendesign/`, 관련 문서.
- 제외: 실제 서비스 화면 디자인 생성(사용자 brief 확인이 필요), OpenDesign 자체 설정 변경.

## 위험·복구

`pnpm design:sync`는 사용자 OpenDesign 데이터 폴더의 `design-systems/<id>/`에 파일을 씁니다. 지우려면 그 폴더를 삭제합니다.

## 연결

- [OpenDesign 사용 기준](../../../design/docs/opendesign.md), [디자인 ADR 0001](../../../design/docs/adr/0001-opendesign-integration.md), [ADR 0001 디자인 토큰](../../adr/0001-design-tokens.md)

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: 조사(OpenDesign 데스크톱 0.24.1, MCP·od CLI·데몬). MCP 도구 22개, od CLI(`lint`·`export`·`design-systems`·`project`·`plugin`·`skill`), skill 163개·design template 125개·plugin 460개, 디자인 시스템 패키지 계약(`manifest.json`·`DESIGN.md`·`tokens.css`, 공통 슬롯 token-schema)을 확인. `import-local`은 `DESIGN.md`를 새로 추출하고, 데이터 폴더에 파일만 두면 프로젝트 지정이 `DESIGN_SYSTEM_NOT_FOUND`(Workspace 미연결)·`DESIGN_SYSTEM_NOT_PUBLISHED`(draft)로 실패함을 실제로 재현해 설치 API + published 방식으로 정함. 시험 중 만든 추출본 `user:system`은 지움.
- 2026-10-01: 검증.
  - `pnpm tokens:generate`: 생성물 6개. `opendesign.json`에서 `--warn`을 빼면 "공통 슬롯 없음", `--focus-ring`에 `#6366f1`을 넣으면 "색 리터럴" 오류로 실패, 복구 후 `tokens:check` 통과.
  - `pnpm design:sync`: 설치 폴더를 지운 상태에서 기존 Workspace 연결을 다시 쓰고 published로 확인, 다시 실행해도 통과. MCP `create_project`에 `designSystem: "user:crelink"`을 주어 프로젝트가 만들어지고(`designSystemId: user:crelink`) 시험 프로젝트는 지움. Workspace 범위 목록에서 다른 멤버 id로는 보이지 않음을 확인.
  - `pnpm design:check`: 시험 산출물(보라 그라디언트·lorem ipsum·hex 17개, `handoff.md` 없음)에서 색 리터럴·인계 문서·`od lint` P0 2건·P1 1건으로 실패. 토큰 링크·`var(--ds-*)`만 쓰고 `handoff.md`를 둔 산출물은 `--require-lint`까지 통과. 시험 파일은 지움.
  - `pnpm od --help`, `pnpm od design-systems show user:crelink` 동작.
  - designer subagent가 `xd://mcp__open_design_list_projects`·`list_agents`를 호출해 프로젝트 5개·런타임 6개를 읽음. 새 OMP 세션(`omp -p`)에서 `skill://opendesign`이 읽히고 designer의 `autoloadSkills: opendesign` 확인.
  - `pnpm verify --fast` 6단계 통과.
  - 확인하지 않은 것: 실제 산출물 생성 run(사용자 brief 확인이 필요해 실행하지 않음), 디자인 시스템이 생성 프롬프트에 실제로 들어가는지.
- 2026-10-01: 완료.
