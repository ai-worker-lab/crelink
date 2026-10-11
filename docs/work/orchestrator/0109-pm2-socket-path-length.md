# 0109 긴 worktree 경로에서 make up의 PM2 소켓 경로 초과

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 결함
- 우선순위: P2
- 작성일: 2026-10-10

## 목적

`Makefile`이 `PM2_HOME=$(CURDIR)/.local/pm2`로 두어, worktree 경로가 길면 PM2 유닉스 소켓 경로(`…/.local/pm2/interactor.sock`)가 macOS 한도(104바이트)를 넘어 `make up`이 `EINVAL`로 실패합니다. 예: `/Users/…/crelink-worktrees/0091-ai-operator-design/.local/pm2/interactor.sock`은 108자입니다. AI 운영자와 병렬 작업이 `../crelink-worktrees/<NNNN-slug>`를 쓰므로 자주 걸립니다.

## 수용 기준

- [ ] 긴 worktree 경로(예: 100자 이상)에서도 `make up`·`make status`·`pnpm logs`가 동작합니다. 확인: 위 경로 길이의 worktree에서 실제 실행.

## 범위

- 포함: PM2 소켓 경로를 짧게 두는 방식(예: 짧은 임시 경로를 인스턴스 이름으로 나누기)과 `scripts/logs.mjs`·문서의 경로.
- 제외: worktree 이름 규칙 변경.

## 위험·복구

해당 없음(로컬 개발 도구). 지금은 `make up PM2_HOME=/tmp/<짧은 이름>`으로 피할 수 있습니다(`pnpm logs`는 그 경로를 모름).

## 연결

- 발견: `docs/work/orchestrator/0091-ai-operator-design.md` 통합 검증
- 관련: `Makefile`, `scripts/logs.mjs`, `docs/development/local-environment.md`

## 진행 기록

- 2026-10-10: 생성(0091 통합 중 발견).
- 2026-10-11: 실행 `c3a06373-d172-4724-ae8d-b4e32cf0cb99`에서 분류·착수했습니다(사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인). 열린 PR·실패 Deploy가 없고 0164는 배포 후 7일 표본 대기 중이므로, 이후 활성화 개선의 로컬 검증을 막는 이 무비용 결함을 선택했습니다. 브랜치 `work/0109-pm2-socket-path-length`, Orca worktree `0109-pm2-socket-path-length`에서 단일 orchestrator가 직접 수행합니다. 같은 결함 0127의 `make down` 기준도 함께 검증합니다. 오늘 병합 상한 8건에 도달해 이번 실행은 main에 머지하지 않습니다.
