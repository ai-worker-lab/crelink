# 0151 공개 랜딩 바닥글 가입 유도 문구 구현

- 단계: 티켓
- 역할: orchestrator
- 상태: 검증
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-10-10

## 목적

[0144](../designer/0144-landing-footer-signup-cta.md) 시안대로 공개 랜딩 바닥글의 `크리링` 글자 링크를 `나도 크리링 만들기`로 바꿔, 크리에이터 랜딩을 본 방문자가 크리링 가입으로 오는 입구를 만듭니다. 실사용자 100명 목표에 사람 계정 없이 도는 채널입니다.

## 수용 기준

- [x] [인계 문서](../../../design/landing-footer-cta/handoff.md)의 화면 위치·상태(A~E)·문구 원문·반응형(1280px·390px·320px)·접근성대로 바닥글이 보이고, 링크는 `/`로 갑니다(쿼리 없음).
- [x] 랜딩 오류 화면(404·410·불러오기 실패)의 바닥글은 지금 모양(`크리링` · `개인정보 처리방침`)을 유지합니다.
- [x] 관리 화면 미리보기(`ManagerPreview`) 바닥글이 같은 문구·모양이고 누를 수 없습니다.
- [x] `tests/e2e/notices.spec.ts`의 바닥글 링크 이름 단언을 새 문구에 맞추고, 로컬 인스턴스에서 390px·1280px 화면을 확인했습니다. 새 API·DB·개인정보 수집이 없습니다.

## 범위

- 포함: `apps/web` 공개 랜딩 바닥글·관리 화면 미리보기·스타일, 관련 E2E 단언, 웹 변경 기록, 필요하면 `/docs` 안내 문구.
- 제외: 유입 경로 기록(0087), 배너 슬롯 계정 숨기기, API 변경.

## 위험·복구

크리에이터 반발이 생기면 PR revert로 `크리링` 글자 링크로 되돌립니다(서버 상태 없음).

## 연결

- 요구: [PRD](../../product/crelink.md) `목표`, R3 ②, R21
- 디자인: [0144](../designer/0144-landing-footer-signup-cta.md), [`design/landing-footer-cta/`](../../../design/landing-footer-cta/handoff.md)
- 관련: [0087](../product/0087-signup-source-attribution.md)

## 진행 기록

- 2026-10-10: 생성·분류(사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인, 실행 `3c8e84eb-a25c-4880-b9a6-09ca69c9c858`). 0144 인계에서 나눈 구현 티켓입니다. 다음 실행이 착수합니다.
- 2026-10-10: 역할 `web` → `orchestrator`로 재분류(사용자 위임(2026-10-10, ADR 0015)에 따른 AI 승인). 수용 기준의 `tests/e2e/notices.spec.ts` 갱신은 web 소유 경로 밖이라(`pnpm work:scope` 실패) 웹과 E2E를 한 브랜치에서 함께 바꾸는 orchestrator 티켓으로 둡니다(`docs/work/README.md` 역할 규칙).
- 2026-10-10: 착수·구현(AI 운영자 실행 `2df7ec6b-f95b-4faf-ad3a-bdbe85084a13`, 브랜치 `work/0151-landing-footer-cta-web`). `page.tsx` 바닥글을 `result.ok`면 `.footer-cta` 가입 유도 링크, 오류면 `크리링` 링크로 나눔. `ManagerPreview.tsx` 바닥글 `span` 문구, `styles.css` 바닥글 여백·44px 링크·`.footer-cta`/`.footer-link` 밑줄·미리보기 여백. 오류 화면 `크리링` 링크의 hover는 지금 모양 그대로 둠(시안의 hover 밑줄은 인계 문서 "지금 그대로"를 따름).
- 2026-10-10 검증: 로컬 인스턴스(슬롯 71)에서 `pnpm e2e notices.spec` 2개 통과(빈 랜딩 가입 유도 링크 `href="/"`, 정지 크리에이터 `/p/{id}` 바닥글은 `크리링`만). 임시 Playwright 측정(지움): 정상 랜딩 1280·390·320px 가로 넘침 0, 바닥글 높이 61px, 가입 유도 링크 폭 109px·높이 44px, 세 요소 세로 중심 같음(한 줄). 404 화면 390px `크리링` · `개인정보 처리방침`, 높이 61px. 관리 화면 미리보기 1280px 문구 `나도 크리링 만들기 · 개인정보 처리방침`, 높이 61px, 링크 0개. 390px 랜딩·1280px 관리 화면 스크린숏을 눈으로 확인. `pnpm verify`(Node 24) 8개 통과, `pnpm smoke` 5개 통과, `pnpm work:scope 0151` 통과(재분류 뒤).
