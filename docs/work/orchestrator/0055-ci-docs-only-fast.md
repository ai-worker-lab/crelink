# 0055 문서만 바뀐 변경의 CI를 문서 검사만으로 줄이기

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-08

## 목적

CI는 경로와 관계없이 PR·main push마다 job 6개(Node 24·26 빌드·DB 시험, smoke, API·웹 이미지 빌드, work scope)를 돌립니다. 문서·디자인 산출물만 바뀐 변경에서는 빌드·시험 결과가 달라지지 않는데도 PR과 머지 뒤 push에서 두 번씩 돌아 시간·러너 사용량이 듭니다. 재배포는 이미 Deploy `plan`이 경로로 건너뜁니다.

## 수용 기준

- [x] CI `changes` job이 바뀐 파일이 문서뿐인지(`docs/`·`design/`·`*.md`, `RELEASES.md` 제외) 판정하고, 문서뿐이면 `docs` job(`pnpm verify --docs`)만, 아니면 기존 `check`·`smoke`·이미지 빌드를 돌린다. 비교 기준이 없으면 전체 검사.
- [x] `pnpm verify --docs`가 `work:check → docs:check → design:check`를 실행하고, `--fast`와 함께 쓰면 사용법 오류로 끝난다.
- [x] 검증 문서 CI 절·완료 보고 전 확인 범위, `AGENTS.md` 명령표, 변경 기록이 새 동작을 설명한다.
- [ ] 다음 문서만 바뀐 PR에서 `docs`·`work scope`만 돌고 나머지가 skipped인 것을 확인한다.

## 범위

- 포함: `.github/workflows/ci.yml`, `scripts/verify.mjs`, 문서.
- 제외: Deploy 워크플로(이미 경로로 배포를 건너뜀), 코드 변경의 영역별(API·웹만) 세분화.

## 위험·복구

판정이 틀려 코드 변경을 문서로 보면 그 변경의 빌드·시험을 건너뜁니다. 그래서 문서 판정은 좁게(`docs/`·`design/`·`*.md`) 두고 `RELEASES.md`와 비교 불가는 코드로 봅니다. 저장소가 비공개 Free 조직이라 브랜치 보호의 필수 검사가 없어(`branches/main/protection` API 403), 건너뛴 job 때문에 PR이 막히지 않습니다. 되돌리기는 이 변경 revert입니다.

## 연결

- 기준: [검증 루프 CI](../../development/verification.md#ci), [운영 확인](../../development/verification.md#운영-확인)
- 코드: `.github/workflows/ci.yml`, `scripts/verify.mjs`, `.github/workflows/deploy.yml`(`plan`의 경로 판정)

## 진행 기록

- 2026-10-08: 생성·구현. 사용자 질문("docs 같은 경우는 ci/cd가 동작하지 않아도 되지 않나?")에 대한 확인: Deploy는 이미 경로로 이미지·배포를 건너뛰고(`cebcecb` 실행에서 `plan`만 성공·나머지 skipped), 비용은 CI 전체 job에서 듦. 사용자 결정: 진행. 같은 PR에 운영 확인 규칙(`AGENTS.md`, 검증 문서 `운영 확인` 절)을 묶어 CI를 한 번만 돌림. 판정에서 `.md`·`design/`을 문서로 보는 근거: `.prettierignore`가 `*.md`·`design/`을 빼서 lint 결과가 바뀌지 않음, 웹이 빌드 때 읽는 Markdown은 `RELEASES.md`뿐(`apps/web/src/app/(public)/docs/releases/page.tsx`).
- 2026-10-08: 확인. `pnpm verify --docs` 3단계 통과(0.8s), `--docs --fast`는 사용법 오류(종료 코드 2), `actionlint .github/workflows/ci.yml` 통과, `scripts/verify.mjs` ESLint·Prettier 통과. 판정 로직을 `bash -eo pipefail`로 따로 돌려 문서만(`AGENTS.md`·`docs/`·`design/`·영역 README)·빈 목록 → `code=false`, `RELEASES.md` 포함·`apps/` 포함·`.github/` 포함 → `code=true` 확인. 이 PR은 `ci.yml`을 바꿔 전체 검사가 돌고, 문서 경로는 다음 문서 PR에서 확인함.
