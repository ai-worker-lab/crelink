# 0047 방명록 API 계약

- 단계: 티켓
- 역할: api
- 상위: 0046
- 상태: 검증
- 종류: 기능
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-08

## 목적

API(0048)와 웹(0049)이 병렬로 구현할 수 있도록 방명록 경로·DTO·오류 코드를 `packages/shared`에 확정합니다.

## 수용 기준

- [x] 설계 `API 계약 초안`의 경로(`CRELINK_API_PATHS`)·요청·응답 DTO·오류 코드·임시 한도 값이 `packages/shared/src/crelink.ts`에 있다.
- [x] `PublicLandingView.guestbookEnabled`, `CreatorLandingState.landing.guestbookEnabled`, `UpdateLandingRequest.guestbookEnabled`가 있다.
- [x] `pnpm typecheck`가 통과한다.

## 범위

- 포함: `packages/shared` 타입·상수.
- 제외: 구현.

## 위험·복구

해당 없음

## 연결

- 설계: [API 계약 초안](../../specs/crelink-guestbook.md#api-계약-초안), [데이터 모델](../../specs/crelink-guestbook.md#데이터-모델)
- 요구: R19

## 진행 기록

- 2026-10-08: 생성.
- 2026-10-08: 통합 담당(orchestrator)이 `work/0050-guestbook-integration`에서 작성. `CRELINK_LIMITS.guestbookBodyMax`·`guestbookPageSize`, 오류 코드 `guestbook_disabled`·`guestbook_entry_not_found`, `COOKIE_NAMES.returnTo`, `GuestbookAuthorView`·`GuestbookEntryView`·`GuestbookPage`·`CreateGuestbookEntryRequest`·`SetGuestbookEntryHiddenRequest`, `CRELINK_API_PATHS.landingGuestbook`·`guestbookEntry`·`guestbookEntryHidden`, `GUESTBOOK_TAB_HASH`·`LOGIN_RETURN_TO_PATTERN`·`LOGIN_RETURN_TO_PARAM`, `CRELINK_WEB_PATHS.landingGuestbook`·`googleLogin`, 기존 DTO의 `guestbookEnabled`. `pnpm --filter @crelink/shared build` 통과. 새 필수 필드 때문에 API(`creator.service.ts`·`public-landing.controller.ts`)와 웹 타입 검사가 0048·0049 구현 전까지 실패하므로, 전체 `pnpm typecheck`는 0048·0049와 함께 확인합니다.
- 2026-10-08: 0048·0049 구현 뒤 `pnpm verify`의 typecheck 통과(근거 `docs/work/orchestrator/0050-guestbook-integration.md`). 계약 변경 없이 구현됨. `검증`으로 넘김.
