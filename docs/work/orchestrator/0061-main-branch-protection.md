# 0061 main 브랜치 보호(ruleset)와 필수 검사 `CI 통과`

- 단계: 티켓
- 역할: orchestrator
- 상태: 완료
- 종류: 운영
- 우선순위: P1
- 작성일: 2026-10-08

## 목적

저장소를 여러 사람이 씁니다(`shaul1991` admin, `ysgy1121` maintain). 사용자가 2026-10-08에 저장소를 공개로 바꿔 Free 조직에서도 브랜치 보호를 쓸 수 있게 되었습니다(비공개일 때 rulesets API 403 "Upgrade to GitHub Pro or make this repository public"). main 머지를 PR·CI 통과·최신 main 기준으로 강제합니다.

필수 검사를 기존 job 이름으로 걸면 문서만 바뀐 PR에서 matrix job(`check`·`이미지 빌드`)이 건너뛰어 `check (Node ${{ matrix.node }})`처럼 치환되지 않은 이름으로 보고되고(PR #56에서 확인), 필수로 건 `check (Node 24)`가 끝내 오지 않아 머지가 막힙니다. 그래서 모든 job 결과를 모으는 `CI 통과` job 하나만 필수로 겁니다.

## 수용 기준

- [x] `ci.yml`에 `CI 통과` job: 모든 job 뒤 `always()`로 돌고, 하나라도 `failure`·`cancelled`면 실패, 건너뜀은 통과.
- [x] 저장소 머지 설정: squash만, 브랜치 갱신 제안, 머지 뒤 브랜치 삭제.
- [x] ruleset `main 보호`(기본 브랜치): 삭제·force push 금지, 선형 이력, PR 필수(승인 0, squash), 필수 검사 `CI 통과`(GitHub Actions)·최신 main 기준. 우회는 admin의 PR 머지만.
- [x] 공개 저장소 설정: 외부 기여자 fork PR 워크플로 승인 필요, secret scanning·push protection 켬.
- [x] 확인: main 직접 push 거부, `CI 통과` 전 머지 불가, 이 PR에서 `CI 통과` 성공.
- [x] 검증 루프 문서(CI 절·머지 규칙)와 변경 기록 갱신.

## 범위

- 포함: `.github/workflows/ci.yml`, GitHub 저장소 설정·ruleset(API), `docs/development/verification.md`, 변경 기록.
- 제외: 리뷰 승인 필수(승인 수 1), CODEOWNERS, 라이선스.

## 위험·복구

`CI 통과`가 보고되지 않는 실행(워크플로 문법 오류, Actions 장애)은 머지를 막습니다. 그때 admin은 bypass로 PR을 머지하고(로컬 `pnpm verify`·`pnpm smoke` 결과를 PR에 적음) 배포는 `infra/prod/deploy-local.sh`를 씁니다. 되돌리기: Settings → Rules → Rulesets에서 `main 보호` 끄기(Enforcement Disabled) 또는 `gh api -X DELETE repos/ai-worker-lab/crelink/rulesets/<id>`.

## 연결

- 검증 루프: [CI](../../development/verification.md#ci)
- 배경: 0060(main 머지 뒤 CI 재실행 없앰). 최신 main 기준 필수 검사로 PR 검사 내용과 머지 결과가 같아져 main 재검사가 필요 없습니다.

## 진행 기록

- 2026-10-08: 생성, 브랜치 `work/0061-main-branch-protection`. 계기: 사용자 공개 전환("공개로 전환햤다")과 앞선 요청("main 브랜치 보호 설정 가이드해줘"). 확인: 저장소 `visibility: public`, 0060 머지(`de51721`) push로 Deploy만 실행되고(`plan` api·web·release 모두 아니오, 나머지 건너뜀) CI push 실행은 없음.
- 2026-10-08: 구현·적용. `ci.yml`에 `CI 통과` job(`needs` 6개, `if: always()`, `join(needs.*.result)`에 `failure`·`cancelled`가 있으면 실패), `actionlint` 통과. API로 적용: 머지 설정(`allow_squash_merge`만 true, `allow_update_branch`·`delete_branch_on_merge` true), `security_and_analysis`(secret scanning·push protection enabled), fork PR 승인 `all_external_contributors`, ruleset `main 보호`(id 24742803, `~DEFAULT_BRANCH`, deletion·non_fast_forward·required_linear_history·pull_request(승인 0, squash)·required_status_checks(`CI 통과`, integration 15368, strict), 우회 admin `pull_request`). 확인: `rules/branches/main`이 규칙 5개를 돌려줌, main 직접 push(빈 커밋)가 `GH013 ... push declined due to repository rule violations`로 거부됨. 문서: 검증 루프 CI 절(머지 규칙·`CI 통과`·admin 우회 머지), 루트 변경 기록.
- 2026-10-08: PR #58 첫 CI: `CI 통과`가 의도대로 실패(결과 `success skipped failure success success success`, 머지 상태 `BLOCKED`). 원인은 `check (Node 24)`의 `apps/api` `test/short-link.e2e-spec.ts` "통과 표시" 1건: 만료 시각을 초 단위로 내림해 59초 전 발급 표시의 남은 시간이 1~1000ms라 요청 중 만료되는 흔들리는 시험(Node 26·로컬 통과). 시험의 유효 쪽을 50초 전 발급으로 고침(서비스 코드 변경 없음), 로컬 그 spec 8건 통과.
- 2026-10-08: 수정 커밋의 CI: 9개 job 모두 통과(`docs`는 코드 변경이라 건너뜀), `CI 통과` 성공, 머지 상태 `BLOCKED` → `CLEAN`. 이 기록 커밋의 CI가 통과하면 squash 머지(배포 대상 경로 변경 없음, 시험 파일만).
