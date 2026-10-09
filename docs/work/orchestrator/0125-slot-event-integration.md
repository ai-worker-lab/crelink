# 0125 링크 슬롯 이벤트 통합 검증

- 단계: 티켓
- 역할: orchestrator
- 상위: 0089
- 선행: 0121, 0122, 0123, 0124
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

링크 슬롯 +5 이벤트 기술 설계의 티켓 분해 0125(통합)입니다. 실제 API·DB로 설계 `검증 계획`을 실행하고 에픽 0089 통합 수용 기준을 확인합니다.

## 수용 기준

- [x] `tests/e2e/slot-event.spec.ts`(Playwright 프로젝트 `slot-event`, 다른 시나리오 뒤 한 워커, 끝에 기간 되돌림)가 설계 검증 계획 1~6을 통과하고 `pnpm e2e` 전체가 통과합니다.
- [x] `pnpm verify`·`make up` 뒤 `pnpm smoke` 통과.
- [x] `tests/e2e/README.md`, 루트 `CHANGELOGS.md`, 설계 `변경 기록`, 에픽 0089 진행 기록 갱신. PR을 엽니다.

## 범위

- 포함: 위 수용 기준.
- 제외: main 머지·운영 배포(부모 세션).

## 위험·복구

설계 `위험과 스파이크`·`운영 적용 절차`를 따릅니다.

## 연결

- 설계: [링크 슬롯 +5 이벤트 기술 설계](../../specs/crelink-slot-event.md) `검증 계획`·`운영 적용 절차`
- 요구: [PRD](../../product/crelink.md) R24

## 진행 기록

- 2026-10-10: 생성(0092 설계 분해). 통합 브랜치는 `work/0092-slot-event-design`입니다.
- 2026-10-10: 통합 검증(통합 브랜치 `work/0092-slot-event-design`, 인스턴스 슬롯 3: web 5493·api 3320, Node 24.20).
  - `tests/e2e/slot-event.spec.ts` 테스트 2개(설계 검증 계획 1~6)와 Playwright 프로젝트 `slot-event`(`ad-banner` 뒤)를 더했습니다. 테스트마다 이벤트 기간을 "한 시간 전 시작·끝 없음"으로 맞추고 끝에 원래 값으로 되돌립니다. BFF로 직접 신청할 때는 같은 출처 검사 때문에 `Origin`을 붙입니다.
  - `pnpm e2e`: 14/14 통과(main 8 → ad-banner 4 → slot-event 2 순서, 1.1분). 실행 뒤 `GET /api/public/slot-event`가 시드 값(`startsAt` 2026-10-09T15:41:12.569Z, `endsAt` null, `open`)으로 돌아와 있음을 확인했습니다.
  - `pnpm verify`: 8단계 모두 통과(API 190/190, 웹 48/48). `pnpm design:check --require-lint` 통과(`design/slot-event/`에 지적 없음). `pnpm smoke` 5/5 통과.
  - `make up`·`make status`는 pm2 `.local/pm2/interactor.sock` 연결 `EINVAL`로 실패했습니다(worktree 경로가 길어 유닉스 소켓 경로 한도를 넘는 것으로 보임 `[INFERENCE]`). API(`nest start --watch`)·웹(`next dev`) 프로세스는 이 worktree 코드로 떠 있었고 `GET /api/health/ready` 200이라 smoke·E2E는 그 인스턴스로 실행했습니다. 분류 대기 [0127](0127-pm2-socket-path-too-long.md)로 등록했습니다.
  - 작업 중 worktree의 `package.json`·`pnpm-lock.yaml`이 누가 바꿨는지 모르게 바뀌어 있어(`@playwright/test` 1.64 등, 하위 에이전트들은 바꾸지 않았다고 보고) 범위 밖이라 되돌리고 `pnpm install --frozen-lockfile`로 맞췄습니다.
- 2026-10-10: PR [#69](https://github.com/ai-worker-lab/crelink/pull/69).
- 2026-10-10: main `7950025`(#69)로 운영에 배포했습니다(Deploy 37961349623 success). 상태를 `완료`로 바꿉니다.
