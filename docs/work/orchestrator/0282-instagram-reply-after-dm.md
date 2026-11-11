# 0282 DM 성공 뒤에만 공개 답글

- 단계: 티켓
- 역할: orchestrator
- 상태: 진행
- 종류: 결함
- 우선순위: P0
- 작성일: 2026-11-11

## 목표와 범위

사용자 요청: DM 발송이 실패한 댓글에는 대댓글을 달지 않는다. Meta의 DM 성공 응답 → 성공 DB 저장 → 공개 답글 순서로 바꾸고, 답글 오류는 DM 재발송을 만들지 않는다. 실제 전달/읽음 확인을 뜻하지 않는다.

SSoT: [API 안내](../../../apps/api/docs/README.md#instagram-공개-답글과-unified-login-보강)의 worker ordering 항목. 기능 기준 r4-all-comments-2026-11-11/u1에서 해당 항목만 r5-dm-before-reply/u1로 변경한다. 나머지 인증·중복·보관 기준은 유지한다. 사용자 요구 권한, DEV 쓰기 담당. 이 파일이 작업 흐름/결정 이력이며 별도 계약·하네스를 만들지 않는다.

## CTO 판단과 최소 실행 흐름

- task-e5af0dc2a97c4ea0817f6379c16ae2a7, CTO run-3d940d6002974df1bc216fd19aa3633e. worker의 순서·성공 저장 및 관련 기존 시험·안내/변경 기록만 변경한다. UI/DB 스키마/CI 도구/외부 API/설정 변경 제외.
- DM 오류는 기존 recordFailure로 끝내고 답글을 호출하지 않는다. finish(sent)의 실제 반영 행이 1개일 때만 답글로 진행한다. 답글 결과 UPDATE는 status=sent·reply_status=skipped 조건이며, 답글이 실패해도 DM은 sent를 유지한다. 기존 상태가 unknown/cancelled로 바뀌었으면 답글 0회다.
- 구현 명확화: DM 응답 뒤 **기존 readSendState를 성공 저장 전에 재사용**해 lease·정지/수신거부를 확인한다. 새로운 쿼리 정의 없이 발송 가능/자기 lease가 아닐 때 대댓글을 생략한다. 이미 성공한 DM 기록과 답글 자격은 구분한다. CTO의 성공 저장 이후에는 기존 lease 검사를 재사용할 수 없다는 한계는 이 위치로 해소한다. DM 직전 재확인도 보존한다.
- 검증: 기존 hotfix profile의 가장 좁은 등록 범위 api:src/instagram을 1회 실행한다. worker 전용 selector 추가는 실행기 변경/full을 유발하므로 이번 hotfix에 넣지 않는다. 별도 DB 시험 중복 실행·브라우저/UI QA·실 Meta 발송·원격 전수 CI·full 없음. 이는 이번 CTO/Coordinator 범위 선택이며 사용자가 각각 명령을 금지했다고 해석하지 않는다.
- 순서: DEV 소스/시험·정적 확인 → clean SHA에서 메인이 도메인 CI1회(`/tmp/crelink-0282-ci.log`) → push → 동일 옵션 report0(`/tmp/crelink-0282-report.log`) → 양측 최종 검수 각1·complete → PR/merge/Deploy 확인. 같은 대상 시험은 재실행하지 않고 관련 실패/소스 변경 때만 보정한다.

## 수용 기준

- [ ] DM 성공·성공 저장 뒤 답글 호출, 답글 실패에도 DM sent/재발송 없음
- [ ] DM rejected(수신/권한 불가)·indeterminate/timeout·connect_failed 첫 재시도에서 답글 0회, 재시도 성공에서만 1회
- [ ] DM 도중 정지/수신거부/취소/lease 상실 시 새 답글 없음; 기존 정지·중복·실패 분류 보존
- [ ] reply mock 안에서 DB가 이미 sent인지 확인하고 다음 tick에서 DM/답글 중복 없음
- [ ] 지정 hotfix CI·report0·최종 검수 근거 확보

## 남는 경계

외부 발송과 DB는 원자적이지 않다. DM 성공 후 저장 전 프로세스가 종료되면 기존 unknown 처리로 답글이 생략될 수 있다. sent 저장 후 답글 전에 종료되면 답글은 누락될 수 있지만 DM을 재발송하지 않는다. 새 reply 재시도 큐/상태/스키마는 만들지 않는다.

## 진행 기록

- 2026-11-11 DEV: `worker.service.ts`에서 DM 직전 재확인을 유지하고 DM 성공 응답 뒤 기존 `readSendState`를 성공 저장 전에 재사용했습니다. 정지·수신 거부·lease 상실 시 답글 자격만 차단하고, 실제 DM 성공은 기존 sending 조건의 `finish(sent)`로 보존합니다. 반영 행이 1개일 때만 답글로 진행하며 답글 결과는 sent·skipped 조건으로 기록합니다. `finish`는 기존 쿼리의 rowCount 반환만 추가하고 기존 오류 인자 구조는 유지했습니다.
- 기존 `instagram-worker.e2e-spec.ts`의 spies를 재사용해 reply mock 내부 sent 확인·성공 순서·답글 실패 후 sent 유지·DM rejected/indeterminate/connect_failed 대기 및 재시도 성공·DM 도중 정지/수신 거부/취소/unknown/lease 상실·성공 저장 0행·후속 tick 중복 금지 사례를 작성했습니다. 실행 결과가 아니며 수용 기준의 실제 시험 확인은 메인에 남깁니다.
- 현재 사용자 실행 제한: DEV는 변경 대상 lint/format·API typecheck만 실행합니다(필요하면 shared build 선행). 실제 DB·Docker·listen·전체 CI·개별 Jest·브라우저·Meta·commit·push·검수는 실행하지 않습니다. 최종 메인에서 등록된 hotfix `api:src/instagram` 도메인 검사 1회 → 동일 옵션 report 검사 0회 → 양측 최종 검수 → PR/Deploy 순서로 이어갑니다.
- 정적 실행 결과: 변경 TS 2개에 `pnpm exec eslint apps/api/src/instagram/worker.service.ts apps/api/test/instagram-worker.e2e-spec.ts` 통과, 변경 파일 경로를 지정한 `pnpm exec prettier --write`와 `--check` 통과(저장소 ignore에 따라 Markdown 제외), `pnpm --filter @crelink/api typecheck` 통과. shared build 선행은 필요하지 않았습니다. DB/Jest·hotfix CI·report·최종 검수·commit/push·PR/Deploy는 미실행이며 수용 기준은 미확정 상태로 유지합니다.
