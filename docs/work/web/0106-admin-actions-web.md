# 0106 운영자 화면 운영 기록·AI 배지·지표 제외

- 단계: 티켓
- 역할: web
- 상위: 0088
- 선행: 0100
- 상태: 완료
- 종류: 기능
- 우선순위: P0
- 작성일: 2026-10-10

## 목적

운영자가 사람·AI의 운영 쓰기 기록을 보고, AI 계정을 구별하며, 시험 계정을 지표에서 뺄 수 있게 합니다. 요구는 R23 ①③⑧입니다.

## 수용 기준

- [x] `/admin/actions`(걸러보기 전체·사람·AI·시스템, 행 형식, 빈·오류·잘못된 커서, 이전 기록·처음으로)가 설계 표대로 동작하고, 표는 공용 `.data-table.is-stacked`(광고 배너 표 규칙을 옮김)로 390px에서 쌓입니다.
- [x] 크리에이터 목록·상세에 `AI`·`지표 제외` 배지, 사람 계정 상세의 `지표 제외` 켜기·끄기, AI 계정 안내·정지 확인 문구, 운영자 메뉴 `AI 실행 기록`·`운영 기록`이 있습니다. 확인: 390px·1280px 화면 확인, E2E(0091).

## 범위

- 포함: 위 수용 기준.
- 제외: AI 실행 화면(0105).

## 위험·복구

광고 배너 표의 쌓기 규칙을 공용 클래스로 옮깁니다. 광고 배너 화면 회귀는 `tests/e2e/ad-banner.spec.ts`가 봅니다.

## 연결

- 설계: [AI 운영자 기술 설계](../../specs/crelink-ai-operator.md) `화면 상태와 API 대응`, `티켓 분해` 0106
- 요구: [PRD](../../product/crelink.md#요구사항) R23 ①③⑧

## 진행 기록

- 2026-10-10: 생성(설계 승인 뒤 분해).
- 2026-10-10: 구현(web 담당, 통합 브랜치 `work/0091-ai-operator-design`, 커밋 없음). 공유 계약 타입(`OperatorActionPage`·`OperatorCreatorSummary.accountKind`·`metricsExcluded`)으로 만들었고 mock은 앱 코드에 두지 않았습니다.
  - `app/admin/actions/page.tsx`: 걸러보기 링크 `?actor=`(`전체`·`사람`·`AI`·`시스템`, `aria-pressed`, 공용 `.filter-chips`), 빈 상태 "운영 기록이 없어요", 오류는 `AdminShell`(`다시 시도`), 400(잘못된 커서·`actor`, API가 검사)은 "주소가 올바르지 않아요."와 `처음으로`(`/admin/actions`), `nav.pagination` `처음으로`·`이전 기록`(걸러보기 유지).
  - `components/admin/OperatorActions.tsx` `OperatorActionTable`(실행 상세와 공유): 시각·행위자 배지(`사람`·`AI`·`시스템`)와 이메일·행동 이름(`Record<OperatorActionType, string>` 한국어, 모르는 값은 원래 키를 `code`로)·대상(대상 종류 한국어와 id)·크리에이터 상세 링크(`subjectUserId`)·이전/이후 값 JSON 글자(React 글자 노드라 HTML로 해석 안 됨)·실행 기록 링크. 700px 이하 카드에서만 보이는 칸 이름표 `.stacked-label`.
  - 공용 쌓는 표: `styles.css`의 광고 배너 700px 이하 카드 규칙을 `.data-table.is-stacked`·`.table-scroll.is-stacked`로 옮김(칸 규칙은 `:where(th, td)`로 낮춰 광고 배너의 손잡이·썸네일·노출·클릭 칸 규칙이 그대로 덮어씀), `.ad-stat-label` → `.stacked-label`. 같은 김에 걸러보기 칩(`.ad-banners-filter(s)` → `.filter-chip(s)`)과 상태 배지 색(`.ad-status-live`·`-scheduled`·`-ended` → `.badge-positive`·`.badge-warning`·`.badge-muted`)도 공용으로 옮겨 운영 기록·AI 실행 화면이 두 번째 방식을 만들지 않게 함. `AdBanners.tsx` 클래스만 바뀌고 모양은 같음.
  - 크리에이터: `components/admin/CreatorStatusBadges.tsx`(`정지`/`이용 중`, `AI`(상세는 `AI 계정`), `지표 제외`)를 목록 상태 칸과 상세 `상태`에. 상세 `계정 관리`에 `MetricsExclusionToggle`(`CreatorControls.tsx`, 사람 계정은 `window.confirm` 뒤 `PUT …/metrics-exclusion`, AI 계정은 "AI 계정은 지표에 들어가지 않아요"), `SuspensionToggle`에 `accountKind`를 받아 AI 계정 정지 확인 문구 "…AI 토큰 인증도 막힙니다…". 운영자 메뉴(`AdminShell`)에 `AI 실행 기록`·`운영 기록`.
  - 실행한 검사(Node 24.20.0): `pnpm --filter @crelink/shared build`, `pnpm --filter @crelink/web typecheck`, `pnpm --filter @crelink/web test`(59건 통과), `eslint apps/web`, `prettier --check apps/web`, `pnpm --filter @crelink/web build` 모두 통과.
  - 화면 확인: 빌드 산출물을 `next start`(포트 5797)로 띄우고 저장소 밖 임시 가짜 API에 연결해 Playwright로 1280px·390px에서 `/admin/actions`(전체·`?actor=ai`·`?actor=bogus`(400)·빈 상태), `/admin`, 사람·AI 크리에이터 상세, `/admin/ad-banners`(쌓는 표 회귀)를 열어 가로 넘침 없음(`scrollWidth == clientWidth`)과 화면 확인. 390px에서 운영 기록·광고 배너 표가 카드로 쌓이고 `노출 n · 클릭 n` 한 줄 유지, 운영자 메뉴는 줄바꿈만. `?actor=ai`에서 `AI`만 `aria-pressed="true"`. 지표 제외 끄기(확인 → BFF `PUT` → 안내 문구), AI 계정 정지 확인 문구 확인. 운영 메뉴 E2E(`ad-banner.spec.ts`)가 쓰는 `운영자 메뉴` 이름·`광고 배너` 링크는 그대로.
  - 남은 위험: 걸러보기는 설계대로 링크에 `aria-pressed`를 둠(ARIA상 링크 역할에는 정의되지 않은 속성이라 화면 낭독기가 읽지 않을 수 있음. 지금 E2E·디자인 기준을 따름).
- 2026-10-10: 통합 확인(orchestrator, 0091 진행 기록). 실제 API로 E2E `tests/e2e/ai-operator.spec.ts`의 `/admin/actions?actor=ai`(390px, 가로 넘침 없음), 크리에이터 상세 `지표에서 빼기`(배지·사람 행위자 기록)와 AI 계정 상세 안내, 광고 배너 표 회귀는 `ad-banner.spec.ts` 4건 통과, 1280px·390px 화면 찍어 보기. 상태 `완료`.
