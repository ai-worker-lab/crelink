---
name: opendesign
description: 로컬 OpenDesign으로 화면 프로토타입·디자인 시스템·디자인 검토·덱·이미지를 만들거나 고치고 design/에 인계할 때 읽는다. MCP mcp__open_design_* 도구 순서, 작업별 skill·template·plugin 선택, 인계·검사 절차.
---

# OpenDesign 작업 절차

저장소와 OpenDesign의 연결 계약(파일 위치, 디자인 시스템 패키지, 인계 문서 형식, 검사)은 `design/docs/opendesign.md`가 기준입니다. 이 스킬은 그 계약 안에서 일하는 순서입니다.

## 도구

- MCP: `xd://mcp__open_design_<도구>`에 JSON 인자를 씁니다. 먼저 `list_projects`로 연결을 확인합니다. 실패하면 Open Design 앱 실행과 MCP 연결(`design/docs/opendesign.md#준비`)을 사용자에게 요청하고 멈춥니다.
- CLI: `pnpm od <명령>`. 셸의 `od`를 쓰지 않습니다(macOS 시스템 명령). 자주 쓰는 명령: `pnpm od lint <html> --fail-on p1`, `pnpm od export <file> --project <id> --format image|pdf|html|pptx --out <경로>`, `pnpm od design-systems list`, `pnpm od plugin info <id>`.
- 저장소: `pnpm design:sync`(디자인 시스템 설치), `pnpm design:check --require-lint`(인계 검사), `pnpm tokens:generate`(토큰·패키지 생성).

## 새 산출물

