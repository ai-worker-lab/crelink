# 0011 하네스 이식성 개선

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

이 템플릿의 하네스를 기존 저장소(who-when)에 이식해 보니, 하네스가 템플릿 고유 값(슬롯 0 포트, 토큰 CSS 접두사 `--ds-`, 이식 전 디자인 산출물이 없다는 가정, 조사 문서 형식, `origin/main` 기준)을 여러 곳에 가정하고 있어 파생 저장소가 손으로 고쳐야 했습니다(who-when work item 0020). 이 가정을 설정 한 곳으로 모으고, 기존 저장소에 하네스를 적용하는 절차를 문서로 남겨 다음 파생 저장소가 기계적으로 이식·적용할 수 있게 합니다.

## 수용 기준

- [x] 슬롯 0 포트의 원본이 한 곳이다. 그 값을 바꾼 임시 clone에서 `pnpm instance`가 바꾼 포트를 슬롯 0으로 보여 주고, 포트 숫자를 반복하던 문서는 `pnpm instance`를 가리킨다. `scripts/init-project.mjs`도 같은 원본을 쓴다.
- [x] 토큰 CSS 접두사가 토큰 원본의 설정 한 곳에서 정해진다. 접두사를 바꾼 임시 clone에서 `pnpm tokens:generate`·`pnpm design:check`가 새 접두사로 동작한다.
- [x] `opendesign.json`에 필수 슬롯이 빠지면 빠진 슬롯 전체와 추가 위치를 한 번에 안내한다.
- [x] `pnpm design:check`가 기준선 파일의 영역 실패를 알림으로, 기준선에 없는 영역 실패는 그대로 실패로 보고한다.
- [x] `pnpm docs:check`가 조사 문서의 `- 확인일: YYYY-MM-DD (메모)`와 맨 URL 출처를 받고, 출처 없는 문서는 실패한다.
- [x] 하네스 ADR이 템플릿 work item에 링크하지 않는다.
- [x] `pnpm design:sync`가 OpenDesign local 설치의 staging 심볼릭 링크를 실제 폴더로 바꾸고, 끊긴 링크로 남은 이전 설치를 복구한다.
- [x] `pnpm work:run --print-prompt [NNNN]`이 에이전트를 실행하지 않고 렌더링된 프롬프트를 출력한다.
- [x] 로컬 기준 브랜치가 `origin`보다 앞선 checkout에서 `pnpm work:scope`가 티켓 브랜치 변경만 센다. CI(PR)의 `--base origin/<기준 브랜치>` 동작은 그대로다.
- [x] 루트 `README.md`의 템플릿 시작 안내와 하네스 사용 안내가 나뉘고, `docs/development/adopting-harness.md`가 기존 저장소에 하네스를 적용하는 절차를 설명한다.
- [x] `pnpm verify --fast`, `pnpm docs:check`, `pnpm work:check`가 통과한다.

## 범위

- 포함: `scripts/`, `packages/design-tokens/`, `design/`, `infra/local/`, 앱 `.env.example`·개발 서버 스크립트의 포트 기본값과 `apps/api/src/main.ts`의 포트 읽기, `.github/workflows/ci.yml`, `.omp/skills/`·`.omp/agents/`의 접두사 서술, 하네스 ADR, 루트 `README.md`, `docs/development/`, `docs/product/`, `docs/references/TEMPLATE.md`, 앞서 미커밋으로 남은 smoke 불변 조건 변경(`tests/smoke/smoke.spec.ts`, `docs/development/verification.md`, `docs/specs/`).
- 제외: 과거 work item 0001~0010과 변경 기록 본문, 디자인 토큰 값, who-when 저장소.

## 위험·복구

슬롯 0 포트 원본과 개발 서버 포트 기본값을 옮기므로 `make up`·`pnpm dev:*` 경로가 바뀝니다. 주 checkout의 기존 `.local/instance.env`·로컬 `.env` 파일과 Compose project는 그대로 쓰이며, 되돌리려면 이 커밋을 `git revert`합니다.

