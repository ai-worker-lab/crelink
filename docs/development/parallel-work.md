# 영역별 병렬 개발

인프라·API·웹·앱 구현과 복합 작업은 OMP task agent 격리 작업공간에서 실행합니다. `.omp/config.yml`은 `task.isolation.enabled: true`, `task.isolation.apply: true`, `task.isolation.merge: patch`, `isolation.backend: auto`를 설정합니다. 복합 작업의 `orchestrator`는 task batch의 각 작업에 `isolated: true`를 지정해 변경을 분리하고 성공한 patch를 부모 checkout에 적용합니다. 프로젝트 역할 정의는 `.omp/agents/*.md`에 둡니다.
OMP는 `.omp/agents/*.md`의 프로젝트 agent를 자동 발견합니다. 역할 정의 변경 후 task 도구 설명에 새 agent 선택 정보가 반영되도록 다음 OMP 세션에서 사용합니다. 격리 모드가 켜진 세션의 task batch에서만 `isolated: true`를 사용할 수 있습니다.
## OMP agent 자동 발견

OMP task는 프로젝트의 `.omp/agents/*.md`를 포함한 설정 경로에서 agent를 자동 발견합니다. 프로젝트 agent 정의의 필수 frontmatter는 고유한 `name`과 `description`이며, task dispatch는 agent 이름으로 실행 시점에 다시 확인됩니다. 따라서 `jev_route`는 역할 이름 목록을 별도로 유지하지 말고 현재 task 도구가 제공하는 agent 목록과 설명으로 대상을 고릅니다. 새 정의의 task 선택 정보가 세션에 반영되도록 변경 후 새 OMP 세션에서 사용합니다.

## 작업 시작

상위 `jev_route`가 요청을 분류합니다. 한 역할만 필요하고 영역 간 통합이 없으면 현재 사용 가능한 전문 agent에 직접 라우팅합니다. 둘 이상의 역할이 필요하거나 영역 간 계약·의존성·통합 검증이 필요한 요청은 `orchestrator`에 위임합니다. 제품 방향·우선순위는 사용자가 확정하고, `product`는 사용자 문제·근거·PRD 초안을 정리합니다. `orchestrator`는 복합 요청의 작업 경계·선행 관계·통합 검증을 담당합니다. 미정 제품 결정을 임의로 확정하지 않습니다.

work item이 있는 작업은 티켓 단위로 위임합니다. 티켓의 `역할` agent가 그 티켓을 맡고, 에픽 단위 복합 작업은 `orchestrator`가 티켓 사이의 `선행` 관계와 에픽의 통합 수용 기준을 조정합니다. 티켓은 역할별 폴더(`docs/work/<역할>/`)에 있으므로 한 역할이 맡은 티켓은 그 폴더에서 찾습니다. 여러 역할이 구현하거나 새 API 계약·데이터 모델이 필요한 기능은 `orchestrator`가 먼저 [기술 설계와 티켓 분해](../specs/README.md)로 설계 문서를 승인받고 그 분해안(계약 → 병렬 구현 → 통합)으로 티켓을 만듭니다. 단계·필드·폴더 규칙은 [작업 관리](../work/README.md)를 따릅니다. 착수 가능한 티켓은 `pnpm work:next`로 확인하고, 사람 대신 실행기가 티켓을 맡기는 방법은 [work item 실행기](agent-runner.md)를 참고합니다.

위임 원칙:

- 위임 전에 수용 기준, 소유 경로, 계약/API 경계, mock 범위, 각자 검증할 경로를 정합니다.
- 독립 작업은 한 번의 `task` batch로 동시에 위임하고, 진정한 선행 관계(예: 미확정 공유 API 계약)가 있을 때만 계약 작업 후 구현 작업을 나눕니다.
- `.omp/config.yml`의 `task.isolation.enabled`가 켜져 있으면 서로 다른 영역 작업은 `isolated: true`로 분리합니다. 격리가 불가능하면 서로 겹치지 않는 파일 경로만 병렬 위임하고 충돌 가능성이 있는 작업은 순차화합니다.
- 각 agent는 담당 영역의 하위 규칙을 직접 읽고 따릅니다. 복합 작업의 `orchestrator`는 결과를 실제 저장소 상태와 대조하고 mock을 실제 의존성으로 바꾼 통합 경로를 확인한 뒤에만 완료로 보고합니다.

```sh
git worktree add -b work/<NNNN>-<slug> ../crelink-worktrees/<NNNN>-<slug> <통합 기준 브랜치>
```

