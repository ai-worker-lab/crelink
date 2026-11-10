# 0249 공개 랜딩 프로필 사진 크기

- 단계: 티켓
- 역할: web
- 상태: 검증
- 종류: 결함
- 우선순위: P2
- 작성일: 2026-11-10

## 목적

공개 랜딩의 프로필 사진이 작게 보입니다. `.profile-avatar` 규칙이 두 번 정의돼 있고(랜딩 96px, 관리 화면 머리글 프로필 메뉴 36px) 우선순위가 같아 나중 규칙(36px)이 랜딩에도 적용됐습니다. 2026-11-10 사용자 보고이며, 사용자가 72×72로 정했습니다.

## 수용 기준

- [x] 공개 랜딩과 홈 예시 랜딩의 `.profile-avatar`가 72×72로 나옵니다.
- [x] 머리글 프로필 메뉴의 아바타는 `.profile-trigger .profile-avatar`로 범위를 좁혀 36px을 유지합니다.
- [x] `pnpm design:check`, `pnpm docs:check`, `pnpm ci:local`이 통과합니다.

## 범위

- 포함: `apps/web/src/styles.css`, `apps/web/src/components/landing/Landing.tsx`(이미지 width·height 속성), `apps/web/CHANGELOGS.md`.
- 제외: 시안 `design/slot-event/slot-event.css`의 96px 값(designer 소유, 별도 티켓 필요), 사진 업로드·자르기 규칙, 다른 화면의 아바타(`guestbook-avatar` 등).

## 위험·복구

CSS와 이미지 크기 속성만 바꿉니다. 되돌리려면 이 변경을 revert합니다.

## 연결

- 코드: `apps/web/src/components/landing/Landing.tsx`, `apps/web/src/components/manage/ProfileMenu.tsx`

## 진행 기록

- 2026-11-10: 생성.
- 2026-11-10: 로컬 홈 예시 랜딩에서 `.profile-avatar` 72×72 실측. 머리글 메뉴(로그인 필요)와 사진이 있는 실제 랜딩은 실측하지 못했습니다.
