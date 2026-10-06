# 0006 복사 즉시 사용할 수 있는 템플릿 준비

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-10-01

## 목적

이 저장소를 복사(GitHub 템플릿 또는 이력 없는 clone)한 직후 초기화·실행·검증·첫 work item까지 막힘 없이 진행되게 합니다.

## 수용 기준

- [x] 루트 `README.md`의 템플릿 안내가 복사 → `init-project` → `make up`·`pnpm verify`·`pnpm smoke` → 첫 커밋·work item 순서를 실제 명령으로 안내한다.
- [x] `scripts/init-project.mjs`가 git 저장소가 아니면 해결 방법과 함께 멈추고, 템플릿 값이 든 로컬 설정 파일(`.local/instance.env`, `infra/local/.env`, `apps/api/.env`, `apps/web/.env.local`, `apps/app/.env`)을 지우며, 초기화 후 `pnpm verify --fast`와 `pnpm build`로 확인하고 다음 단계를 출력한다.
- [x] 이력 없는 복사본에서 `init-project --name <이름> --port-offset <N>` 후 `make up`, `pnpm verify`, `pnpm smoke`, `pnpm work:next`, `pnpm work:run --dry-run`, 연결 worktree의 `pnpm instance`가 새 이름·포트로 동작한다.
- [x] PR 템플릿의 검증 항목이 `pnpm verify`·`pnpm smoke`·`pnpm work:scope`를 안내한다.

## 범위

- 포함: `README.md`, `scripts/init-project.mjs`, `.github/pull_request_template.md`, 하네스 티켓(0001~0005) 상태 정리.
- 제외: GitHub 저장소의 템플릿 설정과 push(사용자 결정), 배포 대상 문서의 서비스별 선택.

## 위험·복구

`init-project`는 템플릿 값이 든 로컬 `.env` 파일을 지웁니다. 실제 비밀값을 넣은 파일이라면 초기화 전에 따로 보관합니다. 템플릿 값이 없는 파일은 지우지 않습니다.

## 연결

- [작업 관리](../README.md), [로컬 개발 환경](../../development/local-environment.md), [검증 루프](../../development/verification.md)

## 진행 기록

- 2026-10-01: 생성.
- 2026-10-01: README 템플릿 안내, `scripts/init-project.mjs`, PR 템플릿 수정. 하네스 티켓 0001~0005를 `완료`로 정리.
- 2026-10-01: 검증. README 순서대로 `git clone --depth 1` → `.git` 삭제 → `git init`·`git add -A` 복사본을 만들어 확인.
  - `git init` 전 `init-project`는 안내와 종료 코드 1.
  - `--name copy-svc --port-offset 7`: 67개 파일 변경, `pnpm install`·`pnpm verify --fast`·`pnpm build` 통과, 스크립트 자체 삭제. 처음 시도에서 `docs:check`가 같은 날짜 변경 기록 제목 중복을 잡아 `init-project`가 기존 날짜 제목 아래에 합치도록 고침.
  - 이어서 `make up`(project `copy-svc`, API 3007·웹 5180·PG 5439·Valkey 6386), `pnpm verify` 7단계 통과, `pnpm smoke` 5 passed, `pnpm work:next`(착수 가능 없음), `pnpm work:run --dry-run` 정상. 연결 worktree의 `pnpm instance`는 슬롯 1(API 3107, project `copy-svc-copy-svc-wt`). 추적 파일에 `crelink`·`crelink` 문자열이 남지 않음(lockfile·생성물 제외 검색).
  - 별도 복사본 `--name copy-two`: 예시에서 만든 `apps/api/.env`와 슬롯 0 `.local/instance.env`는 지워지고, 템플릿 값이 없는 `apps/app/.env`는 남음. 변경 기록이 기존 날짜 제목 아래 빈 줄 없이 합쳐지고 `pnpm docs:check` 통과.
  - 시험 컨테이너·볼륨·디렉터리는 모두 지움.
- 2026-10-01: 완료.
