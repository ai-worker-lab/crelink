# 0250 목록형 링크 카드의 링크명 옆 아이콘 제거

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 유지보수
- 우선순위: P3
- 작성일: 2026-11-10

## 목적

공개 랜딩 목록형 링크 카드는 링크명 앞에 사이트 아이콘(파비콘)을, 불러오지 못하면 기본 링크 아이콘(`svg.favicon-default`)을 보여 줍니다. 2026-11-10 사용자가 처음 이 기본 아이콘을 없애라고 했고, 곧바로 "링크명 옆에 붙는 아이콘"을 없애고 싶다고 범위를 정정했습니다.

## 수용 기준

- [x] 목록형 링크 카드는 사이트 아이콘이 있든 없든 링크명 옆에 아이콘을 그리지 않습니다. (`ego visitor`가 렌더 결과에서 `.link-title` 안 아이콘 0개 확인. 파비콘이 불러와지는 경우는 E2E가 파비콘을 404로 막아 실측하지 못했습니다.)
- [ ] 카드형(그리드)의 썸네일 자리 아이콘은 그대로입니다. (코드상 변경 없음, 실제 화면은 미확인)
- [x] `pnpm work:scope 0250`, `pnpm verify`, `pnpm ci:local`이 통과합니다.

## 범위

- 포함: `apps/web/src/components/landing/Landing.tsx`, `apps/web/CHANGELOGS.md`, `tests/e2e/ego/visitor.browser.mjs`(합성 도메인 차단 대조군). 웹과 E2E를 함께 바꿔 orchestrator 티켓으로 둡니다.
- 제외: 카드형 그리드의 아이콘, 사이트 아이콘 수집·저장 방식(`faviconUrl` 데이터는 그대로 둠).

## 위험·복구

`ego visitor`의 `합성 도메인 차단 >= 2` 검사는 목록 카드의 파비콘 요청이 건수를 채우고 있었습니다. 아이콘을 없애면 0건이 되어 실패하므로, 페이지에서 합성 도메인으로 직접 요청 1건을 보내 대조군을 유지하고 기준을 1로 낮춥니다. 차단이 동작하지 않으면 여전히 실패합니다.


화면 표시만 바꿉니다. 되돌리려면 이 변경을 revert합니다.

## 연결

- 코드: `apps/web/src/components/Favicon.tsx`(변경 없음), `apps/web/src/components/landing/Landing.tsx`

## 진행 기록

- 2026-11-10: 생성. 처음에는 기본 아이콘만 없애는 범위(web)였으나 사용자가 링크명 옆 아이콘 전체로 정정했습니다. `ego visitor` 차단 대조가 파비콘에 기대고 있어 실패해, 대조군을 직접 요청으로 바꾸며 역할을 orchestrator로 옮겼습니다. 요청 대상 선택자는 `li:nth-of-type(1) > a.link-card > span.link-text > span.link-title > svg.favicon.favicon-default`(목록형)입니다.
