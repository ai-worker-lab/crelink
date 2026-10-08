# 0053 PC 랜딩 관리 화면 구현(메뉴·관리 패널·실시간 미리보기)

- 단계: 티켓
- 역할: orchestrator
- 선행: 0050, 0051
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-10-08

## 목적

승인된 시안(0051)대로 크리에이터 관리 화면을 하나로 합치고, PC에서는 편집 패널 옆에 실제 랜딩 모양의 미리보기를 두어 고친 결과를 바로 보게 합니다. 지금은 `/me`와 `/me/landings/{publicId}` 두 곳으로 나뉘어 있고, 결과를 보려면 보기 모드나 공개 페이지로 옮겨 가야 합니다.

## 수용 기준

- [x] PRD R18 수용 기준 ①~⑦과 R19 ①을 웹에서 만족한다: 메뉴 `페이지 편집`(`/me/landings/{publicId}`)·`방명록`(`…/guestbook`)·`주소 설정`(`…/settings`), 1280px 메뉴·패널·sticky 휴대폰 미리보기, 1024~1199px 2열(위쪽 탭), 1023px 이하 한 열 + 전체 화면 `미리보기`, PC 링크 추가·수정은 패널 안 펼침·좁은 화면은 하단 시트, 미리보기는 저장하지 않은 입력 포함·숨긴/차단 링크 제외·링크 이동 없음.
- [x] `/me`는 내 랜딩 페이지 편집으로, `?mode=view`는 페이지 편집으로 이동하고, 남의 랜딩·로그아웃 상태는 지금과 같은 안내·이동을 한다.
- [x] 화면 상태가 [인계 문서](../../../design/desktop-landing-manager/handoff.md)의 `화면과 상태`·`저장 방식`·`상호작용·접근성`과 맞는다(로딩, 빈 랜딩, 저장 중·실패, 한도 도달, 차단 링크, 주소 30일 제한, 방명록 꺼짐).
- [x] E2E(`tests/e2e/`)가 새 주소·화면으로 바뀌고 `pnpm verify`·`pnpm smoke`·`pnpm e2e`가 통과한다. 390px·1280px 가로 넘침 없음.
- [x] 기술 설계·웹 README·사용 안내(`/docs/guide`)·변경 기록이 새 화면을 설명한다(공개 릴리스 노트 `RELEASES.md`는 아직 공개 릴리스가 없어 해당 없음).

## 범위

- 포함: 웹 화면·라우트·이동, 미리보기, E2E, 문서.
- 제외: 새 API·공유 계약, 저장 방식 통일(사용자 결정: 지금처럼), 방명록을 끈 동안 남은 글 보기, 새 메뉴(디자인·통계·문의).

## 위험·복구

데이터·API 변경은 없습니다. 옛 관리 주소 북마크는 이동으로 살립니다. 되돌리기는 이 변경 revert입니다.

## 연결

