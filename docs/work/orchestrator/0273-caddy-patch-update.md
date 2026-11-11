# 0273 PR #178 Caddy 패치 갱신 준비

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P2
- 작성일: 2026-11-11

## 목적

PR #178의 Caddy 패치 갱신을 로컬 검증하고 원래 PR 브랜치에 CI 근거를 남깁니다. 인프라 설정과 루트 `contracts/` 인계를 함께 다뤄 `orchestrator` 범위로 둡니다.

## 수용 기준

- [x] 제품 변경은 `infra/prod/edge/compose.yaml`의 Caddy 2.11.9-alpine 갱신뿐이며, 라우팅 시험도 같은 이미지를 사용합니다.
- [x] prod Compose 문법·셸 검사·로컬 시험 4개가 통과합니다.
- [x] `pnpm install --frozen-lockfile`, `pnpm work:scope 0273 --base origin/main`, `pnpm ci:local`이 통과합니다.
- [ ] 검증 후 커밋·일반 push하고 같은 SHA에서 `pnpm ci:local --report`가 성공합니다.

## 범위

- 포함: #178 Caddy 이미지 갱신, 라우팅 시험 이미지 연동, 관련 문서·변경 기록·인프라 계약, 로컬 검증과 CI status 기록.
- 제외: 검수(`review-*`), 완료 처리, PR 머지, 다른 PR 작업, 운영 직접 시험·적용.

## 위험·복구

고정 edge 이미지 교체는 컨테이너 재생성과 짧은 접속 공백이 필요합니다. 일반 앱 배포·롤백은 고정 edge 이미지를 바꾸지 않습니다. 복구 절차는 [인프라 계약](../../../contracts/0273-caddy-patch-update/5-infra.contract.md)에 둡니다.

## 연결

- [PR #178](https://github.com/ai-worker-lab/crelink/pull/178)
- [운영 Compose](../../../infra/prod/edge/compose.yaml), [prod 검증](../../../infra/prod/README.md#문법-확인)
- [인프라 계약](../../../contracts/0273-caddy-patch-update/5-infra.contract.md)

## 진행 기록

- 2026-11-11: 사용자 지정 원래 Dependabot 브랜치에서 착수했습니다(브랜치명 규칙의 명시적 예외). 시작 HEAD `64fffd8`은 최신 `origin/main`을 포함하며 비교 결과 제품 변경은 Caddy 이미지 한 줄입니다. 이미 main에 병합된 Instagram 변경은 범위에 포함하지 않습니다. 로그는 `/tmp/crelink-pr178-*.log`에 저장하며 인증정보·Compose 전체 설정은 출력하지 않습니다.

- 2026-11-11: 하위 개발 프로세스는 sandbox의 npm DNS·Docker 소켓·PM2 접근 제약으로 검증을 마치지 못해 중단했습니다. coordinator가 같은 worktree에서 직접 설치·검증을 이어받았습니다. `CI=true PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm install --frozen-lockfile` 통과, Node 24.22.2 기준 `pnpm ci:local` 11단계 통과·실패 0·스택 정리 1단계 건너뜀(118.9초). API 47개 suite·739 tests 통과. 최초 실행의 문서 anchor 2건은 수정 후 재검증했습니다.
- 2026-11-11: prod blue·green·edge `config --quiet`, `bash -n`, `shellcheck -x` 통과. Docker 격리 시험은 caddy-routing 172·deploy-rollback 97·zero-downtime 26·cutover-rehearsal 57건 모두 통과했습니다. 무중단 부하 1,560건 중 오류 0, 긴 요청 34/34 완료. cutover/revert 공백은 각각 최대 0.3/1.4/0.5초로 측정됐으며 고정 edge 이미지 재생성의 운영 측정은 아닙니다. 원본 로그는 Git 밖 `/tmp/crelink-pr178-*-parent.log`에만 있습니다.
- 머지 전 고정 커밋에 `pnpm ci:local --report`와 양측 검수 완료 게이트를 실행합니다. 결과는 GitHub PR 검사 및 settings-sync 실행 기록에 남기며 이 문서에서 미실행 결과를 선기재하지 않습니다. 운영 edge 이미지 적용은 별도입니다.
