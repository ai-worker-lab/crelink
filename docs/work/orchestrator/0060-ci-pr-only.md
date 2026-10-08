# 0060 main 머지 뒤 CI 재실행 없애기(Actions 사용 시간 줄이기)

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-08

## 목적

GitHub Actions 무료 몫(Free 조직, 비공개 저장소, 월 2,000분)을 2026-10에 넘겨(Linux 2,073분, 사용량 API `settings/billing/usage/summary`) job이 막혔습니다. 2026-10 실행 중 최근 100회의 job 시간 815분 가운데 main push의 `CI`가 295분(36%)이었고, 같은 내용은 PR에서 이미 검사했습니다. 사용자 지시("main 머지 뒤에는 다시 ci 동작 제거하는것도 추가하자")에 따라 `CI`는 PR에서만 돌리고, 배포는 main push에서 바로 시작합니다.

## 수용 기준

- [x] `ci.yml`은 `main` 대상 `pull_request`에서만 실행된다(main push 트리거 없음).
- [x] `deploy.yml`은 main `push`(또는 main에서 `workflow_dispatch`)로 시작하고 배포 대상 커밋은 push된 커밋이다. 변경 판별·이미지·배포·운영 주소 검사·롤백·태그 동작은 그대로다.
- [x] 검증 루프·운영 배포 설계·런북의 트리거 서술과 변경 기록을 고친다.
- [x] `actionlint`(가능하면)·`pnpm verify --fast` 통과.

## 범위

- 포함: `.github/workflows/ci.yml`·`deploy.yml` 트리거와 그에 딸린 분기, `docs/development/verification.md`, `docs/specs/crelink-prod-deploy.md`, 런북 트리거 서술, 변경 기록.
- 제외: Node 26 matrix·PR 이미지 빌드 축소(사용자가 고르지 않음), 저장소 공개 전환, self-hosted runner, GitHub 결제 설정.

## 위험·복구

main은 브랜치 보호가 없어 CI가 실패했거나 오래된 기준 위의 PR도 머지할 수 있고, 이제 main에서 다시 검사하지 않습니다. 남는 안전장치는 배포의 이미지 빌드(실패하면 배포 안 함)와 운영 주소 검사·자동 롤백입니다. 그래서 PR은 최신 main 위에서 CI(또는 Actions가 막혔을 때 로컬 `pnpm verify`·`pnpm smoke`)가 통과한 뒤 머지합니다. 되돌리기는 이 커밋 revert.

## 연결

- 검증 루프: [CI](../../development/verification.md#ci), 배포 설계: [워크플로](../../specs/crelink-prod-deploy.md#워크플로)
- 배경: 0059(Actions 없이 배포)

## 진행 기록

- 2026-10-08: 생성, 브랜치 `work/0060-ci-pr-only`. 계기: 사용자 지시(위 목적).
- 2026-10-08: 구현. `ci.yml`: `push` 트리거, `changes`의 push 비교(`github.event.before`) 분기, `work scope`의 이벤트 조건 제거. `deploy.yml`: `workflow_run` → `push: branches: [main]`, `plan` 조건 `github.ref == 'refs/heads/main'`, 배포 커밋 `GITHUB_SHA`(태그 push는 브랜치 필터에 걸리지 않아 `record`가 다시 배포를 부르지 않음). Tailscale OIDC subject(`ref:refs/heads/main`)는 push에서도 같아 바꿀 것 없음. 문서: 검증 루프 CI·CD, 배포 설계 워크플로 표, 런북 2-2·5, 변경 기록(루트·인프라). 확인: `actionlint .github/workflows/*.yml` 통과, `pnpm verify --fast` 통과. 실제 트리거 동작은 Actions 무료 몫이 2026-11-01에 돌아온 뒤 첫 PR·머지에서 확인(지금은 job이 시작되지 않음).