브랜치 이름 `work/NNNN-<slug>`의 `NNNN`은 work item 번호이며, 이 브랜치가 있으면 그 티켓은 착수된 것으로 봅니다(`pnpm work:next`가 제외). 수동 worktree에서는 모든 작업을 같은 기준 커밋에서 시작하고, 담당 역할의 소유 경로만 변경합니다(`pnpm work:scope`로 확인). 영역별 `AGENTS.md`와 루트 규칙을 읽고 따르며, 공용 계약·Makefile은 담당자를 합의하지 않고 동시에 수정하지 않습니다. 디자인 산출물은 `design/**` 소유 경계에 두고, 웹·앱 연결은 확정된 에셋 핸드오프 이후 각 담당자가 수행합니다.

## 역할과 에이전트별 소유 경계

`jev_route`는 사용자 요청을 접수·분류·라우팅하는 상위 진입점입니다. `product`는 제품·리서치, `designer`는 디자인 산출물, `orchestrator`는 복합 작업의 위임·통합을 맡는 동급 전문 역할입니다. 한 역할만 필요한 일은 해당 agent에 직접 보냅니다. 여러 역할 간 조정이 필요한 경우에만 `orchestrator`가 책임지고 분해합니다. 제품 방향·우선순위·요구 확정은 사용자가 맡고, PRD는 `product`가 근거와 결정 상태를 보존해 정리합니다.

