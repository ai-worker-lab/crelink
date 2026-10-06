# OpenDesign 사용 기준

디자인 역할(`designer`)과 디자인 작업은 로컬 [OpenDesign](https://github.com/nexu-io/open-design)(OD)으로 산출물을 만들고, 승인된 결과를 이 저장소 `design/`에 인계합니다. 이 문서는 저장소와 OpenDesign 사이의 연결 계약입니다. 에이전트가 따르는 작업 절차는 [opendesign 스킬](../../.omp/skills/opendesign/SKILL.md)에 있고, 결정 배경은 [디자인 ADR 0001](adr/0001-opendesign-integration.md)입니다. 확인한 OpenDesign 버전은 데스크톱 앱 0.24.1(2026-10-01)입니다.

## 역할 분담

| 무엇 | 어디 | 원본 |
| --- | --- | --- |
| 토큰 값 | `packages/design-tokens/src/tokens.json` | 저장소 |
| OpenDesign 공통 슬롯 대응 | `packages/design-tokens/src/opendesign.json` | 저장소 |
| 디자인 시스템 패키지 | `design/system/`(`DESIGN.md`는 직접 작성, `tokens.css`·`manifest.json`은 생성물) | 저장소 |
| 생성·수정·미리보기·대화 이력 | OpenDesign 프로젝트(OpenDesign 데이터 폴더) | OpenDesign |
| 구현에 넘기는 화면·상태·인계 문서 | `design/<기능>/` | 저장소 |

웹·앱 담당자와 다른 에이전트는 OpenDesign 프로젝트를 직접 보지 않아도 되도록 `design/<기능>/`만 읽습니다. OpenDesign에만 있는 결정은 저장소에서 보이지 않으므로 인계 문서에 옮깁니다.

## 준비

1. 데스크톱 앱을 설치하고 실행합니다(macOS·Windows: [open-design.ai](https://open-design.ai) 또는 GitHub Releases). 앱이 PATH의 코딩 에이전트 CLI(Claude Code, Codex 등)를 찾아 생성 런타임으로 씁니다.
2. 코딩 에이전트에 MCP 서버를 연결합니다. 데스크톱 앱 **Settings → MCP server**의 클라이언트별 설정을 씁니다. macOS 셸의 `od`는 시스템 8진수 덤프 명령(`/usr/bin/od`)이라 `od mcp install`이 다른 프로그램을 실행할 수 있습니다. OMP는 프로필의 `mcp.json`에 `open-design` 서버로 등록하며, 연결되면 `mcp__open_design_*` 도구가 `xd://` 장치로 보입니다.
3. 저장소에서 `pnpm design:sync`를 실행해 디자인 시스템을 OpenDesign에 설치합니다. 토큰이나 `design/system/DESIGN.md`를 바꿀 때마다 다시 실행합니다.

od CLI는 `pnpm od <명령>`으로 실행합니다([scripts/od.mjs](../../scripts/od.mjs)). 래퍼는 OpenDesign이 에이전트에 넣어 주는 `OD_NODE_BIN`·`OD_BIN`, 없으면 데스크톱 앱 내장 런타임(`OPEN_DESIGN_APP`, 기본 `/Applications/Open Design.app`)을 쓰고, 실행 중인 데몬을 sidecar 소켓으로 찾습니다(`OD_DAEMON_URL`로 덮어쓰기)([scripts/lib/opendesign.mjs](../../scripts/lib/opendesign.mjs)).

## 디자인 시스템 패키지

`design/system/`은 OpenDesign 디자인 시스템 패키지 형식(`manifest.json`, `DESIGN.md`, `tokens.css`)입니다. OpenDesign은 활성 디자인 시스템의 `DESIGN.md`와 `tokens.css`를 모든 생성 프롬프트에 넣으므로, 프로젝트에 이 패키지를 지정하면 OpenDesign이 만든 화면이 웹·앱과 같은 토큰을 씁니다.

- `tokens.css`는 앱 토큰 CSS 변수 전체와 OpenDesign 공통 슬롯(`--bg`, `--fg`, `--accent`, `--text-*`, `--space-*` 등)을 한 `:root`에 둡니다. 앱 토큰 변수 이름의 접두사는 `packages/design-tokens/src/tokens.json`의 `"$cssPrefix"`가 정하고, 지금의 `--ds-*`는 그 설정의 결과입니다([CSS 변수 접두사](../../packages/design-tokens/docs/usage.md#css-변수-접두사)). 슬롯 값은 `opendesign.json`에서 토큰을 참조(`"{color.action.primary}"`)하거나 색이 아닌 값(`1.65`, `150ms`)을 씁니다. 색 리터럴은 생성기가 거부합니다.
- 생성기(`pnpm tokens:generate`)는 OpenDesign 공통 슬롯이 빠지면 실패하고, 빠진 슬롯 전체를 쓰임새·값 형식과 함께 한 번에 보여 줍니다. 슬롯 목록은 OpenDesign [token-schema.ts](https://github.com/nexu-io/open-design/blob/main/packages/contracts/src/design-systems/token-schema.ts)를 따릅니다. 빠진 슬롯은 산출물의 `var()`를 비워 규칙을 깨뜨립니다.
- `DESIGN.md`는 OpenDesign 프롬프트에 들어가므로 실제 토큰 변수 이름을 씁니다. `pnpm design:check`가 이 문서의 인라인 코드 변수 이름(`--<접두사>-color-...`, `--<접두사>-space-*`)을 토큰 원본과 대조합니다.
- `pnpm design:sync`([scripts/design.mjs](../../scripts/design.mjs))는 패키지를 OpenDesign 사용자 디자인 시스템 `user:<manifest.id>`(이 저장소는 `user:crelink`)로 설치합니다.
  - 처음에는 데몬의 디자인 시스템 설치 API로 패키지를 그대로 설치하고 현재 Workspace에 묶습니다. Workspace에 묶이지 않은 사용자 디자인 시스템은 프로젝트가 찾지 못합니다(`DESIGN_SYSTEM_NOT_FOUND`). Workspace는 기존 OpenDesign 프로젝트에서 읽으므로, 프로젝트가 하나도 없으면 앱에서 하나 만든 뒤 실행하거나 `OD_WORKSPACE_ID`·`OD_WORKSPACE_MEMBER_ID`를 지정합니다.
  - 이미 설치되어 있으면 세 파일을 OpenDesign 데이터 폴더(`OD_DATA_DIR`, 없으면 데스크톱 앱 기본 위치)의 `design-systems/<manifest.id>/`에 덮어씁니다.
  - 0.24.1의 local 설치는 설치 폴더를 임시 원본 폴더의 심볼릭 링크로 만들 수 있습니다. 설치 직후 링크면 실제 폴더 사본으로 바꾸고, 이전 설치가 지워진 임시 폴더를 가리키는 끊긴 링크로 남아 있으면 링크를 지우고 다시 설치합니다.
  - 사용자 디자인 시스템은 기본이 draft이고 draft는 프로젝트에 지정할 수 없으므로(`DESIGN_SYSTEM_NOT_PUBLISHED`) 설치 폴더의 `metadata.json`을 published로 둡니다. 끝에 프로젝트와 같은 Workspace 범위에서 published로 보이는지 확인합니다.
  - 데몬 주소는 `OD_DAEMON_URL`, 없으면 실행 중인 Open Design 프로세스의 로컬 포트에서 찾습니다(데스크톱 앱은 실행마다 포트가 바뀜).
  - `od design-systems import-local`은 폴더를 코드 프로젝트로 보고 `DESIGN.md`를 새로 추출해 이 문서를 버리므로 쓰지 않습니다.
- 새 OpenDesign 프로젝트를 만들 때 `designSystem: "user:<id>"`를 지정합니다.

## 산출물과 인계

승인된 산출물은 `design/<기능>/`(kebab-case)에 둡니다. `shared`, `system`, `docs`는 예약된 폴더입니다.

```text
design/<기능>/
├── handoff.md     # 인계 문서(필수)
├── index.html     # 대표 화면. 상태·화면별 파일을 더 둘 수 있음
└── assets/        # 산출물이 쓰는 이미지·아이콘(선택)
```

- OpenDesign 산출물은 첫 `<style>`에 `tokens.css`의 `:root` 블록을 붙여 넣습니다. 저장소로 옮길 때는 그 블록을 `<link rel="stylesheet" href="../system/tokens.css">`로 바꿉니다. 그러면 토큰을 바꿨을 때 산출물도 함께 바뀌고, 색 리터럴 금지([ADR 0001](../../docs/adr/0001-design-tokens.md))를 지킵니다.
- 산출물은 웹·앱이 런타임에 불러오지 않습니다. 구현 담당자는 화면·상태·토큰 이름을 자기 코드로 옮깁니다.

### 인계 문서

`handoff.md`는 다음을 담습니다. 구현 담당자가 OpenDesign 없이 판단할 수 있어야 합니다.

- 대상: 관련 work item·제품 요구 링크, OpenDesign 프로젝트 id와 대표 파일
- 화면과 상태: 파일별 화면, 로딩·성공·빈 상태·오류·비활성 상태와 전이
- 반응형: 확인한 폭(데스크톱 1280px, 휴대폰 390px)과 바뀌는 배치
- 컴포넌트와 토큰: 쓰는 컴포넌트, 새로 필요한 토큰(있으면 `tokens.json` 변경 포함 여부)
- 상호작용·접근성: 키보드·초점·대비·모션 결정
- 기술 검토: 여러 역할이 구현하는 기능이면 `orchestrator`의 디자인 기술 검토 결과(설계 문서 `docs/specs/<에픽>.md`의 `디자인 검토 의견` 링크)와 반영 내용([기술 설계와 티켓 분해](../../docs/specs/README.md))
- 검증: 실행한 `pnpm design:check --require-lint` 결과, 미리보기·스크린숏 확인 범위, 확인하지 못한 것

## 검사

`pnpm design:check`([scripts/design.mjs](../../scripts/design.mjs))는 `pnpm verify`의 한 단계입니다.

- `design/`의 HTML `<style>`·`style` 속성과 CSS에서 색 리터럴(hex, `rgb()`, `hsl()` 등)을 찾습니다. 생성물 `design/shared/tokens.css`, `design/system/tokens.css`는 제외합니다.
- 산출물 CSS의 `var(--...)`와 `design/system/DESIGN.md`의 변수 이름을 토큰 원본과 대조합니다. 현재 접두사로 시작하는데 없는 토큰, 다른 접두사 뒤에 토큰 경로가 붙은 이름(접두사를 바꾼 뒤 남은 `--<이전>-color-...`)은 고칠 이름과 함께 실패입니다. 산출물이 직접 선언한 변수(`--card-gap: ...`)는 대조하지 않습니다.
- 산출물 HTML이 있는 `design/<기능>/`에 `handoff.md`가 있는지 봅니다.
- OpenDesign이 실행 중이면 산출물 HTML마다 `od lint`(anti-slop 검사: 보라 그라디언트, 자리표시 문구, `:root` 밖 raw hex 등)를 돌려 P1 이상을 실패로 봅니다. OpenDesign이 없거나 꺼져 있으면 건너뛰고, 디자인 인계 전에는 `pnpm design:check --require-lint`로 건너뛰기를 실패로 바꿉니다.

### 이식 전 산출물 기준선

기존 저장소에 이 하네스를 적용할 때, 이식 전에 만든 `design/<기능>/` 산출물이 위 규칙(색 리터럴, `handoff.md`, 토큰 이름, `od lint`)을 어기면 `design/.check-baseline.json`에 영역을 올려 그 영역의 실패를 알림으로 낮춥니다. 새 산출물을 위한 예외가 아니며, 이 템플릿에는 기준선 파일을 두지 않습니다.

```json
{
  "areas": {
    "mvp-timeline": { "reason": "하네스 이식 전 산출물. 임시 색을 리터럴로 정의하고 handoff.md가 없음", "workItem": "0021" }
  }
}
```

- 영역을 올리기 전에 정리 work item을 반드시 만들고 `workItem`에 번호를 적습니다. 알림은 `[기준선, 0021에서 정리]`처럼 번호를 붙여 출력합니다. 기준선에 없는 영역은 그대로 실패입니다.
- 기준선 영역의 새 실패도 알림으로만 보이므로 정리 work item은 미루지 않습니다. 영역에 낮출 실패가 하나도 없으면 기준선에서 지우라는 알림이 나옵니다. 정리가 끝나면 항목을 지우고, 영역이 모두 없어지면 파일을 지웁니다.
- 파일이 없으면 기준선 없이 검사합니다. JSON 문법 오류, `areas` 밖의 키, 없는 영역 폴더·예약 폴더(`shared`·`system`·`docs`), 빈 `reason`, 네 자리가 아니거나 `docs/work/`에 없는 `workItem`은 실패입니다.

## 제약

- 폴더를 OpenDesign 프로젝트로 연결하는 `od project import-folder`는 데스크톱 앱의 가져오기 토큰이 필요해 에이전트가 쓸 수 없습니다. 저장소 파일을 OpenDesign에 넣을 때는 MCP `write_file`·`create_artifact`를 씁니다.
- OpenDesign 데이터 폴더 구조와 기본 위치는 OpenDesign 내부 계약이라 버전에 따라 바뀔 수 있습니다. `pnpm design:sync`가 등록 확인에 실패하면 `OD_DATA_DIR`을 확인합니다.
- 미리보기·Studio 주소는 데몬 세션 동안만 유효합니다. 인계 문서에는 주소 대신 프로젝트 id와 파일 경로를 적습니다.
