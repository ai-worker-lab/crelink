# ADR 0001: OpenDesign 연결 방식

- 날짜: 2026-10-01
- 상태: 승인
- 범위: `design/`, `packages/design-tokens`(OpenDesign 패키지 생성), `.omp/agents/designer.md`, `.omp/skills/opendesign/` (디자인)

## 배경

- 디자인 역할은 로컬 OpenDesign(데스크톱 앱 0.24.1)으로 산출물을 만듭니다. OpenDesign 프로젝트 파일과 대화 이력은 OpenDesign 데이터 폴더에 있어, 저장소에서 일하는 다른 에이전트에게는 보이지 않습니다.
- OpenDesign은 활성 디자인 시스템 패키지(`DESIGN.md`, `tokens.css`)를 모든 생성 프롬프트에 넣습니다. 패키지가 없으면 기본 디자인 시스템을 써서 저장소 토큰과 다른 색·간격이 나옵니다.
- OpenDesign의 `tokens.css` 계약은 `--bg`, `--accent` 같은 공통 슬롯 이름을 쓰고, 저장소는 `--ds-*` 이름을 씁니다([ADR 0001 디자인 토큰](../../../docs/adr/0001-design-tokens.md)).
- `od design-systems import-local`은 폴더를 코드 프로젝트로 보고 `DESIGN.md`를 새로 추출합니다. 폴더 연결(`od project import-folder`)은 데스크톱 가져오기 토큰이 필요해 에이전트가 쓸 수 없습니다.
- 사용자 디자인 시스템은 Workspace에 묶이고 published 상태여야 프로젝트에 지정할 수 있습니다. 데이터 폴더에 파일만 두면 목록에는 보이지만 프로젝트 생성이 `DESIGN_SYSTEM_NOT_FOUND`·`DESIGN_SYSTEM_NOT_PUBLISHED`로 실패합니다.

## 결정

1. **디자인 시스템 패키지 생성**: `pnpm tokens:generate`가 `tokens.json`과 `opendesign.json`(공통 슬롯 → 토큰 참조)으로 `design/system/tokens.css`·`manifest.json`을 만듭니다. `tokens.css`에는 `--ds-*`와 공통 슬롯을 함께 둡니다. 공통 슬롯이 빠지거나 슬롯에 색 리터럴을 쓰면 생성이 실패합니다. `design/system/DESIGN.md`는 `designer`가 씁니다.
2. **설치**: `pnpm design:sync`가 처음에는 데몬의 설치 API(`POST /api/design-systems/install`, source: local)로 패키지를 그대로 설치해 현재 Workspace에 묶고, 이후에는 설치 폴더에 파일을 덮어씁니다. 설치 폴더 `metadata.json`의 상태를 published로 두고, 프로젝트와 같은 Workspace 범위에서 보이는지 확인합니다. `import-local`은 쓰지 않습니다.
3. **인계 위치**: 승인된 산출물은 `design/<기능>/`에 스냅숏으로 옮기고 `handoff.md`를 씁니다. 붙여 넣은 `:root` 블록은 `../system/tokens.css` 링크로 바꿉니다. OpenDesign 프로젝트는 작업 공간이고, 구현의 기준은 저장소 스냅숏입니다.
4. **기계 검사**: `pnpm design:check`가 색 리터럴, `handoff.md` 존재, (OpenDesign 실행 시) `od lint` P1 이상을 검사하고 `pnpm verify`에 포함합니다. OpenDesign이 없는 환경(CI)에서는 `od lint`만 건너뜁니다.
5. **에이전트 절차**: `designer`는 `opendesign` 스킬을 자동으로 읽고(`autoloadSkills`), MCP `mcp__open_design_*` 도구로 brief 확인 → 프로젝트 생성(디자인 시스템 지정) → 실행 → 검토 → 인계 순서를 따릅니다.

## 결과와 트레이드오프

- OpenDesign 산출물이 웹·앱과 같은 토큰을 쓰고, 토큰을 바꾸면 `tokens:generate` → `design:sync`로 OpenDesign에도 반영됩니다.
- 인계 스냅숏은 OpenDesign 프로젝트와 따로 관리되므로, OpenDesign에서 다시 고치면 스냅숏을 다시 옮겨야 합니다. 저장소 스냅숏이 기준이라는 점을 인계 문서에 적습니다.
- `design:sync`는 OpenDesign의 공개 CLI가 아닌 데몬 HTTP API, 데이터 폴더 위치, `metadata.json` 형식에 의존합니다. OpenDesign 버전이 바뀌면 `design:sync`의 마지막 확인(Workspace 범위 published)이 실패로 알려 주므로, 그때 이 결정을 다시 검토합니다.
- `od lint`는 로컬에서만 돌기 때문에 CI 통과가 anti-slop 검사 통과를 뜻하지 않습니다. 인계 전 `--require-lint`로 보완합니다.
