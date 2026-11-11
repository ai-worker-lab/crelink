# 0276 PR #161 원격 CI 회귀 진단과 시험 격리 보완

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 결함
- 우선순위: P1
- 작성일: 2026-11-11

## 목적

순차 머지 준비의 수동 CI 42985548818에서 확인된 Node 26 웹훅 쿼리 감시 경합과 Firefox 분석 시험 종료를 보완합니다. 제품 동작이나 기존 검사를 줄이지 않습니다.

## 수용 기준

- [ ] 웹훅 시험의 2초 worker 타이머 경합을 재현하고 타이머 격리 후 같은 조건에서 통과합니다.
- [ ] 실제 HTTP 웹훅·트랜잭션·조회 횟수·멱등성 검사를 유지합니다. worker 회귀는 별도 스위트를 유지합니다.
- [ ] Firefox의 날짜 7개·정렬·첫 날짜·모바일·기간·스크롤 검사를 유지하고 3엔진 전체가 통과합니다.
- [ ] 최종 로컬 CI와 고정 SHA 수동 CI, 양측 검수 완료 게이트를 통과한 뒤 #161을 머지합니다.

## 범위

- 포함: `instagram-webhook.e2e-spec.ts` 타이머 격리, `analytics-responsive.spec.ts` 동등한 날짜 읽기, 다음 3엔진 단계의 `link-layout.spec.ts`·`list-density.spec.ts` 동일 DOM 배열 전달 경로 보완, 변경 기록과 검증 근거.
- 제외: 제품 코드·worker 주기 변경, Firefox 제외, 실패 무시·재시도 추가·스냅샷 자동 승인.

## 위험·복구

시험만 보완하며 제품의 발송·집계·세션 계약은 바꾸지 않습니다. Firefox upstream 원인은 미확정이므로 동일 읽기 경로 보완의 효과를 새 원격 CI에서 확인합니다. 실패하면 머지하지 않습니다.

## 연결

- [0233](0233-owner-badge.md), [실패한 CI](https://github.com/ai-worker-lab/crelink/actions/runs/42985548818)
- 기존 worker 격리 예: `apps/api/test/instagram-worker.e2e-spec.ts`, `instagram-admin.e2e-spec.ts`

## 진행 기록

- 2026-11-11: 원격 Node 24·amd64 이미지는 통과했고 Node 26 웹훅 1건과 Firefox 분석 4건이 실패했습니다. 실패를 통과로 대체하지 않았습니다.
- 2026-11-11: 쿼리 spy 뒤 2.1초를 기다리는 임시 변이로 실패를 재현했습니다. 실제 추가 SQL은 발송 worker의 lease/stale 처리와 선점 질의였습니다. 제품 쿼리 횟수 기대값을 늘리는 대신 해당 웹훅 테스트 앱의 worker bootstrap만 기존 다른 스위트처럼 mock합니다. 변이 파일은 실행 후 원복했습니다.
- 2026-11-11: Firefox trace 4개는 표 7행 확인 뒤 `allTextContents` → `evalOnSelectorAll` → `queryArrayInMainWorld`에서 종료됐습니다. 같은 셀 7개를 `nth(i).textContent()`로 읽고 기존 날짜 단언을 유지했습니다. Chromium/WebKit 8건은 최초 실행에서도 통과했습니다. 엔진 upstream 원인과 보완 효과는 원격 재검증 전 미확정입니다.
- 원본 로그·trace는 Git 밖 `/tmp/crelink-pr161-remote-ci-failed.log`, `/tmp/crelink-pr161-ci-artifacts`, `/tmp/crelink-pr161-worker-race-*.log`에만 보관합니다. 최종 검수는 기존 task `task-b076da2d76454af4ad3d9404dd3b6759`에 연결합니다.
- 2026-11-11: 타이머 격리 뒤 동일한 2.1초 지연 변이의 Node 26 시험이 통과했습니다(수정 전 조회 3회로 실패, 수정 후 원래 기대 1회로 통과). 다음 3엔진 단계의 evaluateAll 5곳도 설치된 Playwright 코드상 같은 DOM 배열 main-world 전달 경로를 써, 단일 컨테이너 evaluate 안에서 같은 selector·every 조건을 평가하고 boolean만 반환하도록 옮겼습니다. 기존 코드도 쓰던 방식이며 선택 대상·허용 오차·단언은 유지합니다. 이 5곳의 최초 CI 실행은 앞 단계 실패로 건너뛰었으므로 기존 실패로 주장하지 않습니다.
