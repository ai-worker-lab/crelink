# 0127 긴 worktree 경로에서 make up·make status의 pm2 소켓 오류

- 단계: 티켓
- 역할: orchestrator
- 상태: 보류/종료
- 종류: 결함
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-10

## 목적

`../crelink-worktrees/<NNNN-slug>` 위치의 worktree(예: `/Users/…/crelink-worktrees/0092-slot-event-design`)에서 `make up`·`make status`가 pm2 `.local/pm2/interactor.sock` 연결에서 `EINVAL`로 끝납니다(exit 2·1). 소켓 경로가 macOS 유닉스 소켓 경로 한도(104바이트)를 넘기 때문으로 보입니다 `[INFERENCE]`. API·웹 프로세스는 떠 있지만 상태 확인·종료 명령이 실패해 에이전트가 인스턴스를 다루기 어렵습니다. 0092 통합 중 발견했습니다.

## 수용 기준

- [ ] 긴 worktree 경로에서도 `make up`·`make status`·`make down`이 성공합니다(예: `PM2_HOME`을 짧은 경로로 두기). 확인: 경로 길이 100자 이상 worktree에서 세 명령 실행.

## 범위

- 포함: 로컬 실행 스크립트의 pm2 홈 경로.
- 제외: 운영 배포.

## 위험·복구

해당 없음(로컬 개발 환경만).

## 연결

- 발견: `docs/work/api/0121-slot-event-api.md` 진행 기록, `docs/work/orchestrator/0125-slot-event-integration.md`
- 관련: [로컬 개발 환경](../../development/local-environment.md)

## 진행 기록

- 2026-10-10: 생성(0092·0125 통합 중 발견, 이 에픽 범위 밖).
- 2026-10-11: 0109와 같은 PM2 소켓 경로 결함으로 중복 종료합니다. 대체 항목 [0109](0109-pm2-socket-path-length.md)에서 이 티켓의 `make up`·`make status`·`make down` 수용 기준까지 함께 확인합니다. 별도 원인이 확인되면 재개합니다.
