# 0059 GitHub Actions 없이 운영 배포(운영자 컴퓨터에서 서버 빌드)

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 운영
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-08

## 목적

GitHub Actions의 월 사용량 한도를 넘어 CI·CD job이 시작되지 않습니다(2026-10-08 PR #53·#54 실행: "recent account payments have failed or your spending limit needs to be increased"). main에 머지해도 `deploy.yml`이 돌지 않아 운영에 반영되지 않습니다. 사용자 지시("github action 대신 다른 방법으로 배포해야한다")에 따라 Actions 없이 같은 무중단 배포를 실행하는 방법을 둡니다.

## 수용 기준

- [ ] 운영자 컴퓨터에서 `infra/prod/deploy-local.sh` 한 번으로 `deploy.yml`과 같은 순서(변경 판별 → 이미지 → `ssh-entry.sh deploy` → 운영 주소 검사·실패 시 롤백 → 배포 기록 태그)로 배포된다. 이미지는 대상 서버에서 빌드한다(서버 플랫폼, GHCR·Actions 불필요).
- [ ] `--dry-run`이 아무것도 바꾸지 않고 배포 커밋·빌드 영역·대상을 보여 준다.
- [ ] 런북·`infra/prod/README.md`·검증 루프 문서에 절차와 한계(소스맵 업로드 없음, 이미지는 서버에만)가 있다.
- [ ] 실제로 main을 이 방법으로 운영에 배포하고 운영 주소 검사가 통과한다.

## 범위

- 포함: `infra/prod/deploy-local.sh`, 런북 16절, `infra/prod/README.md`, `docs/development/verification.md` CD 서술, 변경 기록.
- 제외: GitHub 결제·한도 변경(사용자), 다른 CI 서비스 도입, `deploy.yml` 변경.

## 위험·복구

배포는 서버의 기존 `deploy.sh`(무중단 전환, 실패 시 무변경)를 그대로 쓰므로 전환 동작은 같습니다. 운영 주소 검사가 실패하면 스크립트가 `rollback`을 실행합니다. 수동 복구는 런북 "7. 롤백". Sentry 소스맵은 올리지 않습니다(토큰이 GitHub secret에만 있음).

## 연결

- 배포 설계: [운영 배포 설계](../../specs/crelink-prod-deploy.md), 워크플로 `.github/workflows/deploy.yml`, 서버 스크립트 `infra/prod/deploy.sh`·`ssh-entry.sh`
- 런북: [16. GitHub Actions 없이 배포](../../../infra/docs/prod-runbook.md#16-github-actions-없이-배포)

## 진행 기록

- 2026-10-08: 생성, 브랜치 `work/0059-manual-deploy`(main에서, 별도 worktree). 확인: `ssh home-server`는 root, 서버 amd64·8코어·31GB, `deploy` 사용자는 docker 그룹, `/usr/local/lib/crelink/ssh-entry.sh` 설치됨, 활성 색 blue·릴리스 `ed4ce75`(0053)·API 이미지 `1643c70`. `lib.sh registry_login`은 토큰이 없으면 로그인하지 않고 서버 이미지만 씀(`ensure_image`는 있으면 pull 안 함). `gh variable list`로 Sentry 변수 4개 확인(secret `SENTRY_AUTH_TOKEN`·`DEPLOY_SSH_KEY`는 값을 읽을 수 없음).
