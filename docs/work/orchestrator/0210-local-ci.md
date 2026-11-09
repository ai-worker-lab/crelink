# 0210 로컬 CI 명령

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 유지보수
- 우선순위: P1 (AI 제안)
- 작성일: 2026-11-10

## 목적

[ADR 0016](../../adr/0016-devoffice-takeover.md) 결정 5는 CI를 로컬 기기로 옮기고 GitHub Actions에는 CD만 남기기로 했습니다. 그 1단계로 `ci.yml`의 job을 로컬에서 재현하는 명령을 만듭니다. 이번에는 스크립트만 만들고 `ci.yml`과 GitHub 설정은 바꾸지 않습니다.

## 수용 기준

- [ ] 깨끗한 작업 트리에서 `pnpm ci:local`이 종료 코드 0으로 끝나고 단계 요약을 출력합니다. **미충족:** 단계 요약은 나오지만 이 기기에서는 `이미지 web`의 QEMU 크래시로 종료 코드 1입니다(진행 기록).
- [x] 일부러 실패시킨 상태에서 종료 코드 1, 실패 단계 표시, `--report`여도 기록하지 않습니다.
- [x] 문서만 바뀐 상태에서 문서 경로만 실행합니다.
- [x] `pnpm ci:local --report --dry-run`이 대상 SHA와 context를 출력하고 호출하지 않습니다.
- [x] 이미 떠 있던 스택은 내리지 않고 이 실행이 띄운 스택만 내립니다.
- [x] `pnpm verify`, `pnpm work:scope 0210`, `pnpm work:check`가 통과합니다.

## 범위

- 포함: `scripts/ci-local.mjs`, `scripts/lib/ci-local.mjs`와 시험, 루트 `package.json`의 스크립트 한 줄, [검증 루프](../../development/verification.md#로컬-ci), 변경 기록.
- 제외: `ci.yml`·ruleset 변경, 실제 commit status 기록, Playwright 설치와 실행, 이미지 push, 나머지 시험의 ego-lite 전환.

## 위험·복구

운영·데이터에 영향이 없습니다. 스크립트는 이 worktree의 인스턴스 스택과 Docker 빌드 캐시만 건드리며 `make down`으로 되돌릴 수 있습니다. `--report`만 GitHub에 쓰며 이번 작업에서는 실제로 실행하지 않습니다. 문제가 있으면 revert합니다.

## 연결

- 결정: [ADR 0016](../../adr/0016-devoffice-takeover.md) 결정 5
- 재현 대상: `.github/workflows/ci.yml`
- ego-lite 시험: `tests/e2e/ego/`, [0206](../crelink-qa/0206-ego-analytics-responsive.md)

## 진행 기록

- 2026-11-10: 생성·착수.
- 2026-11-10: 첫 전체 실행(`f964b30`, 깨끗한 트리, 스택 없음)은 종료 코드 1. `work:scope`, DB, `pnpm verify`(8단계 41.9초), 스택 시작, ego 143개 검사, 스택 정리, `이미지 api`(40.7초)는 통과했고 `이미지 web`(132.7초)이 `QEMU internal SIGILL`로 실패했습니다. 같은 `docker buildx build` 재실행도 `Collecting page data`에서 종료 코드 1, 뒤의 실패 시험에서는 12.9초에 `qemu: uncaught target signal 11`로 종료 코드 1입니다. 세 번 모두 QEMU 크래시이고 죽는 지점은 다릅니다.
- 2026-11-10: 원인 관찰: 이 Mac은 arm64이고 Docker Desktop의 `UseVirtualizationFrameworkRosetta`가 `false`입니다. `apps/web/Dockerfile` build 단계는 대상 플랫폼에서 돌아 QEMU로 `next build`를 실행합니다. `apps/api`는 build 단계가 `$BUILDPLATFORM`이라 통과합니다. Docker Desktop 설정은 사용자 기기 설정이고 재시작하면 다른 worktree 작업이 끊기므로, Dockerfile은 소유 경로 밖이므로 바꾸지 않았습니다. 실패를 건너뜀으로 바꾸지도 않았습니다. Rosetta를 켰을 때의 결과는 확인하지 않았습니다. **첫 번째 수용 기준은 이 기기에서 미충족이며 해결 방법의 결정이 필요합니다.**
- 2026-11-10: `SIGTERM`을 `pnpm verify` 중에 보내면 종료 코드 143, 남은 단계 건너뜀, 이 실행이 띄운 DB 컨테이너 내려감, `verify` 프로세스 잔류 0을 확인했습니다.
- 2026-11-10: 문서만 바꾼 임시 커밋(작업 공간 밖 scratch clone, 임시 bare 원격)에서 `pnpm ci:local` 종료 코드 0, `pnpm verify --docs`와 `work:scope` 2단계만 실행했습니다. 같은 방식으로 `--report --dry-run`은 전 조건을 만족할 때 종료 코드 0과 `호출하지 않았습니다`, 미push·더러운 트리·저장소 불명일 때 종료 코드 1과 이유를 출력했습니다. 각 기록 조건은 `node --test scripts/lib/ci-local.test.mjs`(15개 통과)로도 고정했습니다. 이 시험은 `package.json`의 `test` 줄을 바꿔야 `pnpm test`에 들어가는데 이번 소유 범위가 스크립트 한 줄이라 연결하지 않았습니다.
- 2026-11-10: 임시 커밋으로 Prettier를 실패시킨 상태에서 `make infra-up`을 미리 해 두고 `pnpm ci:local --report --dry-run`을 실행했습니다. 종료 코드 1, 요약에 `pnpm verify` 실패와 `이미지 web` 실패, `기록하지 않습니다`(실패 단계, 미push) 출력. 실행 뒤 미리 띄운 DB 컨테이너 2개는 그대로이고 이 실행이 띄운 API·웹·앱 포트는 닫혔습니다. 임시 커밋은 `git reset --hard`로 되돌렸습니다(작업 트리 변경 0).
- 2026-11-10: 상태는 `진행`으로 둡니다. 첫 번째 수용 기준이 이 기기에서 미충족이라 `검증`으로 올리지 않습니다.