## 연결

- [로컬 개발 환경](../../development/local-environment.md), [검증 루프](../../development/verification.md), [작업 실행기](../../development/agent-runner.md), [OpenDesign 사용 기준](../../../design/docs/opendesign.md)

## 진행 기록

- 2026-10-01: 생성. 근거는 who-when work item 0020(하네스 이식)의 진행 기록과 커밋 `2e47c47`.
- 2026-10-01: 구현. 포트 원본 `infra/local/.env.example`과 `pnpm instance --get`, 앱 개발 서버의 인스턴스 포트 사용, API `PORT` 필수, Compose 포트 기본값 제거, CI smoke 인스턴스 값. 토큰 접두사 `$cssPrefix`(`packages/design-tokens/scripts/source.mjs`)와 design:check의 접두사·토큰 이름 대조, 슬롯 누락 일괄 안내, 기준선 `design/.check-baseline.json`(S에는 둘 영역이 없어 파일을 두지 않음), design:sync 심볼릭 링크 복구. docs:check 조사 문서 완화와 ADR→work item 링크 금지 검사, ADR 0008 링크·포트 숫자 정리(다른 ADR은 work item 링크 없음). `work:run --print-prompt`, `work:scope` 기본 기준. README 분리, `docs/development/adopting-harness.md`, 제품 탐색 문서·스킬의 기존 문서 규칙. ADR 0001(디자인 토큰)·디자인 ADR 0001의 `--ds-*`는 결정 기록이라 그대로 둠.
- 2026-10-01: 검증(모두 /tmp 임시 clone, 확인 뒤 삭제). (1) 포트 원본을 23000·25173·28081·25432·26379로 바꾸자 `pnpm instance`가 슬롯 0에 그 포트를 보이고 `--get WEB_PORT`는 25173, 키를 지우거나 정수가 아니면 해결 안내와 함께 종료 1. `init-project --name demo-svc --no-verify` 결과가 옛 스크립트와 `diff -r` 동일. 웹·앱 `start` 스크립트의 포트 확장은 echo로 확인(서버 미기동). (2) `$cssPrefix`를 `pk`로 바꾸자 `pnpm tokens:generate`가 `--pk-` 60줄·`--ds-` 0줄을 만들고, `pnpm design:check`는 `design/system/DESIGN.md`의 옛 접두사 27개를 고칠 이름과 함께 실패로 보고, DESIGN.md를 바꾼 뒤 통과. (3) 슬롯 5개를 지우면 빠진 슬롯 전체를 쓰임새·형식과 함께 한 번에 출력. (4) 기준선 영역의 색 리터럴은 `[기준선, 0011에서 정리]` 알림, 기준선에 없는 영역은 실패(종료 1), 그 영역을 지우면 통과. (5) `- 확인일: 2026-10-01 (메모)`와 맨 URL 문서 통과, 출처 URL 없는 문서·잘못된 날짜 실패. (7) OpenDesign 데몬 모의로 수정 전 ENOENT 재현, 수정 후 최초 설치·재설치·끊긴 링크 복구 성공(실제 `user:crelink` 설치는 건드리지 않음). (8) `준비` 티켓을 둔 clone에서 `pnpm work:run --print-prompt`가 프롬프트를 출력하고 브랜치·worktree 없음. (9) 로컬 main이 origin보다 앞선 clone의 `work/0099-*`에서 `pnpm work:scope`가 티켓 변경 1개만 세어 통과, `--base origin/main`은 앞선 커밋을 세어 실패. 주 checkout에서 `pnpm verify --fast` 6단계 통과(`docs:check` Markdown 78개, `work:check` 11개, `design:check`·`tokens:check` 포함). `make up`·`pnpm smoke`, GitHub Actions 실행, 실제 `pnpm design:sync`는 하지 않음.
- 2026-10-01: 완료.
