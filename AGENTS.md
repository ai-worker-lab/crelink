# 저장소 지도

pnpm 모노레포 스켈레톤입니다: NestJS API(`apps/api`), Next.js 웹(`apps/web`), Expo 앱(`apps/app`), 공유 계약(`packages/shared`), 디자인 토큰(`packages/design-tokens`), 로컬 인프라(`infra/local`). 이 파일은 지도입니다. 세부 규칙은 링크한 문서에서 필요할 때 읽습니다.

## 반드시 지킬 규칙

- 문서·변경 기록·보고는 한국어. 식별자·명령·경로는 원문 표기.
- 사실은 한 곳에만 둡니다. 실행 가능한 원본(코드·설정·manifest)이 문서보다 우선이고, 문서는 근거 경로를 밝힙니다.
- 코드·설정을 바꾸면 영향받는 문서·링크·변경 기록(`CHANGELOGS.md`, 영역 로그)을 같은 변경에서 고칩니다.
- 작업 영역의 `AGENTS.md`를 함께 읽습니다: [api](apps/api/AGENTS.md), [web](apps/web/AGENTS.md), [app](apps/app/AGENTS.md), [infra](infra/AGENTS.md).
- 티켓의 `역할` 소유 경로(`.omp/agents/*.md`의 `owns`) 밖을 바꾸지 않습니다. `pnpm work:scope`로 확인합니다.
- 실행하지 않은 검증을 통과했다고 보고하지 않습니다. 배포·데이터 파괴·외부 공개는 명시적 요청 없이 하지 않습니다.
- main 머지는 곧 운영 배포입니다(CD). 머지 전에 알리고, 머지 뒤에는 Deploy job 결과(운영 주소 검사 포함)로 확인합니다. 운영(prod)에서 직접 확인·시험은 운영에서만 드러나는 위험이라는 명분이 있을 때만, 이유·범위를 사용자에게 먼저 알리고 진행합니다([검증 루프](docs/development/verification.md#운영-확인)).
- 제품 방향·우선순위·요구 확정은 사용자가 결정합니다.

전체 정책 원문: [저장소 공통 정책](docs/development/repository-policy.md).

## 명령

| 목적 | 명령 |
| --- | --- |
| 로컬 실행(worktree마다 독립 포트·DB) | `make up` · `make status` · `make down` · `pnpm instance` |
| 서비스 로그 | `pnpm logs <api\|web\|app\|infra> [--lines N]` |
| 전체 검증(CI와 동일) | `pnpm verify` · 빠른 검증 `pnpm verify --fast` · 문서만 `pnpm verify --docs` |
| 실행 중 API·웹 브라우저 검증 | `pnpm smoke` |
| work item 트리·검사·착수 가능 목록 | `pnpm work` · `pnpm work:check` · `pnpm work:next` |
| 티켓 소유 범위 검사 | `pnpm work:scope [NNNN]` |
| 문서 링크·형식 / 디자인 산출물 검사 | `pnpm docs:check` · `pnpm design:check` |
| OpenDesign(디자인 시스템 설치·CLI) | `pnpm design:sync` · `pnpm od <명령>` |
| work item 자동 실행기 | `pnpm work:run` |

## 작업 흐름

1. 의미 있는 변경은 [work item](docs/work/README.md)으로 시작합니다. 티켓은 `docs/work/<역할>/`, 에픽은 `docs/work/epics/`에 두며 번호는 폴더와 관계없이 하나입니다. 상태 원본은 각 파일의 `상태` 줄입니다. 새 서비스·큰 기능은 먼저 [제품 탐색과 PRD](docs/product/README.md)(유사 서비스·기술 조사)를 거칩니다.
2. 티켓 브랜치는 `work/NNNN-<slug>`이며 브랜치 존재가 착수 점유입니다.
3. 구현 후 [검증 루프](docs/development/verification.md)를 실행하고 근거를 티켓 `진행 기록`에 남긴 뒤 `검증`으로 넘깁니다.
4. 범위 밖 개선점이나 빠진 도구·가드레일을 발견하면 `분류 대기` work item으로 등록합니다.
5. 여러 역할이 필요한 작업은 `orchestrator`가 [기술 설계와 티켓 분해](docs/specs/README.md)를 거쳐 [영역별 병렬 개발](docs/development/parallel-work.md)에 따라 나눕니다.

## 위임과 반복 작업

subagent·생성 도구(OpenDesign 등)에 맡기거나 "생성 → 확인 → 수정"을 되풀이하는 작업의 기준입니다. 0064 디자인 다듬기 11회 회고에서 나왔습니다(`docs/work/orchestrator/0066-opendesign-refine-rounds.md`).

- **기준 자료를 처음에 모두 넘깁니다.** 이어 갈 승인 산출물, 해당 화면·모듈의 지금 코드(CSS·마크업 포함), 요구 원문이 기준 자료입니다. 중간에 처음 넘기는 자료가 생기면 준비 누락으로 진행 기록에 남깁니다.
- **회차마다 기계 검사를 돌립니다.** 산출물에 맞는 검사(`pnpm design:check --require-lint`, lint·typecheck 등)를 마지막에 몰지 않습니다.
- **확인한 결함은 한 회차에 모아 고칩니다.** 수정 1~2개짜리 회차를 잇달아 돌리지 않습니다. 회차마다 상태 전부(빈·오류·저장 실패·한도 등)와 화면 폭 전부를 확인해, 다음 회차에서 새로 발견하는 일을 줄입니다.
- **5회차나 30분을 넘기면 맡긴 쪽에 보고합니다.** 보고 내용은 진행 상황·남은 문제·끝낼 조건이며, 계속할지 함께 정합니다. 맡긴 쪽도 결과만 기다리지 않고 그 시점에 진행을 확인합니다.
- **"마무리"·"마지막"이라고 한 뒤에는 이유를 남깁니다.** 회차를 더하면 그 이유를 진행 기록에 적습니다.
- **절차 문서가 정한 단계를 다음 티켓으로 미루지 않습니다.** 예를 들어 디자인은 사용자 승인 전에 orchestrator 기술 검토를 받아야 합니다. 미뤄야 하면 사용자에게 먼저 알립니다.

## 문서 지도

- [문서 색인](docs/README.md) — 모든 문서의 목록
- [저장소 공통 정책](docs/development/repository-policy.md) — 언어·기준 정보·문서 배치·ADR·변경 기록·의존성 버전(LTS 기준)
- [로컬 개발 환경](docs/development/local-environment.md) · [검증 루프](docs/development/verification.md)
- [작업 관리](docs/work/README.md) · [ALM 운영 기준](docs/alm/workflow.md) · [실행기 정책 WORKFLOW.md](WORKFLOW.md)
- [영역별 병렬 개발](docs/development/parallel-work.md) — 역할·소유 경계·계약·통합 순서
- [환경과 비밀값 관리](docs/development/environment-secrets.md)
- [OpenDesign 사용 기준](design/docs/opendesign.md) — 디자인 작업·인계 (`designer`는 `opendesign` 스킬을 자동으로 읽음)
- 결정 기록: [docs/adr/](docs/README.md#주요-문서)
