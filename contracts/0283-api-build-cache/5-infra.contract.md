# 0283 API 빌드 캐시 인프라 계약

- 작업: task-cdf1c7866d134f879599872aa92847aa / work/0283-api-build-cache
- 입력: main 7a8774c, contract-policy-2026-11-11-r2/u3
- SSoT: docs/specs/crelink-prod-deploy.md·infra/docs/prod-runbook.md, 범위 api-cache-2026-11-12-r1/u1
- 사용자: 요구/실행 승인. DEV: 구현/현재 기준 쓰기. Coordinator: 검증·통합/증거 마감.

## CTO 결정 이력

R1(run-d125d730611b45bf9a157e987ebfa339)은 기존 Deploy에 choice 입력/bench job, API registry 캐시, 웹 GHA 유지, 벤치 분리 concurrency를 선택했다. actionlint만 실행한 push와 출력 없는 전부-hit warm 측정 제안은 R2에서 철회했다.

R2(run-1e9938bd67f149868c4885e91599ba2d)은 push 전 full1회, 실제 OCI 출력, seed 원본/warm·bypass 동일 주석 fixture, 마감 문서 PR을 채택했다. 아래 흐름은 D93에 맞춰 PR 생성 전에 최종 양측 검수를 수행하도록 명확화한 통합 기준이다. raw CLI 출력은 Git 밖에 보관한다.

## 변경과 불변식

- `.github/workflows/deploy.yml`만 실행 변경. 입력 `api_cache`: default/bypass/bench-seed/bench-warm/bench-bypass, 기본 default. 기존 force 의미 유지.
- API: registry `<IMAGE_PREFIX>-api:buildcache`에서 읽고 같은 tag에 mode=max로 쓴다. bypass는 cache-from만 빈 값, cache-to는 유지. production cache export는 ignore-error=true로 cache 저장 실패와 실제 이미지/배포 실패를 구분한다. 기존 production SHA tag·Sentry secret mount/실패 정책·권한은 그대로다.
- web: 기존 GHA scope=web. main/default production 동작과 Blue/Green·헬스·롤백·deploy-prod 직렬화 보존. bench는 별도 concurrency 그룹이며 plan/image/deploy/record를 모두 건너뛴다.
- bench job: 기존 Deploy의 수동 실행에서 branch 선택 가능. needs 없음, contents:read/packages:write만. Tailscale/SSH/id-token/Sentry secret·실제 운영 요청·production image tag·배포 태그 쓰기 없음.
- bench cache ref: 같은 package의 `buildcache-bench-<sha>` 고유 tag. seed 실행 전에 없는 tag여야 한다. 입력값은 shell 실행 문자열로 보간하지 않고 env/고정 choice로 처리한다. falsy인 빈 문자열을 &&/|| ternary의 중간값으로 사용해 bypass를 무효화하지 않는다.

## 실측 계약

동일 Git SHA·ubuntu amd64·Dockerfile에서 seed→warm→bypass를 순차 각1회 실행한다. 실행마다 새 runner/builder를 사용한다. 동일 builder의 로컬 cache로 warm을 꾸미지 않는다.

| 모드 | 소스 context | cache-from | cache-to |
| --- | --- | --- | --- |
| seed | 원본 checkout | 미존재 bench ref(실제 import miss fallback) | bench ref |
| warm | main.ts에 고정 주석1줄 추가 | 채운 bench ref | bench ref |
| bypass | warm과 정확히 같은 주석 fixture | 없음 | bench ref |

- 모든 모드에 `outputs: type=oci,dest=<runner.temp>/api-bench.tar`, push=false. OCI 파일 생성·크기와 source/fixture hash·builder/플랫폼을 기록한다. Dockerfile이나 저장소의 실제 API 코드는 수정하지 않는다.
- warm은 부모 의존성 CACHED, API COPY/compile은 실행되어야 한다. 동일 context의 전부 CACHED를 실제 hotfix 성능으로 보고하지 않는다. benchmark tag는 warm에서 갱신돼도 bypass가 읽지 않으므로 순서 비교가 가능하다.
- 모든 mode의 cache export 성공과 OCI 파일이 필수다. production의 best-effort export와 달리 bench는 export 오류를 차단하거나 inspect/로그로 실제 성공을 필수 대조한다. Sentry secret은 없고 SENTRY_UPLOAD=no, release는 동일 Git SHA다. 실제 운영 Sentry 업로드 비용·cache key 차이는 결과에 구분한다.
- 단계별 소요·CACHED·import miss/hit/없음·export·OCI·cache 크기·production jobs skipped를 실제 로그/metadata로 확인한다. 같은 mode를 이유 없이 반복하지 않는다. scope 변경/실패는 원인 분석 후 관련 조건만 재판단한다.

