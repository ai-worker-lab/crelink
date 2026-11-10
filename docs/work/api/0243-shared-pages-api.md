# 0243 공유관리 페이지 API

- 단계: 티켓
- 역할: api
- 상위: 0241
- 선행: 0242
- 상태: 준비
- 종류: 기능
- 우선순위: P1
- 작성일: 2026-11-10

## 목적

초대, 멤버, 대상 페이지 권한을 API에 구현합니다.

## 수용 기준

- [ ] migration `0014_shared_pages.sql`, `PageAccessGuard`, 초대·멤버 경로, 경로 분류, 방명록 권한 판정, 보존 작업이 설계와 같습니다.
- [ ] 새 `apps/api/test/page-members.e2e-spec.ts`가 설계의 권한 표 전체를 시험하고 통과합니다.
- [ ] `pnpm verify`가 통과합니다.

## 범위

- 포함: `apps/api/**`, `packages/shared/**`.
- 제외: 웹, 페이지 삭제, `users` 스키마 변경, `sessionUser` 덮어쓰기.

## 위험·복구

새 테이블만 추가합니다. 운영 데이터가 생기기 전에는 DROP으로 되돌리고 이후에는 다음 migration으로 고칩니다.

## 연결

- 설계: [공유관리 페이지](../../specs/shared-pages.md)

## 진행 기록

- 2026-11-10: 생성. 구현은 Codex에 위임합니다(사용자 지시 "구현은 codex로 위임하자.").
