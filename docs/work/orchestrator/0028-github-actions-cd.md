# 0028 GitHub Actions CD(배포·롤백)와 CI 보강

- 단계: 티켓
- 역할: orchestrator
- 상위: 0024
- 선행: 0025, 0026, 0027
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-06

## 목적

main 병합 시 CI 통과 뒤 API(OCI)와 웹(Vercel)을 자동 배포하고 실패 시 자동 롤백, 수동 롤백 워크플로와 의존성 자동화를 추가합니다.

## 수용 기준

- [x] `.github/workflows/deploy.yml`이 설계 `CD 흐름`대로 동작한다: `workflow_run`/`workflow_dispatch`, 변경 영역 판별, arm64 이미지 GHCR 푸시, SSH 배포(`infra/prod/deploy.sh`), Vercel CLI 배포, 운영 주소 검사, 실패 시 자동 롤백. 시크릿 이름은 설계 표와 같다. 권한은 최소(`contents: read`, 필요한 job만 `packages: write`).
- [x] `.github/workflows/rollback.yml`(`workflow_dispatch`, 입력 target·api_tag).
- [x] CI에 API 이미지 빌드 검증(푸시 없이 `linux/arm64` 빌드)을 추가한다. 기존 check·smoke는 유지한다.
- [x] `.github/dependabot.yml`(npm 워크스페이스·GitHub Actions·Docker, 주 1회), 워크플로 문법 검사(가능하면 `actionlint`), `docs/development/verification.md`·`docs/architecture/external-dependencies.md`·`CHANGELOGS.md` 갱신.
- [x] 비밀값·계정이 필요한 단계는 로컬에서 실행하지 않고 `0029`에서 확인한다고 문서에 명시한다.

## 범위

- 포함: `.github/**`, `docs/**`, 루트 설정.
- 제외: `infra/prod/`·앱 코드(다른 티켓), 실제 prod 실행(0029).

## 위험·복구

워크플로는 사용자가 secrets를 넣기 전에는 배포 단계에서 실패하거나 건너뜁니다(secrets 없으면 job을 실행하지 않는 조건). 잘못된 배포는 자동·수동 롤백으로 복구합니다.

## 연결

- 설계: [docs/specs/crelink-prod-deploy.md](../../specs/crelink-prod-deploy.md)
- 결정: [ADR 0010](../../adr/0010-prod-deployment-topology.md)

## 진행 기록

- 2026-10-06: 생성.
- 2026-10-06: 구현. `.github/workflows/deploy.yml`(plan: 배포 커밋·영역별 변경(태그 `deploy/prod-api`·`deploy/prod-web` 기준이라 시크릿 없이 건너뛴 실행이 변경을 삼키지 않음)·시크릿 준비 여부 → API 이미지(arm64, GHCR, gha 캐시) → API 배포(rsync `infra/prod/` + SSH `deploy.sh`, 토큰은 stdin) → 웹 배포(Vercel CLI, 승격 뒤 검사 실패 시 `vercel rollback`) → 운영 주소 검사, 성공한 영역만 태그 이동), `rollback.yml`(api·web·both, 입력값 형식 검사), CI에 `API 이미지 빌드`(푸시 없음), `dependabot.yml`(npm·Actions·Docker 주 1회). 문서: `docs/development/verification.md`(CI·CD 절), `docs/architecture/deployment-target.md`, `external-dependencies.md`. `actionlint`(shellcheck 연동) 통과.
- 2026-10-06: 서버 공용 edge Caddy 결정에 맞춰 rsync에서 `edge/`·`tests/` 제외. GHCR pull은 장기 토큰 대신 job의 `GITHUB_TOKEN`(`packages: read`)을 stdin으로 넘기도록 변경(시크릿 `GHCR_PULL_*` 불필요). 배포 전용 사용자 `deploy`·키를 서버에 만들고 GitHub secrets `OCI_HOST`·`OCI_USER`·`OCI_SSH_KEY`·`OCI_KNOWN_HOSTS` 등록(호스트 키는 기존 신뢰 지문과 대조). 시크릿·계정이 필요한 실행 확인은 0029. `actionlint` 통과.
- 2026-10-06: 통합 확인(브랜치 `work/0024-prod-deploy`). 이미지 한도를 4MB로 맞춤(shared·API 메시지·테스트·문서). `pnpm verify` 8단계 통과(API 테스트 포함), `make api-restart` 뒤 `pnpm e2e` 6 passed, `pnpm smoke` 5 passed, `infra/prod/tests/caddy-routing.sh` 전 요청 일치. 상태 `완료`. 실서버 적용은 0029.
