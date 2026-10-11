# 0109 긴 worktree 경로에서 make up의 PM2 소켓 경로 초과

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 결함
- 우선순위: P2
- 작성일: 2026-10-10

## 목적

`Makefile`이 `PM2_HOME=$(CURDIR)/.local/pm2`로 두어, worktree 경로가 길면 PM2 유닉스 소켓 경로(`…/.local/pm2/interactor.sock`)가 macOS 한도(104바이트)를 넘어 `make up`이 `EINVAL`로 실패합니다. 예: `/Users/…/crelink-worktrees/0091-ai-operator-design/.local/pm2/interactor.sock`은 108자입니다. AI 운영자와 병렬 작업이 `../crelink-worktrees/<NNNN-slug>`를 쓰므로 자주 걸립니다.

## 수용 기준

- [x] 긴 worktree 경로(예: 100자 이상)에서도 `make up`·`make status`·`pnpm logs`가 동작합니다. 확인: 위 경로 길이의 worktree에서 실제 실행.

## 범위

- 포함: PM2 소켓 경로를 짧게 두는 방식(예: 짧은 임시 경로를 인스턴스 이름으로 나누기)과 `scripts/logs.mjs`·문서의 경로.
- 제외: worktree 이름 규칙 변경.

## 위험·복구

로컬 개발 도구만 바꿉니다. 기존 `.local/pm2` 데몬·로그는 자동 이전하지 않으므로 전환 전에 명시한 옛 `PM2_HOME`으로 종료한 뒤 다시 시작합니다. 되돌리기는 PR revert이며, 사용자 데이터·운영 배포·운영 DB는 변경하지 않습니다.

## 연결

- 발견: `docs/work/orchestrator/0091-ai-operator-design.md` 통합 검증
- 관련: `Makefile`, `scripts/pm2-home.mjs`, `scripts/logs.mjs`, [로컬 개발 환경](../../development/local-environment.md)

## 진행 기록

- 2026-10-10: 생성(0091 통합 중 발견).
- 2026-10-11: 실행 `c3a06373-d172-4724-ae8d-b4e32cf0cb99`에서 분류·착수했습니다(사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인). 열린 PR·실패 Deploy가 없고 0164는 배포 후 7일 표본 대기 중이므로, 이후 활성화 개선의 로컬 검증을 막는 이 무비용 결함을 선택했습니다. 브랜치 `work/0109-pm2-socket-path-length`, Orca worktree `0109-pm2-socket-path-length`에서 단일 orchestrator가 직접 수행합니다. 같은 결함 0127의 `make down` 기준도 함께 검증합니다. 오늘 병합 상한 8건에 도달해 이번 실행은 main에 머지하지 않습니다.
- 2026-10-11: `scripts/pm2-home.mjs`를 `Makefile`·`scripts/logs.mjs`의 경로 원본으로 삼았습니다. POSIX `/tmp` 아래 사용자 ID와 checkout 실제 경로의 SHA-256 일부로 데몬을 분리하고, `PM2_HOME` 환경변수·make 인수의 우선순위를 유지합니다. symlink 경로에서도 같은 checkout 홈을 사용합니다. 기존 `.local/pm2`의 자동 이전·호환 경로는 두지 않고 종료 후 재시작 절차를 문서화했습니다.
- 2026-10-11: 124바이트 경로의 독립 smoke worktree에서 실제 `make up`·`make status`·`pnpm logs api --lines 12`·`make down`을 모두 통과했습니다. API·웹·Expo PM2 프로세스의 기동과 삭제를 확인했습니다. 기본 소켓 경로는 53바이트이며 Node 유닉스 소켓 왕복 `PM2_SOCKET_OK`, 다른 checkout 홈 분리, symlink 별칭·명시 환경변수 우선순위도 일회성 실행으로 확인했습니다.
- 2026-10-11: Node 24.18.0·저장소 고정 pnpm 10.10.0으로 `pnpm verify` 8단계를 모두 통과했습니다(API 29개 suite·228건, 웹 76건). 긴 경로의 실제 API·웹에서 `pnpm smoke` 5건(health/readiness·홈 렌더링·1280px/390px 가로 넘침)을 통과했습니다. `work:scope 0109 --base origin/main`도 변경 8파일 소유 범위를 통과했습니다. OpenDesign이 없어 `od lint`는 건너뛰었고 디자인 정적 검사는 통과했습니다.
- 2026-10-11: Corepack 경유 실행·설치는 각각 20초·240초 무출력 timeout으로 실패해, 캐시에 있던 같은 고정 버전의 pnpm 실행 파일로 설치·검증했습니다. 임시 launcher와 smoke worktree를 정리하고, 두 로컬 시험 인스턴스의 컨테이너·시험 볼륨·PM2 프로세스를 제거했습니다. 최종 `pnpm verify --docs` 3단계도 통과했습니다. 운영 공개 주소·사용자 데이터·운영 DB·서버·토큰·멈춤 설정은 건드리지 않았습니다.
- 다음: PR의 CI와 최신 main 포함 여부를 확인합니다. 2026-10-12 Asia/Seoul 이후 일일 병합 수를 재확인하고, CI 통과·직전 guard 성공일 때만 병합·Deploy 확인을 수행합니다. 실사용자 지표는 이번 로컬 도구 변경의 효과로 해석하지 않습니다.
