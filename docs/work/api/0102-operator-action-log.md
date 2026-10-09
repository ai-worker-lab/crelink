# 0102 운영자 행동 기록·지표 제외

- 단계: 티켓
- 역할: api
- 상위: 0088
- 선행: 0101
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

사람·AI 운영자의 모든 운영 쓰기를 누가·언제·무엇을·어느 실행에서 했는지 남기고, 시험 계정을 지표에서 뺄 수 있게 합니다. 요구는 R23 ③⑧입니다.

## 수용 기준

- [x] 모든 `/api/admin/*` 쓰기(추가 슬롯, 정지, 배너 슬롯, 지표 제외, 링크·배너 차단, 차단 도메인 추가·삭제, 크리링 배너 등록·수정·순서·내리기)가 트랜잭션 안에서 `recordOperatorAction`으로 행위자·행동·대상·관련 크리에이터·전후 값·실행 id를 남깁니다. 확인: 쓰기마다 1건 이상 통합 테스트(사람·AI 행위자, run_id, subject).
- [x] AI의 운영자·AI 계정 대상 `creator.*` 쓰기는 403. AI 행위자 기록 시 멈춤을 `FOR SHARE`로 다시 확인합니다. 확인: 통합 테스트.
- [x] `GET /api/admin/actions?cursor=&actor=`(방명록 커서 방식, 잘못된 값 400), `PUT /api/admin/creators/{id}/metrics-exclusion`(사람만), 크리에이터 요약의 `accountKind`·`metricsExcluded`. 확인: 통합 테스트.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ai-operator.md) `행동 기록 규칙`.
- 제외: 실행 기록·지표 계산(0103).

## 위험·복구

기존 운영자 쓰기 5개를 트랜잭션으로 감쌉니다. 기존 `admin.e2e-spec.ts`·`ad-banners.e2e-spec.ts`·`admin-banner-slot.e2e-spec.ts`가 회귀를 봅니다.

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `티켓 분해` 0102
- 요구: [PRD](../../product/crelink.md#요구사항) R23 ③⑧

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해).
- 2026-10-10: 구현(api 담당, 통합 브랜치, 커밋하지 않음).
  - `src/ai-operator/audit.ts` `recordOperatorAction`(AI면 `ai_operator_settings FOR SHARE` 재확인 → 409 `ai_operator_paused`)·`changedFields`. `admin.service.ts`의 모든 쓰기(`setExtraSlots`·`setSuspension`·`setBannerSlot`·새 `setMetricsExclusion`·`setLinkBlock`·`setBannerBlock`·`addBlockedDomain`·`removeBlockedDomain`)를 트랜잭션 + `FOR UPDATE` 이전 값(`lockCreator`가 users 행을 먼저 잠금, `removeBlockedDomain`은 `DELETE … RETURNING domain, reason`)으로, `ad-banners.service.ts`의 등록·수정(바뀐 필드만, 값이 그대로여도 기록)·순서·내리기(멱등도 기록)에 기록 추가. 컨트롤러는 `@CurrentActor()`. 차단 도메인 `created_by`·크리링 배너 `created_by`는 행위자 id. AI의 운영자·AI 계정 대상 `creator.*`는 `lockCreator`에서 403.
  - `GET /api/admin/actions`(`operator-actions.service.ts`), 방명록 커서를 `src/common/cursor.ts`로 옮겨 방명록·실행 기록·행동 기록이 함께 씀. 요약 `accountKind`·`metricsExcluded`.
  - 설계와 다른 점: 없음. `ad_banner.reorder`는 대상 id가 없어 `targetId: null`, 전후 값은 `{ order: [id…] }`. `ad_banner.end`는 `startsAt`·`endsAt` 전후 값을 늘 남깁니다.
  - 실행: `TEST_DATABASE_URL=…5952/crelink pnpm --filter @crelink/api test` 27 스위트 208건 통과. 새 `test/operator-actions.e2e-spec.ts` 8건(creator.* 4종 사람·AI·run_id·subject·멱등 기록, 지표 제외 사람만·400·404, AI의 운영자·AI 계정 대상 403과 무변경, 링크·배너 차단 subject, 차단 도메인 추가 수·삭제·실패 시 무기록, 크리링 배너 4종, 멈춤 경쟁(커밋 전 멈춤 트랜잭션을 잡은 채 AI 요청이 FOR SHARE에서 기다렸다가 409·쓰기 되돌림), 행동 기록 55건 커서·actor 걸러보기·잘못된 값 400). 기존 `admin.e2e-spec.ts`·`ad-banners.e2e-spec.ts`·`admin-banner-slot.e2e-spec.ts`·`guestbook.e2e-spec.ts` 회귀 없음.
- 2026-10-10: 통합 확인(orchestrator, 0091 진행 기록). E2E `tests/e2e/ai-operator.spec.ts`에서 AI 추가 슬롯 쓰기의 행동 기록(`ai`·실행 id·전후 값)이 DB와 `/admin/actions?actor=ai`·실행 상세에 보이고, AI의 사람 운영자 정지는 403. `pnpm verify` 통과. 상태 `완료`.
- 2026-10-10: 보안 검토 반영(orchestrator, 0091 진행 기록). `PUT /api/admin/slot-event` 행동 기록(`slot_event.period_update`), AI의 운영자·AI 계정 소유 링크·배너 차단 403, 행동 기록 범위 시험 `operator-audit-coverage.e2e-spec.ts`. API 29 스위트 227건 통과.
