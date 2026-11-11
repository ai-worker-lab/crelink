# 0283 API GHCR 캐시·읽기 우회·실측

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P1
- 작성일: 2026-11-12

## 목표와 기준

사용자가 승인한 API 이미지 cache 복원 지연 개선. API만 registry cache와 cache 읽기 우회를 구현하고, 운영과 격리한 seed/warm/bypass 실측으로 판단한다. [인프라 계약](../../../contracts/0283-api-build-cache/5-infra.contract.md)이 흐름·불변식 원본이며 SSoT는 docs/specs/crelink-prod-deploy.md와 infra/docs/prod-runbook.md의 api-cache-2026-11-12-r1/u1이다. 과거0282는 변경하지 않는다.

## 수용 기준

- [ ] API registry/default/bypass, web·Sentry·production SHA tag·무중단/롤백 불변식
- [ ] 벤치 production writes/jobs0, 동일 SHA/amd64·동일 fixture의 warm/bypass 및 miss/seed 실측
- [ ] actionlint·필수 full1회/report0·최종 양측 검수/complete·코드 PR 반영
- [ ] 문서 전용 마감에서 실제 결과·현재 상태·원본 증거 연결

## 진행 기록

- 2026-11-12: task-cdf1c7866d134f879599872aa92847aa, CTO R1→R2로 prepush와 실제 layer 복원 측정 조건을 보정했다. 계획 단계의 사용자 추가 승인 대기는 없다. 실제 결과는 아직 미확인이다.
- 2026-11-12: R2 최소 구현을 마쳤다. 실행 변경은 `.github/workflows/deploy.yml` 하나이며 `api_cache` choice, API registry/default/bypass·웹 GHA 유지, 운영 네 job skip·별도 concurrency의 branch 수동 벤치, seed 미존재 ref fallback·동일 warm/bypass 주석 fixture·amd64 OCI·필수 export를 반영했다. SSoT `api-cache-2026-11-12-r1/u1`과 root/infra 변경 기록을 갱신했다.
- 2026-11-12: 실제 확인: `actionlint .github/workflows/deploy.yml`(1.7.12), 변경 파일 Prettier 검사, `pnpm work:scope 0283`, `pnpm work:check`, `git diff --check` 통과. YAML 비교 정적 검사로 캐시/벤치 분기 외 기존 운영 job·이미지/Sentry 업로드 실패·secret mount·권한·force·배포/롤백 설정 보존과 bench 격리 조건을 확인했다. 실제 cache hit·compile 실행·export·production jobs skip은 아직 실측하지 않았다.
- 2026-11-12: **메인 CI 준비 상태**로 `검증`에 넘긴다. DB·Docker·실제 벤치·전체 CI·commit/push·양측 검수·배포는 미실행이며 수용 기준은 미체크다. 이후 Coordinator가 clean SHA full1회 → push/report0 → 동일 SHA bench3회 → 증거 확보 → 최종 양측/complete → 코드 PR merge·Deploy 확인 → 문서 전용 마감 PR(u2)을 수행한다. 실제 측정 결과는 코드 branch에 기록하지 않으며 문서 마감은 pending이다.
