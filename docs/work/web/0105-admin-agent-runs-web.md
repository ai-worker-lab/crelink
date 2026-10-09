# 0105 운영자 화면 AI 실행 기록·멈춤 스위치·지표

- 단계: 티켓
- 역할: web
- 상위: 0088
- 선행: 0100
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

사람 운영자가 휴대폰에서도 AI 실행 기록·실사용자 지표를 보고, 멈춤 스위치와 토큰 폐기로 AI를 멈출 수 있게 합니다. 요구는 R23 ①④⑥⑧입니다.

## 수용 기준

- [x] `/admin/agent-runs`(첫 쪽: 멈춤 스위치·진행 중 실행·지표 카드·실행 카드 목록·AI 계정 절, 둘째 쪽부터 목록만)와 `/admin/agent-runs/{runId}`(실행 전체와 행동 기록, 404 돌아가기)가 설계 `화면 상태와 API 대응` 표의 상태를 모두 그립니다. 확인: 390px·1280px 화면 확인, 가로 넘침 없음.
- [x] 멈춤 켜기·끄기(사유 입력), 토큰 폐기(확인 문구·404)가 BFF로 동작합니다. 관련 링크는 http(s)만 링크로 그립니다. 확인: 실제 API로 E2E(0091).

## 범위

- 포함: 위 수용 기준.
- 제외: 행동 기록 목록·크리에이터 화면(0106).

## 위험·복구

해당 없음(새 화면).

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `화면 상태와 API 대응`, `티켓 분해` 0105
- 요구: [PRD](../../product/crelink.md#요구사항) R23 ①④⑥⑧

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해).
- 2026-10-10: 구현(web 담당, 통합 브랜치 `work/0091-ai-operator-design`, 커밋 없음). 공유 계약 타입(`AiOperatorStatus`·`AiOperatorMetrics`·`AgentRunPage`·`AgentRunDetail`)으로 만들었고 mock은 앱 코드에 두지 않았습니다.
  - `app/admin/agent-runs/page.tsx`: 첫 쪽은 `GET ai-operator`·`metrics`·`agent-runs`를 함께 읽음. 상태·목록 실패는 `AdminShell` 오류(`retryHref='/admin/agent-runs'`), 400(잘못된 커서)은 제목 "주소가 올바르지 않아요."와 `처음으로`, 지표만 실패하면 지표 카드 자리에 `form-error role=alert`. `?cursor=` 쪽은 목록만. 빈 상태 "아직 AI 실행 기록이 없어요" + 헌장 설치 안내. `nav.pagination` `처음으로`·`이전 기록`.
  - 멈춤 스위치: 상태 배지(`멈춤`/`동작 중`)·사유·바꾼 사람(null이면 `—`)·시각, `PauseControl`(`components/admin/AiOperatorControls.tsx`, `BlockControl` 방식: 켤 때만 선택 사유 입력 `maxLength = AI_OPERATOR_LIMITS.pausedReasonMax`, `window.confirm`, 진행 중 실행이 있으면 "진행 중 실행의 쓰기는 바로 막히고 기록 닫기만 됩니다", `PUT …/ai-operator/pause` 뒤 `router.refresh()`, 실패는 `ActionStatus`).
  - 진행 중 실행: 상태·시작·"진행 중 n분째", 90분(`staleRunMinutes`)이 지나면 "· 다음 실행 때 포기 처리됨"과 경고 테두리, 상세 링크.
  - 지표 카드(`stat-tiles`): 실사용자 `n / 100`, 크리에이터(지표 제외), 가입 최근 24시간·7일·30일, 방문·링크 클릭 최근 7일·30일, 게시 중 광고 배너·광고 노출·클릭 최근 7일, `events` 항목, 기준 시각(`generatedAt`).
  - 실행 카드(`components/admin/AgentRuns.tsx`, 모든 폭 `<details>`): 상태 배지·시작 시각·걸린 시간(`formatDuration`, 멈춤은 "멈춤으로 n번 건너뜀")·요약 / 펼치면 한 일·다음 할 일·관련 링크(http(s)만 `<a target="_blank" rel="noopener noreferrer">`, 그 밖은 글자)·실행 방식·계정·호스트·시작·끝·모델·비용(USD)·토큰 수·운영 기록 수·`실행 상세 보기`.
  - `AI 계정` 절: 계정 없음 "아직 AI 계정이 없어요" + 런북 17 안내, 유효 토큰 0개면 "쓸 수 있는 토큰이 없어요. 다음 실행부터 멈춥니다", 토큰마다 label·prefix·만든 날·마지막 사용, 폐기된 토큰은 폐기 시각만, 유효 토큰은 `TokenRevokeButton`(`window.confirm`, 마지막 유효 토큰이면 "쓸 수 있는 마지막 토큰이라 다음 실행부터 멈춥니다", 404 `api_token_not_found`면 오류 문구와 `router.refresh()`).
  - `app/admin/agent-runs/[runId]/page.tsx`: 상태·걸린 시간, 요약·펼친 내용 전체, 그 실행의 운영 기록 표(0106의 `OperatorActionTable`, 실행 칸 없음). 404는 제목 "실행 기록이 없어요."와 `AdminShell`의 새 `backHref`·`backLabel`(`AI 실행 기록으로`).
  - `lib/format.ts` `formatDuration`과 `format.spec.ts`. 걸린 시간은 서버 컴포넌트에서 요청 시각으로 계산(`react-hooks/purity` 규칙은 이유를 단 한 줄 예외).
  - 실행한 검사(Node 24.20.0): `pnpm --filter @crelink/shared build`, `pnpm --filter @crelink/web typecheck`, `pnpm --filter @crelink/web test`(59건 통과), `eslint apps/web`, `prettier --check apps/web`, `pnpm --filter @crelink/web build` 모두 통과.
  - 화면 확인: 빌드 산출물을 `next start`(포트 5797)로 띄우고 저장소 밖 임시 가짜 API(계약 모양 fixture, 쿠키 값으로 상태 고름)에 연결해 Playwright로 1280px·390px에서 정상·둘째 쪽·잘못된 커서·빈 상태·지표만 실패·멈춤·90분 지난 실행·계정 없음·유효 토큰 없음·상태 조회 실패·상세·상세 404를 열어 `scrollWidth == clientWidth`(가로 넘침 없음)와 화면을 확인. 상호작용(390px, `window.confirm` 대체): 멈춤 켜기(사유 입력, 진행 중 실행 확인 문구)·끄기·토큰 폐기(마지막 토큰 문구)·폐기 404 오류 문구가 BFF로 동작, `<details>` 펼침, `javascript:` 관련 링크는 글자로만 그려짐. 콘솔 오류는 fixture 이미지 주소·의도한 404 응답뿐.
  - 디자인 인계와 다른 점: 디자인 산출물 없음(설계 `[AI 결정]`). 멈춤이 아닐 때 상태 배지는 실행 상태 `진행 중`과 헷갈리지 않게 `동작 중`으로 씀.
- 2026-10-10: 통합 확인(orchestrator, 0091 진행 기록). 실제 API로 E2E `tests/e2e/ai-operator.spec.ts`(390px 카드·PR 링크·상세 행동 기록·멈춤 켜기/풀기·토큰 폐기, 가로 넘침 없음)와 1280px·390px 화면 찍어 보기 통과. 상태 `완료`.
