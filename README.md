# crelink

크리링(CreLink, Creator + Link)은 브랜드와 크리에이터를 연결하는 인플루언서 마케팅 서비스로 기획 중입니다. 확정된 제품 결정은 아직 없습니다. 검토용 제안은 [서비스 기획 및 MVP Handoff 참고 자료](docs/product/crelink-mvp-handoff.md)에 있으며, 범위·타깃·기능은 사용자가 결정한 뒤 PRD에 기록합니다.

현재 웹·앱 화면과 health endpoint는 실행 확인용 시작점이며 제품 기능이 아닙니다.

## 구조

- `docs/` — 여러 영역에 걸친 개발 문서. [문서 인덱스](docs/README.md)를 참고하세요.
- [CHANGELOGS](CHANGELOGS.md) — 내부 전체 변경 기록. 영역별 기록은 각 구성요소 디렉터리에 있음 / [RELEASES](RELEASES.md) — 공개 릴리스 노트
- `design/` — 디자인 시스템 패키지(`system/`), 인계된 디자인 산출물(`<기능>/`), 디자인 문서. 로컬 OpenDesign 사용법은 [OpenDesign 사용 기준](design/docs/opendesign.md).
- `apps/app/` — Expo + React Native 모바일 앱.
- `apps/web/` — 앱 설치 없이 이용하기 위한 Next.js App Router 웹 클라이언트.
- `apps/api/` — NestJS + TypeScript API.
- `infra/` — [local·dev·prod 인프라 관리](infra/README.md). 현재 실행 가능한 구성은 local입니다.
- `packages/shared/` — 클라이언트와 API가 공유하는 TypeScript 계약.
- `packages/design-tokens/` — 디자인·웹·앱이 함께 쓰는 디자인 토큰 원본과 생성물. [사용법](packages/design-tokens/docs/usage.md)
- `scripts/` — 저장소 도구: work item 검사·착수 목록·소유 범위·실행기(`work.mjs`, `work-scope.mjs`, `runner.mjs`), 검증(`verify.mjs`, `smoke.mjs`, `docs-check.mjs`), 로컬 인스턴스·로그(`instance.mjs`, `logs.mjs`).
- `tests/smoke/` — 실행 중인 API·웹을 확인하는 Playwright smoke 테스트.
- [WORKFLOW.md](WORKFLOW.md) — work item 실행기의 정책과 에이전트 프롬프트.

에이전트용 지도는 [루트 AGENTS.md](AGENTS.md), 공통 정책 원문은 [저장소 공통 정책](docs/development/repository-policy.md), 영역별 추가 규칙은 각 하위 `AGENTS.md`가 기준입니다.

## 요구사항

- Node.js: 22·24·26 LTS를 지원하며 CI가 세 버전을 모두 검사합니다. 로컬 개발 기본 버전은 [`.nvmrc`](.nvmrc)입니다(`nvm use` 또는 `fnm use`).
- pnpm: 루트 `package.json`의 `packageManager` 값(`corepack enable` 후 자동 사용)
- Docker Engine/Desktop과 Compose v2 (로컬 PostgreSQL·Valkey용)
- make, PM2(`pnpm install` 시 함께 설치)

## 명령어

```sh
pnpm install
make up            # 로컬 인스턴스 설정 생성 후 인프라·API·웹·Expo 실행
make status        # 컨테이너 및 개발 서버 상태
make down          # 전체 종료(데이터 볼륨 유지)
make infra-restart # 인프라만 재시작 (api-·web-·app-restart도 같은 형식)
pnpm format        # Prettier 서식 적용 후 ESLint 자동 수정
pnpm tokens:generate # 디자인 토큰 원본에서 CSS 변수·앱 객체·디자인 tokens.css·OpenDesign 디자인 시스템 생성
```

`make up`은 없는 로컬 설정 파일(`infra/local/.env`, `apps/api/.env`, `apps/web/.env.local`, `apps/app/.env`)을 예시에서 만듭니다. 이 checkout의 API·웹·Expo·PostgreSQL·Valkey 포트와 주소는 `pnpm instance`가 보여 줍니다. 주 checkout(슬롯 0)의 포트 원본은 [`infra/local/.env.example`](infra/local/.env.example)이고, git worktree는 슬롯마다 100씩 더한 포트와 별도 DB를 씁니다.

자세한 내용은 [로컬 개발 환경](docs/development/local-environment.md), [환경과 비밀값 관리](docs/development/environment-secrets.md), [배포 대상 아키텍처](docs/architecture/deployment-target.md), [CHANGELOGS](CHANGELOGS.md)를 참고하세요. 디자인 산출물은 `design/`에 두고, 앱·API 소스는 이 폴더에 두지 않습니다.

<!-- harness:start -->

## 에이전트 하네스

코딩 에이전트가 work item 하나를 혼자 맡아 실행·검증하고 인계할 수 있게 하는 도구와 규칙입니다. 에이전트는 [AGENTS.md](AGENTS.md)를 지도로 씁니다.

```sh
pnpm instance      # 이 checkout의 포트·주소·Compose project 출력(worktree마다 독립 인스턴스)
pnpm logs api      # 서비스 최근 로그 (api|web|app|infra, --lines N, --follow)
pnpm verify        # CI와 같은 전체 검증: 토큰·work item·문서·lint·타입·빌드·테스트
pnpm verify --fast # 빌드·테스트를 뺀 빠른 검증
pnpm smoke         # 실행 중인 API·웹에 Playwright smoke 테스트
pnpm docs:check    # 문서 링크·형식 검사
pnpm design:sync   # design/system 디자인 시스템을 로컬 OpenDesign에 설치
pnpm design:check  # design/ 산출물 색 리터럴·인계 문서 검사(OpenDesign 실행 중이면 od lint 포함)
pnpm od <명령>     # 로컬 OpenDesign od CLI(예: pnpm od lint <html>, pnpm od design-systems list)
pnpm work          # work item 트리(에픽 → 티켓 → 하위 티켓)와 진행률
pnpm work:next     # 지금 착수할 수 있는 work item
pnpm work:place    # 역할·단계를 바꾼 work item을 맞는 폴더(docs/work/<역할>/, epics/)로 옮기고 링크 고침
pnpm work:scope    # 현재 티켓 브랜치의 변경이 역할 소유 경로 안인지 검사
pnpm work:run      # WORKFLOW.md 정책으로 티켓마다 worktree와 코딩 에이전트 실행
pnpm work:run --print-prompt [NNNN] # 에이전트를 실행하지 않고 렌더링된 프롬프트만 출력
```

- 작업 흐름: [작업 관리](docs/work/README.md), [제품 탐색과 PRD](docs/product/README.md), [기술 설계와 티켓 분해](docs/specs/README.md), [영역별 병렬 개발](docs/development/parallel-work.md)(OMP 역할 위임, 격리 실행, 계약 기반 mock과 통합)
- 실행과 검증: [로컬 개발 환경](docs/development/local-environment.md#인스턴스와-포트), [검증 루프](docs/development/verification.md), [work item 실행기](docs/development/agent-runner.md), [OpenDesign 사용 기준](design/docs/opendesign.md)
- 다른 저장소로 옮기기: [기존 저장소에 하네스 적용](docs/development/adopting-harness.md)

<!-- harness:end -->
