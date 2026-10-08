# 0048 방명록 API 구현

- 단계: 티켓
- 역할: api
- 상위: 0046
- 선행: 0047
- 상태: 검증
- 종류: 기능
- 우선순위: P1 (AI 제안)
- 작성일: 2026-10-08

## 목적

방명록 목록·작성·삭제·숨김과 방명록 끄기를 API에 구현하고, 비밀글·숨긴 글이 허용되지 않은 사람의 응답에 나타나지 않음을 보장합니다.

## 수용 기준

- [x] migration `0002_guestbook.sql`이 `landings.guestbook_enabled`(기본 true)와 `guestbook_entries`를 만들고 migration 테스트가 통과한다.
- [x] `GET·POST /api/landings/{publicId}/guestbook`, `DELETE /api/guestbook/{entryId}`, `PUT /api/guestbook/{entryId}/hidden`이 설계 계약대로 응답한다(통합 테스트).
- [x] 가시성 표의 모든 칸(비회원·다른 회원·작성자·크리에이터 × 공개·비밀·숨김)을 통합 테스트로 확인한다. 작성자에게 숨긴 글은 `hidden=false`다.
- [x] 권한 없는 삭제·숨김은 404 `guestbook_entry_not_found`, 꺼진 방명록 조회·작성은 404 `guestbook_disabled`, 정지 크리에이터는 410이다.
- [x] `PATCH /api/me/landing { guestbookEnabled }`와 공개 랜딩 `guestbookEnabled`가 동작한다.
- [x] `pnpm --filter @crelink/api test`·`test:e2e`가 통과한다.

## 범위

- 포함: migration, 방명록 모듈(컨트롤러·서비스), 선택 로그인(세션이 있으면 보는 사람 판정) 가드, 공개 랜딩·편집 상태 필드, API 변경 기록.
- 제외: 웹, 작성 빈도 제한, 운영자 화면.

## 위험·복구

새 테이블·컬럼만 더합니다(expand). 되돌리기는 코드 되돌림 + 다음 migration.

## 연결

- 설계: [데이터 모델](../../specs/crelink-guestbook.md#데이터-모델), [API 계약 초안](../../specs/crelink-guestbook.md#api-계약-초안), [권한·보안·개인정보](../../specs/crelink-guestbook.md#권한보안개인정보)
- 요구: R19

## 진행 기록

- 2026-10-08: 생성.
- 2026-10-08: 구현. migration `0002_guestbook`, `src/guestbook/`(모듈·컨트롤러·서비스), `OptionalSessionGuard`·`ViewerUser`, `CreatorService.publicLanding`(공개 랜딩 404·410 판정 공용화), `PATCH /api/me/landing`의 `guestbookEnabled`, 편집 상태·공개 랜딩 `guestbookEnabled`. 문서 `apps/api/docs/README.md` "방명록", `apps/api/CHANGELOGS.md`.
- 2026-10-08: 설계와 다르거나 설계에 없던 결정. ① 인덱스 `(author_user_id)`를 더함(사용자 삭제 연쇄·작성자 삭제 조건용, 0001의 FK 인덱스 관례). ② 커서 원문은 `{created_at epoch 마이크로초}.{id}`의 base64url(JS `Date`가 밀리초까지라 DB 시각을 그대로 담음). `?cursor=`를 여러 번 주거나 빈 값도 400. ③ 삭제·숨김은 방명록이 꺼져 있어도 동작(설계에 규정 없음, 글 관리 권한은 그대로 둠). ④ 숨김 재요청도 `hidden_at=now()`로 갱신. ⑤ 성공 응답의 `Cache-Control: no-store`는 네 경로 모두(DELETE는 본문 없는 204라 제외). ⑥ 본문 길이는 기존 입력 검사(`requiredText`)대로 JS 문자열 길이 기준이고 DB CHECK는 `char_length` 1~500(이모지 등은 API 쪽이 더 엄격).
- 2026-10-08: 검증(Node 24.20, 이 worktree 인스턴스 postgres 5452).
  - `pnpm --filter @crelink/api typecheck` 통과. `pnpm exec eslint apps/api`·`pnpm exec prettier --check apps/api` 통과(루트 `pnpm lint`는 shared 빌드를 포함해 통합 담당 몫으로 남김). API 패키지에는 `test:e2e` 스크립트가 없고 `test`가 e2e를 포함함.
  - `pnpm --filter @crelink/api test`: 17 스위트 113건 통과(방명록 11건, migration 1건 추가, `health`·`short-link` 기대값 갱신).
  - 로컬 API: pm2 `crelink-api`의 `nest start --watch`가 10:08부터 `@sentry/nestjs` 모듈 해석 오류(TS2307, 새 컴파일 시 재현 안 됨)로 옛 코드를 계속 돌리고 있어 `pm2 restart crelink-api`만 실행. 기동 시 `0002_guestbook` 적용 확인(`schema_migrations`). 실제 요청: `GET /api/landings/5xunfmy74k/guestbook` 비회원 200 `{"entries":[],"nextCursor":null,"viewer":{"signedIn":false,"isOwner":false}}`·`Cache-Control: no-store`, 무효 쿠키도 200 비회원, `POST` 쿠키 없음 401 `unauthenticated`, `?cursor=bad!` 400 `validation_failed`, 없는 랜딩 404 `landing_not_found`, `pwx9zqqp4l`의 `guestbook_enabled`를 SQL로 잠시 끄고 404 `guestbook_disabled`·공개 랜딩 `"guestbookEnabled":false` 확인 후 다시 true로 되돌림.
  - `pnpm work:scope` 통과, `pnpm smoke` 5건 통과. 전체 `pnpm verify`는 통합 담당이 실행.