역할별 소유 경로의 기계 원본은 각 agent 정의(`.omp/agents/*.md`) frontmatter의 `owns`(쉼표로 구분한 glob)입니다. `pnpm work:scope [NNNN]`([scripts/work-scope.mjs](../../scripts/work-scope.mjs))가 티켓 브랜치의 변경(기준 브랜치와의 머지 베이스 이후 커밋과 작업 트리, 기준 선택은 [작업 관리](../work/README.md#명령)) 중 티켓 `역할`의 `owns` 밖 변경을 실패로 보고하며, `docs/work/**`와 루트 `CHANGELOGS.md`(전용 로그가 없는 `packages/`·`design/` 변경 기록용)는 모든 역할에 허용됩니다. `orchestrator`의 `owns`는 전체(`**`)이지만 영역 구현은 해당 역할 티켓으로 나누는 것이 원칙입니다. 각 역할 정의는 같은 틀로 입력(티켓·설계 문서 절·디자인 인계·계약), 작업 방식, 설계 검토 요청에 대한 의견 범위, 끝내는 조건(검증 명령·변경 기록·`진행 기록`)을 적습니다.

| 에이전트 | 책임 |
| --- | --- |
| `product` | 사용자·시장 조사, 유사 서비스 벤치마킹, 근거 정리, 시나리오·수용 기준을 포함한 PRD 초안([제품 탐색과 PRD](../product/README.md)). 제품 확정 결정은 사용자에게 요청 |
| `orchestrator` | 둘 이상의 역할이 필요한 작업과 루트 설정·CI·workspace 연결의 분해·위임·의존성 조정·통합 검증, 디자인 기술 검토와 기술 설계·티켓 분해(`docs/specs/`), 라이브러리·오픈소스·SaaS 기술 조사(`docs/references/`) |
| `infra` | PostgreSQL·Valkey 서비스, Compose, 네트워크와 환경별 인프라 설정 |
| `api` | 인증·권한·도메인 규칙·트랜잭션·DB schema/migration·HTTP 요청/응답/오류, 합의된 `packages/shared/` API 계약 |
| `web` | Next.js 화면·SSR·브라우저 상호작용·웹 전용 API 소비 |
| `app` | Expo·React Native 화면·네이티브 동작·모바일 API 소비 |
| `designer` | 시각 시스템·디자인 토큰 이름·값과 생성물·사용자 흐름·화면 상태와 구현에 필요한 디자인 산출물 |

PRD가 저장소에서 추적 가능한 변경으로 수정될 때 `product`는 확정/제안/미정 상태를 지키며 초안을 제안하고, 사용자가 확정한 요구만 승인된 기준으로 취급합니다. 단일 영역 변경은 해당 agent가 맡고, 여러 영역에 걸치는 변경은 `orchestrator`가 역할과 통합 순서를 정합니다. 각 영역 agent는 소유 경로 밖을 직접 수정하지 않습니다. `packages/shared/` 계약과 root `Makefile`처럼 공용 변경의 소유자를 명확히 정하고, 하위 `AGENTS.md`의 적용 규칙을 따릅니다. 앱 사이 직접 import와 영역에 맞지 않는 의존성은 ESLint `no-restricted-imports`(루트 `eslint.config.mjs`)가 막습니다.

디자인 산출물만 필요한 요청은 `jev_route`가 `designer`에게 직접 라우팅합니다. 디자인과 웹·앱 구현이 함께 필요한 복합 작업은 `orchestrator`가 기술 구현 담당자와 Designer 사이의 산출물·핸드오프를 조정합니다. `designer`는 로컬 OpenDesign으로 산출물을 만들며, 새 산출물은 사용자 확인 브리프를 먼저 받고 확인된 브리프에 따라 OpenDesign Cloud 또는 Local Codex로 생성합니다. 승인된 산출물은 `design/<기능>/`의 화면과 `handoff.md`로 인계하고, 웹·앱은 이 인계를 기준으로 통합합니다([OpenDesign 사용 기준](../../design/docs/opendesign.md)). 수작업으로 만든 이미지나 임의 대체물을 제품 자산으로 넣지 않습니다.

각 git worktree는 자기 로컬 인스턴스를 가집니다. `make up`이나 `pnpm instance`가 주 checkout은 슬롯 0(`infra/local/.env.example`의 포트, Compose project `crelink`), 연결된 worktree는 빈 슬롯 k(각 포트 +100×k, 별도 Compose project·볼륨)를 할당해 `.local/instance.env`에 기록합니다([로컬 개발 환경](local-environment.md), [ADR 0008](../adr/0008-worktree-local-instances.md)). 따라서 격리 작업공간마다 인프라·API·웹을 띄워 `pnpm smoke`까지 병렬로 검증할 수 있습니다. 같은 인스턴스를 여러 작업이 공유하지 않으며, 작업을 마친 worktree는 `make instance-destroy CONFIRM=1`로 인스턴스를 지운 뒤 제거합니다. OMP `task` 격리 작업공간이 git worktree가 아닌 방식으로 만들어지면 슬롯 할당이 겹칠 수 있으므로 `PORT_SLOT`을 지정합니다.


## 계약과 병렬화 경계

- API의 HTTP 경로·메서드·요청·응답·오류와 직렬화 가능한 공통 타입의 기준은 API 구현 및 `packages/shared/`입니다. 데이터베이스 접근, 비밀값, UI 상태는 공유 계약에 넣지 않습니다.
- 웹·앱의 화면 구조·시각 스타일·상태 표현은 사용자가 승인한 `design/<기능>/` 산출물과 `handoff.md`를 기준으로 한다. 색·간격·모서리·글자 크기 토큰은 `@crelink/design-tokens`가 단일 원본이며 웹·앱·디자인은 그 생성물만 사용한다([ADR 0001](../adr/0001-design-tokens.md)). 토큰 생성기와 workspace 연결은 복합 작업의 통합 담당이 맡는다. 각 플랫폼은 디자인의 화면·에셋을 앱 소유 코드로 옮기며 디자인 도구 내부 파일을 런타임에서 불러오지 않는다. 구현에 필요한 화면 상태가 디자인에 없으면 가장 가까운 승인 화면을 따른다.
- 화면 데이터·인증·권한·업무 규칙은 실제 API와 `packages/shared/` 계약을 기준으로 한다. 웹·앱은 표현과 상호작용을 담당하며 서버 업무 규칙을 복제하거나 독자 API 계약을 만들지 않는다. 개발용 mock은 확정된 API 계약에 한정하고 실제 사용자 경로에서는 실제 API를 호출한다.
- API 계약을 바꾸는 기능도 병렬화할 수 있습니다. 먼저 계약 담당자가 경로·메서드·인증 조건·요청/응답 DTO·오류 동작을 정하고 `packages/shared/`에 반영해 기준 커밋으로 통합합니다. 이 짧은 계약 단계가 끝나면 API·웹·앱 담당자가 각 격리 작업공간에서 같은 계약을 기준으로 병렬 구현합니다.
- 웹·앱 담당자는 API가 아직 준비되지 않은 동안 계약과 일치하는 HTTP mock/fixture로 화면과 상태 전이를 구현·검증할 수 있습니다. mock은 소비자 테스트 또는 개발 실행에만 두고, API 계약의 대체 원본이나 별도 가정으로 만들지 않습니다. 응답 예시는 공유 DTO 타입에 대입해 타입 검사를 통과시킵니다.
- API 담당자는 실제 API 경로를 구현하고 DB·외부 제공자 등 하위 의존성만 테스트 경계에서 mock할 수 있습니다. mock 성공만으로 실제 DB·인프라 연동이 확인된 것으로 보고하지 않습니다.
- 인프라 작업자는 합의된 연결 인터페이스(서비스 이름, 포트, 환경변수 이름, 준비 상태)를 기준으로 변경합니다. 임시 mock 서비스에 맞춘 인프라 구성을 제품 구성으로 남기지 않습니다.
- 서버 구현과 인프라 변경은 소유권을 분리합니다. DB 스키마·마이그레이션은 API가, DB 서버·네트워크·Compose 설정은 인프라가 소유합니다. 필요한 연결점은 사전에 합의합니다.
- 서로 다른 파일이라도 같은 계약·설정·문서의 소유권을 공유하지 않습니다. 계약 변경이 생기면 계약 담당자가 기준을 갱신하고 영향받는 작업자에게 새 기준을 알립니다. 계약 충돌을 발견하면 각자 가정으로 계속하지 말고 해당 경로를 멈춰 재합의합니다.
## 통합 순서

1. 계약 기준 커밋이 준비된 뒤 필요한 영역 담당자들은 OMP 격리 작업공간에서 병렬 구현합니다. 각 작업자는 mock/fixture가 실제 계약과 일치하는지, 그리고 자신의 영역 기준 검증을 확인합니다.
2. 복합 작업의 `orchestrator`는 계약 및 기반 변경(API/shared, 필요한 infra)을 먼저 통합합니다. 웹·앱의 mock을 실제 API로 바꾸고 mock과 중복된 경로를 제거합니다. mock 모드를 유지한다면 실제 사용자 실행 경로와 혼동되지 않도록 개발 전용으로 격리합니다.
3. 통합된 환경에서 실제 API 요청·응답, DB·인프라 연결, 웹·앱의 로딩·성공·오류 상태를 검증합니다. mock 테스트는 통합 검증을 대체하지 않습니다.
4. 충돌은 의미를 확인해 해결합니다. 한쪽 변경을 임의로 덮어쓰지 않습니다. work item의 수용 기준·검증 결과와 PR을 연결합니다.
5. OMP 격리 작업은 완료 시 patch 반영 및 격리 환경 정리를 처리합니다. 수동 worktree와 실행기(`pnpm work:run`)가 만든 worktree는 병합 후 미커밋 변경 여부를 확인하고, worktree 안에서 `make instance-destroy CONFIRM=1` → `git worktree remove <경로>` → `git branch -d <브랜치>` 순서로 정리합니다. 브랜치가 남아 있으면 그 티켓은 계속 점유된 것으로 봅니다. 작업자의 확인 없이 `git worktree remove`를 실행하지 않습니다.

## 검증 범위

영역별 규칙의 검증을 따릅니다. 계약 변경은 API 실제 HTTP 요청·응답과 웹·앱 소비 경로를 확인합니다. 계약 기반 mock은 소비자 개발을 앞당기는 수단이며 실제 연결 증거가 아닙니다. 인프라 변경은 Compose 설정 검증 및 해당 서비스 기동·접속·종료를 확인합니다. 병렬 구현 완료는 각 영역의 로컬 검증만으로 충분하지 않으며, mock을 실제 의존성으로 교체한 통합 환경에서 연결 경로를 다시 확인합니다.

## 위임과 반복 작업

subagent·생성 도구(OpenDesign 등)에 맡기거나 "생성 → 확인 → 수정"을 되풀이하는 작업의 기준입니다. 0064 디자인 다듬기 11회(1시간 40분) 회고에서 나왔습니다(`docs/work/orchestrator/0066-opendesign-refine-rounds.md`).

- **기준 자료를 처음에 모두 넘깁니다.** 이어 갈 승인 산출물, 해당 화면·모듈의 지금 코드(CSS·마크업 포함), 요구 원문이 기준 자료입니다. 중간에 처음 넘기는 자료가 생기면 준비 누락으로 진행 기록에 남깁니다.
- **회차마다 기계 검사를 돌립니다.** 산출물에 맞는 검사(`pnpm design:check --require-lint`, lint·typecheck 등)를 마지막에 몰지 않습니다.
- **확인한 결함은 한 회차에 모아 고칩니다.** 수정 1~2개짜리 회차를 잇달아 돌리지 않습니다. 회차마다 상태 전부(빈·오류·저장 실패·한도 등)와 화면 폭 전부를 확인해, 다음 회차에서 새로 발견하는 일을 줄입니다.
- **5회차나 30분을 넘기면 맡긴 쪽에 보고합니다.** 보고 내용은 진행 상황·남은 문제·끝낼 조건이며, 계속할지 함께 정합니다. 맡긴 쪽도 결과만 기다리지 않고 그 시점에 진행을 확인합니다.
- **"마무리"·"마지막"이라고 한 뒤에는 이유를 남깁니다.** 회차를 더하면 그 이유를 진행 기록에 적습니다.
- **절차 문서가 정한 단계를 다음 티켓으로 미루지 않습니다.** 예를 들어 디자인은 사용자 승인 전에 orchestrator 기술 검토를 받아야 합니다. 미뤄야 하면 사용자에게 먼저 알립니다.

