# 0237 PR CI를 로컬로 전환

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 유지보수
- 우선순위: P2
- 작성일: 2026-11-10

## 목적

사용자 결정(ADR 0016 결정 5, 2026-11-10 재지시)대로 PR마다 도는 GitHub Actions CI를 없애고 머지 전 검사를 이 기기에서 실행합니다.

## 수용 기준

- [ ] PR을 열거나 갱신해도 GitHub Actions CI가 자동으로 돌지 않습니다. `ci.yml`은 수동 실행으로 남습니다.
- [ ] ruleset의 필수 검사 `CI 통과`를 `pnpm ci:local --report`의 commit status로 충족해 PR을 머지할 수 있습니다.
- [ ] Deploy는 그대로 동작합니다.
- [ ] 로컬에 없는 검사와 수동 실행 기준이 문서에 있습니다.

## 범위

- 포함: `.github/workflows/ci.yml`, `scripts/ci-local.mjs` 주석, `docs/development/verification.md`, ADR 0016 결정 5, README, 변경 기록, ruleset `main 보호`의 `integration_id` 제거.
- 제외: 나머지 Playwright 시험의 ego-lite 전환(creator, operator, notices, guestbook, instabio-import, personas, 3엔진). 로컬 Playwright 설치.

## 위험·복구

로컬 CI에는 핵심 사용자 E2E가 없어 이 흐름의 회귀가 머지 전에 잡히지 않을 수 있습니다. 위험한 변경은 `ci.yml`을 수동 실행합니다. 되돌리려면 이 변경을 revert하고 ruleset에 `integration_id: 15368`을 다시 넣습니다.

## 연결

- 결정: [ADR 0016](../../adr/0016-devoffice-takeover.md), 선행 [0210](0210-local-ci.md)
- 코드: `scripts/ci-local.mjs`, `.github/workflows/ci.yml`

## 진행 기록

- 2026-11-10: 생성. GitHub 문서 기준 공개 저장소의 표준 러너는 무료(2026-11-10T11:50+09:00 확인)여서 지금 분 소진으로 CD가 멈출 위험은 없지만, 사용자 결정대로 전환합니다.