- 제품 요구: [PRD R18·R19](../../product/crelink.md#요구사항)
- 디자인: [인계 문서](../../../design/desktop-landing-manager/handoff.md), `design/desktop-landing-manager/index.html`·`states.html`
- 설계: [MVP 기술 설계](../../specs/crelink-mvp.md), [방명록 기술 설계](../../specs/crelink-guestbook.md)
- 코드: `apps/web/src/app/me/`, `apps/web/src/components/manage/`, `apps/web/src/components/me/`, `apps/web/src/components/landing/`, `tests/e2e/`

## 진행 기록

- 2026-10-08: 생성·착수(브랜치 `work/0053-desktop-landing-manager`, 0051 위). 0051 시안 사용자 승인과 결정(미리보기로 대체, 주소 통합, 저장 방식 유지)에 따라 PRD R18 요구 문장·수용 기준과 R19 ①을 고침. orchestrator 디자인 기술 검토: 새 API 없음, E2E·설계 문서가 함께 바뀌어 orchestrator 티켓으로 하고 웹 구현을 `web`에 맡김.
- 2026-10-08: 웹 구현(`web`). 관리 화면 틀(`app/me/landings/[publicId]/layout.tsx`, 메뉴 배열 `components/manage/menu.tsx` 한 줄 = 메뉴 하나), 초안·저장 상태 공유(`ManagerContext`), 미리보기(`ManagerPreview`: 1024px 이상 휴대폰 틀 열, 이하 `미리보기` 버튼 → 전체 화면 대화상자), 링크·포트폴리오 폼을 폭에 따라 패널 펼침/하단 시트로 감쌈, 방명록 메뉴·주소 설정 메뉴, `/me`는 307 이동, `?mode=view`는 페이지 편집으로 이동. 옛 `LandingEditor`·`LinkSheet`·`CreatorEditor`·`LinksSummary` 삭제, 홈의 `링크 관리` 버튼 제거. 인계와 다르게 한 곳: 링크 행은 기존 카드 모양(썸네일·파비콘·설명) 유지, 미리보기 바닥글은 실제 공개 랜딩 문구, 방명록 메뉴를 떠나면 미리보기가 `링크` 탭으로 돌아감. 실행 중 로컬 웹에서 320·390·1100·1280px 확인(가로 넘침·콘솔 오류 없음).
- 2026-10-08: 코드 리뷰(`reviewer`) 5건 반영: 레이아웃 불러오기 실패의 `다시 시도`가 공유 레이아웃을 다시 읽지 않던 문제(문서 전체 이동으로), 업로드 중 다른 폼을 열면 이미지가 새 초안에 붙던 회귀(폼 열기마다 key·열림 ref), 방명록 메뉴에서 글 삭제 뒤 미리보기 갱신, 하단 시트 `close` 이벤트 처리, 안 쓰는 `.section-head` 삭제. 1~3은 로컬 웹에서 재현 뒤 같은 시나리오로 고친 것을 확인, 4는 스크립트로 `dialog.close()`를 불러 확인(실제 Esc 두 번 강제 닫힘은 재현 안 함).
- 2026-10-08: E2E 갱신(`creator`·`operator`·`guestbook`·`visitor`·`notices` spec, `tests/e2e/README.md`): 보기 모드 단언을 미리보기 단언(저장 전 입력 반영·칩, 숨긴·차단 링크 없음, 미리보기 링크 누름에 이동·새 창 없음)으로, 1280px 링크 편집은 펼침 폼, 시트 확인은 390px로, 방명록 숨기기는 `…/guestbook` 메뉴로 옮김. 검증(Node 24.20.0): `pnpm verify` 8단계 통과(33.3s), `pnpm smoke` 5건 통과, `pnpm e2e` 8건 통과(25.5s, E2E 담당은 `--repeat-each=3` 24건도 통과), `pnpm work:scope 0053` 통과(변경 92개, 0050·0051 커밋 포함). 확인 못 함: 실제 터치 끌기·스크린리더 낭독·실제 구글 로그인, 운영 배포.
- 2026-10-08: 머지 전 main(0052 Sentry 무료 기능·0054 조직 이전)으로 0050·0051·0053을 rebase. 충돌 해결: 변경 기록은 양쪽 항목 유지, `/privacy`는 Sentry 의견 목적과 방명록 목적을 함께, 0052가 옛 `/me`·관리 화면 머리글에 넣은 `의견 보내기`(`FeedbackButton`)를 새 관리 화면 레이아웃 머리글과 `/me` 오류 안내로 옮김, 웹 단위 시험은 0052 규칙(`*.spec.ts`)에 맞춰 `landing-preview.spec.ts`로 이름 변경. 재검증(Node 24.20.0): `pnpm verify` 8단계 통과(첫 실행의 API 시험 실패는 다시 돌리자 116건 통과, 재현 안 됨), 웹 단위 시험 12건, `pnpm smoke` 5건, `pnpm e2e` 8건 통과. `의견 보내기`는 DSN이 있는 빌드에서만 그려져 로컬(DSN 없음)에서 화면으로 보지 못함.
