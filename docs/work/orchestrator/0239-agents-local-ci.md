# 0239 AGENTS.md에 로컬 CI와 PR 전용 머지 규칙 기록

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P2
- 작성일: 2026-11-10

## 목적

2026-11-10 사용자 지시로 push와 PR 머지 전 로컬 CI, PR로만 `main`을 바꾸는 규칙을 저장소 지도에 적습니다.

## 수용 기준

- [x] `AGENTS.md`에 push·머지 전 로컬 CI와 `main` PR 전용 규칙이 있습니다.
- [x] ruleset `main 보호`가 직접 push·force push·삭제를 막는지 확인했습니다.

## 범위

- 포함: `AGENTS.md`, `docs/development/verification.md`.
- 제외: ruleset 변경. 이미 적용돼 있습니다.

## 위험·복구

문서만 바꿉니다. 해당 없음.

## 연결

- 선행: [0061](0061-main-branch-protection.md), [0237](0237-local-ci-switch.md)

## 진행 기록

- 2026-11-10: API로 확인(2026-11-10T12:25+09:00). ruleset은 `active`이고 `pull_request`, `non_fast_forward`, `deletion`, `required_linear_history`, `required_status_checks` 규칙이 있습니다. admin 우회는 `bypass_mode: pull_request`이고 API의 `current_user_can_bypass`가 `pull_requests_only`여서 PR에서만 가능합니다. 직접 push를 실제로 시도해 보지는 않았습니다.
