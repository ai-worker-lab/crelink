# 0264 연결·규칙 설정 화면, 메뉴

- 단계: 티켓
- 역할: web
- 상위: 0251
- 선행: 0253
- 상태: 준비
- 종류: 기능
- 우선순위: P2 (AI 제안)
- 작성일: 2026-11-11

## 목적

연결·규칙 설정 화면, 메뉴

위험 등급 R2, 담당 Sonnet medium.

## 수용 기준

- [ ] `pnpm --filter @crelink/web test`, 390·1280에서 ego-browser로 상태표 확인, 기본 문구에 금지 표현 없음

## 범위

- 포함: `apps/web/src/app/me/landings/[publicId]/instagram/page.tsx`, `components/manage/instagram/**`, `menu.tsx`, `ManagerShell.tsx`
- 제외: 설계 문서의 `나중으로 미룬 항목`

## 위험·복구

기능은 운영자 스위치 기본 꺼짐으로 배포합니다. 설계의 권한·보안 절을 따릅니다.

## 연결

- 설계: [Instagram 댓글 자동 DM](../../specs/instagram-comment-dm.md)

## 진행 기록

- 2026-11-11: 생성.
