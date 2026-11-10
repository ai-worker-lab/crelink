# 0264 연결·규칙 설정 화면, 메뉴

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253
- 상태: 검증
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

연결·규칙 설정 화면, 메뉴

위험 등급 R2, 담당 Sonnet medium.

## 수용 기준

- [x] `pnpm --filter @crelink/web test`, 390·1280에서 ego-browser로 상태표 확인, 기본 문구에 금지 표현 없음

## 범위

- 포함: `apps/web/src/app/me/landings/[publicId]/instagram/page.tsx`, `components/manage/instagram/**`, `menu.tsx`, `ManagerShell.tsx`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
- 2026-11-11: 구현. 메뉴 `인스타그램 DM`(소유자이고 `instagramDmAvailable=true`), `instagram/page.tsx`, `components/manage/instagram/**`(연결·규칙·게시물 선택·확인 시트, 순수 함수와 시험 `state.ts`·`state.spec.ts`), `styles.css` 추가분.
  - 검증: `pnpm --filter @crelink/web test` 132건 통과, web typecheck 통과, `eslint apps/web`에서 새 오류 없음(기존 경고 2건). 저장소 전체 `pnpm lint`는 기반 브랜치의 `apps/api/src/instagram/connection.service.ts` 미사용 변수 2건과 `packages/shared/src/instagram-dm.ts` prettier 서식으로 실패하며 이 티켓 범위 밖입니다.
  - 설계 문서(`docs/specs/instagram-comment-dm.md`)는 `work:scope`가 web 소유 밖으로 판정해 고치지 않았습니다. 반영할 내용: 연결 실패 행에 `?instagram_error=<코드>` 계약, `/media` 썸네일 CSP는 `apps/web`에 CSP 설정이 없음을 확인(실표시는 0269).
  - 브라우저: 실제 API가 없어 임시 mock API(저장소 밖)와 임시 BFF 허용 한 줄(커밋 안 함)로 ego-browser(TaskSpace `0264-instagram-ui`)에서 390·1280px 확인. 상태표의 메뉴 숨김(편집자·`instagramDmAvailable=false`), 소유자 전용 403, 미구성 503, 미연결·연결 전 안내, 연결됨, 일시 정지, 메시지 접근 꺼짐과 `다시 확인`, 재연결 필요(규칙 읽기 전용), 만료 임박·만료, 운영자 정지, 연결 실패 5개 코드, 인앱 브라우저, 규칙 없음·10개 가득, 게시물 선택(더 보기·빈·502·409), 규칙 편집과 글자 수, 규칙 삭제·연결 해제 확인(첫 초점 취소, 닫으면 호출 버튼으로 복귀)을 두 폭 모두 가로 넘침 없이 확인했습니다.
  - 미확인: 실제 API 응답·`instagramDmAvailable` 실제 값(공유 계약에 아직 없음), 인스타그램 CDN 썸네일 실표시, 실제 OAuth 왕복. 0263(BFF 허용 목록·콜백이 쓰는 `?instagram_error=`)과 0269에서 이어서 봅니다.