1. `pnpm design:sync`를 실행합니다. 출력의 디자인 시스템 id(`user:<id>`)를 기억합니다.
2. `collect_brief`로 brief 카드를 엽니다(`artifactType`: website · product-prototype · presentation · document · image · video · audio · design-system, `locale`: 사용자 언어). 사용자가 카드를 마치면 `confirm_brief`로 확인합니다. **확인 전에는 `start_run`을 호출하지 않습니다.** 사용자가 질문 생략을 명시한 경우에만 `skip: true`.
3. `create_project`에 `name`, `designSystem: "user:<id>"`, 필요하면 `skill`을 줍니다.
4. 실행할 런타임은 `list_agents`의 id에서 고르고, skill·template·plugin id는 `list_skills`·`list_plugins`로 존재를 확인합니다(아래 표는 0.24.1 기준).
5. `start_run`: `project`, `prompt`(brief 요약 + 화면 상태·반응형 요구 + `design/system/DESIGN.md` 규칙 준수), `skill`/`skills` 또는 `plugin`+`inputs`, `requestId`(UUID를 한 번 만들어 재시도에도 그대로). 같은 run이 진행 중이면 다시 시작하지 않습니다.
6. `get_run`을 끝날 때까지(`succeeded`·`failed`·`canceled`) 확인합니다. `failureAction: "recharge"`면 `rechargeUrl`을 사용자에게 보여 주고, 충전 확인 후 같은 `requestId`와 `resume: true`로 한 번만 다시 호출합니다.
7. 검토: 미리보기 주소(`get_project`의 `previewUrl`)를 브라우저 도구로 1280px·390px에서 확인하고, 필요하면 `critique` template이나 `plan-design-review` skill로 검토 run을 돌립니다. 고칠 점은 같은 프로젝트에 `start_run`(또는 `od-design-refine` plugin)으로 반영합니다.
8. 기술 검토: 여러 역할이 구현하는 기능(새 API·데이터가 필요한 화면)은 사용자 승인 전에 `orchestrator`에게 구현 가능성 검토를 요청합니다(`docs/specs/README.md`). 돌아온 `디자인 검토 의견`을 반영하고, 반영 결과를 `handoff.md`의 기술 검토 항목에 적습니다.
9. 인계: 아래 [인계](#인계)를 따릅니다.

## 기존 산출물 고치기

- 사용자가 "열어 둔 것"이라고 하면 `get_active_context`로 프로젝트·파일을 확인합니다(약 5분 활동이 없으면 만료).
- 내용 파악은 `get_artifact`(엔트리와 참조 파일을 한 번에)를 먼저 쓰고, 개별 파일은 `get_file`, 위치 찾기는 `search_files`를 씁니다.
- 수정은 `start_run`으로 OpenDesign에 맡깁니다. 작은 문구·토큰 교체만 `write_file`로 직접 고칩니다. OpenDesign이 관리하는 내부 파일(`.od-skills/` 등)은 고치지 않습니다.
- 프로젝트 삭제(`delete_project`)는 사용자가 명시적으로 요청한 경우에만, 프로젝트를 지정해 실행합니다.

## 작업별 선택

| 작업 | 우선 쓰는 id | 종류 |
| --- | --- | --- |
| 웹 화면·대시보드·문서 페이지 | `web-prototype`, `dashboard`, `docs-page`, `saas-landing` | template |
| 모바일 앱 화면·온보딩 | `mobile-app`, `mobile-onboarding` | template |
| 제품 요구·스펙 한 장 | `pm-spec` | template |
| 디자인 시스템·`DESIGN.md` 작성 | `design-md`, `reference-design-contract`, `design-consultation`, `brand-extract`(참고 사이트에서 추출) | skill |
| 디자인 검토 | `critique`(5축 점수), `plan-design-review`(0~10 평가·AI 티 점검), `web-design-guidelines`(웹 UI 규칙), `platform-design`(HIG·Material·WCAG), `review-animations` | template·skill |
| 다듬기·조절 | `impeccable-design-polish`, `tweaks`(파라미터 패널) | skill·template |
| 기존 화면 개선 | `redesign-existing-projects`, `od-design-refine` | skill·plugin |
| 덱·발표 | `guizang-ppt`, `html-ppt-*` | template |
| 이미지·영상 | `od-media-generation`, `hyperframes` 계열 | plugin·template |

`od-react-export`·`od-nextjs-export`·`od-vue-export` plugin은 코드 초안을 만들 뿐입니다. 웹·앱 코드는 `web`·`app` 역할이 소유하므로 디자인 역할은 결과를 인계 문서의 참고로만 남깁니다.

## 인계

1. `design/<기능>/`(kebab-case)를 만들고 `get_artifact`(`include: "auto"`) 결과를 옮깁니다. 이미지 등 바이너리는 `pnpm od export ... --format image`로 받습니다.
2. 붙여 넣어진 `:root { ... }` 토큰 블록을 `<link rel="stylesheet" href="../system/tokens.css">`로 바꾸고, 남은 색 리터럴을 토큰 CSS 변수 `var(--<접두사>-*)`로 바꿉니다. 접두사는 `packages/design-tokens/src/tokens.json`의 `$cssPrefix`이고 쓸 수 있는 이름은 `design/system/tokens.css`에 있습니다. 필요한 색 토큰이 없으면 `packages/design-tokens/src/tokens.json`에 쓰임새 이름으로 추가하고 `pnpm tokens:generate`·`pnpm design:sync`를 실행합니다.
3. `handoff.md`를 `design/docs/opendesign.md#인계-문서` 항목대로 씁니다. OpenDesign 프로젝트 id를 적고, 세션 한정인 미리보기 주소는 적지 않습니다.
4. `pnpm design:check --require-lint`가 통과해야 인계합니다. 결과와 확인한 폭·상태를 work item `진행 기록`과 보고에 남깁니다.

## 지킬 것

- 사용자에게 보이는 실행 방식 이름은 "OpenDesign Cloud"와 "Local Codex"만 씁니다. 런타임 id, draft id, nonce, `pluginWorkflowId`는 보여 주지 않습니다.
- OpenDesign Cloud를 쓰면 로그인 상태(`get_vela_login_status`)를 먼저 확인하고, 로그인되지 않았으면 `start_vela_login`을 한 번 호출해 활성화 주소·코드를 보여 준 뒤 로그인될 때까지 확인합니다.
- 실행하지 않은 미리보기·lint·검토를 확인했다고 보고하지 않습니다.
