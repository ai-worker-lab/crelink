# 0103 AI 실행 기록·멈춤 스위치·지표 API

- 단계: 티켓
- 역할: api
- 상위: 0088
- 선행: 0101
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

AI 실행마다 기록을 남기고 겹침을 막으며, 사람이 멈춤 스위치·토큰 폐기를 쓰고, 실사용자 목표 지표를 봅니다. 요구는 R23 ④⑤⑥⑧입니다.

## 수용 기준

- [x] `POST·PATCH·GET /api/admin/agent-runs`(목록·상세): 겹침 409, 90분 포기(멈춤과 관계없이 먼저), 같은 멈춤 동안 paused 합치기, 닫힌 실행 409, 다른 계정 403, refs URL http(s)만. 확인: 통합 테스트.
- [x] `GET /api/admin/ai-operator`, `PUT …/pause`(사람만, `FOR UPDATE`), `PUT …/tokens/{id}/revoke`(사람만, 멱등, 404). 확인: 통합 테스트.
- [x] `GET /api/admin/metrics`가 설계 `지표 정의`(실사용자 조건 각각, 가입·방문·클릭 기간, 광고 서울 날짜 7일, `events: []`)를 따릅니다. `VISIBLE_LINK_CONDITION`을 공개 랜딩·관리 상태·단축 주소와 함께 씁니다. 확인: 조건마다 통합 테스트.

## 범위

- 포함: 위 수용 기준. 세부는 [기술 설계](../../specs/crelink-ai-operator.md) `경로`·`지표 정의`.
- 제외: 웹 화면(0105).

## 위험·복구

해당 없음(새 경로).

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `티켓 분해` 0103
- 요구: [PRD](../../product/crelink.md#요구사항) R23 ④⑤⑥⑧, `목표`

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해).
- 2026-10-10: 구현(api 담당, 통합 브랜치, 커밋하지 않음).
  - 새 `src/ai-operator/`(`AiOperatorModule`): `agent-runs.service.ts`(시작: 90분 지난 `running` → `abandoned` → 설정 `FOR UPDATE` → 멈춤이면 `started_at >= settings.updated_at`인 직전 `paused` 행에 합치기(`paused_count + 1`, `ended_at = now()`) 또는 새 `paused`, 아니면 남은 `running` 409·유니크 위반 409. 갱신: `FOR UPDATE`, 404 → 403 → 409 `agent_run_closed`, `refs[].url`은 `parseHttpUrl`, `cost_usd`·토큰 수는 number로), `ai-operator.service.ts`(상태·멈춤 `FOR UPDATE`·토큰 폐기는 `revokeApiToken` 공유), `metrics.service.ts`(한 문장, `VISIBLE_LINK_CONDITION`), `operator-actions.service.ts`, `ai-operator.controller.ts`(`@ActorKinds`·`@AgentRunExempt`·`@AllowWhilePaused`). `VISIBLE_LINK_CONDITION`(`creator.service.ts`)을 공개 랜딩·`limits`·단축 주소 `/c/` 클릭에 적용.
  - 설계와 다른 점(계약 주석 보정, 형태 변경 없음): `AiOperatorStatus.runningRun`은 status `running` 실행(90분이 지나도 다음 시작 전까지 남음), `lastRun`은 가장 최근에 시작한 `running` 밖 실행으로 정하고 `packages/shared/src/crelink.ts` 주석에 적었습니다(웹 담당에게 알림, 웹 변경 없음). `PUT pause`는 값(멈춤·사유)이 그대로면 `updated_at`·`updated_by`를 바꾸지 않고(같은 멈춤의 paused 합치기 유지) 기록만 남기며, 멈춤을 끌 때 사유는 저장하지 않습니다.
  - 실행: `TEST_DATABASE_URL=…5952/crelink pnpm --filter @crelink/api test` 27 스위트 208건 통과. 새 `test/agent-runs.e2e-spec.ts` 8건(시작·겹침 409·다른 계정 겹침·입력 400, 90분 포기와 멈춤 중 포기, paused 합치기·같은 값 재저장 유지·다시 멈추면 새 행, 갱신 필드·400 12가지·다른 계정 403·사람 403·404·멈춤 중 닫기·닫힌 실행 409, 목록 25건 커서·상세 행동 기록·404, 상태·멈춤 기록·400·AI 403, 토큰 폐기 사람만·멱등·404·폐기 뒤 401·기록에 원문 없음, 지표 조건 전부(보이는 링크·포트폴리오만 실사용자, 숨김·차단·없음·정지·제외·AI·운영자 제외, 가입 24시간·7일·30일, 방문·클릭 7일·30일, 광고 게시 중·서울 날짜 7일 경계, `events: []`)). 기존 `short-link.e2e-spec.ts`·`ad-banner-slot.e2e-spec.ts`·`creator.e2e-spec.ts` 회귀 없음.
- 2026-10-10: 통합 확인(orchestrator, 0091 진행 기록). `scripts/ai-operator.mjs`로 실제 시작·겹침 409·닫기·멈춤 중 paused 합치기(`paused_count` 2)·지표 조회를 로컬 인스턴스와 E2E에서 확인. `pnpm verify` 통과. 상태 `완료`.
