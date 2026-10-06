# 0022 랜딩 관리 화면(편집·보기 모드)과 외부 링크 직접 관리

- 단계: 티켓
- 역할: web
- 상위: 0014
- 상태: 완료
- 종류: 기능
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-06

## 목적

외부 링크를 별도 폼 목록이 아니라 랜딩페이지 모양 그대로 보면서 추가·수정·삭제·순서 변경·숨기기 할 수 있게 합니다(PRD R18).

## 수용 기준

- [x] 랜딩마다 관리 화면 `/me/landings/{publicId}`가 있고, 편집 모드와 보기 모드를 전환할 수 있다(주소 `?mode=view`로 보기 모드). 남의 랜딩 ID는 찾을 수 없음 안내, 로그인 안 했으면 `/`.
- [x] 편집 모드: 링크 추가·항목 누르기 → 하단 시트(제목·URL·설명·썸네일, 저장·삭제·닫기, 포커스 가둠·Esc 닫기), 드래그로 순서 변경(터치·마우스·키보드), 링크별 숨기기 토글, 숨긴 링크 흐리게, 차단 표시와 사유, 한도 안내.
- [x] 보기 모드는 공개 랜딩(`/p/{publicId}`)과 같은 화면 구성 요소로 같은 내용을 보여 준다.
- [x] `/me`의 외부 링크 관리 폼은 관리 화면으로 옮기고, `/me`에는 관리 화면으로 가는 진입점과 링크 수 요약만 둔다.
- [x] `pnpm verify` 통과, `pnpm e2e` 갱신·통과(관리 화면에서 추가·수정·삭제·드래그·숨기기, 보기 모드 반영), 390px·1280px 가로 넘침 없음.

## 범위

- 포함: `apps/web/**`, `tests/e2e/**`.
- 제외: API·계약 변경(기존 `POST·PATCH·DELETE /api/me/links`, `PUT /api/me/links/order` 사용), 프로필·SNS·포트폴리오 편집 위치 변경, 최종 디자인(0020).

## 위험·복구

해당 없음

## 연결

- 요구: [PRD R18](../../product/crelink.md#요구사항), R4·R5·R13·R14
- 설계: [MVP 기술 설계](../../specs/crelink-mvp.md)

## 진행 기록

- 2026-10-06: 생성. 사용자 요구 "외부 링크를 랜딩페이지에서 직관적으로 관리(추가/수정/삭제)". 사용자 결정: 랜딩페이지별 관리 랜딩과 view 랜딩, 편집/보기 모드, 하단 시트(모달), 드래그 + 숨기기 토글.
- 2026-10-06: 구현. 변경 내역은 `apps/web/CHANGELOGS.md` 2026-10-06 첫 항목.
  - 화면: `/me/landings/[publicId]`(Server Component, `loadSignedIn`으로 `GET /api/me/landing`; 공개 ID가 내 랜딩과 다르면 찾을 수 없음 안내, 401은 `/`). 상단에 `/me`로 돌아가기, 편집/보기 전환 링크(`aria-current="page"`), 공개 페이지 열기(새 창).
  - 보기 모드: 공개 랜딩 본문을 `src/components/landing/Landing.tsx`로 빼 `/p/[publicId]`와 같은 구성 요소로 그림. 데이터는 편집 상태를 바꾸는 `toLandingPreview`(공개 API `public-landing.controller.ts`와 같은 규칙: 숨김·차단 제외, `position` 순서). 공개 API를 쓰면 링크 ID가 공개 ID라 저장된 URL과 맞출 수 없어 이 방식을 골랐고, 미리보기 링크는 클릭 기록 주소 대신 저장된 URL로 바로 이동해 통계를 남기지 않음.
  - 편집 모드: `src/components/manage/LandingEditor.tsx`(링크 구역만 편집, 한도 `visibleUsed/visibleMax`·`totalUsed/totalMax` 표시, 도달 시 추가 대신 안내), `EditableLinkCard.tsx`(손잡이·카드·숨기기 스위치 `role="switch"`, 실패하면 되돌리고 `errors.ts` 문구), `LinkSheet.tsx`(`<dialog>` `showModal()`, `aria-labelledby`, 열면 표시 이름 입력 포커스, Esc·배경·닫기로 닫힘, 닫으면 연 요소(지워졌으면 링크 구역 제목)로 포커스 복귀, 기존 `ImageField`로 썸네일).
  - 드래그: `@dnd-kit/core` 6.3.1·`@dnd-kit/sortable` 10.0.0·`@dnd-kit/utilities` 3.2.2 추가(`npm view` 라이선스 모두 MIT, 하위 의존성 `@dnd-kit/accessibility` MIT·`tslib` 0BSD). PointerSensor(마우스·터치, 손잡이 `touch-action: none`)와 KeyboardSensor, 한국어 스크린리더 안내, 놓으면 `PUT /api/me/links/order`, 실패 시 원래 순서 복구. SSR 수화 불일치를 막으려고 `DndContext`에 `useId` id를 줌.
  - `/me`: `LinksSection.tsx` 삭제, '링크 관리' 요약 카드(`LinksSummary.tsx`) 추가, 머리글·홈에 관리 화면 링크. 쓰지 않게 된 `.inline-notice` 스타일 삭제. 새 스타일은 기존 토큰(`--ds-*`)과 기존 카드·버튼 모양만 씀(고유 디자인은 0020).
  - E2E: `creator.spec.ts`를 관리 화면 흐름으로 바꾸고(시트 추가 5개→한도 안내·API 409→숨기기 후 추가→한도 찬 상태 다시 보이기 409 되돌림→시트 수정(썸네일 포함)→마우스 드래그·키보드 순서 변경과 새로고침 유지→삭제→1280px·390px 편집 모드·열린 시트 가로 넘침 없음→보기 모드에 숨긴 링크 없음→남의 ID 안내·로그아웃 `/`→공개 랜딩과 같은 목록), 390px 터치 모바일 컨텍스트에서 CDP 터치 끌기 시나리오 추가. `operator.spec.ts`는 6번째 링크 추가·차단 표시·차단 도메인 저장 거부를 관리 화면 시트로 확인. `fixtures.ts`의 `data.session`이 컨텍스트 설정을 덧붙일 수 있게 함.
- 2026-10-06: 검증. `pnpm verify --fast` 통과. `pnpm verify` 통과(웹 개발 서버를 내린 상태에서 실행. 개발 서버가 떠 있을 때는 `next build`가 `Invariant: no direct app page entry found for /notice`로 실패 — 0019와 같은 `.next` 공유 문제), 이어서 `make web-up` 뒤 `pnpm e2e` 연속 2회 통과(6/6, 6/6), `pnpm smoke` 통과(5/5). 390px 편집 모드·열린 시트 스크린샷은 저장소 밖 `/tmp/crelink-editor-390.png`, `/tmp/crelink-sheet-390.png`. `pnpm work:scope 0022`는 `pnpm-lock.yaml`(의존성 추가)과 `tests/e2e/**`(티켓 범위에 포함)를 web 역할 밖으로 표시.
- 2026-10-06: 통합 확인. 실행 중 인스턴스에서 `pnpm e2e` 6 passed, `pnpm smoke` 5 passed, `pnpm verify --fast` 통과. 390px 편집 모드·시트 스크린샷 확인. `work:scope` 경고는 의존성 추가에 따른 `pnpm-lock.yaml`과 티켓 범위에 넣은 `tests/e2e/**`로 의도된 변경.