## 최소 실행·마감 흐름

1. DEV 구현/안내/변경기록, actionlint·정적 경계 확인. Coordinator가 최종 clean 코드에서 full CI1회 실행(파이프라인 변경의 현행 필수 범위).
2. push→동일 SHA report0. 기존 Deploy에서 벤치3회 dispatch. 중간에 코드/문서 commit을 추가하지 않는다.
3. 실측은 PR 본문 초안·중앙 기록에 저장→최종 양측각1회/complete→코드 PR 생성·merge→Deploy 결과 확인. 캐시 정책만 바뀌어 plan-only면 강제 운영 재배포를 추가하지 않는다.
4. main 기준 동일0283 문서 마감 branch/PR에서 ticket·이 계약·SSoT 결과/상태만 갱신한다(u2). docs-only CI와 report만 수행하며 앱 full·코드 검수를 반복하지 않는다. 이 단계는 측정 뒤 문서 commit이 source receipt SHA를 바꿔 full 재실행을 만드는 문제를 피하고 작업 원본을 완료로 맞추기 위한 마감이다.

## 영향·복구·검증

앱/DB/운영 자원·시크릿 변화 없음. cache 장애 시 bypass, workflow 자체 rollback은 이번 변경 revert다. 트래픽 전환/자동롤백 경로를 바꾸지 않는다. actionlint와 실제 branch bench의 production job 0회, miss/hit/bypass, 전체 로컬 필수 검사와 report0를 확인한다. 원격 앱 전수 CI·실 Meta·UI QA·범용 벤치 도구·캐시 보관 정책 추가는 제외한다. 특정 절감 시간은 실측 전 보장하지 않는다.

## R3 실행·반영 마감 (r1/u2)

- 실제 확인 시각: 2026-11-11T17:34:56.317Z(UTC). 구현 source128faba90b7f319786b5d935536563b48a61afc8. actionlint1.7.12·production cache 선택 실제 step5경계 통과. 필수 full1회124.1초/12통과·report시험0/실제status등록을 확인한 뒤 벤치를 실행했다. source 브랜치에 결과 commit을 추가하지 않았다.
- 위 실측3개 run 모두 success. seed miss와 cache export, warm 부모cached/APIcompile, bypassimport없음, 각OCI출력103MB·cacheblob합계약572MB 성공을로그로대조했다. sourcefixture warm/bypass hash617067c3b746d0b00de63eba48309bff0bca0b3bcf42f6a46b943a8be39270a6, Dockerfile4519766fc4f98b398deca3b1b9733f18e1d811e5391d16fcd0e1fcc5c7330cb6이다. 실제 cache/OCI는 서로 다른 지표다.

| 모드 | build step | bench job | 실행 |
| --- | ---: | ---: | --- |
| seed | 96초 | 143초 | [43066903014](https://github.com/ai-worker-lab/crelink/actions/runs/43066903014) |
| warm | 66초 | 103초 | [43067441736](https://github.com/ai-worker-lab/crelink/actions/runs/43067441736) |
| bypass | 113초 | 158초 | [43067942635](https://github.com/ai-worker-lab/crelink/actions/runs/43067942635) |

- Claude run-e1fbf7b68dc2450a927b0b3dd296e12f·Codex run-e590b1348e7f402fa247f05d54a4440a 각1회PASS, 같은지문 fa5e3173bca0fd11a84c70192fcf96d9cbbb73913061d4a49616233aaa4326b3의 complete exit0 후 PR188을생성/일반merge했다.
- merge d579e6da4ede496fac8b7c5f778f3c8427c95b6b, Deploy43069237768 plan-only success. workflow정책은main에반영됐으며 앱강제배포는없다. 실제운영시간·Sentry업로드·production cache warm은미실측이다. 각1회표본의효과를일반보장하지않는다. 현재 결과 원본은 SSoT r1/u2, raw로그/CLI는Git밖에만보관한다.
