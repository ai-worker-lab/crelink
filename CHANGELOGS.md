# 변경 기록

내부 참고용 전체 변경 기록입니다. 공개·배포 여부와 관계없이 모든 변경을 기록합니다. 이 파일에는 전용 로그가 없는 `design/`, `packages/`, `docs/`, `.github/`, 루트 설정·정책 변경과 여러 영역에 걸친 작업의 요약을 둡니다. 영역별 세부 변경은 [인프라](infra/CHANGELOGS.md), [백엔드 API](apps/api/CHANGELOGS.md), [웹](apps/web/CHANGELOGS.md), [앱](apps/app/CHANGELOGS.md) 로그에 있습니다.

공개 릴리스 노트는 [RELEASES](RELEASES.md)에 있습니다. 작성 규칙은 [저장소 공통 정책의 변경 기록](docs/development/repository-policy.md#변경-기록)을 따릅니다.

## 2026-10-06

- `ai-worker-lab/skeleton-repository` 템플릿에서 `crelink`로 초기화: 패키지 범위 `@crelink/*`, 저장소 `ai-worker-lab/crelink`, 로컬 포트 API 3020·웹 5193·Expo 8101·PostgreSQL 5452·Valkey 6399.
- 서비스 기획 및 MVP Handoff 제안 문서를 참고 자료(확정 결정 없음)로 `docs/product/crelink-mvp-handoff.md`(PDF 사본 포함)에 두고 문서 색인과 README에 연결.

## 2026-10-02

- work item 역할별 폴더: 에픽은 `docs/work/epics/`, 티켓·하위 티켓은 `docs/work/<역할>/`(ADR 0009, ADR 0003 결정 4 일부 대체). `pnpm work:check`가 폴더 배치를 검사하고 옮길 위치·명령을 안내, `pnpm work:place [NNNN ...] [--dry-run]`이 `git mv`와 상대 링크 수정을 함께 함(링크 해석은 `docs:check`와 공용 `scripts/lib/markdown-links.mjs`), 기존 0001~0011을 `docs/work/orchestrator/`로 옮김, 실행기·`work:scope`·`design:check`가 하위 폴더를 다룸, 작업 관리·실행기·이식 문서 갱신. 근거 `docs/work/orchestrator/0012-work-items-role-folders.md`.

## 2026-10-01

- 하네스 이식성 개선(who-when 이식에서 드러난 템플릿 고유 값 가정 정리). 근거 `docs/work/0011-harness-adoption-fixes.md`.
  - 슬롯 0 포트 원본을 `infra/local/.env.example`(`API_PORT`·`WEB_PORT`·`EXPO_PORT`·`POSTGRES_PORT`·`VALKEY_PORT`) 하나로 모음: `pnpm instance`·`scripts/init-project.mjs`가 이 파일에서 읽고, 원본을 바꾸면 `pnpm instance`가 `.local/instance.env`를 다시 만듦. `pnpm instance --get <KEY>` 추가, 웹·앱 개발 서버는 변수가 없으면 이 checkout 인스턴스 포트를 씀, API `PORT` 필수, Compose 포트 기본값 제거, CI smoke는 인스턴스 값 사용, 문서의 포트 숫자는 `pnpm instance` 안내로 바꿈. 세부는 [인프라](infra/CHANGELOGS.md)·[API](apps/api/CHANGELOGS.md)·[웹](apps/web/CHANGELOGS.md)·[앱](apps/app/CHANGELOGS.md) 로그.
  - 토큰 CSS 변수 접두사를 `packages/design-tokens/src/tokens.json`의 `$cssPrefix` 한 곳에서 정함(`packages/design-tokens/scripts/source.mjs`). 생성기와 `pnpm design:check`가 이 값을 읽고, design:check는 산출물·`design/system/DESIGN.md`의 다른 접두사·없는 토큰 변수를 고칠 이름과 함께 보고. `opendesign.json` 슬롯 누락은 빠진 슬롯 전체를 쓰임새·값 형식과 함께 한 번에 안내.
  - `pnpm design:check` 기준선 `design/.check-baseline.json`: 기준선 영역의 실패는 정리 work item 번호를 붙인 알림, 기준선에 없는 영역은 실패([이식 전 산출물 기준선](design/docs/opendesign.md#이식-전-산출물-기준선)). `pnpm design:sync`가 OpenDesign 0.24.1 local 설치의 staging 심볼릭 링크를 실제 폴더로 바꾸고 끊긴 링크로 남은 이전 설치를 복구.
  - `pnpm docs:check`가 조사 문서의 `- 확인일: YYYY-MM-DD (메모)`와 맨 URL 출처를 받고(날짜 형식 오류·출처 없음은 실패), ADR이 work item에 링크하면 실패. ADR 0008은 템플릿 work item 대신 [작업 실행기](docs/development/agent-runner.md)에 링크하고 포트 숫자를 쓰지 않음. [저장소 공통 정책](docs/development/repository-policy.md#adr)에 규칙 추가.
  - `pnpm work:run --print-prompt [NNNN]`(에이전트·브랜치·worktree 없이 렌더링된 프롬프트 출력)과 `--help`. `pnpm work:scope` 기본 기준을 `origin/main`에서 `WORKFLOW.md` `workspace.base`와 `origin/<같은 이름>` 중 HEAD와의 머지 베이스가 더 가까운 쪽으로 바꿔, 로컬 기준 브랜치가 origin보다 앞서도 티켓 변경만 셈(`--base` 명시인 CI 동작은 그대로).
  - 루트 README를 템플릿 안내(`template:start`~`template:end`)와 하네스 사용 안내(`harness:start`~`harness:end`)로 나눔. [기존 저장소에 하네스 적용](docs/development/adopting-harness.md) 추가(파일 묶음, 치환 규칙, ADR 재번호, 정책 앵커, 디자인 기준선, 조사 문서 위치, `pnpm instance` 첫 실행, 검증 순서). 제품 탐색 문서·`product-discovery` 스킬에 기존 조사 문서·PRD를 옮기지 않고 연결하는 규칙 추가.
  - smoke의 웹 검사를 화면 문구와 무관한 불변 조건(200, 내용 렌더링, 콘솔 오류 없음, 가로 넘침 없음)으로 바꿈. 화면별 시나리오는 통합 티켓의 E2E 몫(`tests/smoke/smoke.spec.ts`, [검증 루프](docs/development/verification.md), [기술 설계와 티켓 분해](docs/specs/README.md)).
- 역할 정의 정비: `api`·`web`·`app`·`infra` 정의를 입력(티켓·설계 문서·디자인 인계·계약)·작업 방식·설계 검토·끝내는 조건 틀로 다시 씀, `infra`의 공용 포트·DB 공유 서술을 worktree별 인스턴스에 맞게 고침, `product`·`designer`의 설계 검토 범위 추가, `pnpm work:scope`가 루트 `CHANGELOGS.md`를 모든 역할에 허용. 근거 `docs/work/0010-role-definitions.md`.
- 기술 설계와 티켓 분해: [기술 설계와 티켓 분해](docs/specs/README.md)(디자인 기술 검토 → 설계 문서 → 역할별 검토 → 사용자 승인 → 계약·병렬 구현·통합 티켓), [설계 템플릿](docs/specs/TEMPLATE.md), `technical-design` 스킬(`orchestrator`가 자동으로 읽음), 디자인 흐름에 기술 검토 단계 추가, ALM 2단계·제품 탐색·작업 관리·병렬 개발·`WORKFLOW.md`·`AGENTS.md` 갱신. 근거 `docs/work/0009-technical-design-decomposition.md`.
- PRD 전 탐색 조사 절차: [제품 탐색과 PRD](docs/product/README.md)(유사 서비스 벤치마킹 → 기술 조사 → PRD 확정 → 구현 티켓), PRD·벤치마킹·기술 조사 템플릿, `product-discovery` 스킬(`product`가 자동으로 읽음), `orchestrator`의 기술 조사 담당·웹 검색 도구, `pnpm docs:check`의 조사 문서 `확인일`·출처 검사, ALM 2단계·`AGENTS.md`·README 안내 갱신. 근거 `docs/work/0008-product-discovery-research.md`.
- OpenDesign 연결 강화: `pnpm tokens:generate`가 OpenDesign 디자인 시스템 패키지(`design/system/tokens.css`·`manifest.json`, 원본 `packages/design-tokens/src/opendesign.json`)를 생성하고 공통 슬롯 누락·슬롯 색 리터럴을 거부, `design/system/DESIGN.md` 작성, 경고 색 토큰(`color.status.warning`, `-subtle`) 추가. `pnpm design:sync`(Workspace에 묶어 published로 설치), `pnpm design:check`(색 리터럴·`handoff.md`·`od lint`, `pnpm verify`에 포함), `pnpm od`(로컬 od CLI). `designer`가 `opendesign` 스킬(`.omp/skills/opendesign/`)을 자동으로 읽음. [OpenDesign 사용 기준](design/docs/opendesign.md), [디자인 ADR 0001](design/docs/adr/0001-opendesign-integration.md). 근거 `docs/work/0007-opendesign-integration.md`.
- 복사 즉시 사용 준비: README 템플릿 안내를 복사 → `init-project` → `make up`·`pnpm verify`·`pnpm smoke` → 첫 work item 순서로 다시 씀. `scripts/init-project.mjs`가 git 저장소가 아니면 안내 후 중단, 템플릿 값이 든 로컬 설정 파일 삭제, `pnpm verify --fast`·`pnpm build`로 확인, 같은 날짜 변경 기록 제목에 합침. PR 템플릿 검증 항목에 `verify`·`smoke`·`work:scope` 추가. 근거 `docs/work/0006-template-ready-to-copy.md`.
- 에이전트 친화 하네스 구성. 루트 `AGENTS.md`를 크기 예산 안의 지도로 줄이고 공통 정책 원문을 [저장소 공통 정책](docs/development/repository-policy.md)으로 옮김(ADR 0006, `docs/work/0004-agents-map-and-policy-docs.md`). 영역 `AGENTS.md`·변경 기록·FAQ의 정책 링크를 새 위치로 갱신.
- worktree별 로컬 인스턴스(`pnpm instance`, `make instance-destroy`, `.local/instance.env`)와 로그 조회(`pnpm logs`): 루트 `Makefile`, `ecosystem.config.cjs`, `scripts/instance.mjs`, `scripts/logs.mjs`, `scripts/lib/instance.mjs`, `scripts/init-project.mjs`, ADR 0008. 근거 `docs/work/0001-worktree-local-instances.md`. 세부는 [인프라](infra/CHANGELOGS.md)·[웹](apps/web/CHANGELOGS.md)·[앱](apps/app/CHANGELOGS.md) 로그.
- 단일 검증 명령 `pnpm verify`(`--fast`, `--keep-going`)와 Playwright smoke(`pnpm smoke`, `tests/smoke/`), CI를 `verify`·`smoke`·`work-scope` job으로 재구성, [검증 루프](docs/development/verification.md) 문서. 근거 `docs/work/0002-verify-and-smoke.md`.
- 기계 검사: `pnpm docs:check`(링크·anchor·고아 문서·ADR 형식·변경 기록 순서·`AGENTS.md` 예산), ESLint 영역 경계(`no-restricted-imports`), `.omp/agents/*.md`의 `owns`와 `pnpm work:scope`. 근거 `docs/work/0003-mechanical-guardrails.md`.
- work item 실행기: `pnpm work:next`, `pnpm work:run`(`scripts/runner.mjs`, `scripts/lib/runner-workflow.mjs`), 실행 정책·프롬프트 [WORKFLOW.md](WORKFLOW.md), [작업 실행기](docs/development/agent-runner.md)·[문서 정리](docs/development/doc-gardening.md) 문서, ADR 0007. work item 공용 모듈 `scripts/lib/work-items.mjs`·`scripts/lib/agents.mjs`. 근거 `docs/work/0005-work-dispatch-runner.md`.
- 루트 개발 의존성 `@playwright/test`, `yaml` 추가.
- who-when 저장소의 검증된 구조에서 서비스 고유 내용을 걷어내 초기 뼈대 구성: pnpm workspace, 공통 정책(`AGENTS.md`), OMP agent 정의(`.omp/`), work item 규칙과 검사(`docs/work/`, `scripts/work.mjs`), ADR 0001~0005, GitHub Actions CI(Node 22·24·26), ESLint + Prettier, 공유 계약 `@crelink/shared`(liveness·readiness·`ApiError`), 디자인 토큰 `@crelink/design-tokens`, 새 서비스 초기화 스크립트(`scripts/init-project.mjs`). 영역별 세부는 [인프라](infra/CHANGELOGS.md)·[API](apps/api/CHANGELOGS.md)·[웹](apps/web/CHANGELOGS.md)·[앱](apps/app/CHANGELOGS.md) 로그.
